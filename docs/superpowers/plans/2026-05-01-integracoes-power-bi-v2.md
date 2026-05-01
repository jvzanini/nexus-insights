# Integrações + Power BI — Implementation Plan (v0.17.0) — v2

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. UI tasks (T11–T28) require invoking `ui-ux-pro-max:ui-ux-pro-max` BEFORE writing any code. **Coordenação multi-agente:** se um arquivo já está sendo mexido em commit recente (< 30 min) por outro agente, NÃO tocar — pivot e retornar depois.

> **Pente-fino #1 — sumário de mudanças vs v1**
> P1 sub-tasks de UI primitives · P2 migration quebrada em chunks · P3 cross-ref deploy remoto · P4 nota sobre `prisma migrate diff` drift · P5 tests do provisioner com matchers regex em vez de ordem rígida · P6 statement_timeout em pool dedicado · P7 dim sync explícito por dim · P8 reconcile com código · P9 confirma `requireSuperAdmin`/`safeAction` no pattern existente · P10 9 actions com pseudocódigo cada · P11 detalhes visuais Hub · P12 SSE pulado v0.17.0 · P13 wizard back/dirty check · P14 server action pra popular MultiSelect filtros · P15 reveal não persiste · P16 `getProfileByIdAction` adicionada · P17 timeline pagination · P18 delete copy · P19 desktop icons listados · P20 snippet count = #views · P21 CHANGELOG com placeholder data · P22 instrução exata migration prod · P23 jsdom OK · P24 PageHeader ok · P25 sidebar test · P26 ok subagent invoca skill · P27 env var read no Server · P28 fallback quote sem pg-format types · P29 cross-ref CREATEROLE runbook · P30 diretiva multi-agente no header · P31 template subagent prompts · P32 migration timestamp via prisma · P33 audit targetType/targetId · P34 rotate copy · P35 jest isolateModules · P36 view name compute server · P37 mock empty state · P38 soft cap fetch · P39 dim freshness query · P40 E2E pulado · P41 nav test.

**Spec:** `docs/superpowers/specs/2026-05-01-integracoes-power-bi-design.md` (v3 final).
**Goal:** Menu "Integrações" super_admin only com primeira integração Power BI: provisioning automático de user/views/RLS no banco interno, wizard 4 passos, 3 caminhos de conexão, audit completo.
**Architecture:** Schema isolada `powerbi` + views derivadas por perfil. 1 user Postgres + senha encriptada AES-256-GCM por perfil. UI super_admin only hardcoded. Wizard como Dialog. RLS via WHERE em view derivada (não policies nativas).
**Tech Stack:** Next.js 16 · TS · Tailwind v4 · base-ui · NextAuth v5 · Prisma 7 · `pg` + `pg-format` (novo) · Redis + BullMQ · AES-256-GCM · Lucide React.

---

## Pré-execução — coordenação multi-agente (P30)

**Antes de começar Fase A:**

1. Confirmar v0.16.0 LIVE: `gh run list --limit 5` deve mostrar último build verde. `curl https://insights.nexusai360.com/api/health` deve responder com `version=0.16.x`.
2. `git fetch origin main && git pull --rebase origin main`. Resolver conflitos manualmente se houver.
3. Re-ler `docs/agents/active/` — confirmar que `claude-nex-suite-refinement.md` foi deletado (sessão encerrada).
4. Atualizar timestamp em `docs/agents/active/claude-integracoes-powerbi.md`.
5. Bumpar `package.json` versão (T1).

**Durante implementação:**
- Se subagent encontrar arquivo no working tree mexido e não-staged que NÃO faz parte do plan, NÃO tocar (provavelmente outro agente em paralelo). Pivot.
- A cada commit relevante, append em `docs/agents/HISTORY.md`.
- Antes de cada push: `gh run list --limit 5` (não empilhar deploys).

**Template de prompt pro subagent (P31):**
```
Você é um subagent despachado para a Task <N>: <título> do plan
docs/superpowers/plans/2026-05-01-integracoes-power-bi.md (v3 final).

Spec de referência: docs/superpowers/specs/2026-05-01-integracoes-power-bi-design.md.

REGRAS ABSOLUTAS DESTE PROJETO:
- Skill obrigatória pra QUALQUER task de UI: invoque ui-ux-pro-max:ui-ux-pro-max
  ANTES de escrever uma linha. Sem exceção.
- TDD por task quando há lógica testável: write test → run fail → implement → run pass → commit.
- Arquivos `"use server"` só exportam funções `async`.
- NUNCA tocar arquivos que não fazem parte do escopo desta task. Se git status
  mostrar arquivos modificados que não estão no plan, ignorar (outro agente).

Faça SOMENTE a Task <N> e suas sub-tasks. Reporte ao final:
- Arquivos criados/modificados.
- Comando de teste rodado e resultado.
- Hash do commit.
- Bloqueios ou desvios da spec/plan.
```

---

## File structure

(Mesma estrutura da v1; ver lá.)

---

## Fase A — Fundação (libs, schema, sem UI)

### Task 1: Bump versão + dependências + UI primitives

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify (if needed): `src/components/ui/{tooltip,multi-select,accordion,progress}.tsx`

> **Nota P28:** se `@types/pg-format` não existir no NPM (DefinitelyTyped), declarar tipo manual em `src/types/pg-format.d.ts`:
> ```ts
> declare module "pg-format" {
>   function format(fmt: string, ...args: any[]): string;
>   export default format;
> }
> ```

- [ ] **Step 1.1:** `package.json`: `"version": "0.17.0"` (verificar atual; rebase pode ter mudado).
- [ ] **Step 1.2:** `npm install pg-format`. Se types não existirem, criar `.d.ts` (acima).
- [ ] **Step 1.3 (P1):** Verificar `src/components/ui/`:
  - `tooltip.tsx` — base-ui Tooltip wrapper. Padrão: hover/focus mostra texto descritivo. Se não existir, criar.
  - `accordion.tsx` — base-ui Accordion. Headers + colapso animado. Se não existir, criar.
  - `progress.tsx` — barra de progresso (não Step indicator). Se não existir, criar.
  - `multi-select.tsx` — Select com múltiplas seleções. Pode ser baseado no `searchable-select.tsx` existente, em modo multi.
