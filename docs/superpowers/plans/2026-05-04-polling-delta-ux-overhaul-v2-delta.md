# Plan v2 — Delta sobre v1 (após Review #1)

> Este arquivo lista APENAS as mudanças aplicadas após o review #1. A v3 final consolida tudo num arquivo único.

## Tasks adicionadas (5 novas)

### Task B0: Inspecionar schema do Chatwoot da Matrix antes das table-syncs
**Files:**
- Create: `scripts/inspect-chatwoot-schema.ts` (descartável — só roda 1x)

**Steps:**
1. Criar script Node que conecta no banco do Chatwoot via `queryNexusChat` e roda 12 `SELECT column_name FROM information_schema.columns WHERE table_name = X` para cada tabela alvo.
2. Salvar output em `docs/runbooks/polling-delta-sync.md` seção "Schema mapeado em <data>".
3. Atualizar Apêndice A do plan v3 com SQL final exato baseado no que foi descoberto.
4. Commit: `chore(sync): B0 v0.41 — inspeciona schema Chatwoot e documenta colunas updated_at por tabela`.

### Task F0: Validar suporte a 4 placements no TourOverlay existente
**Files:**
- Read: `src/components/tour/tour-overlay.tsx`
- Modify (se faltar): adicionar suporte aos placements ausentes.

**Steps:**
1. Ler o código atual do TourOverlay.
2. Confirmar que aceita placement `top|bottom|left|right`.
3. Se faltar algum, adicionar suporte ANTES da F1.
4. Commit (se houve fix): `fix(tour): F0 v0.41 — TourOverlay suporta 4 placements`.

### Task F8: Sanity tests dos tours configs
**Files:**
- Create: `src/components/tour/tours/bancos-de-dados/__tests__/configs.test.ts`

**Steps:**
1 test por config (5 tours) validando: `id` único, `≥1 step`, todos `targetSelector` no formato `[data-tour='...']`.
Commit: `test(tour): F8 v0.41 — 5 sanity tests para tour configs`.

### Task F9: editConnectionTour (tour do Edit Connection Dialog)
**Files:**
- Create: `src/components/tour/tours/bancos-de-dados/edit-connection.ts`
- Modify: `src/components/settings/nexus-chat/connection-form-dialog.tsx` (add botão "?" no header)

**Steps:**
4-step tour: Nome/Host/Porta → Banco/Usuário → Senha/SSL → **Intervalo de sincronização**.
Commit: `feat(tour): F9 v0.41 — editConnectionTour 4 steps + botão ? no Edit Dialog`.

### Task L-1: Card "Erros recentes" no Saúde tab
**Files:**
- Modify: `src/components/settings/nexus-chat/tabs/saude-tab.tsx`

**Steps:**
Adicionar bloco abaixo dos KPIs: lista top 5 audit logs `polling_sync_failed` últimos 24h com tabela mais afetada e mensagem de erro truncada (200 chars). Empty state quando 0.
Commit: `feat(ui): L-1 v0.41 — saude-tab adiciona card 'Erros recentes' (top 5 polling_sync_failed)`.

## Tasks alteradas (12)

### Task C1 — alteração C-1, C-3, J-1
**Mudanças aplicadas:**
- Adicionar no `ConnectionInputSchema`: `pollingIntervalSeconds: z.number().int().min(20).max(86400).default(30)`.
- Em `createNexusChatConnection`/`updateNexusChatConnection`: passar `pollingIntervalSeconds: parsed.data.pollingIntervalSeconds` no `data` do Prisma.
- Comentário em `updateConnectionPollingInterval`: "Mudança detectada pelo scheduler no próximo tick (≤5s); não invalida pool nem rota de leitura — não publica Pub/Sub."
- Justificativa J-1 inline: "Escolha per-connection: intervalo afeta carga no banco fonte (compartilhado entre accounts daquela connection); per-binding daria controle granular mas com complexidade alta de scheduler."

### Task A2 — alteração C-2
**Reescrita em 3 sub-tasks atômicas:**

**A2.0 — Cleanup audit logs órfãos webhook (data migration)**
1. `npx prisma migrate dev --create-only --name cleanup_audit_webhook`
2. Editar `migration.sql` gerado (vazio) e adicionar:
```sql
-- Cleanup: remove rows com enum values que serão dropados em A2.1.
-- Sem isso, o ALTER TYPE falha por foreign key implícita do enum.
DELETE FROM "audit_logs" WHERE "action"::text IN (
  'webhook_received',
  'webhook_rejected_hmac',
  'webhook_rejected_rate_limit',
  'webhook_no_binding',
  'webhook_token_regenerated',
  'webhook_secret_regenerated'
);
```
3. `npx prisma migrate dev` (aplica)
4. Commit `feat(schema): A2.0 v0.41 — data migration deleta audit_logs com action webhook_*`

