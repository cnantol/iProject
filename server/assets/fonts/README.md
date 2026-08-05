# CJK 字体说明（报价单 PDF）

报价单 PDF 需要中文字体，否则中文会显示为空白或方块。

推荐两种方式之一：

1. 将中文字体文件放入本目录，例如 `NotoSansCJK-Regular.ttc`、`NotoSansSC-Regular.ttf`，后端会自动从
   `server/assets/fonts/` 或 `/app/assets/fonts/` 加载。
2. 设置环境变量 `CJK_FONT_PATH=/path/to/font.ttc` 指定字体文件。

部署到 Docker/Linux 时也可直接安装系统字体包，例如：

```bash
apt-get install -y fonts-noto-cjk
```

常用候选路径已内置：`/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`、
`/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc` 等。
