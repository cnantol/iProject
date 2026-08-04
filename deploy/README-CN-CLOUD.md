# 国内公有云部署教程（阿里云 ECS / 腾讯云 CVM）

适用于阿里云 ECS、腾讯云 CVM 等国内云主机。系统为单体架构：Node.js + Express + SQLite，前端构建产物由 Express 托管，容器只需暴露 3001 端口并挂载数据卷。

## 1. 适用环境与推荐配置

- 操作系统：Ubuntu 22.04 / 24.04（CentOS 7 需把示例命令换成 yum/firewalld）。
- 推荐配置：2 核 2G 起，系统盘 20G 以上。
- 数据目录：`/srv/atlas-copco/data`（数据库、上传附件、Logo、JWT 密钥都在这里）。

## 2. 云控制台准备

1. 购买并启动一台云主机，确保能 SSH 登录（阿里云控制台/腾讯云控制台获取公网 IP）。
2. 提前放行安全组端口，否则外网无法访问（详见第 7 节）。
3. 如果要使用域名 + 80/443，域名需要先完成 ICP 备案；未备案前可先用 `IP:3001` 访问，或选择香港/新加坡等区域的轻量服务器。

## 3. 安装 Docker 并配置国内加速

安装 Docker（Ubuntu 示例，使用阿里云镜像源）：

```bash
curl -fsSL https://get.docker.com | sudo bash -s docker --mirror Aliyun
sudo systemctl enable --now docker
```

配置镜像加速，避免拉取 `node:20-alpine` 过慢：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://mirror.ccs.tencentyun.com"
  ]
}
EOF
sudo systemctl restart docker
sudo docker info | grep -A2 "Registry Mirrors"
```

说明：`mirror.ccs.tencentyun.com` 仅在腾讯云内网可用；阿里云建议在「容器镜像服务 → 镜像加速器」领取专属加速地址（形如 `https://xxxx.mirror.aliyuncs.com`）替换到列表第一位。

## 4. 获取源码

```bash
cd /opt
sudo git clone https://github.com/cnantol/Atlas-Copco.git
cd Atlas-Copco
```

如果服务器访问 GitHub 不稳定，可以在 GitHub 页面下载 ZIP 后通过控制台/FileZilla 上传到服务器，再解压使用。

## 5. 构建镜像

国内网络推荐使用 npmmirror 作为 npm 镜像源，构建参数已内置支持：

```bash
cd /opt/Atlas-Copco
sudo docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f deploy/Dockerfile -t atlas-copco:1.1.1 .
```

网络正常时也可以省略 `--build-arg`（默认使用官方 npm 源）。构建完成后确认：

```bash
sudo docker images | grep atlas-copco
```

## 6. 启动容器

```bash
sudo mkdir -p /srv/atlas-copco/data
sudo docker run -d --name atlas-copco --restart=always \
  -p 3001:3001 \
  -v /srv/atlas-copco/data:/app/server/db/data \
  atlas-copco:1.1.1
sudo docker logs -f atlas-copco
```

日志显示启动完成后，浏览器访问 `http://公网IP:3001`，账号 `admin / password`，登录后请立即修改密码。

## 7. 安全组与系统防火墙

阿里云 ECS：控制台 → ECS 实例 → 安全组 → 配置规则 → 入方向 → 手动添加 TCP 3001（源建议限定为家庭宽带 IP；使用域名时同时放行 80/443）。

腾讯云 CVM：控制台 → CVM → 安全组 → 入站规则 → 放通 TCP 3001（使用域名时同时放行 80/443）。

系统防火墙（如已启用）：

```bash
# Ubuntu ufw
sudo ufw allow 3001/tcp

# CentOS firewalld
sudo firewall-cmd --permanent --add-port=3001/tcp && sudo firewall-cmd --reload
```

## 8. 验证部署

```bash
curl -I http://127.0.0.1:3001
sudo docker ps
sudo docker logs --tail 50 atlas-copco
```

浏览器打开 `http://公网IP:3001`，能看到登录页即部署成功。

## 9. 域名 + HTTPS（可选）

1. 域名解析 A 记录指向服务器公网 IP，且已完成 ICP 备案。
2. 在腾讯云「SSL 证书」或阿里云「数字证书管理服务」申请免费证书，下载 Nginx 格式证书。
3. 安装 Nginx 并放置证书：

   ```bash
   sudo apt install nginx -y
   sudo mkdir -p /etc/nginx/certs/your-domain.com
   # 将 fullchain.pem 与 privkey.pem 上传到上述目录
   ```

4. 复制并修改反向代理配置：

   ```bash
   sudo cp /opt/Atlas-Copco/deploy/nginx/atlas-copco.conf \
     /etc/nginx/conf.d/atlas-copco.conf
   sudo vim /etc/nginx/conf.d/atlas-copco.conf
   ```

   把 `your-domain.com` 替换为实际域名，证书路径替换为 `/etc/nginx/certs/your-domain.com/` 下的文件。

5. 生效：

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

   使用域名后，安全组只需放行 80/443，3001 可仅对 127.0.0.1 开放或关闭。

## 10. 备份与更新

备份优先使用系统内「系统设置 → 备份」导出的全站 zip（应用会保证 SQLite 一致性），也可以对 `/srv/atlas-copco/data` 目录做定时快照。

更新版本：

```bash
cd /opt/Atlas-Copco
sudo git pull
sudo docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f deploy/Dockerfile -t atlas-copco:1.1.1 .
sudo docker rm -f atlas-copco
sudo docker run -d --name atlas-copco --restart=always \
  -p 3001:3001 \
  -v /srv/atlas-copco/data:/app/server/db/data \
  atlas-copco:1.1.1
```

只要不删除 `/srv/atlas-copco/data`，更新和重建容器都不会丢数据。

## 11. 常见问题

- 外网打不开：依次检查安全组入方向、云主机系统防火墙、`docker ps` 是否在运行。
- 构建慢或失败：确认 `/etc/docker/daemon.json` 加速已生效；重试或改用 npmmirror 构建参数。
- 容器反复重启：执行 `sudo docker logs atlas-copco` 查看具体报错。
- GitHub 克隆慢：下载 ZIP 上传到服务器后解压。
- 磁盘空间不足：`sudo docker system prune -af` 清理无用镜像与构建缓存，再重新构建。
- 忘记密码：系统为单管理员且无找回流程，可先在系统内做全站备份，再清空 `/srv/atlas-copco/data` 让系统重建默认账号 `admin / password`（会清空业务数据）。
