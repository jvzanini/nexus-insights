---
agent: claude-cleanup-handoff
started_at: 2026-05-03T05:00-03:00
target_version: cleanup (sem release)
status: in_progress
---

## Tópico
Cleanup geral pra trocar de terminal: deletar specs/plans/memory obsoletos, dead code, atualizar README + STATUS + memory consolidada. Sem release nova.

## Arquivos NÃO posso tocar (outros agentes ativos)
- claude-conversas-v023: tudo de relatorios/conversas + specs/plans `*conversas-v023*` + active dele.

## Arquivos compartilhados que VOU modificar
- README.md (reescrever completo)
- docs/STATUS.md (consolidar v0.16-v0.24 LIVE)
- docs/agents/HISTORY.md (entry de cleanup)
- Specs/plans antigos: deletar v1/v2 + releases > 4 dias atrás
- Memory: deletar project_v0.7-v0.16 + v0.20 (consolidados em v0.22/v0.24)

## Decisões
- DELETE all `*-v1.md` e `*-v2.md` em specs/plans (manter v3 final como histórico).
- DELETE specs/plans de releases LIVE há > 4 dias (v0.4-v0.16 + relatorio-conversas-revamp + dashboard-polish-v022 + empresa-ativa-global + integracoes-power-bi + suite-agente-nex-refinement + conversas-v019 + suite-agente-nex-suite).
- KEEP suite-agente-nex-polish-v2 (v0.24 — minha) + conversas-v023 (do outro agente).
- DELETE memory project_v0.7-v0.20 (consolidados nos releases mais recentes).
- KEEP feedback_*, project_agente_nex_priority, v0.21/v0.22/v0.24.
