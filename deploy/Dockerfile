# Atlas Copco 销售机会管理系统 - 多阶段构建镜像
FROM node:20-alpine AS builder

WORKDIR /app

# 国内部署时可通过 --build-arg NPM_REGISTRY=https://registry.npmmirror.com 加速
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY

# corepack 会按 package.json 的 packageManager 字段安装 pnpm；
# better-sqlite3 在 alpine(musl) 上无预编译产物，需要本机编译工具链
RUN corepack enable
RUN apk add --no-cache python3 make g++

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile --registry="$NPM_REGISTRY"

COPY server server
COPY client client
RUN pnpm --filter atlas-copco-client build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/server server
COPY --from=builder /app/client/dist client/dist
COPY package.json ./

VOLUME ["/app/server/db/data"]
EXPOSE 3001

CMD ["node", "server/index.js"]
