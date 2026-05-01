# Integrações + Power BI — Implementation Plan (v0.17.0) — v3 (final)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. **UI tasks (T11–T28) require invoking `ui-ux-pro-max:ui-ux-pro-max` BEFORE writing any code — controlador E subagentes despachados, sem exceção.** TDD obrigatório quando há lógica testável (write test → run fail → implement → run pass → commit). Steps usam checkbox syntax para tracking.

> **Coordenação multi-agente:** se um arquivo no working tree já está sendo mexido em commit recente (< 30 min) por outro agente, **NÃO tocar** — pivot e retornar depois. Antes de qualquer push: `gh run list --limit 5` (não empilhar deploys).

> **Pente-fino #2 — sumário de mudanças vs v2**
> Q1 sequência migrate dev --create-only + edit + migrate deploy · Q2 confirma `pg@^8` aceita `statement_timeout` em Pool config · Q4 declara explicitamente porque CREATE USER fica criado em retry (idempotência via 42710 no ALTER) · Q5 queue + worker setup completo · Q6 worker handler code completo · Q9 fallback slug vazio · Q10 cmp `expectedUpdatedAt` por ms (não string) · Q15 pass `softCap` via prop pra UI · Q17 test BLOCKED ausente do catalog · Q18 cross-filter teams×accounts · Q21 cursor combinado (createdAt, id) · Q22 delete name case-sensitive · Q23 warning se env var publica vazia · Q24 botão Copiar credenciais · Q25 instruções Service tab sem URLs inventadas · Q26 view label do catálogo no accordion · Q27/Q28 certbot cron + ssl_cert_file/key_file + permissions · Q30 verificar migrate status em prod · Q34 tests rate limit edge · Q36 audit empty state details · Q37 redirect após delete · Q39 test optimistic concurrency stale · Q40 server action valida colunas ⊂ allColumns.

**Spec:** `docs/superpowers/specs/2026-05-01-integracoes-power-bi-design.md` (v3 final).

**Goal:** Menu "Integrações" super_admin only com primeira integração Power BI: provisioning automático de user/views/RLS no banco interno, wizard 4 passos, 3 caminhos de conexão, audit completo.

**Architecture:** Schema isolada `powerbi` + views derivadas por perfil. 1 user Postgres + senha encriptada AES-256-GCM por perfil. UI super_admin only hardcoded. Wizard como Dialog. RLS via WHERE em view derivada (não policies nativas).

**Tech Stack:** Next.js 16 · TS · Tailwind v4 · base-ui · NextAuth v5 · Prisma 7 · `pg` + `pg-format` (novo) · Redis + BullMQ · AES-256-GCM · Lucide React.

---

## Pré-execução — coordenação multi-agente

**Antes de começar Fase A:**

1. Confirmar v0.16.0 LIVE: `gh run list --limit 5` (último build verde) + `curl https://insights.nexusai360.com/api/health` → `version=0.16.x`.
2. `git fetch origin main && git pull --rebase origin main`. Resolver conflitos manualmente.
3. Re-ler `docs/agents/active/`. Confirmar `claude-nex-suite-refinement.md` deletado.
4. Atualizar timestamp em `docs/agents/active/claude-integracoes-powerbi.md`.

**Durante implementação:**
- Subagent encontrar arquivo no working tree mexido e não-staged que NÃO faz parte do plan → NÃO tocar (provavelmente outro agente).
- A cada commit relevante, append em `docs/agents/HISTORY.md`.
- Antes de cada push: `gh run list --limit 5`.

**Template de prompt pro subagent:**

```
Você é um subagent despachado para a Task <N>: <título> do plan
docs/superpowers/plans/2026-05-01-integracoes-power-bi.md (v3 final).

Spec: docs/superpowers/specs/2026-05-01-integracoes-power-bi-design.md.

REGRAS ABSOLUTAS:
- Se a task envolve UI (qualquer componente em src/components/integracoes ou
  src/app/(protected)/integracoes), invoque ui-ux-pro-max:ui-ux-pro-max
  ANTES de escrever uma linha. Sem exceção.
- TDD por task quando há lógica testável: write test → run fail → implement
  → run pass → commit.
- Arquivos `"use server"` só exportam funções `async`.
- NUNCA tocar arquivos fora do escopo desta task. Se git status mostrar
  arquivos modificados que não estão no plan, ignorar (outro agente).

Faça SOMENTE a Task <N>. Reporte ao final:
- Arquivos criados/modificados.
- Comando de teste rodado e resultado.
- Hash do commit.
- Bloqueios ou desvios.
```

---

## File structure

