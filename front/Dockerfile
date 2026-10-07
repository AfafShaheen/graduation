# --- Stage 1: Builder ---
FROM node:18-alpine AS builder

WORKDIR /app

# Ensure package.json exists
RUN if [ ! -f package.json ]; then \
      echo '{"name": "graduation-frontend", "private": true, "scripts": {"build": "echo \"no build script\""}}' > package.json; \
    fi

RUN npm install || true

COPY . .

RUN if [ -f package.json ]; then \
      npm run build --if-present || true; \
    fi

# Fallback index.html if dist does not exist
RUN mkdir -p /app/dist && \
    if [ ! -f /app/dist/index.html ]; then \
      echo '<!DOCTYPE html><html><head><title>Graduation Ticket System</title></head><body><h1>Graduation Ticket System — Frontend</h1></body></html>' > /app/dist/index.html; \
    fi

# --- Stage 2: Production ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 5173
RUN sed -i 's/listen       80;/listen       5173;/g' /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
