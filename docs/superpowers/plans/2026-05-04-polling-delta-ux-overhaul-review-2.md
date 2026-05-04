# Review #2 — v2 (v1 + delta) Pente Fino Mais Profundo

> Data: 2026-05-04
> Reviewer: claude-polling-delta-overhaul (auto-review)
> Postura: análise ainda mais minuciosa. Foco em contradições internas, requisitos implícitos, edge cases sutis, dependências esquecidas.

## Sumário

**Achados críticos:** 7 · **Majors:** 8 · **Minors:** 5 · **Total: 20**

---

## CRÍTICOS (7)

### CC-1 ⚠️🔥 Pré-agregação `chatwoot_facts_*` continua rodando em paralelo (CONTRADIÇÃO MAIOR)
**Sintoma:** Hoje, o worker BullMQ tem 5 jobs scheduled `refresh-by-account/inbox/agent/team` + `hourly-by-account` (cron 5 min) que **POPULAM** as tabelas `chatwoot_facts_*` lendo do banco do Chatwoot. O frontend lê dessas tabelas (`src/lib/chatwoot/facts.ts`). Plan v1 introduz **outro** ciclo de polling (delta-sync) que também lê do Chatwoot mas NÃO escreve em `chatwoot_facts_*`. **Resultado:** dois sistemas paralelos, dobro de carga, dados em `chatwoot_facts_*` continuam refrescando a cada 5 min independente do delta. O frontend vê dados *antigos* até o cron 5min passar.
**Severidade:** Crítica. Quebra o objetivo (latência <30s).
**Fix:** No `runDeltaSync`, em vez de publicar `facts:refreshed` direto, **enfileirar imediatamente** os 5 jobs de pré-agregação para a connection × account afetada. Cada job, ao terminar, publica `facts:refreshed`. Lógica:
```typescript
// Ao detectar accountsChanged em runDeltaSync:
for (const accountId of accountsChanged) {
  const queue = getRefreshQueue(); // já existe — pré-agregação
  await queue.add("refresh-by-account", { connectionId, accountId });
  await queue.add("refresh-by-inbox", { connectionId, accountId });
  await queue.add("refresh-by-agent", { connectionId, accountId });
  await queue.add("refresh-by-team", { connectionId, accountId });
  await queue.add("hourly-by-account", { connectionId, accountId });
}
```
E os scheduled crons antigos de pré-agregação ficam como **fallback de segurança** (rebaixados para 30 min), não como fonte primária. O delta-sync de 30s vira o disparador real.
**Task nova:** **Task BX1: integrar runDeltaSync com pré-agregação** (entre B14 e B15).
**Task nova:** **Task BX2: rebaixar cron pré-agregação 5min → 30min** em `src/worker/jobs/pre-agregacao/scheduler.ts` (ou onde quer que esteja).

---

### CC-2 ⚠️ `audits-table.tsx` mapeia labels para webhook_* — sem isso, UI quebra
**Sintoma:** `src/components/users/audits-table.tsx` (citado no histórico) provavelmente mapeia AuditAction → label pra renderizar a aba "Auditoria" do menu admin. Plan v1/v2 não tocam nesse arquivo. Após A2.1, a UI quebra com action enum value novo (ou orfã com webhook_* sem fallback).
**Fix:** **Task DX1: atualizar `audits-table.tsx`** — remover labels webhook_*, adicionar labels polling_*.

---

### CC-3 ⚠️ Detectar early connection failure (loop de erros)
**Sintoma:** Se o banco do Chatwoot está down, `runDeltaSync` itera 10 tabelas × 2 accounts = 20 chamadas, cada uma retorna `ECONNREFUSED`. Resultado: 20 audit_logs `polling_sync_failed` por run × 120 runs/hora = 2400 audits/hora. Spam no audit + 2400 writes em `chatwoot_sync_cursors.last_error`.
**Fix:** No `runDeltaSync`, antes do loop de bindings, fazer **probe**:
```typescript
try {
  await queryNexusChat(connectionId, "SELECT 1", []);
} catch (err) {
  return {
    connectionId,
    startedAt,
    finishedAt: new Date(),
    totalDurationMs: Date.now() - t0,
    perTable: [],
    errors: [{ tableName: "*probe*", accountId: 0, error: String(err) }],
    hadChanges: false,
  };
}
```
Apenas 1 erro audit por run quando banco fora. Adicionar ao plan v3 dentro de B14 Step 3.