```
prisma/
  schema.prisma                                       (modify)
  migrations/<auto-ts>_add_integrations_power_bi/migration.sql  (new)

src/lib/
  constants/nav.ts                                    (modify)
  integrations/
    queue.ts                                          (new — Queues BullMQ)
    registry.ts                                       (new)
    power-bi/
      catalog.ts                                      (new)
      sql-builders.ts                                 (new)
      provisioner.ts                                  (new)
      admin-pool.ts                                   (new)
      password-generator.ts                           (new)
      m-snippet-generator.ts                          (new)
      dim-sync.ts                                     (new)
      reconcile.ts                                    (new)
      __tests__/                                      (new)

src/lib/actions/
  integrations.ts                                     (new — async only)
  integrations-power-bi.ts                            (new — async only)
  integrations-power-bi-audit.ts                      (new — async only)
  integrations-options.ts                             (new — async only)

src/worker/jobs/integrations/
  refresh-dim-snapshots.ts                            (new)
  reconcile-integrations.ts                           (new)
src/worker/index.ts                                   (modify)

src/app/(protected)/integracoes/
  page.tsx                                            (new — hub)
  power-bi/
    page.tsx                                          (new — list)
    [id]/
      page.tsx                                        (new — detail)
      conectar/page.tsx                               (new — connect)

src/components/integracoes/
  integrations-hub-card.tsx                           (new)
  power-bi/
    profile-list.tsx                                  (new)
    profile-list-empty.tsx                            (new)
    profile-row-actions.tsx                           (new)
    profile-wizard-dialog.tsx                         (new)
    wizard-step-identity.tsx                          (new)
    wizard-step-tables.tsx                            (new)
    wizard-step-columns.tsx                           (new)
    wizard-step-filters.tsx                           (new)
    wizard-progress-bar.tsx                           (new)
    profile-summary-card.tsx                          (new)
    profile-whitelist-card.tsx                        (new)
    profile-credentials-card.tsx                      (new)
    profile-audit-timeline.tsx                        (new)
    credentials-reveal-dialog.tsx                     (new)
    rotate-password-dialog.tsx                        (new)
    delete-profile-dialog.tsx                         (new)
    connect-tabs.tsx                                  (new)
    connect-desktop-tab.tsx                           (new)
    connect-service-tab.tsx                           (new)
    connect-snippet-tab.tsx                           (new)
    snippet-block.tsx                                 (new)
    __tests__/                                        (new)

docs/runbooks/
  integracoes-power-bi.md                             (new)

CHANGELOG.md                                          (modify)
docs/STATUS.md                                        (modify)
package.json                                          (modify)
.env.example                                          (modify)
```

---

## Fase A — Fundação (libs, schema, sem UI)

### Task 1: Bump versão + dependências + UI primitives

**Files:**
- Modify: `package.json`, `package-lock.json`
- Optional create: `src/components/ui/{tooltip,multi-select,accordion,progress}.tsx`, `src/types/pg-format.d.ts`

> **Nota Q2:** `pg@^8.20.0` (no projeto) aceita `statement_timeout` em Pool config — confirmado.

> **Nota P28:** `@types/pg-format` não existe na DefinitelyTyped. Criar declaration manual.

- [ ] **Step 1.1:** `package.json`: `"version": "0.16.x"` → `"0.17.0"` (verificar atual após rebase).
- [ ] **Step 1.2:** `npm install pg-format`.
- [ ] **Step 1.3:** Criar `src/types/pg-format.d.ts`:
  ```ts
  declare module "pg-format" {
    function format(fmt: string, ...args: any[]): string;
    export default format;
  }
  ```
- [ ] **Step 1.4:** Verificar UI primitives. Para cada inexistente, criar baseado em pattern do projeto (`button.tsx`, `card.tsx`):
  - `tooltip.tsx`: base-ui `Tooltip` wrapper (`<Tooltip.Root>` `<Tooltip.Trigger render={<>{children}</>}>` `<Tooltip.Positioner><Tooltip.Popup>{content}</Tooltip.Popup></Tooltip.Positioner>`).
  - `accordion.tsx`: base-ui `Accordion`.
  - `progress.tsx`: barra com `<div role="progressbar">` + width fill em violet 500.
  - `multi-select.tsx`: estender `searchable-select.tsx` em modo multi (chips selecionados + checkbox por item).
- [ ] **Step 1.5:** `npm run typecheck` → 0 erros.
- [ ] **Step 1.6:** Commit:
  ```bash
  git add package.json package-lock.json src/components/ui/ src/types/
  git commit -m "chore(deps): bump 0.17.0 + pg-format + ui primitives p/ Integrações (T1)"
  ```

---

### Task 2: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<auto-ts>_add_integrations_power_bi/migration.sql`

> **Sequência correta (Q1):** `migrate dev --create-only --name X` → editar SQL gerado → `migrate deploy` (NÃO `migrate dev` again, que regeneraria).

- [ ] **Step 2.1:** Adicionar enums + 2 models conforme spec §5 (mesmo conteúdo das versões anteriores).
- [ ] **Step 2.2:** Adicionar 6 valores ao enum `AuditAction`.
- [ ] **Step 2.3:** Adicionar relations no `User`.
- [ ] **Step 2.4:** Gerar migration:
  ```bash
  DATABASE_URL=$LOCAL_DB_URL npx prisma migrate dev --create-only --name add_integrations_power_bi
  ```
