---
agent: claude-conversas-filtros-v032
started_at: 2026-05-03T21:35-03:00
target_version: v0.32.0
status: in_progress
---

## Tópico
Filtros do menu Conversas — 8 fixes/features após feedback do João sobre v0.30.

## Demandas

### F1 NEW FEATURE — Filtro Documento no Simples
- Adicionar seção "Documento" no FiltersDialog Simples.
- 3 opções multi-select: "Com CPF", "Com CNPJ", "Sem documento".
- Schema: `FilterState.documentTypes: Array<"cpf" | "cnpj" | "none">`.
- Lógica: usa `detectDocument()` existente; OR entre as opções.

### F2 — Cursor pointer nos tabs Simples/Avançado
- Tabs idle ainda mostram cursor padrão. Fix: `cursor-pointer`.

### F3 — AlertDialog ao trocar de tab quando há dados
- Tab clicável sempre.
- Trocar de Simples→Avançado COM dados no Simples → AlertDialog "Trocar para filtro avançado vai descartar suas seleções no Simples. Confirma?" Confirmar/Cancelar/X.
- Mesmo lógica inverso (Avançado→Simples).
- Confirmar: limpa tab origem + ativa destino. Cancelar/X: mantém origem.

### F4 — "Limpar todos" respeita só o tab ativo
- Atual: limpa Simples + Avançado.
- Desejado: limpa apenas o tab ativo.

### F5 — Remover botões internos do `<ConditionGroupEditor>` raiz
- Imagem 4: 2 sets de Limpar/Aplicar. Manter só os do rodapé do FiltersDialog.

### F6 BUG — Contador "Aplicar (N)" mostra valores fantasmas
- Imagem 2: Avançado vazio → "Aplicar (2)".
- Imagem 3: Simples vazio → "Aplicar (1)".
- Causa provável: `pendingDiff` em advanced-filters não reseta corretamente entre transições.

### F7 ARQUITETURAL — Operador E/OU per-par
- Atual: 1 operador E/OU global por grupo.
- Desejado: operador entre cada par de irmãos (condições e/ou grupos).
- Schema: `ConditionGroup.items` com `connector?: "AND" | "OR"` (undefined no primeiro).
- Avaliação: left-associative. Documentar.

### F8 VISUAL — Redesign do `<ConditionalFilters>` (where-clause builder)
- Componente em `src/components/ui/conditional-filters.tsx`.
- Ícones distinguindo grupo de condição.
- Linhas/tracejados conectando items irmãos.
- Hover effects.
- Destaque pra grupos vs condições.
- Animations sutis.

### F9 NEW — Export respeita searchClient + conditionGroup + documentTypes + sortStack
- Hoje (v0.30): `exportConversasAction` usa só filtros server-side. `searchClient` (client-side desde v0.25), `conditionGroup` (client-side), `documentTypes` (F1 nova) e `sortStack` (client-side) NÃO entram.
- Desejado: export = exatamente o que está na tabela visível.
- Solução: server action ganha args extras + replica pipeline client (matchSearchClient, applyConditions, documentTypes filter, sort).
- Helpers já são server-safe (puros).

## Arquivos que vou tocar
- `src/lib/reports/filter-state.ts` (FilterState + serialize/deserialize + diff: documentTypes)
- `src/lib/utils/apply-conditions.ts` (ConditionGroup schema com connector per item; left-associative eval)
- `src/components/reports/filters-dialog.tsx` (F1 seção Documento + F3 AlertDialog tabs + F4 limpar tab-ativo + F5 remove botões internos + F6 contador correto + tabs cursor-pointer F2)
- `src/components/reports/condition-group-editor.tsx` (F5 remove botões + F7 operador per-par + F8 visual redesign)
- `src/components/reports/applied-filters-chips.tsx` (chip novo de Documento)
- `src/components/reports/advanced-filters.tsx` (F6 contador correto)
- `src/components/reports/conversas-page-client.tsx` (passa documentTypes ao composeConditionGroup ou direto pra ConversasTable)
- `src/lib/reports/match-search-client.ts` ou novo `src/lib/reports/match-document-client.ts` (filtragem por documentTypes)
- `src/components/reports/conversas-table.tsx` (passa documentTypes pro filtro)

## Arquivos compartilhados
- package.json (bump 0.30→0.32 — pula 0.31 ocupada por claude-agente-nex-polish-v031)
- CHANGELOG.md
- docs/STATUS.md

## Decisões / contexto
- Coordenação: claude-agente-nex-polish-v031 ativo em `/agente-nex/*`, `src/lib/nex/*`, `src/lib/llm/*`. Zero conflito em código fonte. Bumpando pra v0.32 (pula 0.31).
- F7 é refator arquitetural — schema ConditionGroup muda. Migrar dados existentes? URL ?cond= pode ficar incompatível. Aceitável (usuários em teste).
- F8 é redesign visual — invocar ui-ux-pro-max.

## Bloqueios
- (vazio)