- [ ] **Step 1.4:** `npm run typecheck` → 0 erros.
- [ ] **Step 1.5:** Commit:
  ```bash
  git add package.json package-lock.json src/components/ui/ src/types/
  git commit -m "chore(deps): bump 0.17.0 + pg-format + ui primitives p/ Integrações (T1)"
  ```

---

### Task 2: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<auto-timestamp>_add_integrations_power_bi/migration.sql`

> **Nota P32:** `npx prisma migrate dev --name add_integrations_power_bi` gera o timestamp. Não hard-code datas.

> **Nota P4:** após APENDAR o SQL custom (schema powerbi + tabelas snapshot + views), rodar `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` deveria retornar empty se nada de pendente. Se mostrar drift, é porque o schema custom **não está no schema.prisma** — esperado. Apenas confirmar que migration aplicou sem erros via `npx prisma migrate status`.

- [ ] **Step 2.1:** Adicionar enums + models conforme spec §5 (mesmo conteúdo de v1).
- [ ] **Step 2.2:** Adicionar enum `AuditAction` (6 novos valores).
- [ ] **Step 2.3:** Adicionar relations no `User`:
  ```prisma
  integrationProfilesCreated IntegrationProfile[]    @relation("IntegrationProfileCreator")
  integrationAuditEvents     IntegrationAuditLog[]   @relation("IntegrationAuditUser")
  ```
- [ ] **Step 2.4:** `npx prisma migrate dev --create-only --name add_integrations_power_bi`.
- [ ] **Step 2.5 (P2 — quebrado em chunks):** Apender ao migration.sql:

  **Chunk A — schema + snapshot tables:**
  ```sql
  CREATE SCHEMA IF NOT EXISTS powerbi;

  CREATE TABLE IF NOT EXISTS powerbi.dim_accounts_snapshot (
    account_id INT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS powerbi.dim_inboxes_snapshot (
    account_id INT NOT NULL,
    inbox_id INT NOT NULL,
    name TEXT NOT NULL,
    channel_type TEXT,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, inbox_id)
  );
  CREATE TABLE IF NOT EXISTS powerbi.dim_agents_snapshot (
    account_id INT NOT NULL,
    agent_id INT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, agent_id)
  );
  CREATE TABLE IF NOT EXISTS powerbi.dim_teams_snapshot (
    account_id INT NOT NULL,
    team_id INT NOT NULL,
    name TEXT NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, team_id)
  );
  ```

  **Chunk B — passthrough views (dims):**
  ```sql
  CREATE OR REPLACE VIEW powerbi.dim_accounts AS
    SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;
  CREATE OR REPLACE VIEW powerbi.dim_inboxes AS
    SELECT account_id, inbox_id, name, channel_type FROM powerbi.dim_inboxes_snapshot;
  CREATE OR REPLACE VIEW powerbi.dim_agents AS
    SELECT account_id, agent_id, name, email FROM powerbi.dim_agents_snapshot;
  CREATE OR REPLACE VIEW powerbi.dim_teams AS
    SELECT account_id, team_id, name FROM powerbi.dim_teams_snapshot;
  ```

  **Chunk C — passthrough views (facts):**
  ```sql
  CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_account AS
    SELECT account_id, bucket_date, received, resolved, open_at_eod, pending_at_eod,
           messages_in, messages_out, unique_contacts,
           frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
    FROM public.chatwoot_facts_daily_by_account;
  -- ... idem chatwoot_facts_daily_by_inbox, _by_agent, _by_team, _hourly_by_account.
  ```
  (Repetir explicitamente para todas as 5 facts; ver detalhes na v1.)

  **Chunk D — calendar:**
  ```sql
  CREATE OR REPLACE VIEW powerbi.dim_dates AS
    SELECT
      d::DATE AS bucket_date,
      EXTRACT(YEAR FROM d)::INT AS year,
      EXTRACT(MONTH FROM d)::INT AS month,
      EXTRACT(DAY FROM d)::INT AS day,
      EXTRACT(DOW FROM d)::INT AS day_of_week,
      EXTRACT(WEEK FROM d)::INT AS iso_week,
      TO_CHAR(d, 'TMMonth') AS month_name_pt
    FROM generate_series('2024-01-01'::DATE, '2030-12-31'::DATE, '1 day') AS d;
  ```

  **Chunk E — comments:**
  ```sql
  COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table). Managed by app, do not edit manually.';
  COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_account IS 'v1 (2026-05-01)';
  -- ... idem demais facts.
  ```

- [ ] **Step 2.6:** `DATABASE_URL=$LOCAL_DB_URL npx prisma migrate dev` aplica localmente.
- [ ] **Step 2.7:** `npx prisma migrate status` deve mostrar "applied".
- [ ] **Step 2.8:** `npm run typecheck` → 0 erros (Prisma client regenerado).
- [ ] **Step 2.9:** Commit:
  ```bash
  git add prisma/schema.prisma prisma/migrations/
  git commit -m "feat(db): models IntegrationProfile + IntegrationAuditLog + schema powerbi (T2)"
  ```

---

### Task 3: Catálogo (POWER_BI_CATALOG + BLOCKED_TABLES_REGEX)

(Igual à v1; ver lá. Tests + implementação completos.)

- [ ] Step 3.1: tests-first.
- [ ] Step 3.2: run → FAIL.
- [ ] Step 3.3: implementação.
- [ ] Step 3.4: tests PASS.
- [ ] Step 3.5: commit.

---

### Task 4: Password generator

(Igual à v1.)

---

### Task 5: SQL builders

(Igual à v1.)

---

### Task 6: M-snippet generator

(Igual à v1.)

---

### Task 7: Provisioner (Tx 1/2/3 + statement_timeout em pool dedicado)