- [ ] **Step 2.5:** Apender SQL custom (Chunks A–E da v2 — schema, snapshots, dim views, fact views, calendar, comments). **Conteúdo completo** (não placeholder):

  ```sql
  -- Chunk A: schema + snapshots
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

  -- Chunk B: passthrough views (dims)
  CREATE OR REPLACE VIEW powerbi.dim_accounts AS
    SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;
  CREATE OR REPLACE VIEW powerbi.dim_inboxes AS
    SELECT account_id, inbox_id, name, channel_type FROM powerbi.dim_inboxes_snapshot;
  CREATE OR REPLACE VIEW powerbi.dim_agents AS
    SELECT account_id, agent_id, name, email FROM powerbi.dim_agents_snapshot;
  CREATE OR REPLACE VIEW powerbi.dim_teams AS
    SELECT account_id, team_id, name FROM powerbi.dim_teams_snapshot;

  -- Chunk C: passthrough views (facts)
  CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_account AS
    SELECT account_id, bucket_date, received, resolved, open_at_eod, pending_at_eod,
           messages_in, messages_out, unique_contacts,
           frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
    FROM public.chatwoot_facts_daily_by_account;
  CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_inbox AS
    SELECT account_id, bucket_date, inbox_id, received, resolved, open_at_eod, pending_at_eod,
           messages_in, messages_out, unique_contacts,
           frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
    FROM public.chatwoot_facts_daily_by_inbox;
  CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_agent AS
    SELECT account_id, bucket_date, agent_id, received, resolved, open_at_eod, pending_at_eod,
           messages_in, messages_out, unique_contacts,
           frt_p50_seconds, frt_p90_seconds, rt_p50_seconds, is_active_at_eod
    FROM public.chatwoot_facts_daily_by_agent;
  CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_team AS
    SELECT account_id, bucket_date, team_id, received, resolved, open_at_eod, pending_at_eod,
           messages_in, messages_out, unique_contacts,
           frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
    FROM public.chatwoot_facts_daily_by_team;
  CREATE OR REPLACE VIEW powerbi.chatwoot_facts_hourly_by_account AS
    SELECT account_id, bucket_date, bucket_hour, received, resolved,
           messages_in, messages_out, unique_contacts
    FROM public.chatwoot_facts_hourly_by_account;

  -- Chunk D: calendar
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

  -- Chunk E: comments
  COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table). Managed by app, do not edit manually.';
  COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_account IS 'v1 (2026-05-01)';
  COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_inbox IS 'v1 (2026-05-01)';
  COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_agent IS 'v1 (2026-05-01)';
  COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_team IS 'v1 (2026-05-01)';
  COMMENT ON VIEW powerbi.chatwoot_facts_hourly_by_account IS 'v1 (2026-05-01)';
  ```

- [ ] **Step 2.6:** Aplicar migration:
  ```bash
  DATABASE_URL=$LOCAL_DB_URL npx prisma migrate deploy
  ```
- [ ] **Step 2.7:** `npx prisma migrate status` → "Database schema is up to date".
- [ ] **Step 2.8:** `npm run typecheck` → 0 erros.
- [ ] **Step 2.9:** Commit:
  ```bash
  git add prisma/schema.prisma prisma/migrations/
  git commit -m "feat(db): models IntegrationProfile + IntegrationAuditLog + schema powerbi (T2)"
  ```

---

### Task 3: Catálogo (POWER_BI_CATALOG + BLOCKED_TABLES_REGEX)

(Conteúdo de tests + impl conforme v1. Sem mudanças.)

---

### Task 4: Password generator

(Conforme v1.)

---

### Task 5: SQL builders

(Conforme v1 — `pg-format` import correto: `import format from "pg-format";`.)

---

### Task 6: M-snippet generator

(Conforme v1.)

---

### Task 7: admin-pool + provisioner

**Files:**
- Create: `src/lib/integrations/power-bi/admin-pool.ts`
- Create: `src/lib/integrations/power-bi/provisioner.ts`
- Create: `src/lib/integrations/power-bi/__tests__/provisioner.test.ts`

- [ ] **Step 7.1:** `admin-pool.ts`:
  ```ts
  import { Pool } from "pg";

  const globalForAdminPool = globalThis as unknown as { integrationAdminPool: Pool | undefined };

  export function getIntegrationAdminPool(): Pool {
    if (globalForAdminPool.integrationAdminPool) return globalForAdminPool.integrationAdminPool;
    globalForAdminPool.integrationAdminPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      min: 0,
      max: 3,
      statement_timeout: 30_000,  // 30s timeout em todas queries do pool
      idleTimeoutMillis: 5_000,
      application_name: "nexus-insights-integrations-admin",
    });
    globalForAdminPool.integrationAdminPool.on("error", (err) => {
      console.error("[integrations-admin-pool] error:", err.message);
    });
    return globalForAdminPool.integrationAdminPool;
  }
  ```

