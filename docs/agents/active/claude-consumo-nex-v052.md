---
agent: claude-consumo-nex-v052
started: 2026-05-06T18:00:00-03:00
scope: fix/consumo-charts + fix/agente-nex-prompt
status: in_progress
---

## Objetivo

v0.52.0 — Corrige múltiplos bugs nos gráficos da página de Consumo do Agente Nex e melhora o Agente Nex.

## Mudanças planejadas

1. `isChartLoading` stuck bug (spinner preso quando troca pill com navegação ativa)
2. Full-period chart para "Hoje" (24 horas), "Esta semana" (7 dias) e "Este mês" (N dias)
3. XAxis labels a cada 2h no gráfico horário
4. PeriodNavigator com `minDate` (bloqueia navegação antes de abril/2026)
5. Agente Nex: fora do escopo em primeira pessoa
6. Agente Nex: busca por identificador/CPF no `query_contacts`
7. Agente Nex: guia de etiquetas com nomes curtos (emp/hg/acd)

## Arquivos tocados

- `src/components/charts/area-chart.tsx`
- `src/components/dashboard/period-navigator.tsx`
- `src/components/llm/consumo-content.tsx`
- `src/lib/nex/prompt-compose.ts`
- `src/lib/llm/tools/executor.ts`
- `src/lib/llm/tools/definitions.ts`
