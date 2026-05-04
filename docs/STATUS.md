# Status — Nexus Insights

**Última atualização:** 2026-05-04
**Versão atual em produção:** v0.41.1
**URL:** https://insights.nexusai360.com

---

## Em produção (v0.41.1)

### Release v0.41.1 (2026-05-04) — Hotfix usersSync

`column u.role does not exist` em todas as runs de `users` pós-v0.41.0. No Chatwoot OSS atual, `role` mora em `account_users.role` (não em `users.role`). SQL trocado de `u.role` → `au.role` (JOIN com `account_users` já existia). 1 commit.

### Release v0.41.0 (2026-05-04) — Polling Delta + UX Overhaul

> **Pivot arquitetural.** Substitui webhook event-driven (v0.38–v0.40) por **polling delta universal** direto no banco Postgres do Chatwoot.

**Por que mudou de webhook → polling delta:**
1. **Cobertura.** Webhook do Chatwoot dispara em ~8 eventos. Não cobre `inboxes`, `teams`, `users`, `account_users`, `contacts`, `reporting_events`, `taggings`, `custom_attribute_definitions` — metade do que importa pro dashboard. Polling no banco vê tudo.
2. **Independência operacional.** Webhook precisa cadastro manual no painel do Chatwoot por empresa, monitorar "está ativo?", retentativa, dedupe, token por empresa. Polling: zero disso.
3. **Reuso da infra.** Pré-agregação já era polling no banco. Polling delta é evolução da mesma camada, não reescrita.

**Arquitetura:**
- **`src/lib/chatwoot/sync/`**: cursor.ts + types.ts + 10 table-syncs + `run-delta-sync.ts` (orquestrador) + `run-full-sweep.ts` (DELETE handling)
- **`src/worker/jobs/chatwoot-sync/`**: delta-sync (processor BullMQ, concurrency 4) + scheduler (tick 5s) + full-sweep (cron 03:00 BRT)
- **runDeltaSync ENFILEIRA `refresh-by-*` jobs** ao detectar mudança (não publica `facts:refreshed` direto). Pré-agregação rebaixada de cron 5min → 30min como fallback.
- **Schema:** ADD `polling_interval_seconds` (default 30, CHECK >= 20) + `last_sync_at` em `nexus_chat_connections`. NEW table `chatwoot_sync_cursors`. DROP `webhook_token` + `webhook_secret_enc` + `last_webhook_at`. ALTER enum AuditAction (remove 6 webhook_* + add 5 polling_*).

**UX overhaul `/bancos-de-dados`:**
- Lista raiz: linha INTEIRA é `<Link>` clicável + ícone Activity (substitui TestTube)
- Edit Connection Dialog: bloco Webhook removido + campo "Intervalo de sincronização"
- Wizard sem Step Webhook (3 steps fora da conexão / 2 steps dentro com `prefilledConnectionId`)
- Aba "Tempo real" → renomeada **"Sincronização"** (KPIs polling-aware)
- Aba Saúde + card "Erros recentes top 5"
- Aba Jobs SSR-first com JobsPanel filtrado
- **Tour interativo em 6 telas** (lista + 4 abas + Edit Dialog) com `<TourTriggerButton>`

**Métricas:** ~52 commits, 108 tests novos, 1794/1814 suite verde, typecheck zero. 8 subagents paralelos. Plan v3 com 2 reviews aprofundados aplicados (28 + 20 achados).

**Pendência operacional:** João precisa **acessar o painel admin do Nexus Chat e remover o webhook cadastrado** (Configurações → Integrações → Webhooks). Endpoint dá 302 agora; sem remover, Chatwoot retentaria 4xx pra sempre.

---