- [ ] **Step 7.2:** Tests com matchers regex (Q5 — não dependem da ordem exata do mock):
  ```ts
  jest.mock("@/lib/integrations/power-bi/admin-pool", () => {
    const mockClient = { query: jest.fn() };
    const mockPool = {
      connect: jest.fn(() => mockClient),
      on: jest.fn(),
    };
    return { getIntegrationAdminPool: () => mockPool, __mockClient: mockClient };
  });

  import { provisionProfile, deprovisionProfile, disableProfile, reactivateProfile } from "../provisioner";
  import { __mockClient as mockClient } from "../admin-pool";

  describe("provisioner", () => {
    beforeEach(() => mockClient.query.mockReset());

    it("provisionProfile: ordem CREATE USER → CREATE VIEW → GRANT SELECT", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });

      await provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "Senha!Forte",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["account_id", "name"] },
        accountIdFilter: null, teamIdFilter: null,
      });

      const calls = mockClient.query.mock.calls.map(c => c[0]);
      const idxCreateUser = calls.findIndex(s => /CREATE USER/i.test(s));
      const idxCreateView = calls.findIndex(s => /CREATE VIEW/i.test(s));
      const idxGrant = calls.findIndex(s => /GRANT SELECT/i.test(s));
      expect(idxCreateUser).toBeGreaterThanOrEqual(0);
      expect(idxCreateView).toBeGreaterThan(idxCreateUser);
      expect(idxGrant).toBeGreaterThan(idxCreateView);
    });

    it("provisionProfile: ALTER USER em 42710 (duplicate)", async () => {
      const dup: any = new Error("duplicate role"); dup.code = "42710";
      let called = 0;
      mockClient.query.mockImplementation(async (sql: string) => {
        called++;
        if (called === 1 && /CREATE USER/i.test(sql)) throw dup;
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });

      await provisionProfile({...} as any);
      const calls = mockClient.query.mock.calls.map(c => c[0]);
      expect(calls.some(s => /ALTER USER/i.test(s))).toBe(true);
    });

    it("deprovisionProfile: ordem kill → drop view → drop user", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) return { rows: [{ viewname: "pbi_x_v_dim_accounts" }] };
        return { rowCount: 1 };
      });
      await deprovisionProfile({ id: "uuid", pgUsername: "pbi_user" });
      const calls = mockClient.query.mock.calls.map(c => c[0]);
      const idxKill = calls.findIndex(s => /pg_terminate_backend/i.test(s));
      const idxDropView = calls.findIndex(s => /DROP VIEW/i.test(s));
      const idxDropUser = calls.findIndex(s => /DROP USER/i.test(s));
      expect(idxKill).toBeLessThan(idxDropView);
      expect(idxDropView).toBeLessThan(idxDropUser);
    });

    it("disableProfile: REVOKE + NOLOGIN + kill", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0 });
      await disableProfile({ pgUsername: "pbi_user" });
      const calls = mockClient.query.mock.calls.map(c => c[0]);
      expect(calls.some(s => /REVOKE ALL/i.test(s))).toBe(true);
      expect(calls.some(s => /NOLOGIN/i.test(s))).toBe(true);
      expect(calls.some(s => /pg_terminate_backend/i.test(s))).toBe(true);
    });

    it("provisionProfile: rollback Tx 3 quando CREATE VIEW falha", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/CREATE VIEW/i.test(sql)) throw new Error("syntax error in view");
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });
      await expect(provisionProfile({...} as any)).rejects.toThrow();
      const calls = mockClient.query.mock.calls.map(c => c[0]);
      expect(calls.some(s => s === "ROLLBACK")).toBe(true);
    });
  });
  ```

- [ ] **Step 7.3:** Implementar `provisioner.ts`:
  ```ts
  import format from "pg-format";
  import { getIntegrationAdminPool } from "./admin-pool";
  import {
    buildCreateUserSql, buildAlterUserPasswordSql, buildAlterUserNoLoginSql,
    buildAlterUserLoginSql, buildDropUserSql, buildRevokeAllSql, buildGrantUsageSql,
    buildGrantSelectSql, buildCreateDerivedViewSql, buildDropDerivedViewSql,
    buildSelectDerivedViewsSql, buildKillBackendsSql, buildDerivedViewName,
  } from "./sql-builders";
  import { getCatalogEntry, validateAllowedTables } from "./catalog";

  export interface ProvisionInput {
    id: string;
    pgUsername: string;
    password: string;
    allowedTables: string[];
    allowedColumns: Record<string, string[]>;
    accountIdFilter: number[] | null;
    teamIdFilter: number[] | null;
  }

  export async function provisionProfile(input: ProvisionInput): Promise<void> {
    validateAllowedTables(input.allowedTables);  // defesa em profundidade

    const pool = getIntegrationAdminPool();
    const client = await pool.connect();
    try {
      // Tx 1: CREATE/ALTER USER (sem BEGIN — DDL cluster-level)
      try {
        await client.query(buildCreateUserSql(input.pgUsername, input.password));
      } catch (err: any) {
        if (err.code === "42710") {
          await client.query(buildAlterUserPasswordSql(input.pgUsername, input.password));
        } else throw err;
      }

      // Tx 2: drop views antigas
      await client.query("BEGIN");
      try {
        const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
        for (const r of rows as Array<{ viewname: string }>) {
          await client.query(buildDropDerivedViewSql(r.viewname));
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }

      // Tx 3: cria views derivadas + grants
      await client.query("BEGIN");
      try {
        await client.query(buildGrantUsageSql(input.pgUsername));
        for (const table of input.allowedTables) {
          const entry = getCatalogEntry(table);
          if (!entry) throw new Error(`Tabela desconhecida: ${table}`);
          const cols = input.allowedColumns[table] ?? [...entry.essentialColumns];
          // Validar colunas pertencem ao catálogo (Q40)
          for (const c of cols) {
            if (!entry.allColumns.includes(c)) {
              throw new Error(`Coluna inválida "${c}" para tabela "${table}".`);
            }
          }
          // Forçar PK
          for (const pk of entry.pkColumns) {
            if (!cols.includes(pk)) cols.push(pk);
          }
          const sql = buildCreateDerivedViewSql({
            profileId: input.id,
            table,
            columns: cols,
            hasAccountId: entry.hasAccountId,
            hasTeamId: entry.hasTeamId,
            accountIdFilter: input.accountIdFilter,
            teamIdFilter: input.teamIdFilter,
          });
          await client.query(sql);
          const viewName = buildDerivedViewName(input.id, table);
          await client.query(buildGrantSelectSql(input.pgUsername, viewName));
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    } finally {
      client.release();
    }
  }

  export async function disableProfile(input: { pgUsername: string }): Promise<void> {
    const pool = getIntegrationAdminPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(buildRevokeAllSql(input.pgUsername));
      await client.query(buildAlterUserNoLoginSql(input.pgUsername));
      await client.query("COMMIT");
      await client.query(buildKillBackendsSql(input.pgUsername));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  export async function reactivateProfile(input: { id: string; pgUsername: string }): Promise<void> {
    const pool = getIntegrationAdminPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(buildAlterUserLoginSql(input.pgUsername));
      await client.query(buildGrantUsageSql(input.pgUsername));
      const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
      for (const r of rows as Array<{ viewname: string }>) {
        await client.query(buildGrantSelectSql(input.pgUsername, r.viewname));
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  export async function deprovisionProfile(input: { id: string; pgUsername: string }): Promise<void> {
    const pool = getIntegrationAdminPool();
    const client = await pool.connect();
    try {
      await client.query(buildKillBackendsSql(input.pgUsername));
      const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
      for (const r of rows as Array<{ viewname: string }>) {
        await client.query(buildDropDerivedViewSql(r.viewname));
      }
      await client.query(buildDropUserSql(input.pgUsername));
    } finally {
      client.release();
    }
  }
  ```

