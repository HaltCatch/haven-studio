# syntax=docker/dockerfile:1
FROM node:26.13.0-bookworm-slim AS build
ENV HUSKY=0 CI=true
WORKDIR /app
RUN npm install --global --no-audit --no-fund pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    --mount=type=cache,id=haven-studio-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir=/pnpm/store
COPY . .
RUN --mount=type=cache,id=haven-studio-angular,target=/app/.angular/cache \
    pnpm build

FROM nginx:1.31.8-alpine@sha256:1ef7ca94d7879df82421428ce13bd1eaa412404953859cf7a5b6512c25e67a60
COPY --from=build /app/dist/haven-studio/browser /usr/share/nginx/html
COPY container/nginx.conf.template /etc/haven/nginx.conf.template
COPY --chmod=755 container/start.sh /usr/local/bin/haven-start
USER 101:101
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/haven-start"]
