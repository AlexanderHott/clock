FROM ghcr.io/voidzero-dev/vite-plus:latest AS build
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version* ./
RUN vp install --frozen-lockfile
COPY --chown=vp:vp . .
RUN vp build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
