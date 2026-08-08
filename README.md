# iProject 全链路项目管理专家

1.0 正式版。单管理员自用的销售项目全链路管理专家系统，覆盖销售机会从客户信息到项目闭环的完整生命周期。

## 1.0 正式版

- 业务数据已清空，适合正式启用初始化
- 订单编号规则：`OPP-客户简称-日期-四位序号`（序号全局累计、不按天重置）
- 报价编号规则：`Q-客户简称-日期-R轮次`
- 支持最终客户/合同客户简称
- 销售机会进行中 / 存档双列表，闭环订单自动归档
- 开票后天数提醒，超过 100 天未闭环整行醒目提示
- 报价单中英文、Logo 位置、报价日期、页脚文本配置
- 系统内置字段显示名称配置，自定义字段与流程步骤绑定
- 主题三态切换（跟随系统 / 亮色 / 暗色），iProject 亮暗双版本 Logo
- 待办月历：节假日（2021-2031）、农历、二十四节气自动展示

## 功能

- 9 步工作流（客户信息 → 方案 → 报价 → 并行审批 → 中标 → 财务 → 发货+开票并行 → 佣金 → 闭环）
- 框架协议价 / 系统指导价 / 手工价三级价格决策，报价轮次与 PDF 导出
- Sales Force + OA 双线审批、驳回回退与重提
- 发货批次百分比校验、按 PO 开票与超开审计
- 佣金 Excel 全局匹配（幂等）、人工补录、等待匹配清单
- 首页看板、历史销售、待办（月历 + 分组）、基础数据、字段管理、数据导入
- 数据修正、软重置、硬重置（JWT 轮换）、全站备份/还原（可配置自动保留最近 N 份，防止占用空间）、审计日志
- 路由级代码分割、订单详情查询合并、数据库高频索引优化

## 技术栈

React 18 + Vite 5 + MUI 5（前端）；Node.js + Express (ESM) + better-sqlite3（后端）；JWT + bcryptjs；xlsx；PDFKit。

## 本地运行

开发模式（前后端分离）：

```bash
pnpm install
pnpm --filter iproject-server start      # 后端 http://localhost:3001
pnpm --filter iproject-client dev        # 前端 http://localhost:5173
```

生产模式（前端构建后由后端统一托管，只需 3001 一个端口）：

```bash
pnpm install
pnpm --filter iproject-client build
pnpm --filter iproject-server start      # http://localhost:3001
```

默认账号：`admin / password`（登录后请立即在「系统设置」修改密码）。

数据库文件与上传附件位于 `server/db/data/`，首次启动自动按 `server/db/schema.sql` 建库并种子 admin 账户。若启动日志提示前端产物不存在，请先执行 `pnpm --filter iproject-client build`。

## 后端验证

```bash
cd server && node scripts/smoke-test.mjs
```

冒烟测试覆盖：登录、价格决策、销售机会创建、报价提交、双线审批、中标、财务、发货批次校验、超开票审计、佣金幂等匹配、审批驳回重提、人工补录、数据修正回退、软/硬重置与 JWT 轮换。

## 部署到公有云（阿里云 / 腾讯云）

### 1. 准备

- 云主机推荐 Ubuntu 22.04 / 24.04，2 核 2G 起、系统盘 20G 以上。
- 阿里云 ECS：控制台 → 安全组 → 入方向放行 TCP 3001（使用域名时同时放行 80/443）。
- 腾讯云 CVM：控制台 → 安全组 → 入站规则放行 TCP 3001（使用域名时同时放行 80/443）。
- 使用域名访问 80/443 时，大陆服务器域名需完成 ICP 备案；未备案可先用 `http://公网IP:3001`。

### 2. 安装 Docker 与国内镜像加速

```bash
curl -fsSL https://get.docker.com | sudo bash -s docker --mirror Aliyun
sudo systemctl enable --now docker
sudo tee /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://docker.m.daocloud.io", "https://mirror.ccs.tencentyun.com"]
}
EOF
sudo systemctl restart docker
```

说明：`mirror.ccs.tencentyun.com` 仅在腾讯云内网可用；阿里云可在「容器镜像服务 → 镜像加速器」领取专属加速地址。

### 3. 获取源码

```bash
cd /opt
sudo git clone https://github.com/cnantol/iProject.git
cd iProject
```

国内访问 GitHub 不稳定时，可下载源码 ZIP 上传到服务器后解压。

### 4. 构建并启动

```bash
sudo docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f Dockerfile -t iproject:1.0 .
sudo mkdir -p /srv/iproject/data
sudo docker run -d --name iproject --restart=always \
  -p 3001:3001 \
  -v /srv/iproject/data:/app/server/db/data \
  iproject:1.0
sudo docker logs -f iproject
```

镜像已内置中文字体（Noto CJK），报价单 PDF 可正常显示中文。

### 5. 验证与首次登录

浏览器访问 `http://公网IP:3001`，账号 `admin / password`，登录后请立即修改密码。

### 6. 域名 + HTTPS（可选）

安装 Nginx 并把 3001 反代到 80/443，证书使用阿里云或腾讯云的免费 SSL 证书；大陆服务器使用域名需先完成 ICP 备案。

### 7. 备份与更新

所有数据都在数据卷 `/srv/iproject/data` 中（数据库、附件、Logo、JWT 密钥），容器删除重建不丢数据。更新版本：

```bash
cd /opt/iProject
sudo git pull
sudo docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f Dockerfile -t iproject:1.0 .
sudo docker rm -f iproject
sudo docker run -d --name iproject --restart=always \
  -p 3001:3001 \
  -v /srv/iproject/data:/app/server/db/data \
  iproject:1.0
```

## 目录结构

```text
server/             Express 后端（routes / middleware / db / scripts）
server/db/data/     运行数据库与上传附件
server/assets/      静态资源（CJK 字体说明等）
client/             React + Vite + MUI 前端
client/public/      Logo（亮/暗）、favicon
Dockerfile          多阶段构建镜像（含中文字体）
```
