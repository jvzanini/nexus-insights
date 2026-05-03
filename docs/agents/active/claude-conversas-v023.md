---
agent: claude-conversas-v023
started_at: 2026-05-03T03:55-03:00
target_version: v0.23.0
status: in_progress
---

## Tópico
v0.23 polish + bug fixes do `/relatorios/conversas`. 16 ajustes do super_admin via screenshots, com prioridade absoluta no bug da busca (não chega ao backend porque `reportFilters` em `page.tsx:58-71` NÃO inclui `search`) e bug do filtro single-day data personalizada.

## Bugs críticos identificados na investigação
- **Busca**: `page.tsx` constrói `reportFilters` sem o campo `search` → backend nunca filtra. Fix de 1 linha.
- **Single-day filter**: 21/03→21/03 retorna 0 enquanto 21/03→22/03 retorna 3 conversas do 21/03. Hipótese: TZ ou borda do `endOfDay`. A investigar.

## Arquivos que provavelmente vou tocar
- src/app/(protected)/relatorios/conversas/page.tsx (search no reportFilters; verificar period TZ)
- src/components/reports/advanced-filters.tsx (badge Enter Command+K + ajuste layout do hint)
- src/components/reports/conversas-pagination.tsx (novo algoritmo: 1, 1-2, 1-2-3, 1...N, 1...mid...N; dropdown reticências; chevron atual)
- src/components/reports/conversas-table.tsx (paginação no topo; formato "Mostrando X-Y de Z"; remover duplicação Ordenação 3)
- src/components/reports/applied-filters-chips.tsx (X bolinha quina nos chips de Filtros/Ordenação; remover lixeirinhas separadas)
- src/components/reports/filters-dialog.tsx (abrir tudo fechado; limpar todos só de filtros; header dinâmico simples/avançado)
- src/components/reports/sorting-dialog.tsx (anti-duplicação de colunas no select)
- src/components/reports/period-pills.tsx (defaultMonth=hoje; tamanho fonte calendar -1)
- src/components/ui/calendar.tsx (tamanho fonte -1)
- src/lib/tours/conversas-tour.ts (step paginação no topo + bump v4)
- package.json (0.22.0 → 0.23.0)
- CHANGELOG.md, docs/STATUS.md
- docs/superpowers/specs/2026-05-03-conversas-v023-polish-design-v1.md
- docs/superpowers/specs/2026-05-03-conversas-v023-polish-design-v2.md
- docs/superpowers/specs/2026-05-03-conversas-v023-polish-design.md (v3)
- docs/superpowers/plans/2026-05-03-conversas-v023-polish-v1.md
- docs/superpowers/plans/2026-05-03-conversas-v023-polish-v2.md
- docs/superpowers/plans/2026-05-03-conversas-v023-polish.md (v3)

## Issues do super_admin (16 itens)
1. **CRÍTICO** Busca não funciona (não filtra).
2. Layout busca quebra ao digitar (lupa desce + botões adjacentes descem).
3. Badge ⏎ Enter (estilo Command+K) dentro do input — Enter destacado em violet.
4. Calendar: diminuir tamanho dos números (-1 unidade) e do componente.
5. Calendar: abrir no mês atual + próximo (não março/2025).
6. Toolbar tabela: remover duplicação "X Ordenação 3".
7. Toolbar tabela: formato "Mostrando 1-1.000 de 7.183 conversas".
8. Paginação no TOPO da tabela (não rodapé).
9. Algoritmo paginação simplificado (1, 1-2, 1-2-3, 1...N, 1...mid...N).
10. Reticências viram dropdown clicável (lista páginas do meio).
11. Atual no meio tem chevron pra abrir mesmo dropdown.
12. FiltersDialog abre tudo fechado (não Caixa de entrada expandida).
13. "Limpar todos" no FiltersDialog: só limpa filtros, mantém modal aberto, NÃO mexe em período/ordenação.
14. Header modal: "Filtros simples" no modo simples / "Filtros avançados" no modo avançado.
15. X "adesivo" na quina superior direita dos chips Filtros/Ordenação — remove lixeirinhas separadas.
16. **CRÍTICO** Sorting: coluna selecionada em critério N não pode aparecer nos critérios subsequentes.
17. Tour: step da paginação no topo (Total + Mostrando + paginação).
18. **CRÍTICO** Single-day filter (21/03→21/03 retorna 0).

## Decisões / contexto importante
- Workflow rigoroso CLAUDE.md §3: spec v1→v2→v3 (2 pente-finos REAIS) + plan v1→v2→v3.
- subagent-driven-development com TDD por task + ui-ux-pro-max em TODA task UI.
- Versão alvo: **v0.23.0** (v0.22.0 LIVE, sem agentes paralelos no momento).

## Coordenação multi-agente
- Sem agentes paralelos ativos no momento da spec.
- Stage APENAS arquivos seus em todos os commits (NUNCA `git add -A`).

## Bloqueios
- (nenhum)
