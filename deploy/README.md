# iProject-OMS 部署手册（Docker · 腾讯云轻量/通用云服务器）

适用：React(Vite) + Express + better-sqlite3 单体仓库。
目标：买一台云服务器 → 装 Docker → 拉代码 → 起容器 → 浏览器 IP:3001 访问。

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

# 3) 开放防火墙端口（云控制台「防火墙」也要放通 3001）
sudo ufw allow 3001/tcp
```

云厂商控制台侧：在「防火墙/安全组」放行 **TCP 3001**（入站），否则外网打不开。

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

# 3) 构建并启动
docker compose up -d --build

# 4) 看日志确认无报错
docker compose logs -f
```

浏览器访问 `http://<服务器公网IP>:3001` 即可。

---

## 四、验证

```bash
curl http://localhost:3001/api/app-logo      # 应返回 {"logo":...}
# 或浏览器打开页面，注册/登录一个账号，跑一张报价单看 PDF 中文是否正常
```

---

## 五、数据备份

`DATA_DIR`（容器内 `/app/data`，已挂到命名卷 `iproject-data`）是全部家当：

```bash
# 整卷打包备份
docker run --rm -v iproject-data:/data -v $PWD:/backup alpine \
  tar czf /backup/iproject-data-$(date +%F).tar.gz -C /data .
```

---

## 六、后续更新代码

```bash
cd iProject
git pull
docker compose up -d --build
```

---

## 七、后续加 HTTPS / 域名（可选）

当前用 IP:3001。要绑域名+证书时，在宿主机加 Nginx 反代（见 `deploy/nginx.conf`）+ Let's Encrypt：

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/iproject
# 改 server_name 为你的域名，再：
sudo ln -s /etc/nginx/sites-available/iproject /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your.domain.com
```

之后 `.env` 里 `TRUST_PROXY=1`，访问走 80/443，容器端口不必对外暴露（compose 改 `127.0.0.1:3001:3001`）。

---

## 排错速查

- **容器起不来 / 登录报错**：90% 是 `JWT_SECRET` 没设或为空 → 填随机串后 `docker compose up -d`。
- **PDF 中文乱码/空白**：确认 `CJK_FONT_PATH` 指向容器内真实存在的 wqy 字体路径（见 Dockerfile）。
- **better-sqlite3 编译失败**：确保 build 阶段装了 `build-essential python3`（Dockerfile 已含）。
- **外网打不开**：云控制台防火墙 + 系统 ufw 都要放通 3001。
