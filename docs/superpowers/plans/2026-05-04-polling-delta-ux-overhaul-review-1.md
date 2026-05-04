# Review #1 — Plan v1 Pente Fino Crítico

> Data: 2026-05-04
> Reviewer: claude-polling-delta-overhaul (auto-review)
> Postura: análise crítica REAL, não cosmética. Achados levantados sem maquiagem.

## Sumário

**Achados críticos:** 12 · **Majors:** 9 · **Minors:** 7 · **Total: 28**

Todos os achados serão aplicados na **v2** do plan. Achados marcados ✅ já validados. ⚠️ exigem mudança no plan.

---

## CRÍTICOS (12)

### C-1 ⚠️ `pollingIntervalSeconds` ausente no `ConnectionInputSchema` (Task C1)
**Sintoma:** D2 (connection-form-dialog) envia `pollingIntervalSeconds` no payload de `createNexusChatConnection`/`updateNexusChatConnection`. Mas o `ConnectionInputSchema` da Task C1 não inclui esse campo no schema Zod — Zod vai rejeitar com "Unrecognized key" ou silenciosamente ignorar dependendo de `.strict()`/`.passthrough()`. Bug certo.
**Fix:** Em C1, adicionar ao `ConnectionInputSchema`:
```typescript
pollingIntervalSeconds: z.number().int().min(20).max(86400).default(30),
```
E ajustar `createNexusChatConnection`/`updateNexusChatConnection` para passar `pollingIntervalSeconds: parsed.data.pollingIntervalSeconds` no `prisma.create/update.data`.

---

### C-2 ⚠️ Postgres `ALTER TYPE ... DROP VALUE` não suportado (Task A2)
**Sintoma:** O plan A2 Step 4 diz "audit_logs órfãos da fase webhook (deveriam ter expirado, mas garantir)". Mas Postgres NÃO permite `ALTER TYPE AuditAction DROP VALUE 'webhook_received'` direto — a única forma é criar enum novo, ALTER TABLE, drop antigo.
**Risco:** `prisma migrate dev` vai gerar SQL que pode falhar em produção se `audit_logs.action` ainda tiver rows com valores webhook_*.
**Fix:** Reescrever A2 em **3 sub-steps explícitos**:
  1. **A2.0:** Migration *separada* (cleanup) que faz `DELETE FROM "audit_logs" WHERE "action"::text IN (6 valores webhook_*)`. Esse DELETE roda primeiro.
  2. **A2.1:** Migration que troca o enum (Prisma vai gerar a dança CREATE TYPE x_new + ALTER TABLE + DROP TYPE x).
  3. **A2.2:** Validação manual via `\d+ audit_logs` confirmando enum novo.
**Justificativa:** separar em 3 migrations atômicas reduz risco em produção. Se A2.1 falhar, A2.0 já passou e os audit_logs estão limpos.

---

### C-3 ⚠️ Race condition: `Edit Connection Dialog` muda intervalo e não invalida pool (Task C1)
**Sintoma:** `updateConnectionPollingInterval` atualiza apenas o campo. O scheduler do worker já lê `polling_interval_seconds` no próximo tick (5s) — comportamento correto. Mas se a `name`/`host`/etc também mudou via `updateNexusChatConnection`, isso já chama `invalidateNexusChatPool` + `publishRealtimeEvent({ type: "connection:updated" })`. **Inconsistência:** mudar intervalo isolado NÃO publica evento, mas mudar credenciais publica. Documentar pra deixar explícito (não é bug, mas pode confundir).
**Fix:** Adicionar comentário em `updateConnectionPollingInterval` explicando que a mudança é detectada pelo scheduler no próximo tick (≤5s); não precisa de Pub/Sub porque não invalida pool nem rota de leitura.

---

### C-4 ⚠️ Worker B19 mistura JobScheduler + processor na mesma queue (Task B19)
**Sintoma:** Plan B19 diz "JobScheduler usa queue `chatwoot-sync-sweep` para o cron diário" e "Worker processFullSweepJob também escuta a queue `chatwoot-sync-sweep`". Mas o cron dispara job nome `daily-full-sweep`, e os jobs de sweep por conn têm nome `sweep-conn`. Mistura de jobs heterogêneos na mesma queue é fonte clássica de bug.
**Fix:** Usar **2 queues distintas**:
  - `chatwoot-sync-sweep-cron` (JobScheduler, cron 03:00 BRT, dispatcher worker)
  - `chatwoot-sync-sweep-conn` (Worker que recebe os jobs filhos `sweep-conn` enfileirados pelo dispatcher)
