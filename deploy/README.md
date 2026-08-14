# iProject-OMS 部署手册（Docker · 腾讯云轻量/通用云服务器）

适用：React(Vite) + Express + better-sqlite3 单体仓库。
两种访问模式**可同时并存**：
- **模式 A · IP 直连**：`http://<公网IP>:3001`，开箱即用，HTTP 不加密。
- **模式 B · 域名 + HTTPS**：`https://<域名>`，由 Caddy 自动申请/续期 Let's Encrypt 证书。

---

## 一、服务器选购建议

- **厂商**：腾讯云「轻量应用服务器」或阿里云 ECS 均可（境内访问快）。
- **规格**：**2 核 4G** 最稳（2 核 2G 也能跑，但 better-sqlite3 编译时偏吃内存，建议 4G）；
  系统盘 **60GB SSD**，带宽 **4–6 Mbps**（内部 OMS 够用）。
- **镜像**：**Ubuntu 22.04 LTS**（Docker 官方支持好）。
- **区域**：选离你/客户近的，如上海/广州。
- **费用**：轻量 2C4G 约 ¥80–120/月；先在按量/新用户优惠下试跑。

> 备注：本项目数据库是 SQLite 文件（无需额外买云数据库），唯一持续占用磁盘的是 `DATA_DIR`（库+上传附件）。

---

## 二、服务器初始化（一次性）

SSH 登录后执行：

```bash
# 1) 安装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # 免 sudo 跑 docker（重登后生效）
# 2) 安装 docker compose 插件（新 docker 已自带，验证一下）
docker compose version

# 3) 开放防火墙端口
sudo ufw allow 3001/tcp            # 模式 A：IP 直连
sudo ufw allow 80/tcp              # 模式 B：HTTP→HTTPS 跳转 + 证书校验
sudo ufw allow 443/tcp             # 模式 B：HTTPS
```

云厂商控制台侧：在「防火墙/安全组」同样放行 **TCP 3001、80、443**（入站），否则外网打不开。

---

## 三、部署（每次发版都走这套）

```bash
# 1) 拉代码（私有库：用 Deploy Token 或 SSH key，不要把账号密码写进 URL）
git clone https://<DEPLOY_TOKEN>@github.com/cnantol/iProject.git
cd iProject

# 2) 准备环境变量
cp .env.example .env
# 务必编辑 .env，把 JWT_SECRET 改成随机长串：
nano .env
#   JWT_SECRET=$(openssl rand -base64 48)   # 可先生成再粘进去

# 3) 构建并启动（默认仅模式 A：IP:3001）
docker compose up -d --build

# 4) 看日志确认无报错
docker compose logs -f
```

浏览器访问 `http://<服务器公网IP>:3001` 即可（模式 A 已生效）。

---

## 四、模式 B · 域名 + HTTPS（推荐对外访问）

> 前置条件：你已有一个域名，且能把它的 **A 记录指向本机公网 IP**。

1. 在 `.env` 里填写：
   ```ini
   DOMAIN=oms.example.com        # 你的域名
   ACME_EMAIL=admin@example.com  # 证书联系邮箱（Let's Encrypt 要求）
   ```
2. 云控制台防火墙确认 **80/443 已放通**（见第二步），并把域名 A 记录指向服务器公网 IP。
3. 启动 Caddy 反代（应用容器已在跑，Caddy 会接管 80/443 并自动申请证书）：
   ```bash
   docker compose --profile https up -d
   ```
4. 稍等十几秒（首次需向 Let's Encrypt 申请证书），浏览器打开 `https://oms.example.com`：
   - 自动 HTTP→HTTPS 跳转；
   - 证书约 90 天，Caddy 自动续期（数据存在 `caddy-data` 卷，重启不丢）。

**此时两种模式并存**：`http://<IP>:3001` 仍可直接访问（HTTP），`https://<域名>` 走加密。

---

## 五、验证

```bash
# 模式 A
curl http://localhost:3001/api/app-logo      # 应返回 {"logo":...}

# 模式 B（证书就绪后）
curl -I https://<你的域名>                     # 应返回 200，且为 https
```

浏览器打开页面，注册/登录一个账号，跑一张报价单看 PDF 中文是否正常。

---

## 六、数据备份

`DATA_DIR`（容器内 `/app/data`，已挂到命名卷 `iproject-data`）是全部家当：

```bash
# 整卷打包备份
docker run --rm -v iproject-data:/data -v $PWD:/backup alpine \
  tar czf /backup/iproject-data-$(date +%F).tar.gz -C /data .
```

> Caddy 证书存在 `caddy-data` 卷，建议一并备份（避免频繁重新申请触发 Let's Encrypt 限流）。

---

## 七、后续更新代码

```bash
cd iProject
git pull
docker compose up -d --build
# 若启用了 https profile，Caddy 仍在运行，无需单独重启；如需同步更新：
docker compose --profile https up -d
```

---

## 八、备选：用宿主机 Nginx（不用 Caddy）

若坚持用宿主机 Nginx 而非 Caddy 容器：

1. `docker-compose.yml` 把应用端口改为仅本机：`"127.0.0.1:3001:3001"`。
2. 宿主机安装 Nginx + certbot：
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/iproject
   # 改 server_name / 证书路径为你的域名，再：
   sudo ln -s /etc/nginx/sites-available/iproject /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d your.domain.com
   ```
3. `.env` 里 `TRUST_PROXY=1` 保持不变。

---

## 排错速查

- **容器起不来 / 登录报错**：90% 是 `JWT_SECRET` 没设或为空 → 填随机串后 `docker compose up -d`。
- **PDF 中文乱码/空白**：确认 `CJK_FONT_PATH` 指向容器内真实存在的 wqy 字体路径（见 Dockerfile）。
- **better-sqlite3 编译失败**：确保 build 阶段装了 `build-essential python3`（Dockerfile 已含）。
- **外网打不开（IP 模式）**：云控制台防火墙 + 系统 ufw 都要放通 3001。
- **HTTPS 打不开 / 证书申请失败**：
  - 域名 A 记录是否真指向本机公网 IP（`ping 域名` 看解析）；
  - 云控制台 80/443 是否放通（certbot/caddy 的 http-01 校验需要 80 可达）；
  - `.env` 的 `DOMAIN` / `ACME_EMAIL` 是否填好；
  - 查看：`docker compose --profile https logs caddy`。
- **想临时只保留 IP 模式**：停掉 Caddy 即可 `docker compose --profile https down`（应用容器不受影响）。
