# 多阶段构建不是必须：本项目含 better-sqlite3 原生模块 + 中文字体，
# 用单阶段 node:22-bookworm 一次编译运行最稳，避免原生依赖跨阶段链接出错。
# 注意：必须用 node 22 —— package.json 锁定 pnpm@11.9.0，要求 Node >= 22.13；
# 用 node 20 会因 node:sqlite 内置模块缺失导致 pnpm install 崩溃。
FROM node:22-bookworm

WORKDIR /app

# 系统依赖：
#  - build-essential / python3 : 编译 better-sqlite3 原生模块
#  - fonts-wqy-zenhei / fonts-noto-cjk : PDF 报价单中文渲染
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    fonts-wqy-zenhei \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# 启用 pnpm（版本由根 package.json 的 packageManager 字段决定）
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# 复制全部源码（.dockerignore 已排除 node_modules / .git / dist）
COPY . .

# 安装依赖并构建前端；better-sqlite3 在此阶段编译
# 注意：直接进 client 构建，避免触发根 package.json 的 prebuild(eslint)，
# 否则任意 lint 报错都会让镜像构建中断。lint 应在 CI 执行。
RUN pnpm install && cd client && pnpm build

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data
ENV TRUST_PROXY=1
ENV CJK_FONT_PATH=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc
ENV CJK_SERIF_FONT_PATH=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc
ENV CJK_MONO_FONT_PATH=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc

EXPOSE 3001

# 数据持久化到 /app/data（docker-compose 挂载卷）
VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
