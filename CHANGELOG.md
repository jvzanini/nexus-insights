# Changelog

## [v0.5.0] 2026-04-29 — Foundation + UX shell + dashboards operacionais

### Crítico (corrigido)
- **Login quebrado** (`?error=Configuration`): pg-node SCRAM falhava ao resolver `db` (DNS overlay Swarm devolvia 2 IPs, um stale). Corrigido em duas frentes: (1) `pg_hba.conf` do db container alterado pra `trust` no overlay interno; (2) `DATABASE_URL` aponta agora pra `nexus-insights_db:5432` (FQDN do serviço Swarm) em vez de `db:5432`.
- **Owner trancado pós regen-senha:** botão regen-senha **escondido** (não disabled) pra `isOwner`. Idem botão delete e dropdown de status.
- **Auth bypass Prisma:** `authorizeCredentials` e `logAudit` agora usam `pgPool` raw (`@/lib/pg-pool`) — adapter do Prisma 7 + SCRAM tava dando `AuthenticationFailed` esporádico.

### Adicionado
- **Helpers datetime** (`src/lib/datetime.ts` + `src/lib/datetime-core.ts`): `getPlatformTz()`, `getPlatformLocale()`, `getPeriodInTz()`, etc. Cache 60s, fallback `America/Sao_Paulo` / `pt-BR`. Server action `updatePlatformSettings` (super_admin) com invalidação de cache reports.
- **`platform.timezone` e `platform.locale` em AppSetting**: chaves novas, lazy default (sem migration). UI em `/configuracoes` (super_admin).
- **Senha temporária simples** (`generateTempPassword`): 8 chars alfanuméricos, sem confundíveis (`0`, `1`, `i`, `l`, `o`, `I`, `L`, `O`).
- **/perfil 4 cards** no padrão Roteador Webhook Meta: Informações Pessoais, E-mail, Senha, Aparência (3 toggles grandes Escuro/Claro/Sistema). Layout 2x2 desktop, stack mobile.
- **/usuarios redesign:** Switch de status virou Select dropdown; coluna Ações com lápis editar (EditUserDialog 3 tabs); regen + delete escondidos pra owner; NewUserDialog vira wizard 3 passos com preview da senha temp gerada.
- **Filtros pills mobile-friendly:** 4 períodos (Hoje / Esta semana / Este mês / Personalizado) com `overflow-x-auto snap-x` no mobile, Popover com calendário no desktop, Sheet bottom no mobile. Range custom max 90 dias.
- **Account switcher condicional:** escondido quando user só tem ≤1 conta.
- **TZ Brasil em todos os relatórios:** helper `resolvePeriod(searchParams)` em `src/lib/reports/resolve-period.ts`.
- **Dashboard novo:** 4 KPIs clicáveis (Em Aberto, Pendentes, Resolvidas no período, Mensagens não respondidas) + 3 cards Top 5 (atendentes mais rápidos, mais conversas em aberto, inboxes mais carregados).
- **Mensagens não respondidas (nova tela):** `/relatorios/mensagens-nao-respondidas`. Lista conversas open com última msg incoming. KPIs no topo (Total / Tempo médio / Mais antigo). Mobile cards.
- **Conversas redesign:** 11 colunas (Nome | WhatsApp | Documento | Estado | Departamento | Atendente | Status | Prioridade | Labels | Ações). Removida "Última mensagem". Documento detectado via `identifier` → `additional_attributes.cpf|cnpj` → regex. Labels via `json_agg` com cor de fundo + contraste por luminância. Mobile vira cards.
- **Sidebar reorganizado** com seções (Dashboard / Relatórios / Administração) + item "Mensagens não respondidas".
- **Middleware** com `REDIRECT_MAP` pronto pra ativar consolidação 11→4 (futuro v0.5.1).
- **30+ testes Jest novos:** total 114 testes passando.

### Mudanças de comportamento
- `PeriodKey` reduzido pra 4 valores canônicos (`hoje | semana_atual | mes_atual | custom`). Chaves legadas (`ontem | 7d | 30d | mes_anterior`) ainda funcionam via fallback síncrono.
- Build target: client bundle não puxa mais `pg`/`pg-pool` graças ao split `datetime-core` (puro) vs `datetime` (server-only).

### Pendente (próximo release v0.5.1)
- Consolidar os 11 relatórios em 4 dashboards (`/relatorios/operacao`, `/relatorios/atendentes`, `/relatorios/distribuicao`, `/relatorios/origem-resultado`) com Tabs internas + redirects 302. `REDIRECT_MAP` em `src/middleware.ts` já está com a estrutura pronta.

---

