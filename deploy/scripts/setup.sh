#!/usr/bin/env bash
# Atlas Copco 订单管理系统 - 服务器一键环境初始化脚本（Ubuntu 22.04 / CentOS 7+）
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请以 root 运行：sudo bash setup.sh"
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl git nginx docker.io sqlite3
  systemctl enable --now docker
  systemctl enable --now nginx
elif command -v yum >/dev/null 2>&1; then
  yum install -y curl git nginx docker sqlite
  systemctl enable --now docker
  systemctl enable --now nginx
else
  echo "未识别的系统，请手动安装 Docker/Nginx/Node.js 20+"
  exit 1
fi

curl -fsSL https://get.pnpm.io/install.sh | sh - || true

echo "环境初始化完成。下一步："
echo "1. 将工程上传至服务器"
echo "2. 配置 deploy/nginx/atlas-copco.conf 中的域名与证书"
echo "3. 执行 docker build -t atlas-copco . && docker run -d -p 3001:3001 --restart=always -v /srv/atlas-copco/data:/app/server/db/data atlas-copco"
echo "4. 配置每日备份 crontab"
