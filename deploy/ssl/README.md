# SSL 证书申请与配置指引

推荐使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 签发并自动配置 Nginx（需域名 A 记录已指向服务器）
sudo certbot --nginx -d your-domain.com

# 证书路径
/etc/letsencrypt/live/your-domain.com/fullchain.pem
/etc/letsencrypt/live/your-domain.com/privkey.pem
```

阿里云 / 腾讯云轻量服务器也可在云控制台申请免费 SSL 证书并下载 Nginx 版证书文件，
将 `deploy/nginx/atlas-copco.conf` 中的证书路径替换为对应文件后 `sudo nginx -s reload`。

安全组要求：仅开放 80 / 443，不要开放 3001。
