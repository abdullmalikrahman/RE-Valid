# ── Stage 1: builder — install Python dependencies ────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# System deps untuk rasterio, psycopg2, shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    gdal-bin \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime system deps saja (tidak butuh build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal34 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Salin packages yang sudah terinstall dari builder
COPY --from=builder /install /usr/local

# Salin kode aplikasi
COPY . .

# Buat direktori atlas (GWA GeoTIFF mount point)
RUN mkdir -p /app/data/atlas

# Non-root user untuk keamanan
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