---

### CC-4 ⚠️ Test mock não cobre cenário de probe falhar
**Sintoma:** Decorrência de CC-3. Faltam testes em `runDeltaSync` para cenário: connection inacessível.
**Fix:** Adicionar 6o test em B14:
```typescript
it("aborta cedo com 1 erro quando probe SELECT 1 falha", async () => {
  const queryMock = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
  jest.mock("@/lib/nexus-chat/pool", () => ({ queryNexusChat: queryMock }));
  // ...
  const summary = await runDeltaSync("conn-1");
  expect(summary.errors).toHaveLength(1);
  expect(summary.errors[0]?.tableName).toBe("*probe*");
  expect(tableSync1.run).not.toHaveBeenCalled();
});
```

---

### CC-5 ⚠️ Soft delete da connection durante runDeltaSync
**Sintoma:** Worker pega job, super_admin apaga conn (soft delete) durante a execução. `runDeltaSync` continua iterando, escreve em `chatwoot_sync_cursors` órfão (mas Cascade só dispara em hard delete).
**Severidade:** Não-crítico mas precisa documentar — não corrompe dados, só faz trabalho desnecessário.
**Fix:** Em `runDeltaSync`, **antes** do probe, validar que connection ainda existe e não está deletada:
```typescript
const conn = await prisma.nexusChatConnection.findUnique({
  where: { id: connectionId, deletedAt: null },
  select: { id: true },
});
if (!conn) {
  return {
    connectionId, startedAt, finishedAt: new Date(),
    totalDurationMs: Date.now() - t0,
    perTable: [], errors: [], hadChanges: false,
  };
}
```

---

### CC-6 ⚠️ `tickDeltaSyncScheduler` test cobertura insuficiente
**Sintoma:** B18 só tem 2 tests (happy path + 0 conns). Faltam:
- Conn pausada (`status != 'active'`) não enfileira.
- Conn deletada (`deletedAt != null`) não enfileira.
- Conn com `last_sync_at = NULL` enfileira primeiro (NULLS FIRST).
**Fix:** Adicionar 3 tests novos no B18.

---

### CC-7 ⚠️ Worker scheduler não é resiliente a falha do tick
**Sintoma:** `setInterval(() => tickDeltaSyncScheduler().catch(...))` — se o tick demorar mais de 5s, dois ticks rodam simultâneos. JobId determinístico mitiga, mas conn cards.
**Fix:** Usar BullMQ JobScheduler para o tick também (em vez de setInterval Node):
```typescript
const tickQueue = new Queue("delta-sync-scheduler-tick", { connection });
const tickScheduler = new JobScheduler(tickQueue.name, { connection });
await tickScheduler.upsertJobScheduler(
  "delta-tick",
  { every: 5000 }, // a cada 5s
  { name: "tick", data: {} },
);
new Worker(tickQueue.name, async () => tickDeltaSyncScheduler(), { connection, concurrency: 1 });
```
Concurrency 1 + JobId garantido = sem ticks paralelos. Mais robusto que setInterval Node.

---

## MAJORS (8)

### MM-1 ⚠️ `sincronizacao-tab` polling 5s vs polling 30s do worker (UX)
**Sintoma:** UI atualiza a cada 5s buscando audit logs. Worker roda a cada 30s. User vê "Última sync há 5s" e fica confuso por quê o "Runs última 1h" demorou pra incrementar.
**Fix:** Adicionar texto explicativo abaixo do header:
```tsx
<p className="text-xs text-muted-foreground">
  Esta tela atualiza a cada 5s. O worker faz o sync efetivo a cada {pollingIntervalSeconds}s
  (configurável na Aba Conexão).
</p>
```

