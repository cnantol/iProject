# 公有云部署说明（单人自用）

本系统为单体架构：Node.js + Express + SQLite，前端构建产物由 Express 直接托管。
Docker 与 PM2 两种运行方式**二选一**，禁止混用。

## 方案 A：Docker（推荐）

```bash
docker build -f deploy/Dockerfile -t atlas-copco .
docker run -d -p 3001:3001 --restart=always \
  -v /srv/atlas-copco/data:/app/server/db/data \
  atlas-copco
```

必须挂载数据卷 `/app/server/db/data`，否则数据库与上传附件会随容器销毁丢失。

## 方案 B：PM2（需 Node.js 20+）

```bash
pnpm install
pnpm --filter atlas-copco-client build
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

## Nginx 与 HTTPS

1. 将域名 A 记录指向服务器公网 IP；
2. 复制 `deploy/nginx/atlas-copco.conf` 到 `/etc/nginx/conf.d/`，替换域名与证书路径；
3. 申请证书见 `deploy/ssl/README.md`；
4. 安全组仅开放 80/443；
5. `sudo nginx -t && sudo systemctl reload nginx`。

## 每日备份

```bash
crontab -e
# 添加：
0 2 * * * /path/to/atlas-copco/deploy/scripts/backup.sh >> ~/backups/backup.log 2>&1
```

备份包含数据库一致性快照、上传附件与部署配置，保留最近 30 天。

## 首次使用

访问 `https://your-domain.com`，使用默认账号 `admin / password` 登录后立即修改密码。

## 群晖 NAS（DSM6）

家里的群晖 DSM6 Docker 部署步骤见 [README-DSM6.md](README-DSM6.md)。

## 国内公有云（阿里云 / 腾讯云）

阿里云 ECS、腾讯云 CVM 的完整部署教程（含国内镜像加速、安全组、HTTPS、备份更新）见 [README-CN-CLOUD.md](README-CN-CLOUD.md)。
