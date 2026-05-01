# Integrações + Power BI — Implementation Plan (v0.17.0) — v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking. **UI tasks (T14–T36) require invoking `ui-ux-pro-max:ui-ux-pro-max` BEFORE writing any code.**

**Spec:** `docs/superpowers/specs/2026-05-01-integracoes-power-bi-design.md` (v3 final).
**Goal:** Novo menu "Integrações" (super_admin only) com primeira integração Power BI: ponte automatizada para clientes plugarem o banco do Nexus Chat ao Power BI deles, com multi-perfil, whitelist por tabela/coluna, RLS opcional, provisioning automático de user/views Postgres, e tutorial passo-a-passo.
**Architecture:** Schema isolada `powerbi` no banco interno (Nexus Insights, NÃO Chatwoot principal). Cada perfil = 1 user Postgres + senha encriptada (AES-256-GCM) + views derivadas (`pbi_<id>_v_<view>`) com colunas filtradas + WHERE RLS opcional. UI super_admin only, hardcoded no `nav.ts`. Wizard Dialog 4 passos. 3 caminhos de conexão (Desktop/Service/Snippet M).
**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind v4 · base-ui · NextAuth v5 · Prisma 7 · Postgres + `pg` client · Redis + BullMQ · `pg-format` (novo) · AES-256-GCM existente · Lucide React.

---

## Pré-execução — coordenação multi-agente

**ANTES DE COMEÇAR a Fase A:**
1. Confirmar v0.16.0 LIVE em produção: `gh run list --limit 5` deve mostrar último build verde com tag v0.16.0; `curl https://insights.nexusai360.com/api/health` deve responder com `version=0.16.x`.
2. `git fetch origin main && git pull --rebase origin main`.
3. Confirmar `prisma/schema.prisma` reflete v0.16.0 (sem conflito esperado — agente paralelo encerrou sessão).
4. Atualizar `docs/agents/active/claude-integracoes-powerbi.md` com `status: in_progress` (já existe, só atualizar timestamp).
5. Bumpar `package.json` `0.16.x` → `0.17.0` (commit isolado).

**Durante implementação:**
- Cada commit relevante (bump, migration, mudança em arquivo compartilhado, novo spec/plan, fix urgente) → append em `docs/agents/HISTORY.md`.
- Antes de cada push: `gh run list --limit 5` (não empilhar deploys).

---

## File structure

```
prisma/
  schema.prisma                                       (modify: add models)
  migrations/20260501<ts>_add_integrations_power_bi/
    migration.sql                                     (new)

src/lib/
  constants/nav.ts                                    (modify: add Integrações)
  integrations/
    registry.ts                                       (new)
    power-bi/
      catalog.ts                                      (new)
      sql-builders.ts                                 (new)
      provisioner.ts                                  (new)
      password-generator.ts                           (new)
      m-snippet-generator.ts                          (new)
      dim-sync.ts                                     (new)
      __tests__/                                      (new)

src/lib/actions/
  integrations.ts                                     (new — async only)
  integrations-power-bi.ts                            (new — async only)

src/worker/jobs/integrations/
  refresh-dim-snapshots.ts                            (new)
  reconcile-integrations.ts                           (new)
src/worker/index.ts                                   (modify: register jobs)

src/app/(protected)/integracoes/
  page.tsx                                            (new — hub)
  power-bi/
    page.tsx                                          (new — list)
    [id]/
      page.tsx                                        (new — detail)
      conectar/page.tsx                               (new — connect tabs)

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
package.json                                          (modify: bump + pg-format)
.env.example                                          (modify: add INTEGRATION_DB_*)
```

---

## Fase A — Fundação (libs, schema, sem UI)

### Task 1: Dependências + bump versão

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1:** Bumpar versão `"version": "0.16.x"` → `"version": "0.17.0"`.
- [ ] **Step 1.2:** `npm install pg-format @types/pg-format` (lib `pg-format` já tem types em `@types/pg-format` via DefinitelyTyped).
- [ ] **Step 1.3:** Verificar pré-requisitos UI (`src/components/ui/{tooltip,multi-select,accordion,progress}.tsx`). Se algum não existir, criar usando pattern base-ui das demais primitives existentes (`button.tsx`, `card.tsx`).
- [ ] **Step 1.4:** `npm run typecheck` deve passar.
- [ ] **Step 1.5:** Commit:
```bash
git add package.json package-lock.json src/components/ui/
git commit -m "chore(deps): bump 0.17.0 + pg-format + ui primitives p/ Integrações"
```

---

### Task 2: Prisma schema — models de integração

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_integrations_power_bi/migration.sql`

- [ ] **Step 2.1:** Adicionar à enum `AuditAction` (no schema):
```
integration_profile_created
integration_profile_updated
integration_profile_deleted
integration_password_revealed
integration_password_rotated
integration_provisioning_failed
```

- [ ] **Step 2.2:** Adicionar models:
```prisma
enum IntegrationKind {
  power_bi
}

enum IntegrationProfileStatus {
  active
  disabled
  error
}

enum IntegrationAuditEvent {
  profile_created
  profile_updated
  profile_disabled
  profile_reactivated
  profile_deleted
  password_revealed
  password_rotated
  whitelist_changed
  provisioning_failed
}

model IntegrationProfile {
  id                  String                       @id @default(uuid()) @db.Uuid
  kind                IntegrationKind
  name                String
  description         String?                      @db.Text
  status              IntegrationProfileStatus     @default(active)
  pgUsername          String                       @unique @map("pg_username")
  encryptedPgPassword String                       @map("encrypted_pg_password")
  passwordLast4       String                       @map("password_last4")
  allowedTables       Json                         @map("allowed_tables")
  allowedColumns      Json                         @map("allowed_columns")
  accountIdFilter     Json?                        @map("account_id_filter")
  teamIdFilter        Json?                        @map("team_id_filter")
  lastProvisionedAt   DateTime?                    @map("last_provisioned_at")
  lastProvisionError  String?                      @map("last_provision_error") @db.Text
  createdAt           DateTime                     @default(now()) @map("created_at")
  updatedAt           DateTime                     @updatedAt @map("updated_at")
  createdById         String?                      @db.Uuid @map("created_by_id")
  createdBy           User?                        @relation("IntegrationProfileCreator", fields: [createdById], references: [id])
  disabledAt          DateTime?                    @map("disabled_at")
  deletedAt           DateTime?                    @map("deleted_at")

  auditEvents IntegrationAuditLog[]

  @@index([kind, status])
  @@index([deletedAt])
  @@map("integration_profiles")
}

model IntegrationAuditLog {
  id        String                  @id @default(uuid()) @db.Uuid
  profileId String                  @db.Uuid @map("profile_id")
  profile   IntegrationProfile      @relation(fields: [profileId], references: [id], onDelete: NoAction)
  event     IntegrationAuditEvent
  userId    String?                 @db.Uuid @map("user_id")
  user      User?                   @relation("IntegrationAuditUser", fields: [userId], references: [id])
  details   Json?
  ipAddress String?                 @map("ip_address")
  createdAt DateTime                @default(now()) @map("created_at")

  @@index([profileId, createdAt(sort: Desc)])
  @@map("integration_audit_logs")
}
```

- [ ] **Step 2.3:** Adicionar relations no `User`:
```prisma
model User {
  // ... existente
  integrationProfilesCreated IntegrationProfile[]    @relation("IntegrationProfileCreator")
  integrationAuditEvents     IntegrationAuditLog[]   @relation("IntegrationAuditUser")
}
```

- [ ] **Step 2.4:** Gerar migration localmente:
```bash
DATABASE_URL=$LOCAL_DB_URL npx prisma migrate dev --name add_integrations_power_bi --create-only
```
Verificar SQL gerado em `prisma/migrations/<ts>_add_integrations_power_bi/migration.sql`.

- [ ] **Step 2.5:** Adicionar ao SQL gerado o **setup do schema `powerbi`** (será aplicado junto):
```sql
-- Append ao migration.sql gerado pelo Prisma
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

