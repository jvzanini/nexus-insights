---
agent: claude-multitenant-realtime-fase1
started_at: 2026-05-03T19:45-03:00
target_version: v0.36.0+
status: review
last_update: 2026-05-03T22:30-03:00 — L0 + L1 + L7 + L8 completos + Specs Fase 2 e 3 prontas; L2/L3/L4/L5/L6/L9 stand-by

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

## Status detalhado

### ✅ Especificações e plano (3 docs)
- Spec Fase 1 v3 final (5047b51) — `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md` (818 linhas, 58 achados pente fino).
- Spec Fase 2 v3 final (ca5ee02 + b35bc58 doc) — `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase2-webhook-design.md` (1245 linhas, 46 achados). Conteúdo íntegro, autoria do commit foi enxertada em commit alheio do `claude-dashboard-conversas-chart-fix` por `git add -A` indevido — mitigação documentada em HISTORY.md.
- Spec Fase 3 v3 final (8e86934 + cba8278) — `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase3-ui-completa-design.md` (964 linhas, 46 achados). ui-ux-pro-max invocada antes de detalhar UI.
- Plan Fase 1 v3 (fc6b40b) — `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase1.md` + snapshots v1/v2 (48 achados pente fino).

### ✅ L0 — Schema + erros (4 commits + 1 ajuste enum)
- T0.1 fbe1650 errors.ts (ConnectionUnavailable / NoActiveBinding / AmbiguousBinding).
- T0.2 49bd1b2 schema.prisma (NexusChatConnection + CompanyChatBinding + connection_id em 6 chatwoot_facts_*).
- T0.2b b087162 ensureNexusChatTables (DDL runtime idempotente).
- T0.3 b978a8e RealtimeEvent + connection:updated/deleted.
- T8.0 7057d97 enum AuditAction +7 valores (connection.* + binding.*).

### ✅ L1 — Pool + seed + worker (5 commits, T1.3 skipped por design)
- T1.1 65c8b8c pool dinâmico (cache + decrypt + janitor 30 min + hot-reload safe).
- T1.2 8c91976 getActiveConnectionId via cache() React (fail-closed AmbiguousBinding).
- T1.3 SKIP (defesa via getActiveConnectionId já suficiente).
- T1.4 0215e25 seed idempotente (advisory lock + parse env + backfill 6 tabelas).
- T1.5 59044b4 worker boot do seed + listener Pub/Sub.

### ✅ L7 — useFactsRealtime universal (3 commits via subagent)
- T7.1 8aaf3d6 hook filtra (connectionId, accountId) + listeners connection:updated/deleted.
- T7.2 cbd49a5 FactsFreshness + 6 call sites (Visão Geral + 5 outros relatórios) passam connectionId.
- ed39baf encerra subagent.

### ✅ L8 — UI super_admin /configuracoes/conexoes (7 commits)
- T8.0 7057d97 enum AuditAction (já contado em L0).
- T8.1 9375566 Server Actions connections.ts (CRUD + test).
- T8.2 2e61d0f Server Actions bindings.ts (CRUD com constraint operacional).
- T8.6 fe0da88 /api/health connections[].
- Via subagent (com ui-ux-pro-max obrigatório invocado):
  - T8.5 4699ee9 BindingListSheet + BindingFormDialog.
  - T8.4 d54f2d1 ConnectionList + ConnectionFormDialog.
  - T8.3 5dd32f9 page server /configuracoes/conexoes.

### 🟡 STAND-BY — depende de coordenação multi-agente
- L2/L3/L4 — refator de 17 queries em src/lib/chatwoot/queries/* (sobreposição com `claude-conversas-bugfix-v035` e `claude-dashboard-conversas-chart-fix`).
- L5 — 8 server actions de relatórios (depende de L2-L4).
- L6 — worker (getBindingsToRefresh, withMetaUpdate, 4 jobs, facts.ts).
- L9 — constraint NOT NULL + delete shim chatwoot/pool.ts + release v0.36+.

## Totais da sessão
- ~25 commits novos meus (spec×3 + plan×1 + L0×4 + L1×5 + L7×3 + L8×7 + ajustes).
- ~71+ tests novos verde (errors 4 + ensure-tables 5 + pool 11 + active-connection 4 + seed 5 + realtime 6 + use-facts-realtime 14 + facts-freshness 5 + connections 12 + bindings 6 + UI 18+).
- Typecheck zero erros minha área.
- Working tree clean nos meus arquivos (package.json modificado é alheio).

## Próximos passos para próxima sessão
1. João valida fundação (rota `/configuracoes/conexoes` localmente, lê specs Fase 2 e 3).
2. Quando agentes paralelos (`claude-conversas-bugfix-v035`, `claude-dashboard-conversas-chart-fix`) finalizarem, atacar L2/L3/L4 (refator queries) com paralelismo via dispatching-parallel-agents.
3. L5/L6 sequenciais.
4. L9 release final.

## HISTORY.md
Não atualizado pelo controlador — append da sessão deixado pra T9.3 release final (outros agentes mexeram no arquivo durante a sessão; padrão append-only respeitado pelos subagentes que tinham permissão pra registrar).
