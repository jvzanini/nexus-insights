---
agent: claude-conversas-v017
started_at: 2026-05-01T20:50-03:00
target_version: v0.17.0
fallback_version: v0.18.0
status: in_progress
---

## Tópico
Revamp do relatório /relatorios/conversas — exportação XLSX completa, busca server-side em todos os campos (Enter), drill-down inline (WhatsApp + Etiquetas + Atributos em linha única, sem espaço fantasma), coluna #ID como botão "Abrir conversa" (substitui botão Ações), remoção da paginação visual + botão "Carregar mais", virtualização de 10k linhas, tour atualizado, loading overlay sutil violeta.

## Arquivos que provavelmente vou tocar
- src/components/reports/conversas-table.tsx (virtualização + remoção paginação + #ID clicável + remoção col Etiquetas/Ações)
- src/components/reports/conversa-drill-down.tsx (3 seções inline, remove botão Abrir)
- src/components/reports/advanced-filters.tsx (placeholder de busca + ação export ao lado de "Ordenação")
- src/components/reports/conversas-page-client.tsx (wiring de export + filtro de busca)
- src/components/reports/loading-overlay.tsx (label dinâmico, polish pulse)
- src/components/reports/open-in-chatwoot.tsx (provavelmente deletar — botão sai)
- src/lib/actions/reports/conversas.ts (cap MAX_TABLE_ROWS, suporte a search)
- src/lib/chatwoot/queries/conversas-list.ts (search ILIKE em campos relevantes)
- src/lib/chatwoot/filters.ts (parâmetro search no buildBaseFilter; ATENÇÃO compartilhado)
- src/lib/tours/conversas-tour.ts (atualizar steps, remover page-size)
- NEW: src/lib/actions/reports/conversas-export.ts (Server Action gera XLSX)
- NEW: src/lib/reports/conversas-xlsx.ts (build XLSX puro testável)
- NEW: src/components/reports/export-button.tsx
- package.json (bump 0.15.4 → 0.17.0; deps exceljs + @tanstack/react-virtual)
- CHANGELOG.md (release notes v0.17.0)
- docs/STATUS.md
- docs/superpowers/specs/2026-05-01-relatorio-conversas-revamp-design.md (NEW)
- docs/superpowers/plans/2026-05-01-relatorio-conversas-revamp.md (NEW)

## Arquivos compartilhados que VOU modificar
> ⚠️ Coordenação ativa com 2 agentes paralelos:
> - claude-nex-suite-refinement (v0.16.0) — em fase spec/plan, T1-T8 ainda não executou. Toca: package.json, CHANGELOG.md, docs/STATUS.md, prisma/schema.prisma, src/app/(protected)/configuracoes/page.tsx, src/components/ui/calendar.tsx, src/lib/llm/*, src/lib/nex/*, src/components/agente-nex/**, src/lib/reports/cost-detail.ts, src/components/reports/usage-table.tsx, src/components/reports/usage-charts.tsx.
> - claude-integracoes-powerbi (v0.17.0) — em fase spec/plan, aguardando v0.16.0. Toca: prisma/schema.prisma, src/app/(protected)/integracoes/**, src/components/integracoes/**, src/lib/integrations/**, src/lib/actions/integrations*.ts, src/components/layout/sidebar.tsx, src/app/(protected)/configuracoes/page.tsx, package.json, CHANGELOG.md, docs/STATUS.md.
>
> **Sobreposição zero em arquivos de código** — minha feature é toda em src/components/reports/* + src/lib/actions/reports/* + src/lib/chatwoot/* + src/lib/tours/*.
>
> **Sobreposição em arquivos compartilhados de release**: package.json, CHANGELOG.md, docs/STATUS.md.
>
> **Estratégia de versão**:
> 1. Aguardar v0.16.0 do nex-suite cair em main.
> 2. Rebase contra origin/main.
> 3. Se v0.17.0 ainda livre → minha feature vira v0.17.0.
> 4. Se v0.17.0 já tomado pelo powerbi → minha feature vira v0.18.0 (rename minimal).

## Arquivos que NÃO vou tocar (dos agentes paralelos)
- prisma/schema.prisma
- src/lib/actions/nex-chat.ts, nex-prompt.ts, integrations*.ts
- src/lib/nex/prompt.ts, src/lib/llm/catalog.ts, src/lib/llm/pricing.ts
- src/lib/integrations/**
- src/components/ui/calendar.tsx
- src/app/(protected)/agente-nex/**, integracoes/**
- src/app/(protected)/configuracoes/page.tsx
- src/components/agente-nex/**, integracoes/**
- src/components/layout/sidebar.tsx
- src/lib/reports/cost-detail.ts
- src/components/reports/usage-table.tsx, usage-charts.tsx

## Decisões / contexto importante
- **Workflow rigoroso**: spec v1→v2→v3 (2 pente-finos), plan v1→v2→v3 (2 pente-finos), depois subagent-driven-development com TDD por task; ui-ux-pro-max em todas tasks UI.
- **XLSX format** (não CSV): exceljs, header congelado/bold, datas pt-BR, durations formatadas, 1 coluna por chave de custom_attributes (descobertas dinamicamente).
- **Busca**: server-side via SQL ILIKE em contact.name, contact.phone_number, contact.identifier, conversations.display_id::text, conversations.custom_attributes::text, inbox.name, team.name, users.name (assignee), tags.name (labels). Status/prioridade traduzidos para texto pt-BR e comparados em CASE WHEN no SQL. Aplicado quando Enter é pressionado.
- **Sem paginação visual**: PAGE_SIZE_OPTIONS removido; InfiniteScrollSentinel removido; botão "Carregar mais" removido. Backend traz tudo até MAX_TABLE_ROWS=10000 (tabela) / MAX_EXPORT_ROWS=50000 (export). Se exceder cap, banner amarelo "Mostrando primeiras 10000 — refine os filtros".
- **Virtualização**: @tanstack/react-virtual v3 (compatível React 19.2). Mantém thead sticky via overflow container, virtualiza tbody. Cada linha tem altura padrão (≈48px); drill-down expand row variável (measure callback).
- **#ID clicável**: span vira `<a target="_blank">` com border-input/50 cinza fininho default; hover border-violet-500/60 + text-violet-500 + bg-violet-500/5; focus-visible ring-2 ring-violet-500/40 ring-offset-1; tooltip "Abrir conversa" via title nativo (a11y zero-cost) + aria-label completo. e.stopPropagation no click pra não toggle drill-down.
- **URL deep-link**: continua usando `chatwootConversationUrl(accountId, displayId)` do helper. Quando agente nex-suite entregar URL per-account em /configuracoes, helper passa a ler do banco internamente — meu código não muda.
- **Drill-down**: 3 seções (WhatsApp / Etiquetas / Atributos) cada uma como uma linha `flex flex-wrap items-center gap-x-3 gap-y-1` com rótulo + conteúdo lateral. Botão "Abrir" removido. Container `space-y-2`.
- **Coluna Etiquetas removida da tabela**: definição sai do array `COLUMNS` do conversas-table; também sai do `<ColumnsToggle>`. Mas `labelIds` no FilterState e no `<FiltersDialog>`/`<AppliedFiltersChips>` continuam intactos — filtro funciona normalmente.
- **Coluna Ações removida**: `OpenInChatwoot` no body da tabela é eliminado. No drill-down também. `open-action` data-tour migra pro `display_id`.
- **Tour atualizado**: step `page-size` removido (sumiu); step `open-action` aponta pra coluna #ID; descrição atualizada. Step `drill-down` atualizado pra "Clique em qualquer parte da linha (exceto #) pra expandir".
- **Loading**: `<LoadingOverlay>` mantém violeta + backdrop-blur. Adicionar pulse no Loader2, label dinâmico ("Carregando conversas...", "Buscando...", "Gerando planilha..."). Acionar também durante export e durante search transition.
- **Export filename**: `conversas_<accountId>_<periodo-iso>_<timestamp-yyyymmddhhmm>.xlsx`.
- **Versão**: v0.17.0 (com fallback v0.18.0).

## Bloqueios
- **v0.16.0 nex-suite LIVE em produção** (commit c7acbc8 LIVE).
- **[ATIVO 2026-05-02 00:05]** typecheck quebrado em `src/lib/actions/integrations.ts` (do agente claude-integracoes-powerbi, ainda em implementação T1-T7). Bloqueia push porque CI roda typecheck. Aguardando powerbi finalizar OU build verde.
- T1-T13 done · testes 106/106 PASS na área de conversas · typecheck erra só em arquivos do powerbi.

## Status atual (2026-05-02 — segundo wakeup)
- Implementação completa (T1-T13).
- Origem/main já tem TODOS meus commits + bump v0.17.0 release.
- powerbi pegou v0.18.0 (commit `5084037 chore: bump 0.17.0 → 0.18.0 (conflito agente paralelo conversas)`) — então v0.17.0 = minha release isolada.
- Build CI rodou em todos meus commits com sucesso. Image `:latest` no registry contém HEAD.
- `npm test` = 1110/1110 PASS · `npm run typecheck` = 0 erros · `npm run build` = success.
- T14: disparando portainer-fix com app_version=v0.17.0 pra atualizar env var em produção.