- [ ] **Step 7.4:** Tests PASS.
- [ ] **Step 7.5:** Commit.

---

### Task 8: Worker dim sync + reconcile + queues (Q5, Q6)

**Files:**
- Create: `src/lib/integrations/queue.ts`
- Create: `src/lib/integrations/power-bi/dim-sync.ts`
- Create: `src/lib/integrations/power-bi/reconcile.ts`
- Create: `src/worker/jobs/integrations/refresh-dim-snapshots.ts`
- Create: `src/worker/jobs/integrations/reconcile-integrations.ts`
- Modify: `src/worker/index.ts`
- Tests: `__tests__/dim-sync.test.ts`, `__tests__/reconcile.test.ts`

- [ ] **Step 8.1:** `src/lib/integrations/queue.ts` (Q5):
  ```ts
  import { Queue } from "bullmq";
  import { getRedis } from "@/lib/queue";  // helper existente do projeto

  const connection = getRedis();

  export const queueRefreshDim = new Queue("integrations.refresh-dim-snapshots", { connection });
  export const queueReconcile = new Queue("integrations.reconcile", { connection });
  ```
  (Verificar nome real do helper Redis em `src/lib/queue.ts`.)

- [ ] **Step 8.2:** `dim-sync.ts` — 4 funções explícitas (uma por dim) — código completo conforme v2 §8.1.

  Para `refreshAgentsDim`, query no Chatwoot precisa entender o schema. Padrão Chatwoot: tabela `users` + `account_users` (join). SQL aproximado:
  ```sql
  SELECT au.account_id, u.id AS agent_id, u.name, u.email
  FROM users u
  JOIN account_users au ON au.user_id = u.id
  WHERE au.role IN (0, 1)  -- agents/admins
  ```
  > **Nota:** verificar nomes/roles exatos do Chatwoot 4.x antes de codar (ver `src/lib/chatwoot/queries/` para padrões).

- [ ] **Step 8.3:** `reconcile.ts` — código completo conforme v2 §8.2.

- [ ] **Step 8.4:** Worker handlers (Q6):
  ```ts
  // src/worker/jobs/integrations/refresh-dim-snapshots.ts
  import { Worker } from "bullmq";
  import { getRedis } from "@/lib/queue";
  import { refreshAllDimSnapshots } from "@/lib/integrations/power-bi/dim-sync";

  export const refreshDimSnapshotsWorker = new Worker(
    "integrations.refresh-dim-snapshots",
    async (job) => {
      const results = await refreshAllDimSnapshots();
      return { results, completedAt: new Date().toISOString() };
    },
    { connection: getRedis(), concurrency: 1 }
  );

  // src/worker/jobs/integrations/reconcile-integrations.ts
  import { Worker } from "bullmq";
  import { getRedis } from "@/lib/queue";
  import { reconcileIntegrations } from "@/lib/integrations/power-bi/reconcile";

  export const reconcileIntegrationsWorker = new Worker(
    "integrations.reconcile",
    async () => reconcileIntegrations(),
    { connection: getRedis(), concurrency: 1 }
  );
  ```

