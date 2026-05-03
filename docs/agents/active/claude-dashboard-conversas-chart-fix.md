---
agent: claude-dashboard-conversas-chart-fix
started_at: 2026-05-03T20:35-03:00
target_version: v0.34.0
status: in_progress
---

## Tópico
Dashboard — fix do gráfico "Conversas por hora/dia" (3 períodos): (1) componente do PeriodNavigator que mostra a data ("03/05") está com retângulo gigantesco, precisa ajustar ao conteúdo; (2) dados inconsistentes entre períodos diário/semanal/mensal — daily mostra 1 conversa aberta em 03/05 mas semanal/mensal mostram 0 no mesmo dia. Fonte de verdade: banco de dados.

## Demandas (do user)

### B1 — Tag de período do gráfico tamanho automático (UI)
- O retângulo do PeriodNavigator (que renderiza "03/05" no dia, "27/04 — 03/05" na semana, "MAI/26" no mês) está com largura fixa enorme e fica feio com label curto.
- Width deve se ajustar ao conteúdo (`w-fit` ou similar) sem prejudicar o estado de hover/focus/touch target.

### B2 — Sincronização de dados entre períodos (BUG CRÍTICO)
- No período "Dia" 03/05: mostra 1 Aberta às 11:00.
- No período "Semana" 27/04—03/05: bucket 03/05 mostra 0 em tudo.
- No período "Mês" MAI/26: bucket 03/05 mostra 0 em tudo.
- Mesma data, mesmos filtros, valores diferentes — relatório quebrado.
- Hipóteses iniciais (validar):
  - Semanal/mensal podem estar lendo da pré-agregação (`chatwoot_facts_daily_*`) que não foi refrescada para 03/05 (rolling 7 dias funciona, mas se a tabela ainda não tem o bucket de hoje, o gráfico não preenche).
  - Diário pode estar lendo direto da `conversations` em tempo real (com `created_at`/`updated_at` reais) e por isso mostra a conversa aberta hoje.
  - Outra hipótese: timezone — `created_at` em UTC vs `bucket_date` em local dá off-by-one.
  - Outra hipótese: status "Aberta" no diário usa snapshot de "estado atual da conversa", e nas pré-agregações usa "estado em algum ponto do dia" (lógica diferente).

## Arquivos que vou tocar (preliminar — vou refinar após exploração)
- `src/app/(protected)/dashboard/page.tsx` (provável)
- `src/components/dashboard/conversations-chart*.tsx` (provável)
- `src/components/dashboard/period-navigator.tsx` (provável — para B1)
- `src/lib/chatwoot/facts.ts` (camada de leitura das tabelas de pré-agregação)
- `src/worker/jobs/pre-agregacao/*` (caso a fonte de inconsistência seja a pré-agregação)
- Testes correlatos.

## Arquivos compartilhados que VOU modificar
- package.json (bump 0.32→0.34, pulando 0.33 reservada por claude-multitenant-realtime-fase1)
- CHANGELOG.md
- docs/STATUS.md
- docs/agents/HISTORY.md (append-only no commit relevante)

## Decisões / contexto importante
- Coordenação: 3 agentes ativos (v0.31 agente-nex-polish, v0.32 conversas-filtros, v0.33 multitenant-realtime spec-only). Zero overlap em código fonte com Dashboard.
- Pulando v0.33 (reservada para multitenant), bumpando direto para v0.34.0.
- Trabalho NÃO usa spec — usa apenas plan v1→v2→v3 conforme orientação do João.
- UI (B1) e qualquer ajuste visual no chart obriga invocar `ui-ux-pro-max:ui-ux-pro-max` antes de escrever código.

## Bloqueios
- (vazio)