Reescrever B19 com isso.

---

### C-5 ⚠️ Frontend `useFactsRealtime` não revisado (Task B14)
**Sintoma:** O plan assume que `useFactsRealtime` continua funcionando porque escuta canal `realtime-events` com payload `{ type: "facts:refreshed", connectionId, accountId }`. Mas a implementação atual da Fase 2 pode ter sido escrita esperando algo do payload de webhook (ex: incluir `event` específico). Não foi verificado no plan.
**Fix:** Adicionar uma task **B-pre1** *antes* da fase B: ler `src/hooks/useFactsRealtime.ts` e validar que o payload `{ type, connectionId, accountId }` é suficiente. Se o hook esperar mais campos, adaptar antes de seguir.

---

### C-6 ⚠️ `messages.account_id` pode não existir no schema do Chatwoot da Matrix (Task B4 / Apêndice A)
**Sintoma:** O Apêndice A diz "Subagent valida no Postgres do Chatwoot via `\d messages` antes de implementar". Isso é placeholder — o subagent pode pular.
**Fix:** Adicionar **Task B0** explícita: "Inspecionar schema do banco do Chatwoot da Matrix: rodar `\d messages`, `\d teams`, `\d team_members`, `\d taggings`, `\d users`, `\d account_users` via `queryNexusChat` (read-only). Listar quais colunas têm `updated_at`. Atualizar o plan com SQL final exato."
Isso roda **uma vez** antes das tasks B4-B12 e elimina ambiguidade.

---

### C-7 ⚠️ JobsPanel filtrado quebra pattern SSR (Task E5)
**Sintoma:** Plan E5 diz `useEffect(() => getJobsStatus({ connectionId }))`. Isso vai render skeleton inicialmente; melhor seguir o pattern existente onde page.tsx (server component) chama o action e passa `initialStatus` como prop.
**Fix:** Reescrever E5 para:
  1. Em `bancos-de-dados/[id]/page.tsx`, chamar `getJobsStatus({ connectionId: id })` como Server Action no SSR.
  2. Passar `initialStatus` para `JobsTab` via prop.
  3. JobsTab não faz fetch initial — só mantém o polling 5s do JobsPanel.

---

### C-8 ⚠️ Test mock para `prisma.nexusChatConnection.findUnique` precisa atualizar shape (Task A1 ripple)
**Sintoma:** Os testes de `connections.ts`, `health-metrics.ts`, `connection-list.tsx`, etc. mockam `findUnique` retornando objetos com campos antigos. Precisam ganhar `pollingIntervalSeconds` e `lastSyncAt`, perder `webhookToken`/`lastWebhookAt`/`webhookSecretEnc`.
**Fix:** Adicionar nota explícita no plan: "Cada subagent que mexer em testes que mockam `nexusChatConnection.findUnique` ou `findMany` deve atualizar o shape do mock (remover webhookToken/lastWebhookAt; adicionar pollingIntervalSeconds=30 e lastSyncAt=null por default)."

---

### C-9 ⚠️ `polling_sync_started` declarado mas não usado (Task A2 + B16)
**Sintoma:** A2 adiciona `polling_sync_started` no enum, mas B16 não loga essa action — só `polling_sync_completed` ou `polling_sync_failed`. Valor enum órfão.
**Fix:** Decisão: ou remover `polling_sync_started` do A2 (YAGNI), ou usar em B16 (logar started no início, sample 1/100). Preferir **remover** (YAGNI; se precisarmos depois, adiciona).
**Decisão:** remover `polling_sync_started` do A2. Atualizar plan.

---

### C-10 ⚠️ Cron 03:00 BRT escrito como "0 6 * * *" (Task B19) sem timezone (BullMQ)
**Sintoma:** BullMQ JobScheduler aceita `pattern` cron, mas o cron parser interpreta UTC por default. `0 6 * * *` em UTC = 06:00 UTC = 03:00 BRT (UTC-3) — funciona. Mas se o servidor do worker estiver em outro timezone (containers às vezes vêm com TZ=UTC, às vezes não), pode dar 06:00 local. Risco real.
**Fix:** Forçar timezone explicitamente:
```typescript
await sweepScheduler.upsertJobScheduler(
  "daily-full-sweep",
  { pattern: "0 6 * * *", tz: "UTC" },
  { name: "full-sweep", data: {} },
);
```
Ou usar `tz: "America/Sao_Paulo"` com `pattern: "0 3 * * *"` — mais legível.

---

