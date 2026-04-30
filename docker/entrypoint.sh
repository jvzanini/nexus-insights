#!/bin/sh
set -e

cd /app

# Detecta se este container é o worker — neste caso pula migrations/seed
# (essas tarefas são responsabilidade do container `app`, evitando race
# condition quando ambos sobem juntos).
case "$1" in
  *worker*|*tsx*)
    echo "[entrypoint] Modo WORKER detectado (cmd='$@'). Pulando migrations/seed."
    exec "$@"
    ;;
esac

echo "[entrypoint] Aplicando migrations…"
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
