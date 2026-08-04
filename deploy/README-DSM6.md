# 群晖 DSM6 Docker 部署指南

适用于家里的群晖 NAS（DSM 6.x，在套件中心安装旧版「Docker」套件，不是 DSM7 的 Container Manager）。
系统为单体架构：Node.js + Express + SQLite，前端构建产物由 Express 托管，容器只需暴露 3001 端口并挂载数据卷。

## 准备工作

1. DSM 套件中心安装 Docker 套件。
2. 控制面板 → 终端机和 SNMP → 勾选「启动 SSH 功能」并保存。
3. SSH 登录后执行 `uname -m` 确认架构（绝大多数为 `x86_64`，部分 ARM 机型为 `aarch64`）。
4. 确认 NAS 能访问互联网（构建时需要拉取 `node:20-alpine` 和 npm 依赖）。

## 方案 A：直接在 NAS 上构建并运行（推荐）

在 NAS 本机构建会自动匹配架构，不需要 Mac 安装 Docker。

1. SSH 登录并切换到 root：

   ```bash
   ssh 用户名@NAS_IP
   sudo -i
   ```

2. 在套件中心安装 Git（或先在其他电脑下载源码再上传到 NAS），然后克隆：

   ```bash
   cd /volume1/docker
   git clone https://github.com/cnantol/Atlas-Copco.git
   cd Atlas-Copco
   ```

3. 构建镜像：

   ```bash
   docker build -f deploy/Dockerfile -t atlas-copco:1.1.1 .
   ```

4. 创建数据目录并启动容器：

   ```bash
   mkdir -p /volume1/docker/atlas-copco/data
   docker run -d --name atlas-copco --restart=always \
     -p 3001:3001 \
     -v /volume1/docker/atlas-copco/data:/app/server/db/data \
     atlas-copco:1.1.1
   ```

5. 查看启动日志并确认无报错：

   ```bash
   docker logs -f atlas-copco
   ```

6. 浏览器访问 `http://NAS_IP:3001`，账号 `admin / password`，登录后请立即在系统设置中修改密码。

## 方案 B：在其他电脑构建后导入 DSM6

1. 在有 Docker 的电脑上构建（x86_64 NAS 用 amd64）：

   ```bash
   docker build --platform linux/amd64 -f deploy/Dockerfile -t atlas-copco:1.1.1 .
   docker save -o atlas-copco-1.1.1.tar atlas-copco:1.1.1
   ```

   若 `uname -m` 显示 `aarch64`，把 `--platform linux/amd64` 改为 `--platform linux/arm64`。

2. 用 File Station 或 `scp` 把 `atlas-copco-1.1.1.tar` 传到 NAS，例如 `/volume1/docker/`。

3. SSH 登录后导入并运行：

   ```bash
   sudo -i
   cd /volume1/docker
   docker load -i atlas-copco-1.1.1.tar
   mkdir -p atlas-copco/data
   docker run -d --name atlas-copco --restart=always \
     -p 3001:3001 \
     -v /volume1/docker/atlas-copco/data:/app/server/db/data \
     atlas-copco:1.1.1
   ```

## DSM6 Docker 图形界面方式（可选）

镜像导入后也可以在 DSM6 Docker 套件中操作：镜像 → 新增 → 从文件添加；容器 → 新增 → 选择 `atlas-copco` → 高级设置中把 NAS 端口映射到 3001，并挂载 `/volume1/docker/atlas-copco/data` 到 `/app/server/db/data`，勾选「启用自动重新启动」。

## 数据与备份

数据库、上传附件、Logo 设置、JWT 密钥都保存在数据卷 `/volume1/docker/atlas-copco/data` 中，容器删除重建不会丢数据。建议定期在系统设置中导出全站备份，或对 `atlas-copco/data` 目录启用群晖 Hyper Backup。

## 更新版本

```bash
cd /volume1/docker/Atlas-Copco
git pull
docker build -f deploy/Dockerfile -t atlas-copco:1.1.1 .
docker rm -f atlas-copco
docker run -d --name atlas-copco --restart=always \
  -p 3001:3001 \
  -v /volume1/docker/atlas-copco/data:/app/server/db/data \
  atlas-copco:1.1.1
```
