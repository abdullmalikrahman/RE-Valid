#!/bin/bash
# =============================================================================
# RE-Valid — Inisialisasi Sertifikat SSL (jalankan SATU KALI saat pertama deploy)
#
# Persiapan:
#   1. Pastikan DNS sudah mengarah ke IP server 
#   2. Pastikan port 80 dan 443 terbuka di firewall 
#
# Cara jalankan (dari root project di VPS):
#   chmod +x scripts/init-ssl.sh
#   ./scripts/init-ssl.sh
# =============================================================================

DOMAIN="revalid.my.id"
EMAIL="${CERTBOT_EMAIL:-your-email@example.com}"  # set via: export CERTBOT_EMAIL=kamu@email.com
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Membuat folder certbot..."
mkdir -p "$PROJECT_ROOT/nginx/certbot/www"
mkdir -p "$PROJECT_ROOT/nginx/certbot/conf"

echo "==> Menghentikan semua container (membebaskan port 80)..."
cd "$PROJECT_ROOT"
docker compose -f docker-compose.yml -f docker-compose.prod.yml down 2>/dev/null
docker compose down 2>/dev/null

echo "==> Meminta sertifikat SSL dari Let's Encrypt (standalone mode)..."
docker run --rm \
  -p 80:80 \
  -v "$PROJECT_ROOT/nginx/certbot/conf:/etc/letsencrypt" \
  certbot/certbot certonly \
    --standalone \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

if [ $? -eq 0 ]; then
    echo "==> Sertifikat berhasil! Menjalankan semua services..."
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    echo ""
    echo "✓ HTTPS aktif di https://$DOMAIN"
    echo "✓ Auto-renewal aktif (certbot memeriksa setiap 12 jam)"
else
    echo ""
    echo "✗ Gagal mendapatkan sertifikat. Periksa:"
    echo "  - Domain $DOMAIN sudah mengarah ke IP server?"
    echo "  - Port 80 terbuka di UFW DAN di panel IDCloudHost?"
    echo "  - Email $EMAIL valid?"
fi
