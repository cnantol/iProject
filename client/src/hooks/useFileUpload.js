import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

/**
 * 通用文件上传 Hook：基于 axios onUploadProgress 提供上传状态与进度（正式功能，无演示模式）。
 *
 * 状态流转：
 *   idle（初始）→ uploading（上传中，progress 0-99）→ success（上传成功，3s 后自动回 idle）
 *                                     ↘ error（失败，4s 后自动回 error，再 4s 自动回 idle）
 *
 * 进度体验：
 * - 进度条平滑动画：真实进度由 onUploadProgress 驱动，渲染层以 100ms 粒度向目标值逼近，
 *   即使上传很快也能看到完整的 0%→99% 动画，不会"闪一下就完成"。
 * - "服务器处理中"阶段：上传完成后进度停在 99% 并展示流动进度条至少 600ms，
 *   让"上传完成 → 服务器写库/识别 → 成功"的流转清晰可见。
 *
 * 返回：
 *   status    idle | uploading | success | error
 *   progress  0-99（上传中）；上传完成等待服务器响应时停在 99
 *   fileName  当前上传的文件名
 *   error     失败原因
 *   upload(file, { url, fields, timeout, onSuccess, onError })  发起上传
 *   reset()   手动重置到 idle
 */

const PROCESSING_MIN_MS = 600;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function useFileUpload() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const intervalRef = useRef(null);
  const targetRef = useRef(0); // 目标进度（来自 onUploadProgress）
  const progressRef = useRef(0); // 当前渲染进度，供异步流程同步读取

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const setProgressBoth = (value) => {
    progressRef.current = value;
    setProgress(value);
  };

  // 组件卸载时清理定时器
  useEffect(() => clearTimer, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    targetRef.current = 0;
    progressRef.current = 0;
    setStatus('idle');
    setProgress(0);
    setFileName('');
    setError('');
  }, [clearTimer]);

  const upload = useCallback(
    async (file, { url, fields = {}, timeout = 0, onSuccess, onError } = {}) => {
      if (!file || !url) return;
      clearTimer();
      targetRef.current = 0;
      progressRef.current = 0;
      setStatus('uploading');
      setProgress(0);
      setFileName(file.name);
      setError('');

      const formData = new FormData();
      formData.append('file', file);
      Object.entries(fields || {}).forEach(([key, value]) => {
        if (value != null) formData.append(key, String(value));
      });

      // 平滑渲染：向 onUploadProgress 给出的真实目标值逼近
      intervalRef.current = setInterval(() => {
        const target = targetRef.current;
        if (progressRef.current >= target) return;
        setProgressBoth(
          Math.min(progressRef.current + Math.max(3, Math.ceil((target - progressRef.current) / 5)), target)
        );
      }, 100);

      try {
        const response = await api.post(url, formData, {
          timeout, // 0 = 不超时（上传进度已让用户有感知，避免大文件被默认 60s 掐断）
          onUploadProgress: (event) => {
            if (event.total) {
              // 上限 99：剩余 1% 留给"服务器处理中"阶段展示
              targetRef.current = Math.min(Math.round((event.loaded / event.total) * 100), 99);
            }
          }
        });
        clearTimer();

        // 收尾：平滑推进到 99（"服务器处理中"展示）
        await new Promise((resolve) => {
          intervalRef.current = setInterval(() => {
            if (progressRef.current >= 99) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              resolve();
              return;
            }
            setProgressBoth(Math.min(progressRef.current + 4, 99));
          }, 90);
        });

        // 处理中阶段最小展示时长，保证状态流转可见
        await sleep(PROCESSING_MIN_MS);

        setProgressBoth(100);
        setStatus('success');
        timerRef.current = setTimeout(reset, 3000);
        if (onSuccess) await onSuccess(response, file);
      } catch (err) {
        clearTimer();
        setError(err?.response?.data?.error || err?.message || '上传失败');
        setStatus('error');
        timerRef.current = setTimeout(reset, 4000);
        if (onError) onError(err);
      }
    },
    [clearTimer, reset]
  );

  return { status, progress, fileName, error, upload, reset };
}
