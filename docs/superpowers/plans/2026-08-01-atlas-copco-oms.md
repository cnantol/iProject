# Atlas Copco 订单管理系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete single-admin order lifecycle management system exactly per 《AtlasCopco_完整最终方案_V3.4_大模型提示词版.md》V3.4.10, using the provided `schema.sql` and Atlas Copco logo SVG.

**Architecture:** Monorepo with `server/` (Node.js 24 + Express ESM + better-sqlite3, single SQLite connection, WAL, JWT auth) and `client/` (React 18 + Vite 5 + MUI 5, MD3 theme, light/dark auto). Express serves `/api` and the built `client/dist`. Deploy artifacts under `deploy/`.

**Tech Stack:** express, better-sqlite3, jsonwebtoken, bcryptjs, multer, xlsx, pdfkit, adm-zip (server); react, react-dom, react-router-dom, axios, @mui/material, @emotion/react, @emotion/styled, @mui/icons-material, dayjs (client); vite, @vitejs/plugin-react.

## Global Constraints

- `server/db/schema.sql` must be byte-for-byte the provided file; never modify it.
- Single admin account `admin/admin123` seeded by `db/init.js`; no roles, no registration.
- Status enum: `customer_info | proposal | quotation | approval_pending | bid_decision | finance | shipping_invoicing | commission | closed | lost_closed`; all transitions use conditional `UPDATE ... WHERE status=?`, zero rows -> HTTP 409.
- Amounts: `ROUND(x,2)` everywhere (unit prices `ROUND(x,4)`); timestamps stored UTC (`datetime('now')`), returned ISO; date fields `YYYY-MM-DD` (local).
- Sensitive actions (approval submit/approve/reject, data correction, resets, invoice override, delete order, commission manual) write `audit_logs` with `user_id`, before/after JSON detail.
- Errors: `{ "error": "中文提示" }` with 400/401/403/404/409/500.
- Commission Excel: amount column mandatory, SO trim+uppercase, duplicate SO rows count only (first row wins), process only `status='commission' AND commission_matched=0`, single transaction, import_logs row per upload.
- Shipping: batch_percent in (0,100]; delivered=1 requires SUM(batch_percent)=100 when batches exist; no batches -> allowed directly.
- Invoicing: invoice po_id required, per-order unique invoice_no, amount>0; cumulative >= PO total auto-sets invoiced=1; over-invoice needs confirm + audit.
- Uploads: whitelist pdf/doc/docx/xls/xlsx/png/jpg/jpeg/gif/webp, <=20MB, stored in `server/data/uploads/`.
- Frontend readonly logic exactly per spec chapter 5 (`isStepReadOnly`).
- Project files authored in Chinese UI copy; ASCII in code where reasonable.

## File Map

- `server/` — Express entry `index.js`, `db/init.js`, `db/schema.sql` (copied), `db/data/`, `middleware/auth.js`, `middleware/upload.js`, `utils.js`, `routes/*.js` (auth, endCustomers, contractCustomers, materials, guidePrices, orders, proposals, quotations, approvals, customerPos, attachments, shipping, invoices, commission, settings, dashboard, salesHistory, auditLogs, todos), `scripts/smoke-test.mjs`.
- `client/` — `vite.config.js`, `public/logo.svg` (copied), `src/main.jsx`, `src/App.jsx`, `src/api/index.js`, `src/context/AuthContext.jsx`, `src/context/ThemeContext.jsx`, `src/theme/md3Theme.js`, `src/utils/constants.js`, `src/utils/helpers.js`, 10 pages, 13 step/layout components.
- `deploy/` — Dockerfile, nginx/atlas-copco.conf, pm2/ecosystem.config.cjs, scripts/backup.sh, scripts/setup.sh, ssl/README.md, README.md.
- `docs/superpowers/plans/2026-08-01-atlas-copco-oms.md` — this plan.

## Task 1: Project scaffold, dependencies, git

**Files:**
- Create: `package.json` (root, scripts only), `server/package.json`, `client/package.json`, `.gitignore`, `server/db/schema.sql` (copy), `client/public/logo.svg` (copy)

- [ ] **Step 1:** `git init` with bundle git, create `.gitignore` (node_modules, dist, server/db/data, .DS_Store).
- [ ] **Step 2:** Copy `schema.sql` and `Atlas-Copco-Logo.svg` verbatim into the project.
- [ ] **Step 3:** Write both `package.json` files with exact dependency lists.
- [ ] **Step 4:** Install with pnpm (network escalation required); verify `node -e "require('better-sqlite3')"`.
- [ ] **Step 5:** Commit scaffold.

