# Atlas Copco 销售机会管理系统

正式版 1.0 公测版本。单管理员自用的销售项目全生命周期管理系统，严格按《AtlasCopco_完整最终方案_V3.4_大模型提示词版.md》V3.4.10 开发。

## 正式版 1.0

- 业务数据已清空，适合公测初始化
- 订单编号规则：`OPP-客户简称-日期-四位序号`
- 报价编号规则：`Q-客户简称-日期-R轮次`
- 支持最终客户/合同客户简称
- 支持报价单中英文、Logo 位置、报价日期、页脚文本配置
- 支持系统内置字段显示名称配置
- 支持亮色 / 暗色 / 跟随系统三种主题模式

## 功能

- 9 步订单工作流（客户信息 → 方案 → 报价 → 并行审批 → 中标 → 财务 → 发货+开票并行 → 佣金 → 闭环）
- 框架协议价 / 系统指导价 / 手工价三级价格决策，报价轮次与 PDF 导出
- Sales Force + OA 双线审批、驳回回退与重提
- 发货批次百分比校验、按 PO 开票与超开审计
- 佣金 Excel 全局匹配（幂等）、人工补录、等待匹配清单
- 首页看板、历史销售、待办（月历 + 分组）、基础数据、字段管理、数据导入
- 数据修正、软重置、硬重置（JWT 轮换）、全站备份/还原、审计日志

## 技术栈

React 18 + Vite 5 + MUI 5（前端）；Node.js + Express (ESM) + better-sqlite3（后端）；JWT + bcryptjs；xlsx；PDFKit。

## 本地运行

```bash
pnpm install
pnpm --filter atlas-copco-server start   # 后端 http://localhost:3001
pnpm --filter atlas-copco-client dev     # 前端 http://localhost:5173
```

默认账号：`admin / password`（登录后请立即在「系统设置」修改密码）。

数据库文件与上传附件位于 `server/db/data/`，首次启动自动按 `server/db/schema.sql` 建库并种子 admin 账户。

## 后端验证

```bash
cd server && node scripts/smoke-test.mjs
```

冒烟测试覆盖：登录、价格决策、订单创建、报价提交、双线审批、中标、财务、发货批次校验、超开票审计、佣金幂等匹配、审批驳回重提、人工补录、数据修正回退（佣金防死锁）、软/硬重置与 JWT 轮换。

## 部署

部署说明见 [deploy/README.md](deploy/README.md)，含 Docker、Nginx、PM2、SSL 与每日备份配置；群晖 DSM6 部署见 [deploy/README-DSM6.md](deploy/README-DSM6.md)；阿里云/腾讯云部署见 [deploy/README-CN-CLOUD.md](deploy/README-CN-CLOUD.md)。

## 目录结构

```text
server/    Express 后端（routes / middleware / db）
client/    React + Vite + MUI 前端
deploy/    Docker / Nginx / PM2 / 备份脚本
docs/      设计文档与实施计划
```
