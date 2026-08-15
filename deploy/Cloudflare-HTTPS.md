# iProject 外网 HTTPS 配置（Cloudflare 前置）

> 适用场景：iProject 已通过 frp 内网穿透以 `http://izone.org.cn` 对外提供访问（frpc 配置 `customDomains = izone.org.cn`，localPort 3001，frp 服务器 `103.24.219.85:7000`）。现需补 HTTPS，避免登录/JWT 明文传输。
> 方案：把 `izone.org.cn` 的 DNS 交给 Cloudflare（橙云代理 + Flexible SSL），**不改动 frps / NAS / frpc.toml**，即可获得 HTTPS。

## 为什么不需要动 frps
- frpc 与 frps 之间靠长连接，和 DNS 无关；frpc 仍按 `customDomains = izone.org.cn` 在 frps 上注册虚拟主机名。
- 浏览器 → Cloudflare(HTTPS) → frps `103.24.219.85:80`(HTTP, 按 Host: izone.org.cn 返回 iProject) → NAS `192.168.0.2:3001`。
- 因此 Cloudflare 只需把 `izone.org.cn` 的 A 记录指向 `103.24.219.85` 并开启代理即可。

## 步骤
1. **注册/登录 Cloudflare**（免费版足够）：https://dash.cloudflare.com/sign-up
2. **Add a Site** → 输入 `izone.org.cn` → 选 **Free** 计划。
3. ⚠️ **迁移前先备份现有 DNS**：到当前域名注册商（万网/腾讯云 DNSPod/其他）导出 `izone.org.cn` 的**全部 DNS 记录**，尤其是 **MX（邮件）、TXT、其他子域、SPF/DKIM**。改 NS 后这些记录若没在 Cloudflare 重建，邮件和相关服务会中断。
4. **改 NS**：在注册商处把 `izone.org.cn` 的 Nameserver 改为 Cloudflare 提供的两个（形如 `ns1.cloudflare.com` / `ns2.cloudflare.com`）。等待全球生效（几分钟 ~ 48 小时）。
5. **添加 DNS 记录**（Cloudflare → DNS）：
   - 类型 `A`，名称 `@`（即 `izone.org.cn`），IPv4 地址 `103.24.219.85`，代理状态 **Proxied（橙云 ✅）**
   - 把第 3 步备份的 MX/TXT/其他子域原样补回。
6. **SSL/TLS → Overview**：加密模式选 **Flexible**（最简单；若 frps 日后配了证书可改 Full/Full Strict）。
7. **SSL/TLS → Edge Certificates**：打开 **Always Use HTTPS**（浏览器 http 自动跳 https）。
8. 等待 **Universal SSL** 证书颁发（Flexible 下通常几分钟）。
9. **验证**：浏览器打开 `https://izone.org.cn`；或命令行 `curl -I https://izone.org.cn` 应返回 `HTTP/2 200`。

## 注意事项
- `webdav` 的 TCP 穿透（frpc `remotePort = 15005`）走端口转发，与 DNS 无关，改 NS 不影响它。
- 无需修改 `/volume1/docker/frpc/frpc.toml`，也无需重启 frpc 容器。
- 若 `izone.org.cn` 还承载邮件：务必先在 Cloudflare 重建 MX/TXT，否则收不到信。
- 若不想移动 NS（例如邮件在同域且不便迁移），备选方案：在 frps（`103.24.219.85`）开启 `vhostHTTPSPort` 并部署 `izone.org.cn` 的 Let's Encrypt 证书（需你控制该 frps）。

## 验证清单
- [ ] `https://izone.org.cn` 返回 200 且地址栏有锁
- [ ] 访问 `http://izone.org.cn` 自动跳转 https
- [ ] 登录后可正常进入系统（JWT 走加密通道）
- [ ] 邮件（如适用）收发正常
