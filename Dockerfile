FROM node:24-alpine AS build

WORKDIR /app

# Antora 使用本地 Git 内容源，需要 Git 解析 HEAD。
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/site /usr/share/nginx/html

EXPOSE 80