-- Views públicas (passthrough — colunas EXPLÍCITAS)
CREATE OR REPLACE VIEW powerbi.dim_accounts AS
  SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_inboxes AS
  SELECT account_id, inbox_id, name, channel_type FROM powerbi.dim_inboxes_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_agents AS
  SELECT account_id, agent_id, name, email FROM powerbi.dim_agents_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_teams AS
  SELECT account_id, team_id, name FROM powerbi.dim_teams_snapshot;

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

COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table). Managed by app, do not edit manually.';
```

- [ ] **Step 2.6:** Aplicar localmente:
```bash
DATABASE_URL=$LOCAL_DB_URL npx prisma migrate dev
```

- [ ] **Step 2.7:** `npm run typecheck` deve passar (Prisma client regenerado).

- [ ] **Step 2.8:** Commit:
```bash
git add prisma/schema.prisma prisma/migrations/<ts>_add_integrations_power_bi/
git commit -m "feat(db): models IntegrationProfile + IntegrationAuditLog + schema powerbi (T2)"
```

---

### Task 3: Catálogo declarativo

**Files:**
- Create: `src/lib/integrations/power-bi/catalog.ts`
- Create: `src/lib/integrations/power-bi/__tests__/catalog.test.ts`

- [ ] **Step 3.1:** Escrever teste **primeiro**:
```ts
// catalog.test.ts
import { POWER_BI_CATALOG, BLOCKED_TABLES_REGEX, validateAllowedTables } from "../catalog";

describe("POWER_BI_CATALOG", () => {
  it("essentialColumns ⊂ allColumns em cada entry", () => {
    const all = { ...POWER_BI_CATALOG.facts, ...POWER_BI_CATALOG.dims };
    for (const [name, entry] of Object.entries(all)) {
      for (const c of entry.essentialColumns) {
        expect(entry.allColumns).toContain(c);
      }
    }
  });

  it("pkColumns ⊂ allColumns em cada entry", () => {
    const all = { ...POWER_BI_CATALOG.facts, ...POWER_BI_CATALOG.dims };
    for (const [name, entry] of Object.entries(all)) {
      for (const c of entry.pkColumns) {
        expect(entry.allColumns).toContain(c);
      }
    }
  });

  it("nenhum nome do catálogo casa BLOCKED_TABLES_REGEX", () => {
    const all = { ...POWER_BI_CATALOG.facts, ...POWER_BI_CATALOG.dims };
    for (const name of Object.keys(all)) {
      expect(BLOCKED_TABLES_REGEX.test(name)).toBe(false);
    }
  });

  it("BLOCKED_TABLES_REGEX casa tabelas sensíveis", () => {
    expect(BLOCKED_TABLES_REGEX.test("users")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("audit_logs")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("llm_credentials")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("nex_settings")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("integration_profiles")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("password_reset_tokens")).toBe(true);
  });
});

