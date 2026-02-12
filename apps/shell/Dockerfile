FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable

# 你的 build context 就是 apps/shell，所以直接 COPY 当前目录文件
COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
