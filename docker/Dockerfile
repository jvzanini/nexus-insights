FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps && npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV REDIS_URL="redis://dummy:6379"
ENV CHATWOOT_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="dummy_secret_for_build_only_at_least_32_chars_long"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
ENV RESEND_API_KEY="re_dummy_for_build"
ENV ADMIN_EMAIL="dummy@dummy.com"
ENV ADMIN_PASSWORD="dummy_password_build_only"
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js ./prisma.config.js
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
# Worker roda direto via tsx em /app/src/worker/index.ts. Precisa de:
#   - src/worker (próprio worker)
#   - src/lib (redis/queue/pg-pool/chatwoot/audit etc — importados pelo worker)
# Tudo é copiado pra /app/src/* preservando a estrutura do source pra que tanto
# imports relativos (../lib/redis) quanto alias TS (@/lib/...) resolvam.
COPY --from=builder --chown=nextjs:nodejs /app/src/worker ./src/worker
COPY --from=builder --chown=nextjs:nodejs /app/src/lib ./src/lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Diretório de cache do Next 16 (next/image, prerender) precisa ser writable pelo
# usuário runtime. Sem isso, EACCES vira unhandledRejection e mata o processo.
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
