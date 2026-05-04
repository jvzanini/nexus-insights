---
agent: claude-l4-webhook-endpoint
started_at: 2026-05-04T02:30-03:00
target_version: v0.38.0
status: in_progress
---

## Tópico
T4: implementar endpoint `POST /api/webhooks/nexus-chat/[token]/route.ts` da Fase 2 do épico Multi-tenant Realtime, com testes Jest cobrindo 9 cenários.

## Spec/plan de referência
- Spec: `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase2-webhook-design.md` (§5).
- Plan: `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase2-webhook.md` (T4).

## Arquivos que vou tocar nesta sessão
- `src/app/api/webhooks/nexus-chat/[token]/route.ts` (criar).
- `src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts` (criar).
- `docs/agents/active/claude-l4-webhook-endpoint.md` (este, removo no fim).

## Não toco
- Outros paths. Outros subagents paralelos: instrumentation.ts (B), realtime-mount (C), worker cron (D), connection-form-dialog (E).

## Bloqueios
- Nenhum no momento.

## Coordenação multi-agente
- Working tree limpo no início.
- Active file paralelo: `claude-multitenant-realtime-fase2.md` (orquestrador).
- Stage só meus arquivos com `git add <path>`. NUNCA `git add -A`.
- `git commit --only` para isolar.
- Sem push.
