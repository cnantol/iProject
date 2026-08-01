# Atlas Copco 订单管理系统 - 多阶段构建镜像
FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile

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
