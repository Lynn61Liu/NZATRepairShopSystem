FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@11.2.2 --activate

# Build from repo root so pnpm workspace files are available.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/shell/package.json ./apps/shell/package.json
RUN pnpm install --filter ./apps/shell... --frozen-lockfile

COPY apps/shell ./apps/shell
ARG GIT_SHA=dev
RUN pnpm --filter ./apps/shell build && echo "$GIT_SHA" > /app/apps/shell/dist/version.txt

FROM nginx:alpine
COPY apps/shell/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/shell/dist /usr/share/nginx/html
EXPOSE 80