- [ ] **Step 8.5:** Registrar em `src/worker/index.ts` (seguir padrão de outros workers/schedulers existentes):
  ```ts
  import "./jobs/integrations/refresh-dim-snapshots";
  import "./jobs/integrations/reconcile-integrations";
  import { queueRefreshDim, queueReconcile } from "@/lib/integrations/queue";

  await queueRefreshDim.upsertJobScheduler(
    "integrations-refresh-dim-cron",
    { pattern: "*/30 * * * *" },
    { name: "refresh-dim-snapshots", data: {} }
  );
  await queueReconcile.upsertJobScheduler(
    "integrations-reconcile-cron",
    { pattern: "0 */6 * * *" },
    { name: "reconcile-integrations", data: {} }
  );
  ```

- [ ] **Step 8.6:** Tests cobrindo dim sync (4 dims, empty, error isolation, transaction rollback) + reconcile (drift detection, status update, audit).

- [ ] **Step 8.7:** Commit.

---

## Fase B — Server Actions

### Task 9: `integrations.ts` — summary + freshness

**Files:**
- Create: `src/lib/actions/integrations.ts`
- Create: `src/lib/actions/__tests__/integrations.test.ts`

> **Pré-check:** verificar caminho real de `requireSuperAdmin` e `safeAction`. Provavelmente em `src/lib/actions/safe-action.ts` ou `src/lib/auth-helpers.ts` (replicar pattern visto em `nex-prompt.ts`).

(Conteúdo conforme v2 §9.)

- [ ] Tests + commit.

---

### Task 10: `integrations-power-bi.ts` — 10 actions (Q9, Q10, Q34, Q40)

**Files:**
- Create: `src/lib/actions/integrations-power-bi.ts`
- Create: `src/lib/actions/__tests__/integrations-power-bi.test.ts`

- [ ] **Step 10.1:** Validações helpers no topo:
  ```ts
  function dayKey(): string { return new Date().toISOString().slice(0, 10); }

  function deriveSlug(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
    if (slug.length === 0) throw new Error("Nome do perfil precisa conter ao menos uma letra ou número.");  // Q9
    return slug;
  }

  const profileInputSchema = z.object({
    name: z.string().min(3).max(60).regex(/^[A-Za-z0-9 _\-]+$/, "Caracteres inválidos no nome"),
    description: z.string().max(280).optional(),
    allowedTables: z.array(z.string()).min(1),
    allowedColumns: z.record(z.string(), z.array(z.string()).min(1)),
    accountIdFilter: z.array(z.number().int().positive()).nullable(),
    teamIdFilter: z.array(z.number().int().positive()).nullable(),
  }).refine((data) => {
    // Cada coluna em allowedColumns deve estar em allColumns do catálogo (Q40)
    for (const [table, cols] of Object.entries(data.allowedColumns)) {
      const entry = getCatalogEntry(table);
      if (!entry) return false;
      for (const c of cols) {
        if (!entry.allColumns.includes(c)) return false;
      }
    }
    return true;
  }, { message: "Coluna inválida em allowedColumns." });
  ```

- [ ] **Step 10.2:** Implementar 10 actions com pseudo-código completo da v2 §10.2 + correções:

  **`updateProfileAction(id, input, expectedUpdatedAt)`** — Q10 cmp por ms:
  ```ts
  export const updateProfileAction = safeAction(async (id: string, raw: unknown, expectedUpdatedAt: string) => {
    await requireSuperAdmin();
    const user = await getCurrentUser();
    const input = profileInputSchema.parse(raw);

    const current = await prisma.integrationProfile.findUnique({
      where: { id },
      select: { updatedAt: true, pgUsername: true, encryptedPgPassword: true, deletedAt: true },
    });
    if (!current || current.deletedAt) throw new Error("Perfil não encontrado.");
    // Cmp por ms (Q10) — string ISO pode divergir em precisão
    if (current.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
      throw new Error("Perfil modificado por outro super_admin. Recarregue a página.");
    }
    // ... resto igual à v2
  });
  ```

  **Tests rate limit (Q34):**
  ```ts
  it("revealPasswordAction: 5° call passa, 6° throws", async () => {
    // Mock redis incr retornando 1, 2, 3, 4, 5, 6 sequencialmente
    let counter = 0;
    redis.incr = jest.fn(() => Promise.resolve(++counter));
    redis.expire = jest.fn();
    // ...
    for (let i = 1; i <= 5; i++) {
      await expect(revealPasswordAction("uuid")).resolves.toBeTruthy();
    }
    await expect(revealPasswordAction("uuid")).rejects.toThrow(/limite/i);
  });

  it("revealPasswordAction: counter reseta no dia seguinte", async () => {
    // Verifica que key inclui dayKey() — testar com Date mock
    // Implementação detalhada depende do helper Redis disponível
  });
  ```

  (Resto das actions conforme v2 §10.2; copiar inline.)

- [ ] **Step 10.3:** Tests (~30 testes).
- [ ] **Step 10.4:** Commit.

---

## Fase C — UI base

### Task 11: Sidebar — item Integrações

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1.)

---

### Task 12: Hub `/integracoes`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 §12 com detalhes visuais.)

---

### Task 13: Lista `/integracoes/power-bi` (Q15 — soft cap via prop)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 + Q15:)

