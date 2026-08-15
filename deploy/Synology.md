# iProject-OMS 部署到群晖 Synology（局域网访问）

适用场景：把 `cnantol/iProject` 部署到家里的群晖 NAS，先在局域网内用 `http://<NAS内网IP>:3001` 访问；出外网（Cloudflare Tunnel / DDNS）以后再说。

> 部署包本身是标准 Docker Compose，`iproject` 服务对外暴露 `3001`，Caddy（HTTPS）放在 `https` profile 里默认不启动，局域网模式完全够用。

---

## 一、部署前你要在 DSM 上做的两步（命令行装不了，需手动）

1. **安装 Container Manager（Docker）**
   - DSM 桌面 → `套件中心` → 搜索 `Container Manager` → 安装。
   - 装好后，SSH 里就能用 `docker` / `docker compose` 命令（Container Manager 自带）。

2. **开启 SSH**
   - DSM → `控制面板` → `终端机和 SNMP` → 勾选 `启用 SSH 服务`（端口默认 `22`）。
   - 用「管理员」组内账号登录（如 `admin`）；DSM 7 下执行 docker 命令需要 `sudo`。

3. **（可选但推荐）确认 NAS 架构**
   - SSH 登录后执行：`uname -m`
   - `x86_64` → Intel/AMD 机型，正常；`aarch64` → ARM 机型（如部分 DS 系列），镜像仍可跑（`node:20-bookworm` 多架构，better-sqlite3 有预编译包）。

---

## 二、需要提供给助手的 SSH 信息

- NAS 的**局域网 IP**（DSM → 控制面板 → 网络 → 网络界面，看 `192.168.x.x` 或 `10.x.x.x`）
- SSH **端口**（默认 `22`）
- 一个**管理员组内账号** + 密码（或 SSH 私钥）
- 说明：助手会用 `sudo` 跑 docker 命令；私钥仅用于本次连接，不会写入任何文件/仓库。

> 安全提示：家用 NAS 直接暴露到公网有风险。本方案先走局域网，外网访问统一走后续「Cloudflare Tunnel」，不开放路由器端口转发。

---

## 三、助手连上后会执行的步骤（你无需敲命令）

```bash
# 1. SSH 登录 NAS
ssh <账号>@<NAS内网IP> -p 22

# 2. 建工作目录（放在共享卷，数据持久化到硬盘而非系统分区）
sudo mkdir -p /volume1/docker/iproject
cd /volume1/docker/iproject

# 3. 拉代码（私有库需先配 Deploy Token / SSH key；公开库直接 clone）
sudo git clone https://github.com/cnantol/iProject.git .

# 4. 生成环境变量
sudo cp .env.example .env
# 把 JWT_SECRET 改成随机长串（助手会生成），其他保持默认即可

# 5. 构建并启动（仅 iproject，Caddy 不启）
sudo docker compose up -d --build

# 6. 验证
sudo docker compose ps
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
```

成功后，同局域网内任意设备浏览器打开 `http://<NAS内网IP>:3001` 即可使用。

---

## 四、群晖特有的注意点

- **DSM 防火墙**：若启用了 DSM 防火墙（控制面板 → 安全性 → 防火墙），需放行 `3001` 端口（来源限局域网网段，如 `192.168.1.0/24`），否则内网也访问不了。
- **路由器/交换机**：同网段设备一般直连可达；若 NAS 在 VLAN/旁路由后，需在路由器放行对应网段到 `3001`。
- **数据持久化**：SQLite 与上传附件落在 `iproject-data` 卷；删容器不丢数据。建议定期 `sudo docker compose down` 后备份 `/volume1/docker/iproject` 整个目录。
- **性能**：群晖 CPU 较弱，`--build` 编译 better-sqlite3 可能要几分钟，属正常，不要中断。

---

## 五、以后想出外网（可选，不在本次范围）

- **推荐 Cloudflare Tunnel**：免费、免端口转发、自带 HTTPS，无需公网 IP。在 NAS 上跑 `cloudflared` 容器指向 `http://iproject:3001` 即可。
- 也可走 Caddy：`docker compose --profile https up -d`（需域名 A 记录 + 80/443 可达，家用宽带通常需备案/公网 IP，故优先 Tunnel）。

## 六、更新代码

```bash
cd /volume1/docker/iproject
sudo git pull
sudo docker compose up -d --build
```