### MM-2 ⚠️ `pre-agregacao.md` runbook precisa explicar nova arquitetura
**Sintoma:** Plan v1/v2 G2 diz "adicionar seção 'Relação com polling delta'". Mas com CC-1 (delta dispara pré-agregação), a explicação fica mais profunda. Pré-agregação não roda mais 5min — ela roda **on-demand quando há mudança detectada**, com fallback 30 min se nada disparar.
**Fix:** Reescrever G2: pré-agregação rebaixada de 5min → 30min como fallback; gatilho real é `runDeltaSync`.

### MM-3 ⚠️ Migration A2.0 batch delete em prod
**Sintoma:** Plan v2 fala em DELETE single-pass. Em prod, se houver >100k rows webhook_*, lock da tabela bloqueia inserts.
**Fix:** Em A2.0 migration.sql, batch delete:
```sql
DO $$
DECLARE
  batch_size INT := 1000;
  rows_deleted INT;
BEGIN
  LOOP
    DELETE FROM "audit_logs"
    WHERE "id" IN (
      SELECT "id" FROM "audit_logs"
      WHERE "action"::text LIKE 'webhook_%'
      LIMIT batch_size
    );
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    EXIT WHEN rows_deleted = 0;
  END LOOP;
END $$;
```

### MM-4 ⚠️ `connection-list.test.tsx` teste "clique não navega" precisa mockar useRouter
**Sintoma:** Next.js Link em jsdom não navega; mas se `useRouter().push` for chamado, o test vê. Plan E1 não menciona o mock.
**Fix:** Adicionar nota: "no test, mockar `useRouter` retornando `{ push: jest.fn(), refresh: jest.fn() }` e validar que `push` NÃO foi chamado quando o botão de teste é clicado."