### C-11 ⚠️ Constraint CHECK no Postgres pode não ser respeitado por Prisma update (Task A1)
**Sintoma:** A1 Step 4 adiciona `CHECK (polling_interval_seconds >= 20)`. Prisma update não revalida a constraint client-side; se o frontend ou backend enviar 5, o erro vem do Postgres como `P2010` ou similar. Server Action C1 já valida via Zod (`min(20)`), mas o erro é client-side primeiro. **OK, defesa em profundidade**.
**Fix:** Documentar isso no comentário do `pollingIntervalSeconds` no schema. Sem mudança de código.

---

### C-12 ⚠️ Faltam testes de runs com erro parcial em B15 (run-full-sweep)
**Sintoma:** B15 só testa 2 cenários (happy path + 0 bindings). Não testa o cenário onde uma tabela falha mas as outras continuam.
**Fix:** Adicionar 3o test em B15:
```typescript
it("captura erro por tabela sem abortar o sweep inteiro", async () => {
  prismaMock.companyChatBinding.findMany.mockResolvedValue([{ chatwootAccountId: 9 }] as never);
  queryNexusChatMock.mockRejectedValueOnce(new Error("table not found"));
  queryNexusChatMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });
  // ... outras mocks
  const summary = await runFullSweep("conn-1");
  expect(summary.errors).toHaveLength(1);
  expect(summary.perTable.length).toBeGreaterThanOrEqual(1);
});
```

---

## MAJORS (9)

### M-1 ⚠️ `data-tour` attrs faltam na refatoração E1 (lista) e E3 (sincronização)
**Sintoma:** F2 (listaTour) referencia `[data-tour='lista-conn-card']`, `[data-tour='lista-actions']`, `[data-tour='lista-new-connection']`. Mas E1 não menciona adicionar esses atributos no novo `connection-list.tsx`. Idem E3 para `sincronizacao-header`/`sincronizacao-kpis`/`sincronizacao-runs`.
**Fix:** No fim de cada task de UI (E1-E7), adicionar checklist explícito de `data-tour` attrs a aplicar, batendo com os selectors dos tours F2-F6.

---

### M-2 ⚠️ TourTriggerButton no Tabs precisa pegar tour DINÂMICO
**Sintoma:** F7 mostra `<TourTriggerButton config={TOUR_BY_TAB[activeTab]} />` num componente que não tem acesso ao state `activeTab` (TabsList usa o context interno do Tabs).
**Fix:** Reescrever F7 para usar `searchParams.get("tab")` ou expor `activeTab` via prop no `<ConnectionDetailTabs>` — mais simples, ele já calcula `activeTab` internamente.

---

### M-3 ⚠️ Wizard `prefilledConnectionId` + Stepper inconsistência (Task D3)
**Sintoma:** D3 diz "Stepper só visível quando NÃO prefilled". Mas o componente Stepper recebe `current={state.step}` e `STEP_LABELS` com 3 entradas. Quando prefilled, `state.step` começa em 2 — Stepper renderiza só "Etapa 2 de 3 visualmente concluída" e fica estranho.
**Fix:** Quando prefilledConnectionId, **não render Stepper** — só texto "Etapa N de 2". Render condicional já estava no plan (linhas 1245-1250) ✅. Garantir que `STEP_LABELS` quando prefilled vire `["Identidade", "Conclusão"]` (2 entradas).

---

### M-4 ⚠️ Faltam tests de tour configs (F2-F6)
**Sintoma:** Plan não inclui sanity test para configs de tour. Risco de targetSelector errado quebrar o tour silenciosamente.
**Fix:** Adicionar **Task F8: Sanity tests dos tours**:
```typescript
import { listaTour } from "@/components/tour/tours/bancos-de-dados/lista";

describe("listaTour config", () => {
  it("tem ID único e ≥1 step", () => {
    expect(listaTour.id).toBe("bancos-de-dados-lista");
    expect(listaTour.steps.length).toBeGreaterThan(0);
  });
  it("todos os targetSelectors começam com [data-tour=", () => {
    for (const s of listaTour.steps) {
      expect(s.targetSelector).toMatch(/^\[data-tour=/);
    }
  });
});
```
1 test por tour config = 5 tests novos.

---

### M-5 ⚠️ TourOverlay (existente) pode não suportar todos placements
**Sintoma:** F2-F6 usam placement="left/right/bottom/top". Não foi verificado se o TourOverlay existente suporta os 4.
**Fix:** Adicionar **Task F0** (antes da F1): ler `src/components/tour/tour-overlay.tsx` e validar suporte aos 4 placements. Se faltar algum, ajustar configs ou implementar suporte.

