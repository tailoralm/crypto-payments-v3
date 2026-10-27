FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration production

FROM nginx:alpine

COPY --from=build /app/dist/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