**Files:**
- Create: `src/lib/integrations/power-bi/admin-pool.ts` (P6 — pool dedicado com statement_timeout)
- Create: `src/lib/integrations/power-bi/provisioner.ts`
- Create: `src/lib/integrations/power-bi/__tests__/provisioner.test.ts`

- [ ] **Step 7.1 (P6):** `admin-pool.ts`:
  ```ts
  import { Pool } from "pg";

  const globalForAdminPool = globalThis as unknown as { integrationAdminPool: Pool | undefined };

  export function getIntegrationAdminPool(): Pool {
    if (globalForAdminPool.integrationAdminPool) return globalForAdminPool.integrationAdminPool;
    globalForAdminPool.integrationAdminPool = new Pool({
      connectionString: process.env.DATABASE_URL,  // mesmo do app, mas com timeout dedicado
      min: 0,
      max: 3,
      statement_timeout: 30_000,
      idleTimeoutMillis: 5_000,
      application_name: "nexus-insights-integrations-admin",
    });
    return globalForAdminPool.integrationAdminPool;
  }
  ```

- [ ] **Step 7.2 (P5 — tests com matchers regex):**
  ```ts
  it("provisionProfile emite CREATE USER, CREATE VIEW, GRANT na ordem certa", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (/^SELECT viewname/i.test(sql)) return { rows: [] };
      return { rowCount: 0 };
    });

    await provisionProfile({...});

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    const createUserIdx = calls.findIndex(s => /CREATE USER/.test(s));
    const createViewIdx = calls.findIndex(s => /CREATE VIEW/.test(s));
    const grantSelectIdx = calls.findIndex(s => /GRANT SELECT/.test(s));
    expect(createUserIdx).toBeLessThan(createViewIdx);
    expect(createViewIdx).toBeLessThan(grantSelectIdx);
  });
  ```
  (Testar fluxos: happy, dup `42710`, falha mid-Tx 3, deprovision order.)

- [ ] **Step 7.3:** Implementar — usar `getIntegrationAdminPool()` em vez de `pgPool` do app:
  ```ts
  import { getIntegrationAdminPool } from "./admin-pool";

  export async function provisionProfile(input: ProvisionInput): Promise<void> {
    const pool = getIntegrationAdminPool();
    const client = await pool.connect();
    try {
      // (resto igual à v1, mas sem `SET statement_timeout` runtime — já set no pool)
      // Tx 1 (CREATE/ALTER USER fora de BEGIN)
      // Tx 2 (BEGIN; SELECT viewname; DROP VIEW; COMMIT)
      // Tx 3 (BEGIN; CREATE VIEW; GRANT USAGE; GRANT SELECT; COMMIT)
    } finally {
      client.release();
    }
  }
  // disableProfile, reactivateProfile, deprovisionProfile com mesma estrutura.
  ```

- [ ] **Step 7.4:** Tests PASS.
- [ ] **Step 7.5:** Commit.

---

### Task 8: Worker dim sync + reconcile (P7, P8 — explícito por dim)

**Files:**
- Create: `src/lib/integrations/power-bi/dim-sync.ts`
- Create: `src/lib/integrations/power-bi/reconcile.ts`
- Create: `src/worker/jobs/integrations/refresh-dim-snapshots.ts`
- Create: `src/worker/jobs/integrations/reconcile-integrations.ts`
- Modify: `src/worker/index.ts`
- Create: `src/lib/integrations/power-bi/__tests__/dim-sync.test.ts`
- Create: `src/lib/integrations/power-bi/__tests__/reconcile.test.ts`

- [ ] **Step 8.1:** `dim-sync.ts` — 4 funções explícitas (uma por dim):

  ```ts
  export async function refreshAccountsDim(): Promise<SnapshotResult> {
    const result: SnapshotResult = { dim: "dim_accounts", upserted: 0, errors: [] };
    try {
      const rows = await chatwootQuery<{ id: number; name: string; status: string | null }>(
        "SELECT id, name, status FROM accounts"
      );
      if (rows.length === 0) return result;
      const values = rows.map(r => format("(%L, %L, %L, now())", r.id, r.name, r.status));
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(format(
          `INSERT INTO powerbi.dim_accounts_snapshot (account_id, name, status, refreshed_at)
           VALUES %s
           ON CONFLICT (account_id) DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, refreshed_at=EXCLUDED.refreshed_at`,
          values.join(", ")
        ));
        await client.query("DELETE FROM powerbi.dim_accounts_snapshot WHERE refreshed_at < now() - INTERVAL '1 hour'");
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      result.upserted = rows.length;
    } catch (err: any) {
      result.errors.push(err.message ?? String(err));
    }
    return result;
  }

  export async function refreshInboxesDim(): Promise<SnapshotResult> {
    const result: SnapshotResult = { dim: "dim_inboxes", upserted: 0, errors: [] };
    try {
      const rows = await chatwootQuery<{ account_id: number; id: number; name: string; channel_type: string | null }>(
        "SELECT account_id, id, name, channel_type FROM inboxes"
      );
      if (rows.length === 0) return result;
      const values = rows.map(r => format("(%L, %L, %L, %L, now())", r.account_id, r.id, r.name, r.channel_type));
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(format(
          `INSERT INTO powerbi.dim_inboxes_snapshot (account_id, inbox_id, name, channel_type, refreshed_at)
           VALUES %s
           ON CONFLICT (account_id, inbox_id) DO UPDATE SET name=EXCLUDED.name, channel_type=EXCLUDED.channel_type, refreshed_at=EXCLUDED.refreshed_at`,
          values.join(", ")
        ));
        await client.query("DELETE FROM powerbi.dim_inboxes_snapshot WHERE refreshed_at < now() - INTERVAL '1 hour'");
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      result.upserted = rows.length;
    } catch (err: any) {
      result.errors.push(err.message ?? String(err));
    }
    return result;
  }

  // Idem refreshAgentsDim (account_id+id+name+email do Chatwoot users JOIN account_users).
  // Idem refreshTeamsDim (id+account_id+name do Chatwoot teams).

  export async function refreshAllDimSnapshots(): Promise<SnapshotResult[]> {
    return Promise.all([
      refreshAccountsDim(),
      refreshInboxesDim(),
      refreshAgentsDim(),
      refreshTeamsDim(),
    ]);
  }
  ```

  Cada função tem try/catch isolado: falha em uma não para outras.

  > **Nota Chatwoot agents:** verificar nome real da tabela. Pode ser `account_users JOIN users` para pegar agent_id + name + email per account. Adicionar SQL exato após verificação contra o schema Chatwoot.