## Task 2: Database init, auth, middleware, utils

**Files:**
- Create: `server/db/init.js`, `server/middleware/auth.js`, `server/middleware/upload.js`, `server/utils.js`
- Modify: `server/index.js` later; this task only creates the modules.

**Interfaces:**
- `initDb(dataDir)` -> `{ db, close, dbPath }`; seeds admin; exports `db` singleton helpers used by routes.
- `authenticate(req,res,next)` — JWT Bearer check.
- `upload.single('file')` / `upload.array('files', 10)` — multer disk storage.
- `utils.js` exports: `round2`, `round4`, `nowUtc()`, `todayLocal()`, `validateDate`, `writeAudit(db, userId, action, entityType, entityId, detail)`, `isMoney(n)`, `isBool(n)`, `isQty(n)`, `pct`, `normalizeSo`.

- [ ] **Step 1:** Implement modules; `node --check` each file.
- [ ] **Step 2:** Boot init against temp dir; assert 23 tables exist and admin seeded with bcrypt hash.
- [ ] **Step 3:** Commit.

## Task 3: Core routes (auth, customers, materials, guide prices, orders)

**Files:**
- Create: `server/routes/auth.js`, `server/routes/endCustomers.js`, `server/routes/contractCustomers.js`, `server/routes/materials.js`, `server/routes/guidePrices.js`, `server/routes/orders.js`

**Behavior highlights:**
- Auth: login (bcrypt compare, 7-day JWT), change-password, me.
- Customers/guide prices: standard CRUD with validation.
- Materials: CRUD + `GET /check-framework` + `GET /lookup` implementing the 8-case price decision table (Appendix B).
- Orders: create with `ORD-YYYYMMDD-NNNN` generation (transaction + retry), list (search/status/customer filter), detail (full aggregate), patch allowed fields per status, delete only early statuses with child cleanup + audit, `PATCH /:id/status` actions `advance` (with skipProposal), `bid`, `toggle-delivered`, `toggle-invoiced` with all spec validations and auto-advance to commission.

- [ ] **Step 1:** Implement files; `node --check`.
- [ ] **Step 2:** Wire provisional `server/index.js` mounting auth-protected routes.
- [ ] **Step 3:** Commit.

## Task 4: Proposal, quotation, approval, PDF, PO routes

**Files:**
- Create: `server/routes/proposals.js`, `server/routes/quotations.js`, `server/routes/approvals.js`, `server/routes/customerPos.js`

**Behavior highlights:**
- Proposals: version CRUD (sort_order auto), selections CRUD; delete cascades children/attachments.
- Quotations: rounds list/create (auto copy from latest proposal or previous round), items CRUD with price calc, submit validation, sync-from-proposal (framework/guide recalc, manual preserved), price lookup, PDF generation via PDFKit (POST generate, GET download).
- Approvals: submit/approve/reject per the 7 rules; supersede semantics; auto-advance on double approve; auto-revert to quotation on reject.
- Customer POS: CRUD locked once order >= shipping_invoicing; po_amount>0.

- [ ] **Step 1:** Implement; `node --check`.
- [ ] **Step 2:** Commit.

## Task 5: Attachments, shipping, invoices, commission, todos, misc routes

**Files:**
- Create: `server/routes/attachments.js`, `server/routes/shipping.js`, `server/routes/invoices.js`, `server/routes/commission.js`, `server/routes/todos.js`, `server/routes/dashboard.js`, `server/routes/salesHistory.js`, `server/routes/auditLogs.js`

**Behavior highlights:**
- Attachments: upload/list/download/delete with whitelist.
- Shipping: batch CRUD (auto batch_no, sum<=100).
- Invoices: CRUD + auto invoiced + over-invoice confirm/audit.
- Commission: Excel upload with column selection, transaction matching, import_logs, waiting list, manual record.
- Todos: CRUD + toggle + overdue-count; dashboard stats; sales history join; audit logs.

- [ ] **Step 1:** Implement; `node --check`.
- [ ] **Step 2:** Commit.

## Task 6: Settings routes (workflow, fields, imports, resets, backup, data correction)

**Files:**
- Create: `server/routes/settings.js`

**Behavior highlights:** workflow GET/PUT (display config only), custom field CRUD with order_custom_fields cleanup, 5 import targets with template download + name->id matching + import_logs, reset-business / reset-factory with password confirm + audit + uploads cleanup + JWT rotation, backup zip (adm-zip) + restore, `PUT /correct-order-data` with all rollback rules (commission field clearing, SO uniqueness re-check, target status semantics).