---

### M-6 ⚠️ Audit `polling_sync_completed` com `details.rowsByTable` array pode ficar enorme
**Sintoma:** B16 loga `rowsByTable: summary.perTable.map(...)` no audit details. Com 10 tabelas × 2 accounts = 20 entries por log. JSON ~2KB. Multiplicado por 1/100 sample, virou ~7MB/dia/connection em 30s ticks. Pra 1 conn, fica 200MB/mês na tabela audit_logs. Aceitável mas importa documentar.
**Fix:** Reduzir details em B16 para apenas `rowsAffected` total + 3 maiores tables. Diff:
```typescript
details: {
  durationMs: summary.totalDurationMs,
  totalRows: summary.perTable.reduce((s, t) => s + t.rowsAffected, 0),
  topTables: summary.perTable.slice(0, 3).map(t => ({ table: t.tableName, rows: t.rowsAffected })),
  hadChanges: summary.hadChanges,
},
```

---

### M-7 ⚠️ Health metrics `syncRunsLast24h * 100` produz overshoot (Task C3)
**Sintoma:** Sample rate 1/100 multiplicado de volta dá estimativa **com erro de ±100**. Para 1h × 30s = 120 runs reais, audit terá 0-2 entries esperados. Multiplicar por 100 dá 0 ou 200 — variância alta. Para 24h = 2880 runs reais, audit terá ~28 → estimativa 2800. Aceitável.
**Fix:** Documentar variância no card UI: "Estimativa (sample-corrected, ±100)". Adicionar no `SaudeTab` no value formatter:
```tsx
<KpiCard label="Runs 24h (est.)" value={kpis.syncRunsLast24h.toString()} ... />
```

---

### M-8 ⚠️ Test `useEffect` mock pra avoid setInterval em jsdom (Task E3)
**Sintoma:** SincronizacaoTab usa `setInterval`. Em testes com jsdom, setInterval continua executando entre testes — leak. Plan E3 não menciona como mockar.
**Fix:** Adicionar nota no E3: "Em test, usar `jest.useFakeTimers()` no `beforeEach` e `jest.useRealTimers()` no `afterEach` para controlar o setInterval."

---

### M-9 ⚠️ Tour data-attrs em componentes do shadcn/base-ui podem ser strippeded
**Sintoma:** Tabs/TabsTrigger do base-ui pode reescrever DOM internamente. `<TabsTrigger value="conexao" data-tour="aba-conexao">` pode não chegar ao DOM final se o base-ui não passar adiante. Não verificado.
**Fix:** Em vez de colocar data-tour direto no TabsTrigger, envolver com span:
```tsx
<TabsTrigger value="conexao">
  <span data-tour="aba-conexao">
    <Database className="..." />
    Conexão
  </span>
</TabsTrigger>
```
Garante o DOM final tem o atributo.

---

## MINORS (7)

### m-1 Bump versão deveria ser depois do smoke local
Plan G3 bumpa versão antes de G4 (smoke). Ordem certa: G4 (smoke) → G3 (bump + commit release).
**Fix:** Trocar ordem: G4 antes de G3.

### m-2 Clean dirs após DELETE webhook
A1 `rmdir src/app/api/webhooks/nexus-chat/[token] 2>/dev/null || true` — OK, mas `rmdir` em Mac/Linux não falha em "not empty"? Adicionar `rm -rf` para casos de arquivo `.DS_Store`:
```bash
rm -rf src/app/api/webhooks
```

### m-3 Audit logs cleanup pode disparar `prisma migrate dev` rejeição
A2.0 (cleanup) é uma migration *de dados*, mas Prisma migrations normalmente são DDL. Subagent precisa criar migration manual com `npx prisma migrate dev --create-only --name cleanup_audit_webhook` e adicionar o DELETE manualmente no SQL gerado.

### m-4 BigInt no JSON de audit
B16 loga `rowsByTable` mas `rows` é `bigint` em DB; JSON.stringify quebra com bigint sem custom serializer. Converter pra Number antes de logar.

### m-5 Faltam testes E2E de fim-a-fim
Plan não tem teste E2E (Playwright/Cypress). YAGNI por agora — testes unitários cobrem.

### m-6 i18n
Strings em pt-BR hardcoded. OK pra projeto mas registrar como dívida futura.

### m-7 Worker timezone explícito
Plan B19 não força `process.env.TZ`. Em produção, container deve ter `TZ=America/Sao_Paulo` ou usar `tz` no JobScheduler (resolvido em C-10).

