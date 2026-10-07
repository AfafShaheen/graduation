# --- Stage 1: Builder ---
FROM python:3.11-slim AS builder

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

COPY . .

# --- Stage 2: Production ---
FROM python:3.11-slim

WORKDIR /app

# Copy python packages from builder
COPY --from=builder /install /usr/local
# Copy application source code
COPY --from=builder /app /app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