- [ ] **Step 8.2 (P8):** `reconcile.ts`:
  ```ts
  export async function reconcileIntegrations(): Promise<{ drifts: Drift[] }> {
    const profiles = await prisma.integrationProfile.findMany({
      where: { deletedAt: null, status: { not: "disabled" } },
      select: { id: true, pgUsername: true, status: true, allowedTables: true },
    });
    const drifts: Drift[] = [];
    for (const p of profiles) {
      const adminPool = getIntegrationAdminPool();
      const client = await adminPool.connect();
      try {
        const userRow = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1 AND rolcanlogin = true", [p.pgUsername]);
        if (!userRow.rowCount) {
          drifts.push({ profileId: p.id, type: "missing_user" });
          continue;
        }
        const expectedViews = (p.allowedTables as string[]).map(t => buildDerivedViewName(p.id, t));
        const actualViewsResult = await client.query(
          "SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname = ANY($1)",
          [expectedViews]
        );
        const actualSet = new Set(actualViewsResult.rows.map((r: any) => r.viewname));
        const missing = expectedViews.filter(v => !actualSet.has(v));
        if (missing.length > 0) drifts.push({ profileId: p.id, type: "missing_views", missing });
      } finally {
        client.release();
      }
    }
    // Para cada drift: marca profile.status = 'error' + audit
    for (const d of drifts) {
      await prisma.integrationProfile.update({
        where: { id: d.profileId },
        data: { status: "error", lastProvisionError: `drift: ${d.type}` },
      });
      await prisma.integrationAuditLog.create({
        data: { profileId: d.profileId, event: "provisioning_failed", details: { drift: d } },
      });
    }
    return { drifts };
  }
  ```

- [ ] **Step 8.3:** Worker handlers — registrar em `src/worker/index.ts` e adicionar JobScheduler:
  ```ts
  // src/worker/index.ts
  await queueRefreshDim.upsertJobScheduler("refresh-dim-snapshots-cron",
    { pattern: "*/30 * * * *" }, { name: "refresh-dim-snapshots", data: {} });
  await queueReconcile.upsertJobScheduler("reconcile-integrations-cron",
    { pattern: "0 */6 * * *" }, { name: "reconcile-integrations", data: {} });
  ```

- [ ] **Step 8.4:** Tests cobrindo: empty input (0 rows), happy path (UPSERT + DELETE), erro no chatwootQuery (não para outras dims), erro no pgPool (rollback).

- [ ] **Step 8.5:** Commit.

---

## Fase B — Server Actions

### Task 9: `integrations.ts` (cross-integration) + Server Action de freshness

**Files:**
- Create: `src/lib/actions/integrations.ts`
- Create: `src/lib/actions/__tests__/integrations.test.ts`

(Verificar antes: `src/lib/actions/safe-action.ts` existe? Quais helpers tem? Procurar `requireSuperAdmin` no código existente — provavelmente em `src/lib/auth-helpers.ts` ou similar. Se não, criar replicando pattern de `nex-prompt.ts`.)

- [ ] **Step 9.1:** Tests:
  - `getIntegrationsSummary` retorna `{ powerBi: { active, disabled, errored } }`.
  - `getDimSnapshotFreshness` retorna `{ accounts: Date|null, inboxes: ..., agents: ..., teams: ... }` (P39).
  - Guard super_admin em ambos.

- [ ] **Step 9.2:** Implementar:
  ```ts
  "use server";
  import { requireSuperAdmin, safeAction } from "@/lib/actions/safe-action";  // confirmar path
  import { prisma } from "@/lib/prisma";
  import { pgPool } from "@/lib/pg-pool";

  export const getIntegrationsSummary = safeAction(async () => {
    await requireSuperAdmin();
    const [active, disabled, errored] = await Promise.all([
      prisma.integrationProfile.count({ where: { kind: "power_bi", status: "active", deletedAt: null } }),
      prisma.integrationProfile.count({ where: { kind: "power_bi", status: "disabled", deletedAt: null } }),
      prisma.integrationProfile.count({ where: { kind: "power_bi", status: "error", deletedAt: null } }),
    ]);
    return { powerBi: { active, disabled, errored } };
  });

  export const getDimSnapshotFreshness = safeAction(async () => {
    await requireSuperAdmin();
    const result = await pgPool.query<{ dim: string; max_refreshed: Date | null }>(
      `SELECT 'accounts' AS dim, MAX(refreshed_at) AS max_refreshed FROM powerbi.dim_accounts_snapshot
       UNION ALL
       SELECT 'inboxes', MAX(refreshed_at) FROM powerbi.dim_inboxes_snapshot
       UNION ALL
       SELECT 'agents', MAX(refreshed_at) FROM powerbi.dim_agents_snapshot
       UNION ALL
       SELECT 'teams', MAX(refreshed_at) FROM powerbi.dim_teams_snapshot`
    );
    return Object.fromEntries(result.rows.map(r => [r.dim, r.max_refreshed]));
  });
  ```

- [ ] **Step 9.3:** Commit.

---

### Task 10: `integrations-power-bi.ts` (10 actions) (P10, P38, P14)

**Files:**
- Create: `src/lib/actions/integrations-power-bi.ts`
- Create: `src/lib/actions/__tests__/integrations-power-bi.test.ts`

> Cada action segue pattern: `safeAction(async (...) => { await requireSuperAdmin(); zod.parse(input); ...; await logAudit({ action, targetType: "integration_profile", targetId: profile.id, details }); ... })`.