- [ ] **Step 13.X:** Page server lê `process.env.INTEGRATION_PROFILE_SOFT_CAP ?? "50"` e calcula `softCapReached = activeCount >= softCap`. Passa `softCap` e `softCapReached` como props.
- [ ] Tooltip do botão "+ Novo perfil": `Limite de ${softCap} perfis ativos atingido.`

---

## Fase D — Wizard

### Task 14: WizardProgressBar + ProfileWizardDialog (P13)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 — back/dirty check.)

---

### Task 15: Wizard step 1 — Identidade

(Conforme v1.)

---

### Task 16: Wizard step 2 — Tabelas (Q17 — test BLOCKED)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1 + test:)

- [ ] **Step 16.X:** Test: `expect(getAllCatalogTableNames()).not.toContain("users")` (defesa contra catálogo casualmente adicionar BLOCKED).

---

### Task 17: Wizard step 3 — Colunas

(Conforme v1.)

---

### Task 18: Wizard step 4 — Filtros (Q18 cross-filter)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 + Q18:)

- [ ] **Step 18.X:** Quando `accountIdFilter` está ativo, MultiSelect de teams **filtra** opções pelo `account_id`:
  ```tsx
  const teamsFiltered = useMemo(() => {
    if (!accountIdFilter) return availableTeams;
    return availableTeams.filter(t => accountIdFilter.includes(t.account_id));
  }, [accountIdFilter, availableTeams]);
  ```

---

### Task 19: CredentialsRevealDialog (P15 — não persiste, Q24 — copy credenciais)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 + Q24:)

- [ ] **Step 19.X:** Botão "Copiar credenciais" copia bloco multi-linha:
  ```
  Host: db.insights.nexusai360.com
  Port: 5432
  Database: nexus_insights
  User: pbi_diretoria_a3f8c2
  Password: <senha em claro se revelada>
  ```

---

## Fase E — Detail

### Task 20: Detail page + ProfileSummaryCard

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2.)

---

### Task 21: ProfileWhitelistCard

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1.)

---

### Task 22: ProfileCredentialsCard (Q20 — erro rate-limit)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v1 + Q20:)

- [ ] **Step 22.X:** `revealPasswordAction` pode rejeitar com `Limite de 5...`. Catch erro, toast vermelho com mensagem.

---

### Task 23: ProfileAuditTimeline (Q21 — cursor combinado, Q36 — empty details)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/lib/actions/integrations-power-bi-audit.ts`
- Create: `src/components/integracoes/power-bi/profile-audit-timeline.tsx`

- [ ] **Step 23.1 (Q21):** Server Action com cursor (createdAt, id):
  ```ts
  export const listProfileAuditEventsAction = safeAction(async (
    profileId: string,
    cursor: { createdAt: string; id: string } | null
  ) => {
    await requireSuperAdmin();
    return prisma.integrationAuditLog.findMany({
      where: { profileId },
      take: 20,
      ...(cursor ? {
        skip: 1,
        cursor: { id: cursor.id }  // id é único
      } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { user: { select: { id: true, name: true } } },
    });
  });
  ```

- [ ] **Step 23.2 (Q36):** Component renderiza `<pre>` colapsado se details existe; senão "Sem detalhes".

- [ ] Tests + commit.

---

### Task 24: Rotate + Delete dialogs (Q22)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 + Q22:)

- [ ] **Step 24.X:** Delete dialog: `if (typed.trim() === profile.name)` (não trim middle, exact match com case sensitivity preservada).

---

## Fase F — Connect

### Task 25: Connect page + ConnectTabs (Q23 — warning env vazia)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 + Q23:)

- [ ] **Step 25.X:** Page server: se `process.env.INTEGRATION_DB_HOST_PUBLIC` é vazia ou indefinida, render banner amarelo: "⚠️ `INTEGRATION_DB_HOST_PUBLIC` não está configurado. Os snippets abaixo terão host vazio. Configure as variáveis em produção (ver runbook)."

---

### Task 26: Aba Desktop

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

(Conforme v2 — tabela exata de ícones.)

---

### Task 27: Aba Service / Gateway (Q25)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

- [ ] **Step 27.1:** Recomendação Gateway:
  > **Power BI Service / Gateway (Recomendado)**
  >
  > Para publicar relatórios na nuvem do Power BI compartilhando com vários usuários, use o **On-premises Data Gateway** (gratuito da Microsoft).
  >
  > 1. Pesquisar "On-premises data gateway" no site oficial da Microsoft e baixar.
  > 2. Instalar em uma VM/PC interno do cliente que tem acesso ao banco.
  > 3. Configurar o gateway com a conta Power BI do cliente.
  > 4. No Power BI Service, adicionar fonte de dados PostgreSQL apontando para `<host privado>:5432` (acesso de rede interna do gateway).
  > 5. Publicar relatório do Power BI Desktop → vincular ao gateway.

