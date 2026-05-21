FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@11.2.2 --activate


COPY package.json ./
RUN pnpm install

COPY . .
ARG GIT_SHA=dev
RUN pnpm build && echo "$GIT_SHA" > /app/dist/version.txt

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
