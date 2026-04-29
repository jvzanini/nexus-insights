# Nexus Insights

> Plataforma web de relatórios e insights da operação Chatwoot da Matrix Fitness Group — distribuidora nacional de equipamentos de academia.

[![Deploy](https://img.shields.io/badge/deploy-portainer-blue)](https://painel.nexusai360.com) [![License](https://img.shields.io/badge/license-private-red)]() [![Stack](https://img.shields.io/badge/stack-next.js%2016%20%7C%20prisma%207-violet)]()

## Visão geral

Nexus Insights é uma plataforma de **somente leitura** que se conecta ao banco PostgreSQL do Chatwoot via usuário read-only (`chatwoot_leitura`), agrega dados e produz relatórios filtráveis por estado, departamento, atendente, período e status. Não realiza ações no Chatwoot — apenas redireciona o usuário para a conversa específica via deep-link quando necessário.

- **URL de produção:** https://insights.nexusai360.com
- **Branding:** seguindo o padrão do projeto Roteador Webhook Meta da Nexus AI.
- **Domínio Chatwoot:** https://chatwoot.znsolucoes.com.br

## Funcionalidades

### Implementado
- Cópia integral do esqueleto do Roteador Webhook Meta (auth, sidebar, tema dark/light/system, primitivos UI).
- Modelo de dados próprio: `User`, `UserAccountAccess`, `UserTeamAccess`, `AppSetting`, `AuditLog`, `PasswordResetToken`, `EmailChangeToken`.
- Auth completa (NextAuth v5, JWT stateless, bcrypt, rate-limit, audit).
- Sidebar adaptada com navegação para os 12 relatórios + Usuários + Configurações + Perfil.
- Tela de login replicando exatamente o visual do Roteador.
- Healthcheck granular `/api/health` com checks de DB, Redis e Chatwoot.
- Camada de acesso ao Chatwoot via `pg` (pool dedicado) com `withChatwootResilience`.
- Cache híbrido (Redis pull-through) com TTL configurável em runtime.
- Settings dinâmicos (`AppSetting`) com cache 60s e invalidação SSE.
- Worker BullMQ (audit-write, housekeeping placeholders).

### Em construção (próximas fases)
- 12 relatórios completos (Dashboard, Conversas, Leads, Volumetria, Tempos, Ranking, Por Departamento, Por Estado, Status, CSAT, SLA, Matrix IA).
- Server actions completas de usuários com regras hierárquicas e subset rules.
- Tela `/usuarios` com tabela completa, dialogs, audit tab.
- Tela `/configuracoes` (super admin) com toggles em tempo real.
- Account switcher (super admin).
- Worker pré-aquecimento real de cache.
- Testes Jest com cobertura ≥80% nas áreas críticas.
- Mapa do Brasil colorido por volume.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Linguagem | TypeScript 5 strict |
| Styling | Tailwind CSS 4 + base-ui (shadcn-style) |
| Auth | NextAuth.js 5 (Credentials + JWT + bcryptjs) |
| ORM (próprio DB) | Prisma 7 + `@prisma/adapter-pg` |
| Acesso Chatwoot | `pg` 8 com queries SQL parametrizadas + Zod |
| Cache & pub/sub | Redis 7 + ioredis |
| Filas | BullMQ 5 |
| Realtime | SSE em `/api/events` |
| Charts | Recharts 3 |
| Email | Resend + React Email |
| Tests | Jest 30 + jest-mock-extended |
| Container | Docker + Traefik labels |
| Registry | `ghcr.io/jvzanini/nexus-insights` |
| CI/CD | GitHub Actions → GHCR → Portainer redeploy |

## Estrutura

```
src/
├── app/
│   ├── (auth)/      # login, forgot, reset, verify-email
│   ├── (protected)/ # dashboard, relatorios, usuarios, configuracoes, perfil
│   └── api/         # auth, events, health, user/theme
├── components/
│   ├── layout/      # sidebar
│   ├── login/       # login-branding, content, form
│   ├── providers/   # session, theme
│   └── ui/          # primitivos base-ui
├── lib/
│   ├── actions/     # server actions
│   ├── chatwoot/    # pool, queries, deep-link, resilience
│   ├── cache/       # keys, pull-through
│   ├── settings/    # get, update
│   ├── constants/   # roles, nav
│   ├── permissions  # canCreateRole, canEditUser, etc
│   ├── tenant       # getAccessibleAccountIds, getAccessibleTeamIds
│   ├── audit, prisma, redis, queue, realtime, env, email...
│   └── ...
├── worker/          # BullMQ
└── generated/prisma # gerado pelo prisma generate
prisma/
├── schema.prisma
└── seed.ts
docker/
├── Dockerfile (multi-stage)
└── entrypoint.sh
docs/
├── discovery/      # levantamentos do Chatwoot
├── superpowers/    # specs e plans v1→v2→v3
└── runbooks/
```

## Quickstart local

```bash
# 1) Variáveis
cp .env.example .env.local
# preencher CHATWOOT_DATABASE_URL com credenciais read-only do Chatwoot

# 2) Subir Postgres + Redis local
docker compose up -d db redis

# 3) Instalar deps + gerar Prisma Client
npm install
npx prisma generate

# 4) Migrar e seed
DATABASE_URL=postgresql://nexus:nexus@localhost:5433/nexus_insights npm run prisma:migrate
DATABASE_URL=postgresql://nexus:nexus@localhost:5433/nexus_insights ADMIN_EMAIL=admin@dev.local ADMIN_PASSWORD=admin12345 npm run prisma:seed

# 5) Dev
npm run dev
```

App em `http://localhost:3000`. Login com `admin@dev.local` / `admin12345`.

## Deploy

Imagem publicada em `ghcr.io/jvzanini/nexus-insights:latest`. Stack rodando no Portainer da Nexus AI atrás de Traefik com SSL Let's Encrypt automático em `insights.nexusai360.com`.

CI/CD: push em `main` → GitHub Actions → build & push GHCR → Portainer redeploy via API.

Variáveis em produção (não versionadas): `.env.production`. Compose de produção: `docker-compose.production.yml`.

## Documentação

- **Spec de design (v3 final):** [`docs/superpowers/specs/2026-04-29-nexus-insights-design-v3.md`](docs/superpowers/specs/2026-04-29-nexus-insights-design-v3.md)
- **Plan de implementação (v3 final):** [`docs/superpowers/plans/2026-04-29-nexus-insights-implementation-v3.md`](docs/superpowers/plans/2026-04-29-nexus-insights-implementation-v3.md)
- **Levantamento do banco do Chatwoot:** [`docs/discovery/2026-04-29-chatwoot-schema-discovery.md`](docs/discovery/2026-04-29-chatwoot-schema-discovery.md)
- **Decisões consolidadas:** [`docs/discovery/2026-04-29-decisoes-consolidadas.md`](docs/discovery/2026-04-29-decisoes-consolidadas.md)
- **Status atual:** [`docs/STATUS.md`](docs/STATUS.md)
- **CLAUDE.md raiz:** regras supremas do projeto.

---

Nexus AI © 2026. Todos os direitos reservados.
