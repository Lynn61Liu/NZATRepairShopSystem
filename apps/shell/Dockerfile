FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable
RUN corepack prepare pnpm@11.2.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/shell/package.json apps/shell/package.json
RUN pnpm install --frozen-lockfile --filter ./apps/shell...

COPY apps/shell apps/shell
WORKDIR /repo/apps/shell
ARG GIT_SHA=dev
RUN pnpm build && echo "$GIT_SHA" > /repo/apps/shell/dist/version.txt

FROM nginx:alpine
COPY apps/shell/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/shell/dist /usr/share/nginx/html
EXPOSE 80
