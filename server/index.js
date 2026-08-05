import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initDb, closeDb, getDataDir } from './db/init.js';
import { authenticate } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import endCustomerRoutes from './routes/endCustomers.js';
import contractCustomerRoutes from './routes/contractCustomers.js';
import materialRoutes from './routes/materials.js';
import guidePriceRoutes from './routes/guidePrices.js';
import orderRoutes from './routes/orders.js';
import proposalRoutes from './routes/proposals.js';
import quotationRoutes from './routes/quotations.js';
import approvalRoutes from './routes/approvals.js';
import customerPosRoutes from './routes/customerPos.js';
import attachmentRoutes from './routes/attachments.js';
import shippingRoutes from './routes/shipping.js';
import invoiceRoutes from './routes/invoices.js';
import commissionRoutes from './routes/commission.js';
import todoRoutes from './routes/todos.js';
import dashboardRoutes from './routes/dashboard.js';
import salesHistoryRoutes from './routes/salesHistory.js';
import auditLogRoutes from './routes/auditLogs.js';
import settingsRoutes from './routes/settings.js';
import { startBackupScheduler } from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/auth', authRoutes);
  app.get('/api/app-logo', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(getDataDir(), 'app-logo.json'), 'utf8'));
      return res.json({ logo: data && typeof data.logo === 'string' ? data.logo : null });
    } catch {
      return res.json({ logo: null });
    }
  });
  app.use('/api/end-customers', authenticate, endCustomerRoutes);
  app.use('/api/contract-customers', authenticate, contractCustomerRoutes);
  app.use('/api/materials', authenticate, materialRoutes);
  app.use('/api/guide-prices', authenticate, guidePriceRoutes);
  app.use('/api/orders', authenticate, orderRoutes);
  app.use('/api/orders', authenticate, proposalRoutes);
  app.use('/api/orders', authenticate, quotationRoutes);
  app.use('/api/orders', authenticate, approvalRoutes);
  app.use('/api/orders', authenticate, customerPosRoutes);
  app.use('/api/orders', authenticate, attachmentRoutes);
  app.use('/api/orders', authenticate, shippingRoutes);
  app.use('/api/orders', authenticate, invoiceRoutes);
  app.use('/api/attachments', authenticate, attachmentRoutes);
  app.use('/api/commission', authenticate, commissionRoutes);
  app.use('/api/todos', authenticate, todoRoutes);
  app.use('/api/dashboard', authenticate, dashboardRoutes);
  app.use('/api/sales-history', authenticate, salesHistoryRoutes);
  app.use('/api/audit-logs', authenticate, auditLogRoutes);
  app.use('/api/settings', authenticate, settingsRoutes);

  const distDir = path.resolve(__dirname, '..', 'client', 'dist');
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexFile = path.join(distDir, 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    return res.status(503).json({ error: '前端尚未构建，请先执行 pnpm --filter iproject-client build' });
  });

  // 404 for unmatched API routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小不能超过 20MB' });
    }
    if (err && err.message && (err.message.includes('仅支持') || err.message.includes('Unexpected field'))) {
      return res.status(400).json({ error: err.message.includes('仅支持') ? err.message : '上传字段无效' });
    }
    console.error(err);
    return res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'db', 'data');
  initDb(dataDir);
  startBackupScheduler();
  const distIndex = path.join(path.resolve(__dirname, '..', 'client', 'dist'), 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.warn('[警告] 前端构建产物不存在，请先执行 pnpm --filter iproject-client build');
  }
  const port = Number(process.env.PORT) || 3001;
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`iProject 全链路项目管理专家已启动：http://localhost:${port}`);
  });
  const shutdown = () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default createApp;
