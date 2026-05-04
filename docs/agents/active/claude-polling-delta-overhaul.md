---
agent: claude-polling-delta-overhaul
started_at: 2026-05-04T05:00-03:00
target_version: v0.41.0
status: in_progress
---

## Tópico
Migração arquitetural webhook → polling delta universal (30s configurável, mín 20s)
+ overhaul de UX em /bancos-de-dados (lista, dialog, abas, wizard sem webhook)
+ tour interativo em todas as telas da seção banco de dados.

## Arquivos que provavelmente vou tocar
- prisma/schema.prisma (remove webhookToken/webhookSecretEnc/lastWebhookAt; add pollingIntervalSeconds/lastSyncAt em NexusChatConnection; add modelo ChatwootSyncCursor; remove 6 valores AuditAction webhook_*; add valores polling_*)
- prisma/migrations/<nova>/migration.sql
- src/app/api/webhooks/nexus-chat/[token]/route.ts (DELETE)
- src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts (DELETE)
- src/instrumentation.ts (remove listener webhook)
- src/lib/webhook-credentials.ts (DELETE — se existir)
- src/lib/actions/nexus-chat/connections.ts (remove logic webhook; add updatePollingInterval)
- src/lib/actions/nexus-chat/realtime-stream.ts (DELETE — substitui por sync-stream)
- src/lib/actions/nexus-chat/health-metrics.ts (recontextualiza para polling)
- src/lib/actions/nexus-chat/sync-stream.ts (NEW — listRecentSyncRuns)
- src/lib/chatwoot/sync/ (NEW — pasta com cursor.ts, table-syncs/, full-sweep.ts)
- src/worker/jobs/chatwoot-sync/ (NEW — pasta com index.ts e tests)
- src/worker/index.ts (registra novos jobs, remove queue webhook se houver)
- src/components/settings/nexus-chat/connection-list.tsx (reconstroi card, clicável inteiro, ícones, tag empresas)
- src/components/settings/nexus-chat/connection-form-dialog.tsx (remove bloco webhook, add campo pollingIntervalSeconds)
- src/components/settings/nexus-chat/connection-detail-tabs.tsx (renomeia "Tempo real" → "Sincronização")
- src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx → sincronizacao-tab.tsx
- src/components/settings/nexus-chat/tabs/jobs-tab.tsx (embute JobsPanel filtrado)
- src/components/settings/nexus-chat/tabs/saude-tab.tsx (recontextualiza)
- src/components/settings/nexus-chat/tabs/conexao-tab.tsx (corrige layout)
- src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx (remove Step Webhook; condicional Step Connection)
- src/components/settings/nexus-chat/wizard/onboarding-wizard-launcher.tsx (remove botão raiz)
- src/app/(protected)/bancos-de-dados/page.tsx (remove botão "Cadastrar empresa" do topo)
- src/app/(protected)/bancos-de-dados/[id]/page.tsx (Wizard interno + nova aba)
- src/components/settings/jobs-panel.tsx (aceita prop connectionId pra filtrar)
- src/components/tour/tours/bancos-de-dados/* (NEW — 4-5 tours: lista, conexão, sincronização, jobs, saúde)
- src/lib/actions/jobs.ts (filtra por connection)
- tests novos pra cada componente alterado (TDD)

## Arquivos compartilhados que VOU modificar
- package.json (bump v0.41.0)
- CHANGELOG.md (entrada release)
- prisma/schema.prisma (modelo novo + remoção)
- src/instrumentation.ts
- src/worker/index.ts
- CLAUDE.md (atualizar §4.1 stack — remove menção webhook, add menção polling delta)
- docs/runbooks/pre-agregacao.md (atualizar)
- docs/runbooks/webhook-nexus-chat.md (DELETE)
- docs/runbooks/polling-delta-sync.md (NEW)

## Decisões / contexto importante
- Polling delta default 30s, configurável per-connection (não per-binding), mín 20s, máx ilimitado, em segundos.
- Campo de configuração no Edit Connection Dialog.
- DELETE handling via full sweep 1x/dia 03:00 BRT.
- Worker BullMQ novo `chatwoot-sync-delta` por connection, scheduler a cada 5s checa quais conexões têm `lastSyncAt + pollingIntervalSeconds < now()` e enfileira.
- Cursor por (connectionId, accountId, tableName) → lastSyncedAt em tabela `chatwoot_sync_cursors`.
- Tabelas Chatwoot a sincronizar: a definir no plan v1, com base em src/lib/chatwoot/queries/* (o que de fato é consultado).
- Frontend não muda (`useFactsRealtime` continua escutando `facts:refreshed` no Pub/Sub — agora publicado pelo worker de polling em vez do webhook).
- Tour interativo via TourProvider/useTour (já existem).
- Workflow: writing-plans v1 → review #1 → v2 → review #2 → v3 → subagent-driven-development → verification → release.
- João autorizou modo autônomo total. Chamar de volta apenas quando LIVE.

## Bloqueios
- (nenhum)