---

## Lacunas de Spec Coverage

Releitura comparando com a mensagem do João:

### ✅ Cobertos
- Remover botão "Cadastrar empresa" do topo da página raiz → D4
- Reconstruir card como linha clicável + ícones + tag empresas → E1
- Edit Connection layout corrigido + sem webhook → D2
- Aba Tempo Real → Sincronização → E2 + E3
- Aba Jobs com painel embutido + tutorial → E5 + F5
- Aba Saúde recontextualizada com dados úteis → E6
- Wizard sem Step Webhook → D3
- Polling delta universal 30s configurável (mín 20s) → A1 + B + C1
- Tour interativo em todas as telas → F1-F8
- Estrutura conexão→empresas mantida → preservada
- Remover webhook completamente → D1

### ❌ Pendentes (achados na releitura)
- **L-1:** "se você for manter a tela de saúde, eu quero que tenha realmente dados úteis" → E6 mantém os 4 cards mas não verificou se os dados são *úteis*. Adicionar lista de "Erros recentes" (top 5 falhas) no Saúde tab.
- **L-2:** João disse "essa configuração precisa estar em alguma tela do menu do banco de dados" — D2 coloca no Edit Dialog. Mas para conexão NOVA (mode=create), o user já vê o campo. ✅
- **L-3:** "tutorial em todas as telas da seção banco de dados" → 5 tours cobrem 5 telas. Lista raiz (1) + Detalhe×4 abas (4) = 5 ✅. Mas o Edit Connection Dialog também é uma "tela" do banco. Adicionar tour para o Dialog? **Decisão:** sim, adicionar `editConnectionTour` (Task F9, +1 tour).
- **L-4:** "remover aviso 'token único'" — D2 remove `WebhookSection` inteira ✅.

---

## Riscos de Migração

### R-1 ⚠️ Audit logs acumulados
Atualmente em produção, audit_logs tem ~N rows com `action ∈ webhook_*`. A2.0 deleta. Validar contagem em produção antes:
```sql
SELECT action, COUNT(*) FROM audit_logs WHERE action::text LIKE 'webhook_%' GROUP BY action;
```
Se houver >100k rows, considerar batch DELETE (1k por vez) pra não travar tabela.

### R-2 ⚠️ webhookToken antigo cadastrado no Chatwoot
O João já cadastrou o webhook na URL `/api/webhooks/nexus-chat/<token>`. Pós-deploy, esse endpoint dá 404. **OK** — pedir pro João "remover o webhook do painel admin do Nexus Chat" no checklist pós-deploy. Documentar isso no runbook polling-delta-sync.md.

### R-3 ⚠️ Worker rolling deploy
Se o worker velho ainda está rodando enquanto o novo deploy acontece, pode haver race entre worker_v0.40 (escutando webhook queue) e worker_v0.41 (escutando polling queue). Como webhook queue some completamente em A2/D1, worker velho vai falhar mas não vai corromper estado. **OK**.

---

## Decisões Não Justificadas (review)

### J-1 Por que `pollingIntervalSeconds` per-connection e não per-binding?
**Justificativa adicionada na v2:** intervalo afeta carga no banco do Chatwoot, que é compartilhado entre todas as accounts daquela connection. Per-binding daria controle granular, mas worker teria que iterar bindings × intervalos diferentes — complexidade alta. Per-connection é o ponto mais simples que faz sentido.

### J-2 Por que sweep diário em 03:00 BRT (não 04:00 ou 02:00)?
**Justificativa adicionada na v2:** menor tráfego no Chatwoot (academias fechadas). Pode ser ajustado se medirmos alta carga.

### J-3 Por que sample 1/100 no audit completed?
**Justificativa adicionada na v2:** com 30s tick × 24h = 2880 runs/dia/conn. 100% audit = 86k rows/mês/conn — explosão. 1/100 = ~860 rows/mês — manejável. Erros sempre 100% (raros).

---

## Próximos passos (v2)

1. Aplicar todos os 28 fixes acima nas tasks correspondentes.
2. Adicionar Tasks **B0** (validar schema Chatwoot), **F0** (validar TourOverlay), **F8** (sanity tests tours), **F9** (editConnectionTour).
3. Corrigir ordem G3↔G4.
4. Adicionar L-1 (lista "Erros recentes" em Saúde tab).
5. Documentar todas as Justificativas (J-1 a J-3) inline no plan v2.

Após aplicar fixes → escrever **Review #2** ainda mais profundo.