## Stack atual

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + base-ui (shadcn-style)
- **Auth:** NextAuth v5 (JWT stateless, Credentials provider, bcryptjs)
- **DB principal:** PostgreSQL + Prisma 7 (`@prisma/adapter-pg`); client em `@/generated/prisma/client`
- **Cache/Queue:** Redis 7 + BullMQ + Redis Pub/Sub + SSE em `/api/events`
- **Polling delta universal** (v0.41+): worker BullMQ `chatwoot-sync-delta` lê banco Chatwoot a cada N segundos (configurável por connection); enfileira jobs `refresh-by-*` da pré-agregação on-demand. Sweep diário 03:00 BRT detecta IDs órfãos.
- **Pré-agregação** (v0.8+): camada `src/lib/chatwoot/facts.ts` lê 6 tabelas internas `chatwoot_facts_*`. Worker BullMQ refresca on-demand quando polling delta detecta mudança; cron 30 min como fallback.
- **Tour interativo:** `TourProvider` + `useTour` + `TourTriggerButton` + 6 configs em `src/components/tour/tours/bancos-de-dados/`.
- **RBAC duas camadas:** `platformRole` (super_admin > admin > manager > viewer) × `companyRole` (company_admin > manager > viewer) via `UserCompanyMembership`.
- **Tema:** ThemeProvider próprio via cookie SSR-aware (NUNCA `next-themes`).
- **Toast:** Sonner customizado (pilha bottom-up, timers independentes).
- **Ícones:** Lucide React. Emojis proibidos em UI.
- **Testes:** Jest + jest-mock-extended + React Testing Library. Suite atual: 1794/1814 verde (20 falhas pré-existentes em `integrations-power-bi.test.ts` desde v0.39, não introduzidas por nada recente).
- **Soft delete:** padrão `deletedAt: DateTime?`.
- **Encryption:** AES-256-GCM para dados sensíveis (`src/lib/encryption.ts`).
- **Audit:** `src/lib/audit.ts → logAudit()`.

---

## Documentação canônica

- **Operação polling delta:** `docs/runbooks/polling-delta-sync.md`
- **Operação pré-agregação:** `docs/runbooks/pre-agregacao.md`
- **Operação multi-tenant base:** `docs/runbooks/multi-tenant-realtime.md`
- **Deploy:** `docs/runbooks/deploy.md`
- **Escopo per-empresa:** `docs/runbooks/escopo-por-empresa.md`
- **Chatwoot URLs:** `docs/runbooks/chatwoot-account-urls.md`
- **Credenciais LLM:** `docs/runbooks/credenciais-llm.md`
- **Power BI:** `docs/runbooks/integracoes-power-bi.md`
- **Embedded signup:** `docs/runbooks/embedded-signup-setup.md`
- **Agente Nex:** `docs/runbooks/agente-nex-prompt-v0.16.md` + `consumo-drill-down-v0.16.md` + `agente-nex-audio-e-kb-url.md`
- **Agentes ativos / coordenação multi-sessão:** `docs/agents/_README.md` + `AGENTS.md` + `docs/agents/HISTORY.md`

## Documentação de planos/specs (releases recentes)

`docs/superpowers/plans/` e `docs/superpowers/specs/` — apenas a versão final de cada release (vN-1/vN-2 deletados na faxina v0.41.1+).

Plans ativos:
- `2026-05-04-polling-delta-ux-overhaul.md` (v0.41 — atual)
- `2026-05-04-multi-tenant-realtime-fase3-ui-completa.md` (v0.40)
- `2026-05-03-multi-tenant-realtime-fase1.md` (v0.37 — fundação ainda viva)
- Releases conversas: `conversas-fixes-v030/v029/v027.md`, `conversas-polish-v025.md`, `conversas-filtros-v032.md`, `conversas-bugfix-v035.md`
- Releases agente nex: `agente-nex-polish-v026/v027/v031.md`, `suite-agente-nex-polish-v2.md`
- `dashboard-conversas-chart-fix.md` (v0.36)

Specs:
- `multi-tenant-realtime-fase1-fundacao-design.md`
- `multi-tenant-realtime-fase3-ui-completa-design.md`
- `conversas-v023-polish-design.md`
- `suite-agente-nex-polish-v2-design.md`

---

## Histórico de releases (resumo)

- **v0.41.1** (2026-05-04) — Hotfix usersSync (`u.role` → `au.role`)
- **v0.41.0** (2026-05-04) — Polling Delta + UX Overhaul (pivot arquitetural)
- **v0.40.0** (2026-05-04) — Multi-tenant Realtime Fase 3 (UI 4 abas + Wizard)
- **v0.39.0** (2026-05-04) — Hotfix Fase 2 (HMAC removido + sidebar Bancos de dados)
- **v0.38.0** (2026-05-04) — Multi-tenant Realtime Fase 2 (Webhook event-driven — REMOVIDO em v0.41)
- **v0.37.0** (2026-05-04) — Multi-tenant Realtime Fase 1 (fundação)
- **v0.36.0** (2026-05-04) — Dashboard chart fixes
- **v0.35.0** (2026-05-04) — Conversas Bugfix (XLSX + filtro Documento)
- **v0.34.0** (2026-05-03) — Suite Agente Nex Polish v5
- **v0.32.0** (2026-05-03) — Conversas Filtros Polish v5
- **v0.30.0–v0.27.0** — séries Conversas Polish/Fixes
- **v0.26.0–v0.22.0** — séries Suite Agente Nex Polish + Dashboard
- **v0.21.0** — Empresa Ativa Global

Detalhes completos por release em `CHANGELOG.md`.
