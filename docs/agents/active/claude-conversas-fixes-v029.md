---
agent: claude-conversas-fixes-v029
started_at: 2026-05-03T17:15-03:00
target_version: v0.29.0
status: in_progress
---

## Tópico
3 fixes pontuais em /relatorios/conversas reportados pelo João via screenshots após v0.27/v0.28 LIVE.

## Problemas
1. **X duplo no input de busca:** o `<input type="search">` mostra X nativo do browser/macOS sobre o X custom h-5 que adicionei. Resultado: dois X visíveis. Solução: hide nativo via CSS `::-webkit-search-cancel-button { -webkit-appearance: none }`.
2. **X dos chips Filtros/Ordenação muito grande + estilo errado:** João quer comportamento igual ao X do search input — idle: discreto cinza sem fundo (só o X); hover: fica vermelho (mantém comportamento atual). E DIMINUIR o tamanho de forma sutil (de h-5 pra ~h-4 ou h-3.5).
3. **Colunas da tabela truncando texto (ellipsis "...")**: Estado, Departamento, Atendente cortam nomes. João quer mostrar texto COMPLETO sem truncar mas mantendo larguras estáveis. Solução: aumentar widths + trocar `truncate` por `whitespace-normal break-words` (cells multi-line conforme necessário; virtualizer já tem measureElement dinâmico).

## Arquivos que vou tocar
- `src/components/reports/advanced-filters.tsx` (X chips estilo discreto + idle cinza, hover destrutivo; X do input search mantém)
- `src/app/globals.css` (hide ::-webkit-search-cancel-button no input[type="search"])
- `src/components/reports/conversas-table.tsx` (COLUMN_WIDTHS aumenta inbox/team/assignee/name; render troca truncate por whitespace-normal break-words)
- `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` (atualiza expectativas — sem bg-destructive idle)

## Arquivos compartilhados
- package.json (bump 0.28 → 0.29)
- CHANGELOG.md
- docs/STATUS.md

## Decisões / contexto
- v0.28.0 LIVE (Suite Agente Nex Polish v4 do agente paralelo). Bump 0.28 → 0.29.
- Skip brainstorming (3 fixes específicos com solução clara). Plan v1→v2→v3 com 2 pentes-finos REAIS.
- ui-ux-pro-max obrigatória pros 3 fixes (são UI).

## Bloqueios
- (vazio)