## [PR-B] 2026-04-14 — Pipeline ingest via @nexusai360/webhook-routing

### Adicionado
- `PrismaWebhookAdapter` (`src/lib/webhook/adapter.ts`) implementando `WebhookAdapter` do pacote — mapeia tipos Prisma ↔ records do pacote, captura P2002 retornando inbound existente.
- `instrumentation.ts` (raiz) configura adapter no boot do Next runtime (Node.js).
- `src/worker/index.ts` chama `configureWebhookRouting(webhookAdapter)` no startup.
- Helper `src/lib/webhook/enqueue.ts` — preserva `InboundWebhook.processingStatus = "queued"` com BullMQ jobId determinístico.
- Migration `prisma/migrations/20260414000000_inbound_unique_dedupe/migration.sql` com `UNIQUE(companyId, dedupeKey)` — **criada, não aplicada** (operador roda `prisma migrate deploy` em ambiente conectado; cleanup de duplicatas documentado no `.sql`).
- Flag `USE_PACKAGE_PIPELINE` (default off) — opt-in para o novo pipeline no handler POST.
- `src/app/api/webhook/[webhookKey]/route-inline.ts` mantém pipeline antigo como fallback (deletado em PR-C ~7d após estável).
- Helpers legacy congelados em `src/lib/webhook/legacy/{normalizer-legacy,deduplicator-legacy}.ts` (+ testes movidos para `legacy/__tests__/`).
- Helper de testes `src/__tests__/utils/fake-adapter.ts` (adapter in-memory).
- Testes novos: `adapter.test.ts` (7 cases), `webhook-ingest.test.ts` reescrito (8 cases pipeline novo + flag off), `normalizer.test.ts` reescrito para o novo NormalizedEvent (7 cases).
- Script `scripts/smoke-webhook.mjs` — tráfego sintético HMAC-assinado a cada 30s.
- Runbook `docs/runbooks/webhook-routing-cutover.md`.
- Dev dep: `jest-mock-extended@^4.0.0` (Jest 30 compat).

### Mudanças de comportamento
- `listRoutes` é chamado UMA vez por callback (antes: por evento). Rotas criadas durante processamento de callback multi-evento não recebem deliveries para eventos posteriores no mesmo callback. Diferença teórica — callbacks Meta típicos têm 1–3 eventos.
- Dedupe de `errors.*` (eventos sem ID natural) recomeça do zero pós-deploy: `hashPayloadDeterministic` recursivo do pacote difere do `hashContent` top-level antigo. Aceitável: errors são raros, downstream apenas enfileira HTTP delivery.
- `messages.*` / `statuses.*` / `calls.*` mantêm chave de dedupe **byte-idêntica** (verificado spec I1).
- `normalizer.ts` mudou assinatura: agora recebe `(payload, companyId)` (2º arg é fallback de sourceId). Consumidores legacy continuam via `legacy/normalizer-legacy.ts`.

### Cutover
1. Merge com flag default OFF — produção segue inline.
2. `USE_PACKAGE_PIPELINE=true` em staging por 24h com tráfego sintético (`scripts/smoke-webhook.mjs`).
3. Flip em produção, monitorar 24h (runbook).
4. PR-C deleta `route-inline.ts`, flag, helpers legacy após 7d estáveis.

## [PR-A] 2026-04-14 — Helpers via @nexusai360/webhook-routing@0.2.1

### Adicionado
- Dependência `@nexusai360/webhook-routing@0.2.1` via vendor tarball + verify SHA256.
- Peer deps (tambem via vendor tarball): `@nexusai360/types@0.2.0`, `@nexusai360/core@0.2.1`, `@nexusai360/multi-tenant@0.2.1`.
- Script `scripts/verify-vendor.mjs` + `preinstall` hook validando checksums dos tarballs.
- Config Jest: `moduleNameMapper` resolvendo o pacote e subpaths para `dist/*.cjs`.

### Mudanças de comportamento (SSRF — bloqueios novos no egress de webhooks)
- **CGNAT (100.64.0.0/10)** agora bloqueado. Rotas configuradas para esse range passam a falhar.
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d` decimal e `::ffff:hhhh:hhhh` hex) bloqueado quando mapeia para IPv4 privado.
- **Hostnames extras bloqueados:** `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`, `broadcasthost`.

### Mudanças cosméticas
- Mensagens de erro SSRF agora são códigos estruturados (`private_ipv4`, `non_https_protocol`, `blocked_hostname`, etc.) em vez de strings em português.

### Sem mudanças
- Pipeline de ingest, normalizer, deduplicator, schema Prisma, worker — intactos. Vão ser migrados em PR-B.
