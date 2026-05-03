---
agent: claude-conversas-bugfix-v035
started_at: 2026-05-04T00:00-03:00
target_version: v0.35.0
status: in_progress
---

## Tópico
2 bugs reportados pelo João em produção sobre v0.32:
1. **Export XLSX cria linhas em branco extras** quando há poucas rows (ex: 1 row vira várias).
2. **Filtro Documento (CPF/CNPJ/Sem) não funciona** — UI presente mas a tabela não filtra.

## Causas confirmadas

### Bug 1 — Export XLSX rows fantasma
- `src/lib/reports/conversas-xlsx.ts:146`: `ws.columns = headers.map(...)` cria headers via `ws.columns`. ExcelJS pode pré-alocar rows vazias quando `views: [{ state: "frozen", ySplit: 1 }]` está setado.
- Fix defensivo: substituir por `ws.addRow(headers)` + aplicar widths via `ws.getColumn(i).width = 18` + formatação row 1 manual.

### Bug 2 — Filtro Documento sem efeito
- `src/components/reports/conversas-table.tsx:636-650`: pipeline tem `searchedRows → filteredRows (conditionGroup) → sortedRows`. **NÃO chama `matchDocumentTypes`.**
- `<ConversasTable>` nem recebe `documentTypes` como prop.
- Fix: passar `documentTypes` da `ConversasPageClient` → `ConversasTable` (via prop) e aplicar `matchDocumentTypes(searchedRows, documentTypes)` ANTES de `applyConditions`.

## Arquivos que vou tocar
- `src/lib/reports/conversas-xlsx.ts` (refator builder pra evitar rows fantasma)
- `src/lib/reports/__tests__/conversas-xlsx.test.ts` (test que reproduz bug + valida rowCount exato)
- `src/components/reports/conversas-table.tsx` (recebe documentTypes + aplica matchDocumentTypes na pipeline)
- `src/components/reports/conversas-page-client.tsx` (passa documentTypes pra ConversasTable)
- `src/components/reports/__tests__/conversas-table.test.tsx` (smoke test do filtro funcionando)

## Arquivos compartilhados
- package.json (bump 0.32→0.35; skip 0.33 multitenant + 0.34 dashboard-chart)
- CHANGELOG.md
- docs/STATUS.md

## Decisões / contexto
- v0.32.0 LIVE em produção (verificado /api/health). package.json local diz 0.34 (do agente paralelo dashboard-chart-fix que ainda não pushou).
- Escopo limitado: bugfix urgente, sem features novas. Plan v1→v2→v3 mas curto.
- Coordenação: 3 agentes ativos; meus arquivos disjuntos.

## Bloqueios
- (vazio)