- [ ] **Step 27.2:** Box separado "Acesso direto via internet (alternativa)":
  > ⚠️ **Acesso direto** requer abrir a porta 5432 do banco para a internet — menos seguro. Se for necessário:
  > - Configurar IP allowlist (ver runbook).
  > - Garantir TLS válido (cert Let's Encrypt).
  > - **Avisar:** o `.pbix` salvo localmente armazena a credencial. Compartilhar o arquivo é compartilhar acesso ao banco. Use Gateway sempre que possível.

- [ ] Commit.

---

### Task 28: Aba Snippet M (Q26 — view label)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

- [ ] **Step 28.1:** Accordion item label: `${entry.label} (${viewName})` onde `entry = getCatalogEntry(table)` e `viewName = buildDerivedViewName(profileId, table)`.
- [ ] **Step 28.2:** SnippetBlock body: `generateMSnippet({ host, port, database, viewName })`.
- [ ] Tests RTL: render N items para N tabelas, snippet contém viewName.
- [ ] Commit.

---

## Fase G — Operacional

### Task 29: Runbook (Q27, Q28)

**Files:**
- Create: `docs/runbooks/integracoes-power-bi.md`

(Conforme v2 + Q27/Q28:)

- [ ] **Step 29.X (Q27 cron certbot):**
  ```
  0 3 1 * * /usr/bin/certbot renew --quiet --post-hook "systemctl reload postgresql"
  ```
- [ ] **Step 29.Y (Q28 ssl_cert_file):**
  ```
  # postgresql.conf
  ssl = on
  ssl_cert_file = '/etc/letsencrypt/live/db.insights.nexusai360.com/fullchain.pem'
  ssl_key_file = '/etc/letsencrypt/live/db.insights.nexusai360.com/privkey.pem'
  ```
  ```bash
  # Permissões
  chown postgres:postgres /etc/letsencrypt/live/db.insights.nexusai360.com/*.pem
  chmod 600 /etc/letsencrypt/live/db.insights.nexusai360.com/privkey.pem
  ```

- [ ] Commit.

---

### Task 30: `.env.example` + CHANGELOG (P21) + STATUS

(Conforme v1; CHANGELOG entrada com placeholder data — atualizar real na T32.)

---

## Fase H — Verification & deploy

### Task 31: Verification

**INVOQUE `superpowers:verification-before-completion`.**

(Conforme v1.)

---

### Task 32: Push + deploy + smoke staging (Q30)

- [ ] **Step 32.1:** Atualizar CHANGELOG com data real do release.
- [ ] **Step 32.2:** Append em `docs/agents/HISTORY.md`.
- [ ] **Step 32.3:** `git push origin main`.
- [ ] **Step 32.4:** `gh run watch <id>` até completar.
- [ ] **Step 32.5:** Aplicar migration em prod:
  ```bash
  docker exec -it nexus-insights_app.1.<task-id> npx prisma migrate deploy
  ```
- [ ] **Step 32.6 (Q30):** Confirmar em prod:
  ```bash
  docker exec -it nexus-insights_app.1.<task-id> npx prisma migrate status
  ```
  Esperado: "Database schema is up to date".
- [ ] **Step 32.7:** Portainer redeploy app + worker.
- [ ] **Step 32.8:** `curl https://insights.nexusai360.com/api/health` → version=0.17.0, status=ok.
- [ ] **Step 32.9:** Smoke staging — script §10.2 da spec (9 etapas).

---

### Task 33: Notificação João + cleanup (Q37)

- [ ] **Step 33.1:** Avisar:
  > "v0.17.0 LIVE em https://insights.nexusai360.com.
  > Acesse `Integrações` na sidebar (super_admin) → Power BI → `+ Novo perfil`.
  > Smoke test:
  > 1. Crie um perfil 'teste-001' liberando `chatwoot_facts_daily_by_account` (todas as colunas).
  > 2. Conecte do Power BI Desktop usando os dados que aparecem após criação.
  > 3. Confirme que carrega dados.
  > 4. Tente acessar 'users' — deve falhar.
  >
  > Pré-requisitos infra (caso ainda não estejam): runbook em `docs/runbooks/integracoes-power-bi.md`."
- [ ] **Step 33.2:** Deletar `docs/agents/active/claude-integracoes-powerbi.md`.

---

## Self-review — coverage da spec

| Spec section | Tasks |
| --- | --- |
| §1 contexto, §2 F1–F8 + NF1–NF10 | T1–T28 (cobre tudo) |
| §3 YAGNI | (não fazer) |
| §4 arquitetura | T2 (schema), T3 (catalog), T5 (sql), T7 (provisioning), T29 (rede) |
| §5 schema Prisma | T2 |
| §6 provisioning DDL | T5–T7 |
| §6.4 dim sync | T8 |
| §6.5 reconcile | T8 |
| §7 frontend | T11–T28 |
| §8 boundaries | (estrutura task-a-task) |
| §9 segurança 10 camadas | T2, T3, T5, T7, T9, T10, T29 |
| §10 testes | (em cada task) |
| §11 release | T29–T32 |
| §12 riscos | (mitigações inline) |
| §13 decisões fechadas | (todas) |
| §14 coordenação | (pré-execução) |

Cobertura completa.

---

## Próximo passo

Plan v3 final aprovado pelo João (autonomia autorizada). Aguardar v0.16.0 LIVE → executar com `superpowers:subagent-driven-development` task-a-task → cada task UI invocando `ui-ux-pro-max:ui-ux-pro-max` antes de codar → verification → push → smoke → notificar João.
