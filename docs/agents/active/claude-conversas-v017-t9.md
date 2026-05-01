---
agent: claude-conversas-v017-t9
parent: claude-conversas-v017
started_at: 2026-05-01T23:50-03:00
target_version: v0.17.0
status: in_progress
---

## Tópico
T9 — Refator de `<ConversasTable>`: virtualização (@tanstack/react-virtual),
remoção paginação/Etiquetas/Ações, #ID vira botão clicável (Chatwoot), banner
amarelo de truncamento em 10k, cleanup localStorage page-size.

## Arquivos que VOU modificar (isolado, sem overlap)
- src/components/reports/conversas-table.tsx
- src/components/reports/__tests__/conversas-table.test.tsx (novo)
- package-lock.json (apenas; package.json já tinha a dep)

## Arquivos compartilhados que VOU modificar
- package-lock.json — dep `@tanstack/react-virtual` já presente no
  package.json (commit 294e8f4 do agente principal); só atualizo o lockfile.

Sem overlap com `claude-nex-suite-refinement` (mexe em /agente-nex/*),
`claude-integracoes-powerbi` (mexe em /integracoes/*) ou
`claude-v016-release-docs` (mexe em CHANGELOG/STATUS/runbooks).