- [ ] **Step 10.1:** Tests parametrizados (`describe.each`) verificando guard super_admin em todas as 10 actions.

- [ ] **Step 10.2:** Implementar (esboços):

  **`listProfilesAction()`**:
  ```ts
  export const listProfilesAction = safeAction(async () => {
    await requireSuperAdmin();
    return prisma.integrationProfile.findMany({
      where: { kind: "power_bi", deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, description: true, status: true, pgUsername: true, passwordLast4: true, allowedTables: true, accountIdFilter: true, teamIdFilter: true, lastProvisionedAt: true, lastProvisionError: true, createdAt: true, createdBy: { select: { id: true, name: true, email: true } } },
    });
  });
  ```

  **`getProfileByIdAction(id)`** (P16):
  ```ts
  export const getProfileByIdAction = safeAction(async (id: string) => {
    await requireSuperAdmin();
    const profile = await prisma.integrationProfile.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        auditEvents: { take: 50, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!profile || profile.deletedAt) return null;
    return profile;
  });
  ```

  **`createProfileAction(input)`**:
  ```ts
  const createInputSchema = z.object({
    name: z.string().min(3).max(60).regex(/^[A-Za-z0-9 _\-]+$/),
    description: z.string().max(280).optional(),
    allowedTables: z.array(z.string()).min(1),
    allowedColumns: z.record(z.string(), z.array(z.string()).min(1)),
    accountIdFilter: z.array(z.number()).nullable(),
    teamIdFilter: z.array(z.number()).nullable(),
  });

  export const createProfileAction = safeAction(async (raw: unknown) => {
    await requireSuperAdmin();
    const user = await getCurrentUser();
    const input = createInputSchema.parse(raw);

    // Soft cap (P38)
    const activeCount = await prisma.integrationProfile.count({
      where: { kind: "power_bi", deletedAt: null, status: { not: "disabled" } }
    });
    const cap = parseInt(process.env.INTEGRATION_PROFILE_SOFT_CAP ?? "50");
    if (activeCount >= cap) throw new Error(`Limite de ${cap} perfis atingido. Edite/desative perfis existentes.`);

    // Slug
    const slug = deriveSlug(input.name);
    const random = randomBytes(3).toString("hex");
    const pgUsername = `pbi_${slug}_${random}`;

    // Validate allowlist
    validateAllowedTables(input.allowedTables);

    // Generate password
    const password = generateIntegrationPassword();
    const encryptedPgPassword = encrypt(password);
    const passwordLast4 = getPasswordLast4(password);

    // Create profile (rejeita P2002)
    let profile;
    try {
      profile = await prisma.integrationProfile.create({
        data: {
          kind: "power_bi",
          name: input.name,
          description: input.description ?? null,
          pgUsername,
          encryptedPgPassword,
          passwordLast4,
          allowedTables: input.allowedTables,
          allowedColumns: input.allowedColumns,
          accountIdFilter: input.accountIdFilter,
          teamIdFilter: input.teamIdFilter,
          createdById: user?.id ?? null,
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") throw new Error("Nome já existe — escolha outro.");
      throw err;
    }

    // Provision Postgres
    try {
      await provisionProfile({
        id: profile.id,
        pgUsername,
        password,
        allowedTables: input.allowedTables,
        allowedColumns: input.allowedColumns,
        accountIdFilter: input.accountIdFilter,
        teamIdFilter: input.teamIdFilter,
      });
      await prisma.integrationProfile.update({
        where: { id: profile.id },
        data: { lastProvisionedAt: new Date(), status: "active", lastProvisionError: null },
      });
    } catch (err: any) {
      await prisma.integrationProfile.update({
        where: { id: profile.id },
        data: { status: "error", lastProvisionError: err.message },
      });
      await prisma.integrationAuditLog.create({
        data: { profileId: profile.id, event: "provisioning_failed", userId: user?.id, details: { error: err.message } },
      });
      await logAudit({ userId: user?.id, action: "integration_provisioning_failed", targetType: "integration_profile", targetId: profile.id, details: { error: err.message } });
      throw new Error("Provisionamento falhou: " + err.message);
    }

    // Audit
    await prisma.integrationAuditLog.create({
      data: { profileId: profile.id, event: "profile_created", userId: user?.id, details: { name: input.name } },
    });
    await logAudit({ userId: user?.id, action: "integration_profile_created", targetType: "integration_profile", targetId: profile.id, details: { name: input.name } });

    revalidatePath("/integracoes/power-bi");

    // Retorna senha em CLEAR uma única vez aqui
    return { profile, plainPassword: password };
  });
  ```

  **`updateProfileAction(id, input, expectedUpdatedAt)`** (NF9):
  ```ts
  export const updateProfileAction = safeAction(async (id: string, raw: unknown, expectedUpdatedAt: string) => {
    await requireSuperAdmin();
    const user = await getCurrentUser();
    const input = createInputSchema.parse(raw);

    // Optimistic concurrency
    const current = await prisma.integrationProfile.findUnique({ where: { id }, select: { updatedAt: true, pgUsername: true, encryptedPgPassword: true } });
    if (!current) throw new Error("Perfil não encontrado.");
    if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new Error("Perfil modificado por outro super_admin. Recarregue a página.");
    }

    validateAllowedTables(input.allowedTables);

    const profile = await prisma.integrationProfile.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null, allowedTables: input.allowedTables, allowedColumns: input.allowedColumns, accountIdFilter: input.accountIdFilter, teamIdFilter: input.teamIdFilter },
    });

    // Re-provision com mesma senha (decrypt)
    const password = decrypt(current.encryptedPgPassword);
    try {
      await provisionProfile({
        id, pgUsername: current.pgUsername, password,
        allowedTables: input.allowedTables, allowedColumns: input.allowedColumns,
        accountIdFilter: input.accountIdFilter, teamIdFilter: input.teamIdFilter,
      });
      await prisma.integrationProfile.update({
        where: { id }, data: { lastProvisionedAt: new Date(), status: "active", lastProvisionError: null },
      });
    } catch (err: any) {
      await prisma.integrationProfile.update({
        where: { id }, data: { status: "error", lastProvisionError: err.message },
      });
      throw new Error("Provisionamento falhou: " + err.message);
    }

    await prisma.integrationAuditLog.create({
      data: { profileId: id, event: "whitelist_changed", userId: user?.id, details: { tables: input.allowedTables } },
    });
    await logAudit({ userId: user?.id, action: "integration_profile_updated", targetType: "integration_profile", targetId: id });

    revalidatePath(`/integracoes/power-bi/${id}`);
    return profile;
  });
  ```

  **`revealPasswordAction(id)`**:
  ```ts
  export const revealPasswordAction = safeAction(async (id: string) => {
    await requireSuperAdmin();
    const user = await getCurrentUser();

    // Rate limit Redis: 5×/perfil/dia
    const key = `integ:reveal:${id}:${dayKey()}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 86400);
    if (count > 5) throw new Error("Limite de 5 revelações por dia atingido.");

    const profile = await prisma.integrationProfile.findUnique({ where: { id }, select: { encryptedPgPassword: true } });
    if (!profile) throw new Error("Perfil não encontrado.");
    const password = decrypt(profile.encryptedPgPassword);

    await prisma.integrationAuditLog.create({
      data: { profileId: id, event: "password_revealed", userId: user?.id },
    });
    await logAudit({ userId: user?.id, action: "integration_password_revealed", targetType: "integration_profile", targetId: id });

    return password;
  });
  ```

  **`rotatePasswordAction(id)`**:
  ```ts
  export const rotatePasswordAction = safeAction(async (id: string) => {
    await requireSuperAdmin();
    const user = await getCurrentUser();

    // Rate limit 10/dia
    const key = `integ:rotate:${id}:${dayKey()}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 86400);
    if (count > 10) throw new Error("Limite de 10 rotações por dia atingido.");

    const profile = await prisma.integrationProfile.findUnique({ where: { id }, select: { pgUsername: true } });
    if (!profile) throw new Error("Perfil não encontrado.");
    const newPassword = generateIntegrationPassword();
    const encrypted = encrypt(newPassword);
    const last4 = getPasswordLast4(newPassword);

    // ALTER USER no Postgres
    const adminPool = getIntegrationAdminPool();
    const client = await adminPool.connect();
    try {
      await client.query(buildAlterUserPasswordSql(profile.pgUsername, newPassword));
    } finally { client.release(); }

    await prisma.integrationProfile.update({
      where: { id }, data: { encryptedPgPassword: encrypted, passwordLast4: last4 },
    });
    await prisma.integrationAuditLog.create({
      data: { profileId: id, event: "password_rotated", userId: user?.id },
    });
    await logAudit({ userId: user?.id, action: "integration_password_rotated", targetType: "integration_profile", targetId: id });

    return newPassword;  // 1× pra UI mostrar
  });
  ```

  **`disableProfileAction(id)`**, **`reactivateProfileAction(id)`**, **`deleteProfileAction(id)`** — pattern similar (chama `disableProfile`/`reactivateProfile`/`deprovisionProfile` do provisioner + status update + audit).

  **`triggerDimSyncAction()`**:
  ```ts
  export const triggerDimSyncAction = safeAction(async () => {
    await requireSuperAdmin();
    await queueRefreshDim.add("manual-trigger", { trigger: "ui" });
    return { enqueued: true };
  });
  ```

  Helper `dayKey()`:
  ```ts
  function dayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function deriveSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  }
  ```

- [ ] **Step 10.3:** Tests cobrindo todos os fluxos (~25 testes).
- [ ] **Step 10.4:** Commit.

---

## Fase C — UI base

### Task 11: Sidebar — item Integrações

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Igual à v1 + adicionar test em `__tests__/sidebar.test.tsx` se existe; senão, criar test mínimo do `filterNav` cobrindo o novo item.)

---

### Task 12: Hub `/integracoes` (P11 — detalhes visuais)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/page.tsx`
- Create: `src/components/integracoes/integrations-hub-card.tsx`
- Create: `src/lib/integrations/registry.ts`

- [ ] **Step 12.1:** `registry.ts` (igual à v1).

- [ ] **Step 12.2:** `integrations-hub-card.tsx` (Server) — visual detalhado:
  - Container: `Card` com `rounded-2xl border border-border bg-muted/30 p-6 hover:bg-muted/50 transition-all`.
  - Cabeçalho: ícone Lucide grande (`h-10 w-10 text-violet-500`) à esquerda, label + vendor empilhados.
  - Description curta abaixo.
  - Footer: badge status (`Disponível` violet 500/15 + violet 600 text · `Em breve` muted).
  - Se status=available, mostra `<Link>` envolvendo o card todo + "Configurar →" no canto inferior direito.
  - Se status=coming_soon, opacity-60, sem hover, sem cursor pointer.

- [ ] **Step 12.3:** `/integracoes/page.tsx`:
  - Guard super_admin.
  - Server Component async; fetch `getIntegrationsSummary` + `getDimSnapshotFreshness`.
  - PageShell variant="wide". PageHeader (Plug icon, "Integrações", subtitle).
  - Banner amarelo se 0 perfis E (todas dim freshness < 30 min OU all null): "⚠️ Antes de criar perfis, leia [runbook] e confirme pré-agregação ativa".
  - Grid 3-col (md) / 2-col (sm) / 1-col (mobile).

- [ ] **Step 12.4:** Tests RTL.
- [ ] **Step 12.5:** Commit.

---

### Task 13: Lista `/integracoes/power-bi` (P38 — soft cap server-side)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/power-bi/page.tsx`
- Create: `src/components/integracoes/power-bi/profile-list.tsx`
- Create: `src/components/integracoes/power-bi/profile-list-empty.tsx`
- Create: `src/components/integracoes/power-bi/profile-row-actions.tsx`

- [ ] **Step 13.1:** Page server: fetch perfis + soft cap reached + dim freshness. Pass tudo pro componente filho.
- [ ] **Step 13.2:** `ProfileList` (Server) — tabela com colunas conforme spec §7.3. Status chip via helper:
  ```tsx
  function StatusChip({ status }: { status: IntegrationProfileStatus }) {
    const map = {
      active: { color: "bg-green-500/15 text-green-600", label: "Ativo", icon: CheckCircle },
      disabled: { color: "bg-zinc-500/15 text-zinc-500", label: "Desativado", icon: PauseCircle },
      error: { color: "bg-red-500/15 text-red-600", label: "Erro", icon: AlertCircle },
    };
    const { color, label, icon: Icon } = map[status];
    return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", color)}><Icon className="h-3.5 w-3.5" />{label}</span>;
  }
  ```
- [ ] **Step 13.3:** `ProfileListEmpty`: ilustração simples (ícone Plug grande, opacity-30) + texto + CTA `<Button>+ Novo perfil</Button>` que abre wizard via Dialog.
- [ ] **Step 13.4:** `ProfileRowActions` (Client): `<DropdownMenu>` base-ui com itens.
- [ ] **Step 13.5:** Botão "+ Novo perfil" no header da tabela: disabled se `softCapReached`, com tooltip explicando.
- [ ] **Step 13.6:** Tests RTL.
- [ ] **Step 13.7:** Commit.

---

## Fase D — Wizard

### Task 14: `WizardProgressBar` + `ProfileWizardDialog` (P13 — back/dirty)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1 + acrescentar:)

- [ ] **Step 14.X:** `handleBack`: preserva form state (não reset).
- [ ] **Step 14.Y:** `onClose`: se `isDirty=true`, abre confirm "Descartar alterações?". Botão Continuar / Descartar.
- [ ] **Step 14.Z:** Tests: dirty check + descarte confirma.

---

### Task 15: Wizard step 1 — Identidade

(Conforme v1.)

---

### Task 16: Wizard step 2 — Tabelas

(Conforme v1.)

---

### Task 17: Wizard step 3 — Colunas

(Conforme v1.)

---

### Task 18: Wizard step 4 — Filtros (P14 — server action pra MultiSelect)

**Files:**
- Create: `src/components/integracoes/power-bi/wizard-step-filters.tsx`
- Create: `src/lib/actions/integrations-options.ts`

- [ ] **Step 18.A:** `integrations-options.ts`:
  ```ts
  "use server";
  export const getAvailableAccountsForFilter = safeAction(async () => {
    await requireSuperAdmin();
    const rows = await pgPool.query<{ account_id: number; name: string }>(
      "SELECT account_id, name FROM powerbi.dim_accounts_snapshot ORDER BY account_id"
    );
    return rows.rows;
  });
  export const getAvailableTeamsForFilter = safeAction(async () => {
    await requireSuperAdmin();
    const rows = await pgPool.query<{ account_id: number; team_id: number; name: string }>(
      "SELECT account_id, team_id, name FROM powerbi.dim_teams_snapshot ORDER BY account_id, team_id"
    );
    return rows.rows;
  });
  ```
  (Estes ficam em arquivo separado pra evitar mistura com `integrations-power-bi.ts` que tem mutations.)

- [ ] **Step 18.B:** Component (resto igual à v1).
- [ ] Tests + commit.

---

### Task 19: `CredentialsRevealDialog` (P15 — não persiste)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1 + nota:)

- [ ] **Step 19.X:** Quando Dialog fecha, `setPlainPassword(null)` (limpar do state — nunca persiste em localStorage).

---

## Fase E — Detail page

### Task 20: Detail page + `ProfileSummaryCard`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1; usa `getProfileByIdAction` da T10 — P16.)

---

### Task 21: `ProfileWhitelistCard` + reabrir wizard mode=edit

(Conforme v1.)

---

### Task 22: `ProfileCredentialsCard`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1.)

---

### Task 23: `ProfileAuditTimeline` (P17 — pagination)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/profile-audit-timeline.tsx`
- Create: `src/lib/actions/integrations-power-bi-audit.ts`

- [ ] **Step 23.A:** Server Action `listProfileAuditEventsAction(profileId, cursor)`:
  ```ts
  export const listProfileAuditEventsAction = safeAction(async (profileId: string, cursor: string | null) => {
    await requireSuperAdmin();
    return prisma.integrationAuditLog.findMany({
      where: { profileId },
      take: 20,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    });
  });
  ```

- [ ] **Step 23.B:** Component: render lista; botão "Ver mais" carrega próximos 20 (`useTransition` + `useState` cursor).

- [ ] Tests + commit.

---

### Task 24: `RotatePasswordDialog` (P34) + `DeleteProfileDialog` (P18)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

- [ ] **Step 24.A:** Rotate copy:
  > "Tem certeza? A senha atual será invalidada **imediatamente**. Power BI Desktop pedirá a nova senha na próxima refresh. Conexões abertas podem cair com erro."

- [ ] **Step 24.B:** Delete copy + confirm input:
  > "Esta ação remove o perfil **permanentemente** (soft-delete). O usuário Postgres + views derivadas serão dropados. Conexões Power BI ativas cairão.
  >
  > Para confirmar, digite o nome do perfil: `[___________]`"

  Botão Deletar habilitado só quando `typed === profile.name`.

- [ ] Tests + commit.

---

## Fase F — Connect page

### Task 25: `/integracoes/power-bi/[id]/conectar` + tabs (P27 — env via Server, P36 — view names)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/power-bi/[id]/conectar/page.tsx`
- Create: `src/components/integracoes/power-bi/connect-tabs.tsx`

- [ ] **Step 25.1:** Page server: read `process.env.INTEGRATION_DB_HOST_PUBLIC` etc. Compute view names:
  ```tsx
  import { buildDerivedViewName } from "@/lib/integrations/power-bi/sql-builders";

  const profile = await getProfileByIdAction(id);
  if (!profile) return <NotFound />;
  const views = (profile.allowedTables as string[]).map(t => ({
    table: t,
    viewName: buildDerivedViewName(profile.id, t),
  }));
  const connectionInfo = {
    host: process.env.INTEGRATION_DB_HOST_PUBLIC ?? "",
    port: parseInt(process.env.INTEGRATION_DB_PORT_PUBLIC ?? "5432"),
    database: process.env.INTEGRATION_DB_NAME_PUBLIC ?? "",
    user: profile.pgUsername,
    passwordLast4: profile.passwordLast4,
  };

  return <ConnectTabs profile={profile} views={views} connectionInfo={connectionInfo} />;
  ```

- [ ] **Step 25.2:** `ConnectTabs` (Client) — base-ui Tabs com 3 abas.

- [ ] Commit.

---

### Task 26: Aba Desktop (P19 — icons listados)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1 + lista exata de ícones por passo:)

| Passo | Texto | Ícone |
| --- | --- | --- |
| 1 | "Abra o Power BI Desktop." | `Download` |
| 2 | "Vá em Get Data → PostgreSQL database." | `Database` |
| 3 | "Server: cole o host:porta abaixo." | `Server` |
| 4 | "Database: cole o nome do banco abaixo." | `FileText` |
| 5 | "Authentication: Database. User + Password copiados da plataforma." | `KeyRound` |
| 6 | "Marque 'Encrypt connection' (TLS obrigatório)." | `Lock` |
| 7 | "No Navigator, selecione as views liberadas e clique Load." | `CheckCircle` |

---

### Task 27: Aba Service / Gateway

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1.)

