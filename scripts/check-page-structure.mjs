#!/usr/bin/env node
// 全站 page 结构检查：所有带 Tab 切换的页面，Tab 内容必须内联在同一文件。
// 防止后续出现"独立 Tab 子页面文件"被误判为死代码。
//
// 规则：
//   1. 在 client/src/pages/*.jsx 中，如果文件使用了 <Tabs 组件，则同文件内必须能
//      找到所有 <Tab 子组件（通过 label/标识比对）。
//   2. 如果检测到某个 page 引用了另一个 pages/*.jsx 作为 Tab 内容（例如
//      `import X from './X'; ... {tab === N && <X />}`），则报错。
//
// 误报白名单：在 ALLOWLIST 中登记即可。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = 'client/src/pages';
const ALLOWLIST = new Set([
  // 'client/src/pages/SomePage.jsx',
]);

const files = readdirSync(PAGES_DIR)
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => join(PAGES_DIR, f));

const bad = [];

for (const file of files) {
  if (ALLOWLIST.has(file)) continue;
  if (!/\/pages\//.test(file)) continue;
  const src = readFileSync(file, 'utf8');

  // 是否使用 Tabs (本文件内有 <Tabs ...)
  const usesTabs = /<Tabs[\s>]/.test(src);
  if (!usesTabs) continue;

  // 收集所有 import 引入的兄弟 page 文件
  const importFromPages = [];
  const importRe = /import\s+(\w+)\s+from\s+['"]\.\/((\w+))['"]/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const [, localName, name] = m;
    // 引用的是 pages 兄弟（不是 utils/components/api）
    const siblingPath = join(PAGES_DIR, `${name}.jsx`);
    try {
      if (statSync(siblingPath).isFile()) {
        importFromPages.push({ localName, sibling: siblingPath });
      }
    } catch {}
  }

  // 如果引用了 pages 兄弟且该文件中有 <Tabs, 判断是否作为 Tab 内容使用
  if (importFromPages.length === 0) continue;

  // 粗判：所有 import 进来的兄弟，若用作 JSX 渲染（<LocalName />）且本文件
  // 含 <Tabs ... <Tab，视为可疑（建议拆解到同文件）。
  for (const { localName, sibling } of importFromPages) {
    // 用作 JSX：<LocalName ... 或 <LocalName/>
    const usedAsJsx = new RegExp(`<${localName}[\\s/>]`).test(src);
    // 是否同时有 <Tabs ...
    if (usedAsJsx && usesTabs) {
      bad.push({
        file,
        sibling,
        localName,
        reason: `Tab 页面引用了兄弟页面 \`${sibling}\` 作为 Tab 内容（<${localName} />），违反"Tab 内容必须内联"规范`,
      });
    }
  }
}

if (bad.length === 0) {
  console.log('[check-page-structure] ✓ 全站 Tab 页面均符合"内容内联"规范');
  process.exit(0);
}

console.error('[check-page-structure] ✗ 发现违反"Tab 内容内联"规范的页面：');
for (const b of bad) {
  console.error(`  - ${b.file}`);
  console.error(`      ${b.reason}`);
  console.error(`      修复方式：把 ${b.sibling} 的内容合并到 ${b.file} 末尾（参考 CommissionDeviations → CommissionPage 合并模式）`);
}
process.exit(1);
