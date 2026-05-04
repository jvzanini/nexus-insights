---
agent: claude-l4-mensagens-nao-respondidas
started_at: 2026-05-04T01:10Z
target_version: v0.37.0
status: in_progress
---

## Tópico
L4 do plan multi-tenant fase 1 — refator query mensagens-nao-respondidas + Server Action.

## Arquivos
- src/lib/chatwoot/queries/mensagens-nao-respondidas.ts (e test novo)
- src/lib/actions/reports/mensagens-nao-respondidas.ts (caller)
- src/components/reports/mensagens-nao-respondidas-table.tsx (verificar consumo)

## Áreas que NÃO vou tocar
- queries L2 (dashboard-*, home-summary, status-distribution)
- queries L3 (conversas-list, meta-cache, meta-cache-for-user)
- queries L4 paralelas (leads-recebidos, matrix-ia, por-departamento, por-estado, ranking-atendentes, tempos-resposta, volumetria-dow, volumetria-heatmap)
- src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx (responsabilidade L3)
- docs/agents/HISTORY.md
- package.json