---

### Task 28: Aba Snippet M (P20 — count)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

- [ ] **Step 28.1:** Accordion com `views.length` itens — 1 por view derivada do perfil.
- [ ] **Step 28.2:** Cada item: `<SnippetBlock>` com snippet gerado por `generateMSnippet({ host, port, database, viewName })`.
- [ ] Commit.

---

## Fase G — Operacional

### Task 29: Runbook (P22, P29)

**Files:**
- Create: `docs/runbooks/integracoes-power-bi.md`

Conteúdo:

1. **Pré-requisitos infra (checklist):**
   - DNS A record `db.insights.nexusai360.com` → IP servidor.
   - `postgresql.conf` `listen_addresses = '*'`.
   - `pg_hba.conf` `hostssl all all 0.0.0.0/0 scram-sha-256`.
   - TLS via Let's Encrypt + certbot mensal (`certbot certonly --standalone -d db.insights.nexusai360.com`).
   - `ssl_cert_file` / `ssl_key_file` apontando pros certs.
   - Postgres reload (`pg_reload_conf()`) ou restart.
   - `max_connections` ≥ atual + 250 (50 perfis × 5).
   - App user com `rolcreaterole=true`. Verificar: `SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user`. Se false: `ALTER USER <app_user> CREATEROLE`.
   - Firewall IP allowlist via Hostinger panel.
   - Variables de env definidas em produção: `INTEGRATION_DB_HOST_PUBLIC`, `INTEGRATION_DB_PORT_PUBLIC`, `INTEGRATION_DB_NAME_PUBLIC`, `INTEGRATION_PROFILE_SOFT_CAP`.