describe("validateAllowedTables", () => {
  it("aceita tabelas do catálogo", () => {
    expect(() => validateAllowedTables(["chatwoot_facts_daily_by_account", "dim_accounts"])).not.toThrow();
  });
  it("rejeita tabela em BLOCKED", () => {
    expect(() => validateAllowedTables(["users"])).toThrow(/bloqueada|blocked/i);
  });
  it("rejeita tabela fora do catálogo", () => {
    expect(() => validateAllowedTables(["foobar"])).toThrow(/desconhecida|unknown/i);
  });
});
```

- [ ] **Step 3.2:** Run: `npx jest src/lib/integrations/power-bi/__tests__/catalog.test.ts -v` → FAIL (módulo não existe).

- [ ] **Step 3.3:** Implementar `catalog.ts`:
```ts
export const POWER_BI_CATALOG = {
  facts: {
    chatwoot_facts_daily_by_account: {
      label: "Diário por conta",
      description: "Volumes diários por conta (recebidas, resolvidas, abertas).",
      pkColumns: ["account_id", "bucket_date"],
      essentialColumns: ["account_id", "bucket_date", "received", "resolved", "open_at_eod"],
      allColumns: ["account_id", "bucket_date", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
      hasAccountId: true,
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_inbox: {
      label: "Diário por caixa",
      description: "Volumes diários por caixa de entrada.",
      pkColumns: ["account_id", "bucket_date", "inbox_id"],
      essentialColumns: ["account_id", "bucket_date", "inbox_id", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "inbox_id", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
      hasAccountId: true,
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_agent: {
      label: "Diário por atendente",
      description: "Volumes diários por atendente.",
      pkColumns: ["account_id", "bucket_date", "agent_id"],
      essentialColumns: ["account_id", "bucket_date", "agent_id", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "agent_id", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds", "is_active_at_eod"],
      hasAccountId: true,
      hasTeamId: false,
    },
    chatwoot_facts_daily_by_team: {
      label: "Diário por equipe",
      description: "Volumes diários por equipe.",
      pkColumns: ["account_id", "bucket_date", "team_id"],
      essentialColumns: ["account_id", "bucket_date", "team_id", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "team_id", "received", "resolved", "open_at_eod", "pending_at_eod", "messages_in", "messages_out", "unique_contacts", "frt_p50_seconds", "frt_p90_seconds", "rt_p50_seconds"],
      hasAccountId: true,
      hasTeamId: true,
    },
    chatwoot_facts_hourly_by_account: {
      label: "Por hora por conta",
      description: "Volumes por hora por conta (granularidade horária).",
      pkColumns: ["account_id", "bucket_date", "bucket_hour"],
      essentialColumns: ["account_id", "bucket_date", "bucket_hour", "received", "resolved"],
      allColumns: ["account_id", "bucket_date", "bucket_hour", "received", "resolved", "messages_in", "messages_out", "unique_contacts"],
      hasAccountId: true,
      hasTeamId: false,
    },
  },
  dims: {
    dim_accounts: {
      label: "Contas",
      description: "Lista de contas Nexus Chat (snapshot atualizado a cada 30 min).",
      pkColumns: ["account_id"],
      essentialColumns: ["account_id", "name"],
      allColumns: ["account_id", "name", "status"],
      hasAccountId: true,
      hasTeamId: false,
    },
    dim_inboxes: {
      label: "Caixas de entrada",
      description: "Lista de inboxes (Whatsapp, web, etc) por conta.",
      pkColumns: ["account_id", "inbox_id"],
      essentialColumns: ["account_id", "inbox_id", "name", "channel_type"],
      allColumns: ["account_id", "inbox_id", "name", "channel_type"],
      hasAccountId: true,
      hasTeamId: false,
    },
    dim_agents: {
      label: "Atendentes",
      description: "Lista de atendentes por conta.",
      pkColumns: ["account_id", "agent_id"],
      essentialColumns: ["account_id", "agent_id", "name"],
      allColumns: ["account_id", "agent_id", "name", "email"],
      hasAccountId: true,
      hasTeamId: false,
    },
    dim_teams: {
      label: "Equipes",
      description: "Lista de equipes por conta.",
      pkColumns: ["account_id", "team_id"],
      essentialColumns: ["account_id", "team_id", "name"],
      allColumns: ["account_id", "team_id", "name"],
      hasAccountId: true,
      hasTeamId: true,
    },
    dim_dates: {
      label: "Calendário",
      description: "Tabela calendário (2024–2030) com year, month, day, day_of_week, iso_week, month_name_pt.",
      pkColumns: ["bucket_date"],
      essentialColumns: ["bucket_date", "year", "month", "day"],
      allColumns: ["bucket_date", "year", "month", "day", "day_of_week", "iso_week", "month_name_pt"],
      hasAccountId: false,
      hasTeamId: false,
    },
  },
} as const;

export type CatalogTableEntry = {
  label: string;
  description: string;
  pkColumns: readonly string[];
  essentialColumns: readonly string[];
  allColumns: readonly string[];
  hasAccountId: boolean;
  hasTeamId: boolean;
};

export const BLOCKED_TABLES_REGEX = /^(users|accounts|audit_logs|llm_.*|nex_.*|password_reset_tokens|email_change_tokens|app_settings|integration_.*|user_account_access|user_team_access|sessions|verification_tokens)$/;

export function getCatalogEntry(name: string): CatalogTableEntry | undefined {
  return (POWER_BI_CATALOG.facts as Record<string, CatalogTableEntry>)[name]
    ?? (POWER_BI_CATALOG.dims as Record<string, CatalogTableEntry>)[name];
}

export function validateAllowedTables(tables: string[]): void {
  for (const t of tables) {
    if (BLOCKED_TABLES_REGEX.test(t)) {
      throw new Error(`Tabela bloqueada por política de segurança: "${t}".`);
    }
    if (!getCatalogEntry(t)) {
      throw new Error(`Tabela desconhecida: "${t}".`);
    }
  }
}

export function getAllCatalogTableNames(): string[] {
  return [...Object.keys(POWER_BI_CATALOG.facts), ...Object.keys(POWER_BI_CATALOG.dims)];
}
```

- [ ] **Step 3.4:** Run tests → PASS.

- [ ] **Step 3.5:** Commit:
```bash
git add src/lib/integrations/power-bi/catalog.ts src/lib/integrations/power-bi/__tests__/catalog.test.ts
git commit -m "feat(integrations): catálogo Power BI + BLOCKED_TABLES_REGEX (T3)"
```

---

### Task 4: Password generator

**Files:**
- Create: `src/lib/integrations/power-bi/password-generator.ts`
- Create: `src/lib/integrations/power-bi/__tests__/password-generator.test.ts`

- [ ] **Step 4.1:** Teste:
```ts
import { generateIntegrationPassword, INTEGRATION_PWD_CHARSET } from "../password-generator";

describe("generateIntegrationPassword", () => {
  it("retorna 32 chars", () => {
    expect(generateIntegrationPassword()).toHaveLength(32);
  });
  it("usa charset definido (sem ambíguos)", () => {
    const pwd = generateIntegrationPassword();
    for (const c of pwd) {
      expect(INTEGRATION_PWD_CHARSET).toContain(c);
    }
    // Sem 0/O/I/l/1
    expect(pwd).not.toMatch(/[0OIl1]/);
  });
  it("sem duplicatas em 1000 calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateIntegrationPassword());
    expect(set.size).toBe(1000);
  });
});
```

- [ ] **Step 4.2:** Run → FAIL.

- [ ] **Step 4.3:** Implementar:
```ts
import { randomBytes } from "crypto";

export const INTEGRATION_PWD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnopqrstuvwxyz" + "23456789" + "!@#$%";

export function generateIntegrationPassword(length = 32): string {
  const bytes = randomBytes(length * 2);
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += INTEGRATION_PWD_CHARSET[bytes[i] % INTEGRATION_PWD_CHARSET.length];
  }
  return pwd;
}

export function getPasswordLast4(pwd: string): string {
  return pwd.slice(-4);
}
```

- [ ] **Step 4.4:** Tests PASS.

- [ ] **Step 4.5:** Commit:
```bash
git add src/lib/integrations/power-bi/password-generator.ts src/lib/integrations/power-bi/__tests__/password-generator.test.ts
git commit -m "feat(integrations): password generator (charset sem ambíguos, 32 chars) (T4)"
```

---

### Task 5: SQL builders (DDL)

**Files:**
- Create: `src/lib/integrations/power-bi/sql-builders.ts`
- Create: `src/lib/integrations/power-bi/__tests__/sql-builders.test.ts`

- [ ] **Step 5.1:** Tests (golden snapshots):
```ts
import {
  buildCreateUserSql,
  buildAlterUserPasswordSql,
  buildAlterUserNoLoginSql,
  buildAlterUserLoginSql,
  buildDropUserSql,
  buildRevokeAllSql,
  buildGrantUsageSql,
  buildGrantSelectSql,
  buildDerivedViewName,
  buildCreateDerivedViewSql,
  buildDropDerivedViewSql,
  buildSelectDerivedViewsSql,
  buildKillBackendsSql,
  buildRlsPredicate,
} from "../sql-builders";

describe("sql-builders", () => {
  it("buildCreateUserSql escapa identifier + literal", () => {
    expect(buildCreateUserSql("pbi_diretoria_a3f8c2", "Senha!Forte"))
      .toBe(`CREATE USER "pbi_diretoria_a3f8c2" WITH PASSWORD 'Senha!Forte' CONNECTION LIMIT 5 LOGIN`);
  });

  it("escapa apóstrofes na senha", () => {
    expect(buildCreateUserSql("pbi_x_111111", "a'b"))
      .toContain("PASSWORD 'a''b'");
  });

  it("buildDerivedViewName usa hash curto pra id", () => {
    expect(buildDerivedViewName("00000000-0000-0000-0000-000000000abc", "chatwoot_facts_daily_by_account"))
      .toMatch(/^pbi_[a-f0-9]{8}_v_chatwoot_facts_daily_by_account$/);
  });

  it("buildCreateDerivedViewSql sem RLS", () => {
    const sql = buildCreateDerivedViewSql({
      profileId: "00000000-0000-0000-0000-000000000abc",
      table: "dim_accounts",
      columns: ["account_id", "name"],
      hasAccountId: true,
      hasTeamId: false,
      accountIdFilter: null,
      teamIdFilter: null,
    });
    expect(sql).toContain('CREATE VIEW "powerbi"."pbi_');
    expect(sql).toContain("SELECT \"account_id\", \"name\"");
    expect(sql).toContain("FROM \"powerbi\".\"dim_accounts\"");
    // Sem WHERE
    expect(sql).not.toMatch(/\bWHERE\b/);
  });

  it("buildCreateDerivedViewSql com RLS account+team", () => {
    const sql = buildCreateDerivedViewSql({
      profileId: "00000000-0000-0000-0000-000000000abc",
      table: "chatwoot_facts_daily_by_team",
      columns: ["account_id", "team_id", "received"],
      hasAccountId: true,
      hasTeamId: true,
      accountIdFilter: [1, 2],
      teamIdFilter: [10, 20],
    });
    expect(sql).toContain("WHERE \"account_id\" IN (1, 2)");
    expect(sql).toContain("AND \"team_id\" IN (10, 20)");
  });

  it("buildRlsPredicate ignora dim_dates (sem account_id)", () => {
    expect(buildRlsPredicate({ hasAccountId: false, hasTeamId: false, accountIdFilter: [1], teamIdFilter: null })).toBe("");
  });

  it("buildSelectDerivedViewsSql filtra por prefixo", () => {
    expect(buildSelectDerivedViewsSql("00000000-0000-0000-0000-000000000abc"))
      .toBe(`SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname LIKE 'pbi_%_v_%' AND viewname LIKE 'pbi_%' || $1 || '%'`);
    // (formato exato depende da implementação — ajustar conforme)
  });

  it("buildDropDerivedViewSql", () => {
    expect(buildDropDerivedViewSql("pbi_abc_v_dim_accounts"))
      .toBe(`DROP VIEW IF EXISTS "powerbi"."pbi_abc_v_dim_accounts" CASCADE`);
  });

  it("buildKillBackendsSql", () => {
    expect(buildKillBackendsSql("pbi_diretoria_a3f8c2"))
      .toContain("pg_terminate_backend");
    expect(buildKillBackendsSql("pbi_diretoria_a3f8c2"))
      .toContain("'pbi_diretoria_a3f8c2'");
  });

  it("buildGrantSelectSql escapa identifiers", () => {
    expect(buildGrantSelectSql("pbi_user", "pbi_abc_v_dim_accounts"))
      .toBe(`GRANT SELECT ON "powerbi"."pbi_abc_v_dim_accounts" TO "pbi_user"`);
  });
});
```

- [ ] **Step 5.2:** Run → FAIL.

- [ ] **Step 5.3:** Implementar (usando `pg-format`):
```ts
import format from "pg-format";
import { createHash } from "crypto";

export const POWERBI_SCHEMA = "powerbi";

export function buildDerivedViewName(profileId: string, table: string): string {
  const hash = createHash("sha1").update(profileId).digest("hex").slice(0, 8);
  return `pbi_${hash}_v_${table}`;
}

export function buildCreateUserSql(username: string, password: string): string {
  return format(
    "CREATE USER %I WITH PASSWORD %L CONNECTION LIMIT 5 LOGIN",
    username, password
  );
}

export function buildAlterUserPasswordSql(username: string, password: string): string {
  return format(
    "ALTER USER %I WITH PASSWORD %L CONNECTION LIMIT 5 LOGIN",
    username, password
  );
}

export function buildAlterUserNoLoginSql(username: string): string {
  return format("ALTER USER %I WITH NOLOGIN", username);
}

export function buildAlterUserLoginSql(username: string): string {
  return format("ALTER USER %I WITH LOGIN CONNECTION LIMIT 5", username);
}

export function buildDropUserSql(username: string): string {
  return format("DROP USER IF EXISTS %I", username);
}

export function buildRevokeAllSql(username: string): string {
  return format("REVOKE ALL ON SCHEMA %I FROM %I", POWERBI_SCHEMA, username);
}

export function buildGrantUsageSql(username: string): string {
  return format("GRANT USAGE ON SCHEMA %I TO %I", POWERBI_SCHEMA, username);
}

export function buildGrantSelectSql(username: string, viewName: string): string {
  return format("GRANT SELECT ON %I.%I TO %I", POWERBI_SCHEMA, viewName, username);
}

export function buildKillBackendsSql(username: string): string {
  // Usa literal escapado:
  return format("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = %L", username);
}

export function buildSelectDerivedViewsSql(profileId: string): string {
  const hash = createHash("sha1").update(profileId).digest("hex").slice(0, 8);
  return format(
    "SELECT viewname FROM pg_views WHERE schemaname=%L AND viewname LIKE %L",
    POWERBI_SCHEMA, `pbi_${hash}_v_%`
  );
}

export function buildDropDerivedViewSql(viewName: string): string {
  return format("DROP VIEW IF EXISTS %I.%I CASCADE", POWERBI_SCHEMA, viewName);
}

export interface RlsPredicateInput {
  hasAccountId: boolean;
  hasTeamId: boolean;
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

export function buildRlsPredicate(input: RlsPredicateInput): string {
  const clauses: string[] = [];
  if (input.hasAccountId && input.accountIdFilter && input.accountIdFilter.length > 0) {
    const list = input.accountIdFilter.map(n => Number(n)).filter(Number.isFinite).join(", ");
    clauses.push(format("%I IN (%s)", "account_id", list));
  }
  if (input.hasTeamId && input.teamIdFilter && input.teamIdFilter.length > 0) {
    const list = input.teamIdFilter.map(n => Number(n)).filter(Number.isFinite).join(", ");
    clauses.push(format("%I IN (%s)", "team_id", list));
  }
  return clauses.join(" AND ");
}

export interface CreateDerivedViewInput {
  profileId: string;
  table: string;
  columns: string[];
  hasAccountId: boolean;
  hasTeamId: boolean;
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

export function buildCreateDerivedViewSql(input: CreateDerivedViewInput): string {
  const viewName = buildDerivedViewName(input.profileId, input.table);
  const cols = input.columns.map(c => format("%I", c)).join(", ");
  const where = buildRlsPredicate({
    hasAccountId: input.hasAccountId,
    hasTeamId: input.hasTeamId,
    accountIdFilter: input.accountIdFilter,
    teamIdFilter: input.teamIdFilter,
  });
  const whereClause = where ? ` WHERE ${where}` : "";
  return format(
    "CREATE VIEW %I.%I AS SELECT %s FROM %I.%I%s",
    POWERBI_SCHEMA, viewName, cols, POWERBI_SCHEMA, input.table, whereClause
  );
}
```

- [ ] **Step 5.4:** Tests PASS. Ajustar testes ao formato exato da implementação se necessário (golden snapshots tolerantes a whitespace).

- [ ] **Step 5.5:** Commit:
```bash
git add src/lib/integrations/power-bi/sql-builders.ts src/lib/integrations/power-bi/__tests__/sql-builders.test.ts
git commit -m "feat(integrations): SQL builders (DDL com pg-format) (T5)"
```

---

### Task 6: M-snippet generator

**Files:**
- Create: `src/lib/integrations/power-bi/m-snippet-generator.ts`
- Create: `src/lib/integrations/power-bi/__tests__/m-snippet-generator.test.ts`

- [ ] **Step 6.1:** Teste:
```ts
import { generateMSnippet, generateMSnippetsForProfile } from "../m-snippet-generator";

describe("generateMSnippet", () => {
  it("inclui host:porta, banco e view name", () => {
    const s = generateMSnippet({
      host: "db.insights.nexusai360.com",
      port: 5432,
      database: "nexus_insights",
      viewName: "pbi_abc12345_v_dim_accounts",
    });
    expect(s).toContain('"db.insights.nexusai360.com:5432"');
    expect(s).toContain('"nexus_insights"');
    expect(s).toContain("powerbi.pbi_abc12345_v_dim_accounts");
    expect(s).toContain("PostgreSQL.Database");
    expect(s).not.toContain("PASSWORD"); // sem senha inline
  });
  it("escapa quotes no view name (defensivo)", () => {
    const s = generateMSnippet({
      host: "h", port: 5432, database: "d",
      viewName: 'pbi_"abc"',
    });
    expect(s).toContain('pbi_""abc""');
  });
});
```

- [ ] **Step 6.2:** Implementar:
```ts
export interface MSnippetInput {
  host: string;
  port: number;
  database: string;
  viewName: string;
}

export function generateMSnippet(input: MSnippetInput): string {
  const escapedView = input.viewName.replace(/"/g, '""');
  return `let
    Source = PostgreSQL.Database(
        "${input.host}:${input.port}",
        "${input.database}",
        [Query="SELECT * FROM powerbi.${escapedView}"]
    )
in
    Source`;
}

export function generateMSnippetsForProfile(input: {
  host: string; port: number; database: string;
  views: string[];
}): Array<{ viewName: string; snippet: string }> {
  return input.views.map(viewName => ({
    viewName,
    snippet: generateMSnippet({ ...input, viewName }),
  }));
}
```

- [ ] **Step 6.3:** Tests PASS.

- [ ] **Step 6.4:** Commit:
```bash
git add src/lib/integrations/power-bi/m-snippet-generator.ts src/lib/integrations/power-bi/__tests__/m-snippet-generator.test.ts
git commit -m "feat(integrations): m-snippet generator (T6)"
```

---

### Task 7: Provisioner (orquestra Tx 1/2/3)

**Files:**
- Create: `src/lib/integrations/power-bi/provisioner.ts`
- Create: `src/lib/integrations/power-bi/__tests__/provisioner.test.ts`

- [ ] **Step 7.1:** Tests com mocks de `pg-pool`:

```ts
import { provisionProfile, deprovisionProfile, disableProfile, reactivateProfile } from "../provisioner";

const mockClient = { query: jest.fn() };
const mockPool = { connect: jest.fn(() => mockClient), end: jest.fn() };

jest.mock("@/lib/pg-pool", () => ({ pgPool: mockPool }));

describe("provisioner", () => {
  beforeEach(() => mockClient.query.mockReset());

  it("provisionProfile: cria user + dropa views antigas + cria novas + grants", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0 })  // create user OK
      .mockResolvedValueOnce({ rowCount: 0 })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })     // SELECT viewname (vazio, primeira vez)
      .mockResolvedValueOnce({ rowCount: 0 })  // COMMIT
      .mockResolvedValueOnce({ rowCount: 0 })  // BEGIN
      .mockResolvedValueOnce({ rowCount: 0 })  // CREATE VIEW
      .mockResolvedValueOnce({ rowCount: 0 })  // GRANT USAGE
      .mockResolvedValueOnce({ rowCount: 0 })  // GRANT SELECT
      .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT

    await provisionProfile({
      id: "00000000-0000-0000-0000-000000000abc",
      pgUsername: "pbi_x_a3f8c2",
      password: "SenhaForte!",
      allowedTables: ["dim_accounts"],
      allowedColumns: { dim_accounts: ["account_id", "name"] },
      accountIdFilter: null,
      teamIdFilter: null,
    });

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /CREATE USER/.test(s))).toBe(true);
    expect(calls.some(s => /CREATE VIEW/.test(s))).toBe(true);
    expect(calls.some(s => /GRANT SELECT/.test(s))).toBe(true);
  });

  it("provisionProfile: faz ALTER USER se 42710 (duplicate)", async () => {
    const dup = new Error("duplicate role"); (dup as any).code = "42710";
    mockClient.query
      .mockRejectedValueOnce(dup)
      .mockResolvedValueOnce({ rowCount: 0 })  // ALTER USER
      .mockResolvedValueOnce({ rowCount: 0 })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 })  // COMMIT
      .mockResolvedValueOnce({ rowCount: 0 })  // BEGIN
      .mockResolvedValueOnce({ rowCount: 0 })  // CREATE VIEW
      .mockResolvedValueOnce({ rowCount: 0 })  // GRANT USAGE
      .mockResolvedValueOnce({ rowCount: 0 })  // GRANT SELECT
      .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT

    await provisionProfile({ /* mesma input */ } as any);
    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /ALTER USER/.test(s))).toBe(true);
  });

  it("deprovisionProfile: kill backends → drop views → drop user (ordem)", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 1 })  // pg_terminate_backend
      .mockResolvedValueOnce({ rows: [{ viewname: "pbi_x_v_dim_accounts" }] })  // SELECT viewname
      .mockResolvedValueOnce({ rowCount: 0 })  // DROP VIEW
      .mockResolvedValueOnce({ rowCount: 0 }); // DROP USER

    await deprovisionProfile({ id: "uuid", pgUsername: "pbi_user" });
    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls[0]).toMatch(/pg_terminate_backend/);
    expect(calls[2]).toMatch(/DROP VIEW/);
    expect(calls[3]).toMatch(/DROP USER/);
  });

  it("disableProfile: REVOKE ALL + NOLOGIN + kill backends", async () => {
    mockClient.query.mockResolvedValue({ rowCount: 0 });
    await disableProfile({ pgUsername: "pbi_user" });
    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /REVOKE ALL/.test(s))).toBe(true);
    expect(calls.some(s => /NOLOGIN/.test(s))).toBe(true);
    expect(calls.some(s => /pg_terminate_backend/.test(s))).toBe(true);
  });

  it("reactivateProfile: ALTER LOGIN + GRANT USAGE + re-GRANT views existentes", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0 })  // ALTER USER LOGIN
      .mockResolvedValueOnce({ rowCount: 0 })  // GRANT USAGE
      .mockResolvedValueOnce({ rows: [{ viewname: "pbi_x_v_dim_accounts" }] })
      .mockResolvedValueOnce({ rowCount: 0 }); // GRANT SELECT
    await reactivateProfile({ id: "uuid", pgUsername: "pbi_user" });
    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /ALTER USER.*LOGIN/.test(s))).toBe(true);
    expect(calls.some(s => /GRANT SELECT/.test(s))).toBe(true);
  });
});
```

- [ ] **Step 7.2:** Run → FAIL.

- [ ] **Step 7.3:** Implementar:
```ts
import { pgPool } from "@/lib/pg-pool";
import {
  buildCreateUserSql, buildAlterUserPasswordSql, buildAlterUserNoLoginSql, buildAlterUserLoginSql,
  buildDropUserSql, buildRevokeAllSql, buildGrantUsageSql, buildGrantSelectSql,
  buildCreateDerivedViewSql, buildDropDerivedViewSql, buildSelectDerivedViewsSql,
  buildKillBackendsSql, buildDerivedViewName, POWERBI_SCHEMA,
} from "./sql-builders";
import { getCatalogEntry } from "./catalog";

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
  const client = await pgPool.connect();
  try {
    // Set timeout pra DDL
    await client.query("SET statement_timeout = 30000");

    // Tx 1: create/alter user (sem BEGIN — DDL cluster-level)
    try {
      await client.query(buildCreateUserSql(input.pgUsername, input.password));
    } catch (err: any) {
      if (err.code === "42710") {
        await client.query(buildAlterUserPasswordSql(input.pgUsername, input.password));
      } else {
        throw err;
      }
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

    // Tx 3: criar views derivadas + grants
    await client.query("BEGIN");
    try {
      await client.query(buildGrantUsageSql(input.pgUsername));
      for (const table of input.allowedTables) {
        const entry = getCatalogEntry(table);
        if (!entry) throw new Error(`Tabela desconhecida: ${table}`);
        const cols = input.allowedColumns[table] ?? [...entry.essentialColumns];
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
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(buildRevokeAllSql(input.pgUsername));
    await client.query(buildAlterUserNoLoginSql(input.pgUsername));
    await client.query("COMMIT");
    await client.query(buildKillBackendsSql(input.pgUsername));
  } finally {
    client.release();
  }
}

export async function reactivateProfile(input: { id: string; pgUsername: string }): Promise<void> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(buildAlterUserLoginSql(input.pgUsername));
    await client.query(buildGrantUsageSql(input.pgUsername));
    const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
    for (const r of rows as Array<{ viewname: string }>) {
      await client.query(buildGrantSelectSql(input.pgUsername, r.viewname));
    }
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

export async function deprovisionProfile(input: { id: string; pgUsername: string }): Promise<void> {
  const client = await pgPool.connect();
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

- [ ] **Step 7.5:** Commit:
```bash
git add src/lib/integrations/power-bi/provisioner.ts src/lib/integrations/power-bi/__tests__/provisioner.test.ts
git commit -m "feat(integrations): provisioner (Tx 1/2/3 + idempotência + statement_timeout) (T7)"
```

---

### Task 8: Worker dim sync + reconcile

**Files:**
- Create: `src/lib/integrations/power-bi/dim-sync.ts`
- Create: `src/worker/jobs/integrations/refresh-dim-snapshots.ts`
- Create: `src/worker/jobs/integrations/reconcile-integrations.ts`
- Modify: `src/worker/index.ts`
- Create: `src/lib/integrations/power-bi/__tests__/dim-sync.test.ts`

- [ ] **Step 8.1:** Implementar `dim-sync.ts`:
```ts
import { pgPool } from "@/lib/pg-pool";
import { chatwootQuery } from "@/lib/chatwoot/pool";
import format from "pg-format";

interface SnapshotResult {
  dim: string;
  upserted: number;
  errors: string[];
}

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

// Idem refreshInboxesDim, refreshAgentsDim, refreshTeamsDim — mesma estrutura.
// Cada função retorna SnapshotResult; falhas em uma não param outras.

export async function refreshAllDimSnapshots(): Promise<SnapshotResult[]> {
  const results: SnapshotResult[] = [];
  results.push(await refreshAccountsDim());
  results.push(await refreshInboxesDim());
  results.push(await refreshAgentsDim());
  results.push(await refreshTeamsDim());
  return results;
}
```

- [ ] **Step 8.2:** Tests com mocks de `chatwootQuery` e `pgPool` cobrindo: happy path, dim vazia (0 rows), falha em chatwootQuery, falha em pgPool transação.

- [ ] **Step 8.3:** Worker handler `refresh-dim-snapshots.ts`:
```ts
import { Worker } from "bullmq";
import { redis } from "@/lib/queue";
import { refreshAllDimSnapshots } from "@/lib/integrations/power-bi/dim-sync";

export const refreshDimSnapshotsWorker = new Worker(
  "integrations.refresh-dim-snapshots",
  async () => {
    const results = await refreshAllDimSnapshots();
    return { results, completedAt: new Date().toISOString() };
  },
  { connection: redis, concurrency: 1 }
);
```

- [ ] **Step 8.4:** Worker reconcile (`reconcile-integrations.ts`) com lógica conforme spec §6.5.

- [ ] **Step 8.5:** Registrar workers em `src/worker/index.ts` + agendar cron (BullMQ JobScheduler `*/30 * * * *` para refresh + `0 */6 * * *` para reconcile).

- [ ] **Step 8.6:** Tests PASS.

- [ ] **Step 8.7:** Commit:
```bash
git add src/lib/integrations/power-bi/dim-sync.ts src/lib/integrations/power-bi/__tests__/dim-sync.test.ts src/worker/jobs/integrations/ src/worker/index.ts
git commit -m "feat(integrations): worker dim-sync (UPSERT) + reconcile (drift detection) (T8)"
```

---

## Fase B — Server Actions

### Task 9: Server Actions de Integrações (cross-integration)

**Files:**
- Create: `src/lib/actions/integrations.ts`
- Create: `src/lib/actions/__tests__/integrations.test.ts`

> **Lembrete:** arquivos `"use server"` só exportam funções `async`. Sem const/objeto/interface runtime. Tipos OK.

- [ ] **Step 9.1:** Tests da action `getIntegrationsSummary` (super_admin guard, retorna count de perfis ativos).

- [ ] **Step 9.2:** Implementar `integrations.ts`:
```ts
"use server";
import { requireSuperAdmin } from "@/lib/auth-helpers-actions";
import { safeAction } from "@/lib/actions/safe-action";
import { prisma } from "@/lib/prisma";

export const getIntegrationsSummary = safeAction(async () => {
  await requireSuperAdmin();
  const [active, disabled, errored] = await Promise.all([
    prisma.integrationProfile.count({ where: { kind: "power_bi", status: "active", deletedAt: null } }),
    prisma.integrationProfile.count({ where: { kind: "power_bi", status: "disabled", deletedAt: null } }),
    prisma.integrationProfile.count({ where: { kind: "power_bi", status: "error", deletedAt: null } }),
  ]);
  return { powerBi: { active, disabled, errored } };
});
```

(Verificar antes se `requireSuperAdmin` e `safeAction` existem no projeto e qual seu signature exato — provavelmente em `src/lib/actions/safe-action.ts` baseado no padrão observado em `nex-prompt.ts`.)

- [ ] **Step 9.3:** Commit.

---

### Task 10: Server Actions Power BI — CRUD perfil

**Files:**
- Create: `src/lib/actions/integrations-power-bi.ts`
- Create: `src/lib/actions/__tests__/integrations-power-bi.test.ts`

- [ ] **Step 10.1:** Tests cobrindo:
  - Guard `requireSuperAdmin` em todas as 8 actions (parametrized).
  - `safeAction` wrapper.
  - Audit logs corretos por action.
  - Validação reject tabela em BLOCKED (T1).
  - Edit preserva `pgUsername` (T2).
  - Rate limit `password_revealed` cap 5×/dia (mock Redis).
  - Optimistic concurrency (NF9): rejeita stale `expectedUpdatedAt`.
  - P2002 friendly error em nome duplicado.

- [ ] **Step 10.2:** Implementar 8 actions (todas async):
  - `listProfilesAction()` — lista perfis ativos+disabled (filtro deletedAt=null).
  - `createProfileAction(input)` — cria perfil + chama `provisionProfile` + retorna senha em texto claro **uma única vez** + audit `profile_created` + audit_logs global.
  - `updateProfileAction(id, input, expectedUpdatedAt)` — re-provisiona com mesma senha + audit `whitelist_changed`.
  - `revealPasswordAction(id)` — rate-limited (5/dia), decrypt senha, audit `password_revealed`, retorna texto claro.
  - `rotatePasswordAction(id)` — rate-limited (10/dia), gera nova senha, ALTER USER, encrypt, audit `password_rotated`.
  - `disableProfileAction(id)` — chama `disableProfile` provisioner, status=disabled, audit `profile_disabled`.
  - `reactivateProfileAction(id)` — chama `reactivateProfile`, status=active, audit `profile_reactivated`.
  - `deleteProfileAction(id)` — soft-delete + `deprovisionProfile`, audit `profile_deleted`.
  - `triggerDimSyncAction()` — enqueue job `integrations.refresh-dim-snapshots`.

  Cada uma com input validation (zod recomendado), `requireSuperAdmin`, `safeAction`, `logAudit` global + insert em `integration_audit_logs`.

- [ ] **Step 10.3:** Tests PASS.

- [ ] **Step 10.4:** Commit:
```bash
git add src/lib/actions/integrations-power-bi.ts src/lib/actions/__tests__/integrations-power-bi.test.ts
git commit -m "feat(integrations): 9 Server Actions Power BI (CRUD + reveal/rotate/sync) (T10)"
```

---

## Fase C — UI base (sidebar + hub + lista)

### Task 11: Sidebar — item "Integrações"

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max` ANTES DE CODAR.**

**Files:**
- Modify: `src/lib/constants/nav.ts`
- Modify: `src/components/layout/__tests__/sidebar.test.tsx` (se existe)

- [ ] **Step 11.1:** Adicionar item entre "Agente Nex" e "Usuários":
```ts
{
  label: "Integrações",
  href: "/integracoes",
  icon: Plug,
  superAdminOnly: true,
  section: "admin",
},
```

(Importar `Plug` do `lucide-react` no topo.)

- [ ] **Step 11.2:** Verificar `filterNav` continua funcionando (super_admin vê, outros não).

- [ ] **Step 11.3:** Commit:
```bash
git add src/lib/constants/nav.ts
git commit -m "feat(nav): item Integrações no sidebar (super_admin only) (T11)"
```

---

### Task 12: Hub `/integracoes`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/page.tsx`
- Create: `src/components/integracoes/integrations-hub-card.tsx`
- Create: `src/lib/integrations/registry.ts`

- [ ] **Step 12.1:** `registry.ts`:
```ts
export type IntegrationKind = "power_bi" | "looker_studio" | "tableau" | "excel" | "webhook";

export interface IntegrationDescriptor {
  kind: IntegrationKind;
  label: string;
  vendor: string;
  description: string;
  href: string | null;
  status: "available" | "coming_soon";
  icon: "BarChart3" | "TrendingUp" | "PieChart" | "Sheet" | "Webhook";
}

export const INTEGRATIONS: IntegrationDescriptor[] = [
  { kind: "power_bi", label: "Power BI", vendor: "Microsoft", description: "Conecte o Nexus Insights ao Power BI Desktop ou Service.", href: "/integracoes/power-bi", status: "available", icon: "BarChart3" },
  { kind: "looker_studio", label: "Looker Studio", vendor: "Google", description: "Conexão direta a PostgreSQL.", href: null, status: "coming_soon", icon: "TrendingUp" },
  { kind: "tableau", label: "Tableau", vendor: "Salesforce", description: "Servidor PostgreSQL.", href: null, status: "coming_soon", icon: "PieChart" },
  { kind: "excel", label: "Excel / CSV", vendor: "Microsoft", description: "Export agendado.", href: null, status: "coming_soon", icon: "Sheet" },
  { kind: "webhook", label: "Webhooks", vendor: "HTTP genérico", description: "Eventos em tempo real.", href: null, status: "coming_soon", icon: "Webhook" },
];
```

- [ ] **Step 12.2:** `integrations-hub-card.tsx` (Server, recebe descriptor + powerBiCounts, renderiza com pattern visual do `EnabledReportsCard`/`DashboardSettingsCard`).

- [ ] **Step 12.3:** `/integracoes/page.tsx`:
  - Guard super_admin (redirect /dashboard se não).
  - Server Component, async, `getIntegrationsSummary()`.
  - PageShell variant="wide" + PageHeader (icon=Plug, title="Integrações", subtitle="Conecte o Nexus Insights a ferramentas externas").
  - Grid 3-col responsive de cards.
  - Banner amarelo se 0 perfis E nenhum dim_*_snapshot row recente: "⚠️ Antes de criar perfis, leia `docs/runbooks/integracoes-power-bi.md`".

- [ ] **Step 12.4:** Test RTL hub (super_admin vê 5 cards; "Power BI" tem link; demais "em breve").

- [ ] **Step 12.5:** Commit.

---

### Task 13: Lista `/integracoes/power-bi`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/power-bi/page.tsx`
- Create: `src/components/integracoes/power-bi/profile-list.tsx`
- Create: `src/components/integracoes/power-bi/profile-list-empty.tsx`
- Create: `src/components/integracoes/power-bi/profile-row-actions.tsx`

- [ ] **Step 13.1:** Page server: lista perfis (via Server Action), guard super_admin.
- [ ] **Step 13.2:** `ProfileList` (Server) tabela rich (Nome, Status chip, # Tabelas, Filtros resumidos, Criado em, Ações).
- [ ] **Step 13.3:** `ProfileListEmpty` (Server) — empty state com CTA "+ Novo perfil" disparando Dialog.
- [ ] **Step 13.4:** `ProfileRowActions` (Client) — dropdown base-ui com: Editar / Conectar / Mostrar senha / Rotacionar senha / Desativar / Reativar / Deletar.
- [ ] **Step 13.5:** Soft cap check no botão "+ Novo perfil" (`INTEGRATION_PROFILE_SOFT_CAP=50`).
- [ ] **Step 13.6:** Tests RTL: empty state, render perfis, soft cap disabled.
- [ ] **Step 13.7:** Commit.

---

## Fase D — Wizard

### Task 14: Wizard — `WizardProgressBar` + Dialog wrapper

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/wizard-progress-bar.tsx`
- Create: `src/components/integracoes/power-bi/profile-wizard-dialog.tsx`

- [ ] **Step 14.1:** `WizardProgressBar` (Client) — 4 segmentos com labels (`Identificação · Tabelas · Colunas · Filtros`), step ativo violet 500, completos violet 500/40, futuros muted.
- [ ] **Step 14.2:** `ProfileWizardDialog` (Client) — props `mode: "create" | "edit"`, `initial?`, `onClose`, `onSuccess(profile)`. Estado: step (0–3), formData, isSubmitting, error.
- [ ] **Step 14.3:** Layout: Dialog `max-w-3xl max-h-[90vh] overflow-y-auto`. Topo: `WizardProgressBar`. Body: switch step. Footer: Voltar / Continuar (último step → "Criar perfil"/"Salvar alterações").
- [ ] **Step 14.4:** Submit: chama `createProfileAction` ou `updateProfileAction(id, ..., expectedUpdatedAt)` com optimistic concurrency.
- [ ] **Step 14.5:** Em sucesso modo create: fecha wizard, abre `CredentialsRevealDialog` com payload da action.
- [ ] **Step 14.6:** Tests: navegação entre steps, validação progressiva (não avança sem completar), erro de concurrency mostra inline.
- [ ] **Step 14.7:** Commit.

### Task 15: Wizard step 1 — Identidade

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/wizard-step-identity.tsx`

- [ ] **Step 15.1:** Form: Nome (Input, max 60, regex live validation), Descrição (Textarea, max 280), Slug derivado **readonly** (helper `deriveSlug(name)` produz lower-case + `_+` → `_` + max 30 chars).
- [ ] **Step 15.2:** Erro inline P2002 ("Nome já existe") + concurrency.
- [ ] **Step 15.3:** Tests: deriva slug correto, valida 3–60 chars, mostra erro inline.
- [ ] **Step 15.4:** Commit.

### Task 16: Wizard step 2 — Tabelas

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/wizard-step-tables.tsx`

- [ ] **Step 16.1:** Renderiza `POWER_BI_CATALOG` agrupado: Fatos diários / Fatos por hora / Dimensões.
- [ ] **Step 16.2:** Checkbox por tabela com label + tooltip (`description`).
- [ ] **Step 16.3:** Botões "Selecionar tudo" / "Selecionar fatos diários" / "Limpar".
- [ ] **Step 16.4:** Validação: ≥ 1 tabela. BLOCKED não aparece (X1 — verificar via test).
- [ ] **Step 16.5:** Tests: render grupos, seleciona tudo, BLOCKED ausente.
- [ ] **Step 16.6:** Commit.

### Task 17: Wizard step 3 — Colunas

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/wizard-step-columns.tsx`

- [ ] **Step 17.1:** Para cada tabela do step 2, accordion. Default: `essentialColumns` marcadas; PK forçada (disabled).
- [ ] **Step 17.2:** Tooltip por coluna.
- [ ] **Step 17.3:** Tests: PK não desmarca, default = essentialColumns.
- [ ] **Step 17.4:** Commit.

### Task 18: Wizard step 4 — Filtros (RLS)

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/wizard-step-filters.tsx`

- [ ] **Step 18.1:** Toggle "Filtrar por contas" → MultiSelect de `dim_accounts_snapshot`. Toggle disabled (E4) se nenhuma tabela do step 2 tem `hasAccountId`.
- [ ] **Step 18.2:** Toggle "Filtrar por times" → MultiSelect de `dim_teams_snapshot`. Disabled se nenhuma tabela do step 2 tem `hasTeamId`.
- [ ] **Step 18.3:** Empty state nos selects: "Aguarde próxima sincronização (≤30 min)" + botão "Atualizar agora" (chama `triggerDimSyncAction`).
- [ ] **Step 18.4:** Tests: toggle disabled adequado, render multi-select, empty state.
- [ ] **Step 18.5:** Commit.

### Task 19: `CredentialsRevealDialog`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/credentials-reveal-dialog.tsx`

- [ ] **Step 19.1:** Dialog mostra Host/Porta/Banco/User + senha hidden inicial. Botão "Mostrar senha completa" chama `revealPasswordAction(id)` (rate-limited) e mostra inline.
- [ ] **Step 19.2:** Botão "Copiar tudo" copia bloco com label/value.
- [ ] **Step 19.3:** Botão "Ver tutorial" → link `/integracoes/power-bi/[id]/conectar`.
- [ ] **Step 19.4:** Tests: render, click reveal, copy.
- [ ] **Step 19.5:** Commit.

---

## Fase E — Detail page

### Task 20: Detail `/integracoes/power-bi/[id]` — page + Summary card

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/power-bi/[id]/page.tsx`
- Create: `src/components/integracoes/power-bi/profile-summary-card.tsx`

- [ ] **Step 20.1:** Page server: guard, fetch profile + audit events, render 4 cards.
- [ ] **Step 20.2:** `ProfileSummaryCard`: status chip + criado por + criado em + last provisioned + erro inline + banner amarelo se status=error com botão "Repetir provisionamento" (chama `updateProfileAction` com mesmas configs).
- [ ] **Step 20.3:** Commit.

### Task 21: `ProfileWhitelistCard` + reabertura wizard mode=edit

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/profile-whitelist-card.tsx`

- [ ] **Step 21.1:** Lista tabelas + colunas + filtros (resumido). Botão "Editar whitelist" abre `ProfileWizardDialog mode="edit" initial={...}`.
- [ ] **Step 21.2:** Sucesso de edit → toast com aviso sobre conexões antigas.
- [ ] **Step 21.3:** Commit.

### Task 22: `ProfileCredentialsCard` + reveal flow

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/profile-credentials-card.tsx`

- [ ] **Step 22.1:** Mostra Host/Porta/Banco/User + `••••••••<last4>` + botões "Mostrar senha completa" / "Rotacionar senha".
- [ ] **Step 22.2:** Tests rate limit + audit.
- [ ] **Step 22.3:** Commit.

### Task 23: `ProfileAuditTimeline`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/profile-audit-timeline.tsx`

- [ ] **Step 23.1:** Timeline simples com event chip + user (avatar pequeno) + timestamp + details JSON em `<pre>` colapsado.
- [ ] **Step 23.2:** Pagination 20 events/page (loading mais com "Ver mais").
- [ ] **Step 23.3:** Commit.

### Task 24: `RotatePasswordDialog` + `DeleteProfileDialog`

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/rotate-password-dialog.tsx`
- Create: `src/components/integracoes/power-bi/delete-profile-dialog.tsx`

- [ ] **Step 24.1:** `RotatePasswordDialog`: confirma + chama action + abre `CredentialsRevealDialog` com nova senha.
- [ ] **Step 24.2:** `DeleteProfileDialog`: requer digitação do nome do perfil pra confirmar (defesa contra clique acidental).
- [ ] **Step 24.3:** Tests.
- [ ] **Step 24.4:** Commit.

---

## Fase F — Connect page

### Task 25: `/integracoes/power-bi/[id]/conectar` + ConnectTabs

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/app/(protected)/integracoes/power-bi/[id]/conectar/page.tsx`
- Create: `src/components/integracoes/power-bi/connect-tabs.tsx`

- [ ] **Step 25.1:** Page server fornece host/porta/banco (`process.env.INTEGRATION_DB_*_PUBLIC`) + nomes das views derivadas + senha last4 only.
- [ ] **Step 25.2:** `ConnectTabs` (Client) com 3 abas via base-ui Tabs.
- [ ] **Step 25.3:** Commit.

### Task 26: Aba 1 — Power BI Desktop

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/connect-desktop-tab.tsx`
- Create: `src/components/integracoes/power-bi/snippet-block.tsx`

- [ ] **Step 26.1:** `SnippetBlock` reusável: `<pre>` + label + Copy.
- [ ] **Step 26.2:** Aba Desktop: lista numerada (1–7) com Lucide icons. SnippetBlock host/porta/banco/user. Senha hidden + botão Mostrar.
- [ ] **Step 26.3:** Footer: nota Windows TLS workaround.
- [ ] **Step 26.4:** Commit.

### Task 27: Aba 2 — Power BI Service / Gateway

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/connect-service-tab.tsx`

- [ ] **Step 27.1:** Default Gateway recomendação. Box separado "Acesso direto via internet (alternativa)".
- [ ] **Step 27.2:** Commit.

### Task 28: Aba 3 — Snippet M

**INVOQUE `ui-ux-pro-max:ui-ux-pro-max`.**

**Files:**
- Create: `src/components/integracoes/power-bi/connect-snippet-tab.tsx`

- [ ] **Step 28.1:** Accordion 1 bloco/view. Snippet via `generateMSnippetsForProfile`.
- [ ] **Step 28.2:** Tests RTL: renders 1 accordion item por view.
- [ ] **Step 28.3:** Commit.

---

## Fase G — Operacional

### Task 29: Runbook

**Files:**
- Create: `docs/runbooks/integracoes-power-bi.md`

- [ ] **Step 29.1:** Documentar: (1) Pré-requisitos infraestrutura (DNS, listen_addresses, pg_hba.conf, TLS Let's Encrypt + certbot, max_connections, IP allowlist). (2) Comando manual de migration. (3) Sequência exata de deploy. (4) Smoke test pós-deploy (9 etapas). (5) Rollback. (6) Troubleshooting comum (TLS errors Windows, ALTER USER permission, duplicate slug).
- [ ] **Step 29.2:** Commit.

### Task 30: `.env.example` + CHANGELOG + STATUS

**Files:**
- Modify: `.env.example`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 30.1:** `.env.example`:
```
INTEGRATION_DB_HOST_PUBLIC=db.insights.nexusai360.com
INTEGRATION_DB_PORT_PUBLIC=5432
INTEGRATION_DB_NAME_PUBLIC=nexus_insights
INTEGRATION_PROFILE_SOFT_CAP=50
```

- [ ] **Step 30.2:** `CHANGELOG.md` entrada v0.17.0:
```
## v0.17.0 (2026-05-XX) — Menu Integrações + Power BI

- Novo menu sidebar **Integrações** (super_admin only).
- Hub `/integracoes` com 5 cards (Power BI ativo + 4 placeholders).
- Sub-página Power BI: lista de perfis, wizard 4 passos (Identidade · Tabelas · Colunas · Filtros), detail page (Resumo · Whitelist · Credenciais · Auditoria), connect tabs (Desktop · Service/Gateway · Snippet M).
- Schema isolada `powerbi` no banco interno + views derivadas por perfil + RLS opcional via WHERE.
- Worker BullMQ `integrations.refresh-dim-snapshots` (cron 30 min, UPSERT) + `integrations.reconcile` (cron 6h, drift detection).
- Encryption AES-256-GCM em senhas Postgres (reusa `ENCRYPTION_KEY`).
- Audit log per-profile + entries em `audit_logs` global.
- Soft cap 50 perfis ativos.
- Optimistic concurrency em edit.

Pré-requisitos infra (runbook): DNS, listen_addresses, pg_hba.conf, TLS Let's Encrypt, max_connections, App role com CREATEROLE.
```

- [ ] **Step 30.3:** `docs/STATUS.md`: bloco "v0.17.0 Live" + atualizar "Em produção".

- [ ] **Step 30.4:** Commit.

---

## Fase H — Verification & deploy

### Task 31: Verification skill

**INVOQUE `superpowers:verification-before-completion`.**

- [ ] **Step 31.1:** `npm run typecheck` → 0 erros.
- [ ] **Step 31.2:** `npm test` → todos PASS.
- [ ] **Step 31.3:** `npm run build` → success.
- [ ] **Step 31.4:** `git status` clean.
- [ ] **Step 31.5:** `gh run list --limit 5` → não há outro build em curso.

### Task 32: Push + deploy + smoke staging

- [ ] **Step 32.1:** Atualizar `docs/agents/HISTORY.md` com release v0.17.0.
- [ ] **Step 32.2:** `git push origin main`.
- [ ] **Step 32.3:** `gh run watch` o build até completar.
- [ ] **Step 32.4:** João aplica migration manualmente (runbook §11.2).
- [ ] **Step 32.5:** Portainer redeploy (puxa imagem nova).
- [ ] **Step 32.6:** Worker redeploy (junto).
- [ ] **Step 32.7:** Smoke staging — script §10.2 da spec (9 etapas).

### Task 33: Notificação João + cleanup

- [ ] **Step 33.1:** Avisar João: "v0.17.0 LIVE em https://insights.nexusai360.com. Roda smoke test ou me chama se algo travar."
- [ ] **Step 33.2:** Deletar `docs/agents/active/claude-integracoes-powerbi.md`.

---

## Self-review — coverage da spec

| Spec section | Tasks |
| --- | --- |
| §1 Contexto | (ambiente) |
| §2 Objetivos F1–F8 | T11 (sidebar), T12 (hub), T13 (lista), T14–T19 (wizard + reveal), T20–T24 (detail), T25–T28 (connect), T7–T10 (provisioning + actions) |
| §2 NF1–NF10 | T4 (pwd), T7 (provisioner idempotente), T2 (schema), T3 (BLOCKED), T7 (statement_timeout), T10 (rate limits + concurrency + soft cap) |
| §3 YAGNI | (não fazer) |
| §4.1 Banco interno | T8 (dim sync) |
| §4.2 Schema isolada | T2 (migration) |
| §4.3 Catálogo | T3 |
| §4.4 Multi-perfil + RLS | T5/T7 |
| §4.5 Conexão 3 caminhos | T25–T28 |
| §4.6 Rede operacional | T29 (runbook) |
| §5 Schema Prisma | T2 |
| §6 Provisioning DDL | T5–T7 |
| §6.4 Worker dim sync | T8 |
| §6.5 Reconciliação | T8 |
| §7 Frontend (rotas, hub, lista, wizard, detail, connect, sidebar, a11y) | T11–T28 |
| §8 Componentes | (estrutura task-a-task) |
| §9 Segurança 10 camadas | T2 (schema), T3 (BLOCKED), T5/T7 (GRANTs), T7 (timeout), T9-T10 (audit + rate limit + encryption) |
| §10 Testes | (em cada task) |
| §11 Plano de release & versionamento | T29-T32 |
| §12 Riscos | (mitigações inline) |
| §13 Decisões fechadas | (todas) |
| §14 Coordenação multi-agente | (pré-execução) |

---

## Próximo passo

Pente-fino #1 → v2 → pente-fino #2 → v3 → executar com `superpowers:subagent-driven-development`.