- [ ] **Step 1:** Implement; `node --check`.
- [ ] **Step 2:** Commit.

## Task 7: Backend smoke test (full workflow + branches)

**Files:**
- Create: `server/scripts/smoke-test.mjs`

- [ ] **Step 1:** Write the smoke script using `node:test` + `fetch`: temp DB, full happy path (create -> proposal skip -> quotation 3 price sources -> submit -> approve x2 -> won -> finance -> shipping 40+60 -> delivered -> invoice -> invoiced -> commission xlsx -> closed), reject/re-submit path, over-invoice audit, data correction rollback, soft reset, hard reset JWT invalidation.
- [ ] **Step 2:** Run; fix all failures until green.
- [ ] **Step 3:** Commit.

## Task 8: Frontend foundation (theme, contexts, api, utils, layout, routing)

**Files:**
- Create: `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api/index.js`, `client/src/context/AuthContext.jsx`, `client/src/context/ThemeContext.jsx`, `client/src/theme/md3Theme.js`, `client/src/utils/constants.js`, `client/src/utils/helpers.js`, `client/src/components/AppLayout.jsx`

- [ ] **Step 1:** Implement foundation with #004E9A MD3 theme, dark auto, Axios interceptors (401 redirect, 403 snackbar), logo in layout.
- [ ] **Step 2:** `vite build` passes; commit.

## Task 9: Frontend pages 1-4 (Login, Dashboard, OrderList, OrderCreate)

**Files:**
- Create: `client/src/pages/Login.jsx`, `client/src/pages/Dashboard.jsx`, `client/src/pages/OrderList.jsx`, `client/src/pages/OrderCreate.jsx`

- [ ] **Step 1:** Implement with loading/empty/error states, dashboard cards + status distribution + recent orders + overdue badge.
- [ ] **Step 2:** `vite build` passes; commit.

## Task 10: OrderDetail + 13 step components

**Files:**
- Create: `client/src/pages/OrderDetail.jsx`, `client/src/components/OrderStepper.jsx`, `StepWrapper.jsx`, `StepCustomerInfo.jsx`, `StepProposal.jsx`, `StepQuotation.jsx`, `StepApproval.jsx`, `StepBidResult.jsx`, `StepFinance.jsx`, `StepShipping.jsx`, `StepInvoicing.jsx`, `StepCommission.jsx`, `StepClose.jsx`

- [ ] **Step 1:** Implement stepper (9 slots, shipping/invoicing share one) + readonly logic per spec chapter 5 + all confirmations/validations.
- [ ] **Step 2:** `vite build` passes; commit.

## Task 11: Remaining pages (MaterialList, Commission, SalesHistory, TodoList, Settings)

**Files:**
- Create: `client/src/pages/MaterialList.jsx`, `client/src/pages/CommissionPage.jsx`, `client/src/pages/SalesHistory.jsx`, `client/src/pages/TodoList.jsx`, `client/src/pages/Settings.jsx`

- [ ] **Step 1:** Implement all pages per spec (todos: custom month calendar, 4 groups, dots, overdue badge, quick add).
- [ ] **Step 2:** `vite build` passes; commit.

## Task 12: Deploy artifacts + README

**Files:**
- Create: `deploy/Dockerfile`, `deploy/nginx/atlas-copco.conf`, `deploy/pm2/ecosystem.config.cjs`, `deploy/scripts/backup.sh`, `deploy/scripts/setup.sh`, `deploy/ssl/README.md`, `deploy/README.md`, root `README.md`

- [ ] **Step 1:** Write all files per chapter 14 (multi-stage Docker, nginx 443/80, pm2 single instance, cron backup with wal_checkpoint, setup script).
- [ ] **Step 2:** Commit.

## Task 13: End-to-end verification and dev server

- [ ] **Step 1:** Run backend smoke test again against fresh DB.
- [ ] **Step 2:** Start backend (3001) + vite dev server; verify login, dashboard, order detail render via browser screenshots; fix visual/functional bugs.
- [ ] **Step 3:** Final commit; report URLs and verification results.

## Self-Review Notes

- Spec coverage: all 23 tables via schema.sql; all 39 API rows of chapter 10 mapped to route files; 10 pages + 13 components; deploy chapter 14; todos chapter 2.22/8/13.3; audit/error handling chapters 12.
- Ambiguity decisions: `PATCH /api/orders/:id/status` accepts `{action}` variants (advance/bid/toggle-delivered/toggle-invoiced) as the single transition endpoint; invoice auto-set and toggles both live there or in invoices route as needed; custom todo calendar implemented with plain React (no MUI X date picker) to keep dependency surface stable.
