# Booking Hub + Thomstay Coliving — 1 image cho cả web (frontend build tĩnh) và API/worker.
#   API:    node dist/index.js   (phục vụ /api + web tại cùng cổng 8787)
#   Worker: node dist/worker.js  (đồng bộ ezCloud)
#   CLI:    node dist/cli.js users | make-admin <email> | reset-link <email>

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Gọi API cùng origin
ENV VITE_API_URL=/api
RUN npx tsc --noEmit -p . && npx vite build

FROM node:22-alpine AS api
WORKDIR /api
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npx tsc -p . && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Ho_Chi_Minh STATIC_DIR=/app/public PORT=8787
RUN apk add --no-cache tzdata wget
WORKDIR /app
COPY --from=api /api/node_modules ./node_modules
COPY --from=api /api/dist ./dist
COPY --from=api /api/db ./db
COPY --from=api /api/package.json ./package.json
COPY --from=web /web/dist ./public
ARG RELEASE=local
ENV RELEASE=${RELEASE}
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