2. **Sequência exata de deploy:**
   ```
   1. PR aprovado e merged em main.
   2. CI build em curso (gh run list).
   3. Aguardar build verde + imagem em GHCR.
   4. Conectar SSH no Hostinger:
      docker exec -it <app-container> npx prisma migrate deploy
   5. Confirmar `npx prisma migrate status` mostra applied.
   6. Portainer → Stack `nexus-insights` → Update (puxa imagem nova).
   7. Worker stack idem.
   8. Smoke staging (script abaixo).
   ```

3. **Smoke staging (9 etapas)** — copiar tabela §10.2 da spec.

4. **Rollback** — copiar §11.4 da spec + script SQL completo.

5. **Troubleshooting:**
   - "TLS errors no Power BI Windows" → desabilitar Encrypt connection ou validar cert.
   - "ALTER USER permission denied" → app não tem CREATEROLE; rodar GRANT.
   - "Slug duplicado" → escolher outro nome.
   - "Snapshot vazio" → triggerar dim sync manual via UI (passo 4 wizard).
   - "Provisioning failed: timeout" → verificar locks no Postgres (`pg_locks`).

- [ ] Commit.

---

### Task 30: `.env.example` + CHANGELOG (P21) + STATUS

**Files:** (mesmos da v1)

- [ ] **Step 30.1–30.3:** Idem v1, **mas** CHANGELOG entrada usa data **a ser preenchida no momento do release** — placeholder `## v0.17.0 (2026-05-XX)` no commit do dia da implementação; atualizar **na T32** com data real.

- [ ] Commit.

---

## Fase H — Verification & deploy

(T31, T32, T33 conforme v1, com cross-references explícitas pra runbook §29.)

---

## Self-review — coverage da spec

| Spec section | Tasks |
| --- | --- |
| §1, §2 (objetivos) | T2 (schema), T3 (catalog), T7 (provisioning), T9-T10 (actions), T11-T28 (UI), T29 (runbook) |
| §3 YAGNI | (não fazer) |
| §4 Arquitetura | T2, T3, T5, T7, T8, T29 |
| §5 Schema | T2 |
| §6 Provisioning | T5–T7 |
| §6.4 Dim sync | T8 |
| §6.5 Reconcile | T8 |
| §7 Frontend | T11–T28 (cada sub-task) |
| §8 Componentes | (estrutura task-a-task) |
| §9 Segurança | T2, T3, T5, T7, T9, T10, T29 |
| §10 Tests | (em cada task) |
| §11 Release | T29–T32 |
| §12 Riscos | (mitigações inline em cada task) |
| §13 Decisões fechadas | (todas) |
| §14 Coordenação | (pré-execução + diretivas) |

---

## Próximo passo

Pente-fino #2 → v3 final → executar com `superpowers:subagent-driven-development`.