**A2.1 — Drop webhook fields + enum migration (DDL)**
1. Editar `prisma/schema.prisma`: remover 3 fields webhook em NexusChatConnection + 6 valores enum + add 5 valores polling (sem `polling_sync_started` — C-9).
2. `npx prisma migrate dev --create-only --name drop_webhook_add_polling_audit`
3. Validar `migration.sql` gerado contém:
   - `DROP INDEX "nexus_chat_connections_webhook_token_key"`
   - `ALTER TABLE "nexus_chat_connections" DROP COLUMN webhook_token, DROP COLUMN webhook_secret_enc, DROP COLUMN last_webhook_at`
   - Estratégia Prisma de troca de enum (CREATE TYPE x_new + ALTER TABLE + DROP TYPE x_old)
4. `npx prisma migrate dev`
5. Commit `feat(schema): A2.1 v0.41 — DROP webhook fields + AuditAction enum trade webhook_*→polling_*`

**A2.2 — Validação manual**
1. `psql ... -c "\d+ audit_logs"` → confirma enum tem só os valores polling_*.
2. `psql ... -c "\d+ nexus_chat_connections"` → confirma sem webhook_*.
3. Sem commit — só documentação no agent file.

### Task A1 — C-9, C-11
- Remover `polling_sync_started` da lista de valores enum (não usado em B16).
- Comentário JSDoc no schema sobre `pollingIntervalSeconds`: "Mínimo 20s validado por Zod (Server Action) e CHECK constraint Postgres (defesa em profundidade)."

### Task B14 — C-5
Adicionar **Step 0** antes de B14:
- Ler `src/hooks/useFactsRealtime.ts` (ou onde estiver).
- Validar payload esperado é `{ type: "facts:refreshed", connectionId, accountId }`.
- Se hook esperar mais campos do payload de webhook (ex: `event`, `payload`), adaptar antes de seguir.

### Task B15 — C-12
Adicionar 3o test:
```typescript
it("captura erro por tabela sem abortar o sweep inteiro", async () => {
  prismaMock.companyChatBinding.findMany.mockResolvedValue([{ chatwootAccountId: 9 }] as never);
  queryNexusChatMock
    .mockRejectedValueOnce(new Error("table not found"))
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  const summary = await runFullSweep("conn-1");
  expect(summary.errors.length).toBe(1);
  expect(summary.errors[0]?.tableName).toBe("conversations");
  expect(summary.perTable.length).toBeGreaterThanOrEqual(1);
});
```

### Task B16 — M-6, m-4
Reduzir details:
```typescript
details: {
  durationMs: summary.totalDurationMs,
  totalRows: summary.perTable.reduce((s, t) => s + t.rowsAffected, 0),
  topTables: summary.perTable
    .slice()
    .sort((a, b) => b.rowsAffected - a.rowsAffected)
    .slice(0, 3)
    .map((t) => ({ table: t.tableName, rows: t.rowsAffected })),
  hadChanges: summary.hadChanges,
},
```
**Tipo:** garantir `rowsAffected` é `number` (já é em `TableSyncResult`), não `bigint` — não há conversão necessária.

### Task B19 — C-4, C-10
**Reescrito com 2 queues distintas + tz:**
```typescript
// 1. Queue para o cron diário (1 job que dispatcha)
const cronQueue = new Queue("chatwoot-sync-sweep-cron", { connection });
const cronScheduler = new JobScheduler(cronQueue.name, { connection });
await cronScheduler.upsertJobScheduler(
  "daily-full-sweep",
  { pattern: "0 3 * * *", tz: "America/Sao_Paulo" },
  { name: "dispatch", data: {} },
);

// 2. Worker do cron — só dispatcha
new Worker(
  "chatwoot-sync-sweep-cron",
  async (_job) => {
    const conns = await prisma.nexusChatConnection.findMany({
      where: { deletedAt: null, status: "active" },
      select: { id: true },
    });
    const sweepQueue = getFullSweepQueue();
    for (const c of conns) {
      await sweepQueue.add("sweep-conn", { connectionId: c.id });
    }
  },
  { connection, concurrency: 1 },
);

// 3. Queue para os jobs filhos
const sweepQueue = new Queue("chatwoot-sync-sweep", { connection, defaultJobOptions: { attempts: 1, removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } } });

// 4. Worker dos jobs filhos
new Worker("chatwoot-sync-sweep", processFullSweepJob, { connection, concurrency: 1 });

// 5. Delta-sync worker + scheduler 5s tick (igual antes)
```

### Task D2 — Acompanha C-1
Confirmar que payload do `createNexusChatConnection`/`updateNexusChatConnection` agora inclui `pollingIntervalSeconds`.

### Task D3 — M-3
- Quando `prefilledConnectionId`, `STEP_LABELS` vira `["Identidade", "Conclusão"]` (2 entries).
- Stepper só renderiza se NÃO prefilled.
- Quando prefilled, mostrar "Etapa X de 2" como texto curto.

