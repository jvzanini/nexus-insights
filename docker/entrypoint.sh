#!/bin/sh
set -e

echo "[entrypoint] Aplicando migrations…"
npx prisma migrate deploy || {
  echo "[entrypoint] FALHA ao rodar migrations"
  exit 1
}

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] Rodando seed (idempotente)…"
  npx prisma db seed || echo "[entrypoint] Seed falhou (não-crítico, prosseguindo)"
fi

echo "[entrypoint] Iniciando aplicação: $@"
exec "$@"
