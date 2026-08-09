#!/usr/bin/env node
/**
 * 清理 uploads/ 目录中的孤儿文件(物理文件存在但 DB 无引用)。
 * 可手动运行: node scripts/cleanup-orphans.mjs
 * 也可由部署脚本/定时任务调用。
 * 
 * 安全策略:
 *   - 只删除不在 order_attachments 引用列表中的文件
 *   - 删除后自动清理空目录
 *   - 默认 dry-run,确认后加 --apply 才真正删除
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUploadDir, getDb, initDb } from '../server/db/init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = getUploadDir();

function walkFiles(dir) {
  const result = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return result;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(full));
    } else if (entry.isFile()) {
      result.push(full);
    }
  }
  return result;
}

function main() {
  const dryRun = !process.argv.includes('--apply');
  initDb();
  const db = getDb();

  const referenced = new Set(
    db.prepare('SELECT file_path FROM order_attachments').all().map((r) => r.file_path)
  );

  const allFiles = walkFiles(uploadDir);
  const orphans = [];
  for (const file of allFiles) {
    const relPath = path.relative(uploadDir, file).replace(/\\/g, '/');
    if (!referenced.has(relPath) && !referenced.has(path.basename(relPath))) {
      // 兼容新版分层路径 "order_id/stage/file" 和旧版扁平 "file"
      // 新版: 整段 "order_id/stage/file" 应在 referenced 中
      // 旧版: 纯文件名应在 referenced 中
      // 都不匹配 → 孤儿
      orphans.push({ full: file, relPath });
    }
  }

  if (orphans.length === 0) {
    console.log('No orphan files found.');
    db.close();
    return;
  }

  console.log(`Found ${orphans.length} orphan file(s):`);
  for (const { full, relPath } of orphans) {
    const size = fs.statSync(full).size;
    console.log(`  - ${relPath} (${size} bytes)`);
  }

  if (dryRun) {
    console.log('\nDry-run mode. Use --apply to delete them.');
    db.close();
    return;
  }

  let deleted = 0;
  for (const { full } of orphans) {
    try {
      fs.unlinkSync(full);
      deleted++;
    } catch (err) {
      console.error('Failed to delete:', full, err.message);
    }
  }

  // 清理空目录(自底向上)
  function removeEmptyDirs(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        removeEmptyDirs(path.join(dir, entry.name));
      }
    }
    try {
      if (fs.readdirSync(dir).length === 0 && dir !== uploadDir) {
        fs.rmdirSync(dir);
      }
    } catch {}
  }
  removeEmptyDirs(uploadDir);

  console.log(`Deleted ${deleted} orphan file(s).`);
  db.close();
}

main();
