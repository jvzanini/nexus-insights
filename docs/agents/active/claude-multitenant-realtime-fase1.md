---
agent: claude-multitenant-realtime-fase1
started_at: 2026-05-03T19:45-03:00
target_version: v0.33.0
status: review

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
- Spec v3 final escrita e double-checked (28 achados pente fino #1 + 30 achados pente fino #2 aplicados).
- Localização: `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md`.
- Próximos passos após aprovação: plan v1→v2→v3 via `superpowers:writing-plans` (em sessão dedicada). Implementação via `superpowers:subagent-driven-development`.
- HISTORY.md NÃO atualizado nesta sessão — outros agentes ativos modificaram o arquivo. Append será feito no commit de release da implementação.
