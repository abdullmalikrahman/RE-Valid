# ── Stage 1: deps — install node_modules ─────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# ── Stage 2: builder — Next.js production build ───────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env — NEXT_PUBLIC_* harus di-set saat build
# Runtime API proxy dikonfigurasi via next.config.ts rewrites
ARG NEXT_PUBLIC_API_URL=http://backend:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# BuildKit cache mount: simpan .next/cache di host antar build.
# Build pertama tetap ~17 menit, build berikutnya turun ke ~2-3 menit
# karena Next.js hanya mengompilasi ulang file yang benar-benar berubah.
# NODE_OPTIONS membatasi heap Node.js agar tidak OOM-kill di VPS RAM kecil.
RUN --mount=type=cache,target=/app/.next/cache \
    NODE_OPTIONS="--max-old-space-size=1400" npm run build

# ── Stage 3: runner — minimal production image ────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Salin artefak build saja (bukan node_modules penuh)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
