---
agent: claude-conversas-fixes-v030
started_at: 2026-05-03T17:45-03:00
target_version: v0.30.0
status: in_progress
---

## Tópico
2 fixes urgentes em /relatorios/conversas após feedback duro do João sobre v0.29.

## Problemas
1. **Cells da tabela quebrando linha** (regressão v0.29 — eu apliquei `whitespace-normal break-words` em F3, que ele pediu). João quer:
   - SEM quebra de linha (single-line por cell).
   - Texto COMPLETO visível (sem ellipsis).
   - Sem mexer nas larguras toda hora (estabilidade — `tableLayout: fixed` mantém).
   - Solução: aumentar bem mais as larguras (suficientes pro percentil 99 dos casos) + voltar `whitespace-nowrap` + remover `max-w-` + remover `truncate`. Casos extremos cortam discretamente sem ellipsis.
2. **X dos chips Filtros/Ordenação muito pequeno** (v0.29 reduziu pra h-4): aumentar pouco + colocar mais "para fora" do botão como adesivo na quina superior direita. Solução: h-4→h-5 + ícone X 2.5→3 + offset -right-1/-top-1 → -right-2/-top-2 (mais para fora).

## Arquivos que vou tocar
- `src/components/reports/conversas-table.tsx` (COLUMN_WIDTHS aumenta pra inbox/team/assignee/name; cells voltam pra whitespace-nowrap sem truncate sem max-w)
- `src/components/reports/advanced-filters.tsx` (X chips: h-5 + X h-3 + offset -right-2 -top-2)
- `src/components/reports/__tests__/conversas-table.test.tsx` (atualiza smoke test)
- `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` (atualiza expectativas h-5 + offset)

## Arquivos compartilhados
- package.json (bump 0.29 → 0.30)
- CHANGELOG.md
- docs/STATUS.md

## Decisões / contexto
- v0.29.0 LIVE (Conversas Polish v3). Bump 0.29 → 0.30.
- Skip brainstorming (2 fixes específicos de regressão; correção direta).
- Plan v1→v2→v3 com 2 pentes-finos REAIS.
- ui-ux-pro-max obrigatória em ambas as tasks (são UI).

## Bloqueios
- (vazio)