### Task E1 — M-1
Adicionar checklist explícito no fim da task:
- [ ] `data-tour="lista-header"` no `<section>` ou wrapper de cabeçalho.
- [ ] `data-tour="lista-conn-card"` no `<Link>` da primeira linha.
- [ ] `data-tour="lista-actions"` no `<div>` dos 3 ícones de ação.
- [ ] `data-tour="lista-new-connection"` no `<Button>` "Nova conexão".

### Task E3 — M-1, M-8
Adicionar checklist:
- [ ] `data-tour="sincronizacao-header"` no `<header>`.
- [ ] `data-tour="sincronizacao-kpis"` no `<KpiGrid>` wrapper.
- [ ] `data-tour="sincronizacao-runs"` no `<RunList>` wrapper.

E nota sobre testes:
- [ ] Em `__tests__/sincronizacao-tab.test.tsx`, usar `jest.useFakeTimers()` no beforeEach e `jest.useRealTimers()` no afterEach pra controlar o setInterval.

### Task E5 — C-7
Reescrita SSR-first:
1. Em `bancos-de-dados/[id]/page.tsx`, adicionar:
   ```typescript
   const initialJobsStatus = await getJobsStatus({ connectionId: conn.id });
   ```
2. Passar `initialStatus` para `<ConnectionDetailTabs>`, que passa pra `<JobsTab>`.
3. JobsTab aceita prop `initialStatus`, passa pra `<JobsPanel>`.
4. JobsPanel **não faz fetch initial** — só polling 5s.

### Task E6 — L-1
Adicionar bloco "Erros recentes" abaixo dos 4 KPIs:
- Usa `listRecentSyncRuns({ limit: 200 })` já chamado.
- Filtra `action === "polling_sync_failed"`, top 5 mais recentes.
- Renderiza tabela compacta: timestamp, tabela mais afetada (de `details.errors[0]?.tableName`), erro truncado (200 chars).
- Empty state quando 0: "Nenhum erro de sync nas últimas 24h."

### Task E7 — Acompanha
Confirmar `<OnboardingWizardLauncher prefilledConnectionId>` é sintaxe válida (D3 adicionou prop).

### Task F7 — M-2, M-9
1. `<ConnectionDetailTabs>` aceita prop `activeTab` ou expõe via state lifted up. Mais simples: já calcula `activeTab` internamente; render `<TourTriggerButton config={TOUR_BY_TAB[activeTab]} />` dentro do mesmo componente.
2. Para `data-tour` em `TabsTrigger`, envolver com `<span data-tour="...">` para garantir DOM final.

## Mudanças globais

### G3 e G4 — m-1
Trocar ordem: G4 (smoke local) ANTES de G3 (bump versão + commit release). Isso garante que se algo quebra no smoke, não temos commit de versão pendente.

### Tarefa anti-leak — m-2
Em D1 Step 1, trocar `rmdir` por `rm -rf`:
```bash
git rm src/app/api/webhooks/nexus-chat/[token]/route.ts
git rm src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts
git rm src/lib/nexus-chat/webhook-credentials.ts
git rm src/lib/nexus-chat/__tests__/webhook-credentials.test.ts
git rm src/lib/actions/nexus-chat/realtime-stream.ts
git rm src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts
rm -rf src/app/api/webhooks
```

### Test mock shape — C-8
Adicionar nota global no header do plan v3: "**ATENÇÃO MOCK SHAPE:** Cada subagent que mexer em testes que mockam `prisma.nexusChatConnection.findUnique`/`findMany` DEVE atualizar o shape: remover `webhookToken`/`lastWebhookAt`/`webhookSecretEnc`; adicionar `pollingIntervalSeconds: 30` e `lastSyncAt: null` por default."

### Documentação Justificativas — J-2, J-3
Adicionar bloco "Decisões Arquitetônicas" no header do plan v3 com J-1, J-2, J-3 (per-connection, sweep 03:00 BRT, sample 1/100).

### Riscos pós-deploy — R-2
No runbook polling-delta-sync.md (Task G1), adicionar checklist pós-deploy:
- [ ] Pedir ao João para acessar o painel admin do Nexus Chat e **remover o webhook cadastrado** (não vai mais ser usado, e o endpoint dá 404).
- [ ] Validar `/api/health` mostra v0.41.0.
- [ ] Validar `/bancos-de-dados/[id]?tab=sincronizacao` mostra runs aparecendo a cada 30s (heartbeat verde dentro de 1 min após deploy).

## Tasks que ficam como estão (sem alteração)

B1, B2, B3, B4-B12 (apenas SQL via B0), B13, B17, B18, C2, D1, D4, E2, E4, E8, F1, F2, F3, F4, F5, F6, G1, G2, G5.

---

**v2 = v1 + este delta. Próximo passo: Review #2 (mais profundo).**