### MM-5 ⚠️ `useFactsRealtime` ainda recebe payload com `event`?
**Sintoma:** Decorrência de C-5 (review #1). Sem ler o hook, não sabemos se aceita payload novo.
**Fix:** **Task BX0** (antes de B-pre1): ler `useFactsRealtime` e validar. Se rejeitar payload sem `event`, adaptar.

### MM-6 ⚠️ JobsPanel filtrar por connectionId pode mostrar 0 rows
**Sintoma:** Se a connection ainda não tem bindings com facts populados (`chatwoot_facts_meta` vazio para essa conn), JobsPanel mostra "0 jobs" e empty state. Isso pode confundir após criar nova conn (sem dados ainda).
**Fix:** Adicionar empty state mais informativo no JobsPanel quando `connectionId` está setado e rows.length === 0:
```tsx
<p>Nenhum job registrado ainda para esta conexão. Os jobs aparecem após o primeiro polling delta detectar mudanças.</p>
```

### MM-7 ⚠️ `pollingIntervalSeconds` em `<ConnectionListItem>` interface
**Sintoma:** Plan v1 menciona "remover webhookToken; adicionar pollingIntervalSeconds" na interface. Mas o que **mapeia** o objeto Prisma → ConnectionListItem? Provavelmente em `bancos-de-dados/page.tsx`. Esse arquivo precisa atualizar select e map.
**Fix:** Adicionar nota explícita na Task D4 (página raiz): "atualizar select Prisma + mapping para incluir `pollingIntervalSeconds`."

### MM-8 ⚠️ Test de `updateConnectionPollingInterval` não testa rejeição de não-super_admin
**Sintoma:** C1 tests cobrem (a) rejeição de < 20, (b) sucesso, (c) audit. Falta teste de não-super_admin.
**Fix:** Adicionar 4o test em C1:
```typescript
it("rejeita user não super_admin", async () => {
  getCurrentUserMock.mockResolvedValue({ platformRole: "manager" });
  const r = await updateConnectionPollingInterval("conn-1", 30);
  expect(r.success).toBe(false);
  expect(r.error).toContain("super_admin");
});
```

---

## MINORS (5)

### mm-1 Type narrow `summary.errors[0]?.tableName`
Em CC-3 fix, escrevi `errors: [{ tableName: "*probe*", accountId: 0, error: String(err) }]`. `accountId: 0` quebra o type — provavelmente `accountId: number` aceita 0. OK.

### mm-2 Worker entry com `process.env.TZ`
Como segurança, no topo de `src/worker/index.ts` adicionar:
```typescript
process.env.TZ = process.env.TZ ?? "America/Sao_Paulo";
```
Garante consistência de cron mesmo se container vier sem TZ definido.

### mm-3 Falta documentar SLA de delta
No runbook polling-delta-sync.md, adicionar SLA esperado:
- Latência percebida pelo user: ≤ pollingIntervalSeconds + 30s (delta + pré-agregação).
- Default 30s + 30s = 60s p99.

### mm-4 audit details `topTables` ordering
B16 fix usa `slice().sort()`. Em runs com 0 rows, sort dá array vazio — `topTables: []`. OK.

### mm-5 Connection-list "Activity" icon nome em pt-BR ambíguo
Trocar TestTube → Activity. Mas "atividade" em pt-BR é palavra outra. Em hover/title do botão, usar "Testar conexão" (mantém label) — só mudei o ícone. **OK no plan**.

---

## Lacunas Adicionais Detectadas

### LL-1 Worker rolling deploy duplica polling
Durante deploy, worker velho ainda escutando `chatwoot-sync-delta` (já que a queue é a mesma). Se ambos pegarem o mesmo job (idempotente via jobId), uma instância processa, outra falha com `Already exists`. **Aceitável**, BullMQ lida.

### LL-2 Schema do Chatwoot pode mudar
Se o Chatwoot atualizar (raro mas possível), schema das 10 tabelas pode mudar. Polling continua funcionando até a coluna mudar de nome. **Acceitável risk**.

### LL-3 Backfill inicial
Para conn nova: `lastSyncAt = null` → primeira execução do delta busca **TODAS** as rows com `updated_at > 1970-01-01`. Banco do Chatwoot pode ter milhões. Single batch LIMIT 5000 = vamos varrer durante muitos ticks até alcançar.
**Mitigação:** o LIMIT 5000 em todas as table-syncs já garante batches manejáveis. Vai levar 1-2 horas para 1M rows × 30s = 17 minutos. **Aceitável**.
**Documentar no runbook.**

### LL-4 `npm run worker` precisa estar funcionando local
Plan G4 (smoke local) menciona `npm run dev` (next dev). Mas o worker é processo separado. Smoke completo requer `npm run worker` paralelo.
**Fix:** Em G4 adicionar Step "rodar worker em outro terminal: `npm run worker` e validar logs `[scheduler tick]` aparecendo a cada 5s".

---

## Próximos passos (v3)

1. Aplicar todos os achados de review #1 + review #2 num **único arquivo plan v3 final**.
2. Tasks novas:
   - **BX0:** Validar useFactsRealtime payload contract
   - **BX1:** Integrar runDeltaSync com pré-agregação (refresh-by-* on demand)
   - **BX2:** Rebaixar cron pré-agregação 5min → 30min (fallback)
   - **DX1:** Atualizar `audits-table.tsx` (labels webhook_* → polling_*)
   - **B0** (já listado em v2): inspeciona schema Chatwoot
   - **F0** (já listado em v2): valida TourOverlay placements
   - **F8** (já listado em v2): sanity tests tour configs
   - **F9** (já listado em v2): editConnectionTour + botão ?
   - **L-1** (já listado em v2): card "Erros recentes" no Saúde
3. Reordenar G3 e G4 (smoke antes de bump).
4. Documentar SLAs no runbook.
5. Adicionar mock TZ no worker entry.

---

**v3 = v1 + v2-delta + este review-2. Próximo passo: escrever o arquivo v3 final consolidado.**
