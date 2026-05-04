---
agent: claude-multitenant-realtime-fase3
started_at: 2026-05-04T05:00-03:00
target_version: v0.40.0
status: in_progress
---

## Tópico
Plan v3 + implementação da Fase 3 do épico Multi-tenant Realtime — UI rica em 4 abas dentro de `/bancos-de-dados/[id]` + wizard de onboarding empresa.

## Spec de referência
`docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase3-ui-completa-design.md` (v3, 964 linhas).

## Diferenças vs spec original
- Spec menciona `/configuracoes/conexoes`. Hotfix v0.39 já moveu rota para `/bancos-de-dados`. Plan vai usar a rota nova.
- Sidebar reorg (§5 da spec) já parcialmente feito na v0.39 (entry "Bancos de dados" no nível superior; "Jobs de pré-agregação" removida do sidebar). Falta o redirect 308 de `/configuracoes/jobs` (page legada). Aba "Jobs" da Fase 3 absorve a funcionalidade.

## Arquivos novos previstos
- `src/components/settings/nexus-chat/connection-detail-tabs.tsx` (Tabs ARIA com 4 panels).
- `src/app/(protected)/bancos-de-dados/[id]/page.tsx` (refator pra usar Tabs).
- `src/components/settings/nexus-chat/tabs/conexao-tab.tsx` (info do banco).
- `src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx` (KPIs + line chart + stream).
- `src/components/settings/nexus-chat/tabs/jobs-tab.tsx` (absorve JobsPanel).
- `src/components/settings/nexus-chat/tabs/saude-tab.tsx` (cards lag + audit list).
- `src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx` (Stepper 4 steps).
- `src/lib/actions/nexus-chat/realtime-stream.ts` (Server Action: stream de eventos webhook).
- `src/lib/actions/nexus-chat/health.ts` (Server Action: métricas saúde).

## Coordenação
- v0.39.0 LIVE em produção sem regressões.
- Sou único agente ativo nesta sessão.
