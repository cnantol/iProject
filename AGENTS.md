# iProject 全链路项目管理专家 — 协作约定

## 项目骨架
- 客户端:`client/src/`(React + MUI + Vite)
- 服务端:`server/`(Node.js + Express + better-sqlite3)
- 根级 `pnpm build` 触发 `prebuild` → 静态检查 → `vite build`
- `pnpm smoke` 跑全栈冒烟测试(20 项)

## 红线规则(违反将导致构建失败或线上事故)

### R1. Tab 子页面必须内联
带 `<Tabs>` 的 page 文件,**所有 Tab 对应的内容必须写在同一文件内**。
**禁止**:
```js
// ❌ 错误:CommissionDeviations → CommissionPage 的反面案例
// CommissionPage.jsx
import CommissionDeviations from './CommissionDeviations';
{tab === 1 && <CommissionDeviations />}
```
**正确**:
```js
// ✅ 把 CommissionDeviations 的全部内容搬到 CommissionPage.jsx 末尾
//   并 export { CommissionDeviations } 命名导出(给潜在复用方备用)
function CommissionDeviations() { ... }
```
**为什么**:Tab 子页面文件 + 专属后端 API 这种组合在结构上孤立,极易被误判为"未挂路由的死组件"。
`scripts/check-page-structure.mjs` + `prebuild` 钩子会在合并前/后持续守护此规范。

### R2. 删任何 page/component 文件前必须跑检查
**禁止**直接 `git rm client/src/pages/*.jsx` 或 `client/src/components/*.jsx`。
**必须先**:
1. `pnpm lint:page-structure` 确认未破坏 R1
2. `grep -rln <文件名>` 列出全部父级引用
3. 在 commit message 或对话中**列出引用清单 + 用户确认记录**

### R3. isDark 判断已废弃
**禁止**再写 `const isDark = theme.palette.mode === 'dark'` 或 `isDark ? A : B`。
**原因**:`QuoteStyle`(报价单式样美化)组件的预览目标永远是 PDF(白底黑字),
dark 分支的样式字符串毫无用处,反而引入 `useTheme` 依赖,可能因 theme 异常导致整页崩。
其他列表/表格页面的 `isDark` 也在 isDark 清理版本中被移除,全站统一 light 风格。

### R4. SPA fallback 仅服务 GET/HEAD
`server/index.js` 的 SPA fallback 路由已限定 `req.method === 'GET' || 'HEAD'`。
**禁止**改回无条件 fallback — 否则 PUT/DELETE 等 API 请求会被错误地返回 `index.html`。

### R5. PDF 字体加载必须有 try/catch 容错
`server/routes/quotations.js` 中 `doc.registerFont` 必须包 try/catch。
**原因**:Mac 系统 `.ttc` 字体在 pdfkit 0.15.x 上不支持,缺少容错会导致 500。
字体加载失败时自动回退到 latin(Helvetica/Times-Roman/Courier),不影响英文/数字渲染。

## 常用命令
- `pnpm build` — 构建(含 prebuild 静态检查)
- `pnpm smoke` — 全栈冒烟测试
- `pnpm lint:page-structure` — 仅跑 page 结构检查
- `node server/index.js` — 启动后端(默认 3001)
- `cd client && pnpm dev` — 启动前端 dev server

## 改动后必做清单
1. 修改 `client/src/` → `pnpm build`(自动跑 lint:page-structure)
2. 修改 `server/` → `pnpm smoke`(全栈回归)
3. 涉及路由/页面 → 手动打开 `http://localhost:3001/<路由>` 验证渲染

## 注意事项
- 截图与 bundle 大小无强制要求,但 Settings.jsx(2586 行)等大文件建议按模块拆分
- 任何新增的"独立子页面文件"应**优先**评估能否内联到父页面
- 后端接口命名:路径前缀 `/api`,遵循 RESTful 风格
