#!/bin/sh
set -e

echo "[entrypoint] Aplicando migrations…"
cd /app
npx prisma migrate deploy --config=./prisma.config.js || {
  echo "[entrypoint] FALHA ao rodar migrations"
  exit 1
}

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] Rodando seed (idempotente)…"
  npx prisma db seed --config=./prisma.config.js || echo "[entrypoint] Seed falhou (não-crítico)"
fi

echo "[entrypoint] Iniciando aplicação: $@"
exec "$@"
