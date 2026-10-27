# --- Stage 1: Builder ---
FROM node:20-alpine AS builder

WORKDIR /app

# Ensure package.json exists
COPY package*.json ./

RUN npm install 

COPY . .

# وكيل بناء SEO: يُحقن عنوان الموقع في index.html وملفات sitemap/robots (B10/B12).
# قابل للضبط وقت البناء: docker compose build --build-arg VITE_SITE_URL=https://example.com
ARG VITE_SITE_URL=""
ENV VITE_SITE_URL=$VITE_SITE_URL

RUN npm run build

# --- Stage 2: Production ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
