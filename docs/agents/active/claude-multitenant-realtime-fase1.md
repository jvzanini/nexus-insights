---
agent: claude-multitenant-realtime-fase1
started_at: 2026-05-03T19:45-03:00
target_version: v0.33.0
status: in_progress
last_update: 2026-05-03T20:50-03:00 — L0 + L1 completos (9 commits + spec + plan)

## Coordenação multi-agente (snapshot 2026-05-03 ~22:00)
- `claude-agente-nex-polish-v031` ativo → v0.31.0 (escopo: agente-nex, llm/exchange-rate, nex_settings schema). 3 commits locais à frente.
- `claude-conversas-filtros-v032` ativo → v0.32.0 (escopo: filtros do menu Conversas, FiltersDialog).
- Meu escopo é **sessão de spec apenas** — não toco código fonte nesta sessão. Mesmo se tocasse, escopo é fundação multi-tenant (tabelas novas, pool novo, refator de queries) — sem overlap crítico com filtros de Conversas (v032) nem com agente-nex (v031).
- Não vou stage nem commitar `docs/agents/HISTORY.md`, `src/lib/llm/exchange-rate.ts` nem `src/lib/llm/__tests__/exchange-rate.test.ts` que estão modificados no working tree (são do v031).

---

## Tópico
Spec da Fase 1 do épico **Multi-tenant Realtime** — fundação para que o Nexus Insights vire hub de insights conectado a múltiplas instalações Nexus Chat (cada uma com várias accounts/empresas) e que os relatórios atualizem em tempo real via webhook.

## Escopo desta sessão
- Apenas Fase 1: modelagem `nexus_chat_connection` + `company_chat_binding`, pool dinâmico, refator das queries, CRUD super_admin de connections, migração das credenciais do `.env` para DB encriptado, `connection_id` em `chatwoot_facts_*`.
- Fases 2 (webhook + realtime em todos relatórios) e 3 (UI completa + sidebar reorg) ficam para sessões futuras.
- **NÃO escrever código nesta sessão.** Apenas spec v1→v2→v3 com double-check rigoroso.

## Arquivos que provavelmente vou tocar
- `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md` (criar)
- `docs/agents/active/claude-multitenant-realtime-fase1.md` (este arquivo)
- `docs/agents/HISTORY.md` (append no commit final)

## Arquivos compartilhados que VOU modificar
- `docs/agents/HISTORY.md` (append-only, baixíssimo risco de conflito)

## Decisões / contexto importante
- **Naming absoluto:** UI/copy/menus = "Nexus Chat". "Chatwoot" só em nomes técnicos legados de tabelas e variáveis privadas (renome gradual em fases futuras).
- **Governança:** super_admin only para gerenciar conexões e empresas (decisão (a) do João).
- **Webhook:** 1 webhook por instalação Chatwoot, compartilhado entre todas as accounts daquela instalação. App roteia internamente pelo `account.id` no payload (decisão arquitetural confirmada com o João).
- **Encriptação:** AES-256 via `src/lib/encryption.ts` para senhas de banco e webhook secret.
- **Pool dinâmico:** substituir `getChatwootPool()` global por `getNexusChatPool(connectionId)` com cache `Map<connectionId, Pool>`.
- **Pré-agregação por binding:** `chatwoot_facts_*` ganham `connection_id` na PK (migration aditiva + backfill).

## Bloqueios
- Aguardando review e aprovação do João da spec v3.

## Status
- ✅ Spec v3 final (commit 5047b51): `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md`. 58 achados pente fino aplicados.
- ✅ Plan v3 final (commit fc6b40b): `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase1.md` + snapshots v1/v2. 48 achados pente fino aplicados.
- ✅ L0 — Schema migrations + erros (4 commits: T0.1 fbe1650 / T0.2 49bd1b2 / T0.2b b087162 / T0.3 b978a8e):
  - errors.ts (ConnectionUnavailableError + NoActiveBindingError + AmbiguousBindingError, 4 tests).
  - schema.prisma com NexusChatConnection + CompanyChatBinding + connection_id em 6 facts tables.
  - ensureNexusChatTables (DDL idempotente runtime, 5 tests).
  - RealtimeEvent enriquecido com connectionId + connection:updated/deleted (6 tests).
- ✅ L1 — Pool dinâmico + active-connection + seed (5 commits: T1.1 65c8b8c / T1.2 8c91976 / T1.3 SKIP / T1.4 0215e25 / T1.5 59044b4):
  - pool.ts com cache + janitor 30 min + hot-reload safe (11 tests).
  - getActiveConnectionId via cache() React (4 tests).
  - T1.3 SKIPPED (defesa em getActiveConnectionId é suficiente — extender assertAccountAccess durante janela de deploy 1 quebraria todas Server Actions).
  - seed idempotente com pg_try_advisory_lock + parse(CHATWOOT_DATABASE_URL) + backfill 6 tabelas (5 tests).
  - worker/index.ts boot do seed + listener Pub/Sub (subscribe.then(on('message'))) para invalidar pool em connection:updated/deleted.
- 🟡 L2/L3/L4 — pendente (17 queries para refatorar com connectionId; paralelizar com dispatch).
- 🟡 L5 — pendente (8 server actions atualizar call-sites).
- 🟡 L6 — pendente (worker getBindingsToRefresh, withMetaUpdate, 4 jobs, facts.ts).
- 🟡 L7 — pendente (useFactsRealtime + Visão Geral).
- 🟡 L8 — pendente (UI super_admin com ui-ux-pro-max).
- 🟡 L9 — pendente (constraint NOT NULL + release).

## Total atual
- 11 commits novos: spec(1) + plan(1) + L0(4) + L1(5).
- 35 tests novos verde (errors 4 + ensure-tables 5 + pool 11 + active-connection 4 + seed 5 + realtime 6).
- Typecheck 0 erros minha área (erros pré-existentes em usage-stats.test.ts são do v031, escopo distinto).
- Code minha área não toca código de v031/v032.

## HISTORY.md NÃO atualizado nesta sessão
- Outros agentes ativos (`claude-agente-nex-polish-v031`, `claude-conversas-filtros-v032`) modificaram HISTORY.md.
- Append da sessão será feito no commit de release final (T9.3) quando a Fase 1 fechar.
