# Agente Nex v0.12.0 — credenciais + custo BRL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renomear "Agente IA" → "Agente Nex"; separar credenciais (API keys) da config ativa com CRUD por provedor; adicionar custo BRL com cotação USD→BRL cartão capturada por chamada e exibir com mínimo 4 casas decimais.

**Architecture:** Nova tabela `llm_credentials` (label + encrypted_api_key + last4) cifrada com AES-256; `llm_configs` ganha FK `credential_id` mantendo `encrypted_api_key` por compat de rollback; `llm_usage` ganha `cost_brl` e `usd_to_brl_rate` populados via `getUsdBrlRate()` (cache 4h em `app_settings`, AwesomeAPI + spread cartão configurável); migração one-shot dentro de `ensureLlmTables()`.

**Tech Stack:** PostgreSQL (raw SQL via `pgPool`), Prisma 7 (apenas tipos), Next.js 16 App Router + Server Actions, base-ui dialogs, Sonner toasts, Jest + jest-mock-extended, AES-256 (`@/lib/encryption`), AwesomeAPI USD-BRL.

**Spec referência:** `docs/superpowers/specs/2026-04-30-credenciais-llm-design.md`

---

## File Structure

**Criar (NOVO):**
- `src/lib/llm/credentials.ts` — CRUD server-side de credenciais.
- `src/lib/llm/exchange-rate.ts` — cotação USD→BRL com cache 4h.
- `src/lib/actions/llm-credentials.ts` — Server Actions (list/create/update/delete/test).
- `src/lib/actions/exchange-rate.ts` — Server Actions (get rate / set spread).
- `src/components/settings/llm-credentials-card.tsx` — UI de gerenciamento.
- `src/lib/llm/__tests__/credentials.test.ts`
- `src/lib/llm/__tests__/exchange-rate.test.ts`
- `src/lib/llm/__tests__/get-active-config.test.ts`
- `src/lib/llm/__tests__/ensure-tables.test.ts`
- `src/lib/llm/agent/__tests__/usage-logger.test.ts`
- `src/lib/actions/__tests__/llm-credentials.test.ts`
- `src/lib/actions/__tests__/exchange-rate.test.ts`
- `src/components/settings/__tests__/llm-credentials-card.test.tsx`
- `docs/runbooks/credenciais-llm.md`

**Modificar:**
- `prisma/schema.prisma` — `LlmCredential` + ajustes em `LlmConfig`/`LlmUsage`.
- `src/lib/llm/ensure-tables.ts` — CREATE TABLE + ALTERs + migração one-shot.
- `src/lib/llm/get-active-config.ts` — JOIN com credentials + fallback.
- `src/lib/llm/queries/usage-stats.ts` — agregados em BRL.
- `src/lib/llm/agent/usage-logger.ts` — captura cost_brl + rate.
- `src/lib/llm/agent/run-nex.ts` — mensagem de erro renomeada.
- `src/lib/actions/llm-config.ts` — `saveLlmConfig` aceita `credentialId`.
- `src/components/settings/llm-config-card.tsx` — sem campo API key + select de credencial + spread.
- `src/components/settings/__tests__/llm-config-card.test.tsx` — atualizar.
- `src/components/llm/consumo-content.tsx` — BRL primário + colunas + 4 casas mínimas.
- `src/app/(protected)/configuracoes/page.tsx` — montar card de credenciais.
- `src/app/(protected)/configuracoes/consumo/page.tsx` — título.
- `package.json` — bump `0.12.0`.
- `CHANGELOG.md` — entrada da release.

---

## Convenções deste plano

- **Cada task é fechada em commit próprio.** Mensagens em `feat(...)`, `fix(...)`,
  `refactor(...)`, `docs(...)`, `chore(release): ...`.
- **TDD obrigatório** para libs e actions: red → green → commit. UI não exige
  red estrito — escrever test junto da implementação é aceitável onde for o
  pattern do projeto (`llm-config-card.test.tsx` segue isso hoje).
- **Antes de cada commit:** rodar `npm run typecheck` e os tests da área tocada.
  Antes do PUSH final: rodar `npm test` completo.
- **Ferramenta:** `pgPool.query` para raw SQL; `prisma` apenas para tipos.
- **Imports:** sempre `@/...` (root alias).
- **Encryption:** `import { encrypt, decrypt, mask } from "@/lib/encryption"`.

---

## Task 1: Schema + ensureLlmTables (criar tabela + colunas + migração)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/llm/ensure-tables.ts`
- Create: `src/lib/llm/__tests__/ensure-tables.test.ts`

- [ ] **Step 1: Atualizar `prisma/schema.prisma`**

Após o bloco `model LlmConfig` adicionar:

```prisma
model LlmCredential {
  id              String   @id @default(uuid()) @db.Uuid
  provider        String
  label           String
  encryptedApiKey String   @map("encrypted_api_key")
  last4           String
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  createdById     String?  @db.Uuid @map("created_by_id")

  @@unique([provider, label], name: "llm_credentials_provider_label_idx")
  @@index([provider, updatedAt(sort: Desc)], name: "llm_credentials_provider_updated_idx")
  @@map("llm_credentials")
}
```

Em `model LlmConfig`, adicionar após `createdById`:

```prisma
  credentialId    String?  @db.Uuid @map("credential_id")
```

Em `model LlmUsage`, após `errorMessage`:

```prisma
  costBrl         Decimal? @map("cost_brl") @db.Decimal(12, 6)
  usdToBrlRate    Decimal? @map("usd_to_brl_rate") @db.Decimal(10, 4)
```

- [ ] **Step 2: Regenerar Prisma client**

```bash
npx prisma generate
```

Expected: client gerado em `src/generated/prisma/` sem erro.

- [ ] **Step 3: Escrever testes de `ensureLlmTables`**

Criar `src/lib/llm/__tests__/ensure-tables.test.ts`:

```ts
import { Pool } from "pg";

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  ensureLlmTables,
  __resetEnsureLlmTablesCache,
} from "../ensure-tables";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  __resetEnsureLlmTablesCache();
  mockedQuery.mockReset();
});

describe("ensureLlmTables — schema bootstrap", () => {
  it("cria tabelas, indexes e roda ALTERs no cenário fresh", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureLlmTables();

    const sql = mockedQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "llm_configs"'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "llm_usage"'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "llm_credentials"'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_configs" ADD COLUMN IF NOT EXISTS "credential_id"'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "cost_brl"'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "usd_to_brl_rate"'))).toBe(true);
  });

  it("é idempotente (rodar 2x não duplica)", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureLlmTables();
    const firstCount = mockedQuery.mock.calls.length;
    await ensureLlmTables();
    expect(mockedQuery.mock.calls.length).toBe(firstCount);
  });

  it("migra rows antigas: cria credencial e popula credential_id", async () => {
    // 1ª chamada (create tables) e demais ALTERs ok.
    // SELECT de pendentes retorna 1 row.
    mockedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, provider, encrypted_api_key")) {
        return {
          rows: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              provider: "openai",
              encrypted_api_key: "enc:sk-LIVEKEY1234",
            },
          ],
          rowCount: 1,
        } as never;
      }
      if (sql.includes("SELECT COUNT(*) AS count FROM llm_credentials")) {
        return { rows: [{ count: 0 }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    await ensureLlmTables();

    const inserts = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("INSERT INTO llm_credentials"));
    expect(inserts.length).toBe(1);
    const updates = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("UPDATE llm_configs SET credential_id"));
    expect(updates.length).toBe(1);
  });

  it("ignora rows cujo decrypt falha (loga warning, segue)", async () => {
    const { decrypt } = require("@/lib/encryption");
    (decrypt as jest.Mock).mockImplementationOnce(() => {
      throw new Error("auth tag failure");
    });

    mockedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, provider, encrypted_api_key")) {
        return {
          rows: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              provider: "openai",
              encrypted_api_key: "enc:CORRUPT",
            },
          ],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(ensureLlmTables()).resolves.toBeUndefined();
    const inserts = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("INSERT INTO llm_credentials"));
    expect(inserts.length).toBe(0);
    warn.mockRestore();
  });
});
```

- [ ] **Step 4: Rodar testes — devem falhar**

```bash
npm test -- src/lib/llm/__tests__/ensure-tables.test.ts
```

Expected: FAIL — `CREATE TABLE IF NOT EXISTS "llm_credentials"` não encontrado.

- [ ] **Step 5: Implementar mudanças em `ensure-tables.ts`**

Substituir o conteúdo por:

```ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { decrypt } from "@/lib/encryption";

let ensured = false;
let inflight: Promise<void> | null = null;

async function createTables(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "llm_configs" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "encrypted_api_key" TEXT NOT NULL,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by_id" UUID,
      CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
    );
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "llm_usage" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "tokens_input" INTEGER NOT NULL,
      "tokens_output" INTEGER NOT NULL,
      "cost_usd" DECIMAL(10,6) NOT NULL,
      "prompt_chars" INTEGER NOT NULL,
      "response_chars" INTEGER NOT NULL,
      "user_id" UUID,
      "duration_ms" INTEGER,
      "error_message" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
    );
  `);

  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "llm_usage_created_at_idx" ON "llm_usage"("created_at");`,
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "llm_usage_provider_model_created_at_idx" ON "llm_usage"("provider", "model", "created_at");`,
  );

  // --- Novo em v0.12.0: tabela de credenciais ---
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "llm_credentials" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "provider" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "encrypted_api_key" TEXT NOT NULL,
      "last4" TEXT NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by_id" UUID,
      CONSTRAINT "llm_credentials_pkey" PRIMARY KEY ("id")
    );
  `);
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "llm_credentials_provider_label_idx" ON "llm_credentials"("provider", "label");`,
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "llm_credentials_provider_updated_idx" ON "llm_credentials"("provider", "updated_at" DESC);`,
  );

  // --- Novo em v0.12.0: colunas em llm_configs e llm_usage ---
  await pgPool.query(
    `ALTER TABLE "llm_configs" ADD COLUMN IF NOT EXISTS "credential_id" UUID;`,
  );
  await pgPool.query(
    `ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "cost_brl" DECIMAL(12,6);`,
  );
  await pgPool.query(
    `ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "usd_to_brl_rate" DECIMAL(10,4);`,
  );
}

async function migrateExistingConfigs(): Promise<void> {
  const pending = await pgPool.query<{
    id: string;
    provider: string;
    encrypted_api_key: string;
  }>(
    `SELECT id, provider, encrypted_api_key
       FROM llm_configs
      WHERE credential_id IS NULL
        AND encrypted_api_key IS NOT NULL`,
  );

  for (const row of pending.rows) {
    let last4: string;
    try {
      last4 = decrypt(row.encrypted_api_key).slice(-4);
    } catch (err) {
      console.warn(
        `[ensureLlmTables] decrypt falhou na config ${row.id}; pulando.`,
        err,
      );
      continue;
    }

    // Gera label "Chave principal" único pelo provider.
    let label = "Chave principal";
    let suffix = 1;
    while (true) {
      const existing = await pgPool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM llm_credentials WHERE provider = $1 AND label = $2`,
        [row.provider, label],
      );
      if (Number(existing.rows[0]?.count ?? 0) === 0) break;
      suffix += 1;
      label = `Chave principal ${suffix}`;
    }

    const inserted = await pgPool.query<{ id: string }>(
      `INSERT INTO llm_credentials (id, provider, label, encrypted_api_key, last4, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [row.provider, label, row.encrypted_api_key, last4],
    );

    await pgPool.query(
      `UPDATE llm_configs SET credential_id = $1 WHERE id = $2`,
      [inserted.rows[0].id, row.id],
    );
  }
}

export async function ensureLlmTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = (async () => {
    await createTables();
    await migrateExistingConfigs();
  })()
    .then(() => {
      ensured = true;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function __resetEnsureLlmTablesCache(): void {
  ensured = false;
  inflight = null;
}
```

- [ ] **Step 6: Rodar testes — devem passar**

```bash
npm test -- src/lib/llm/__tests__/ensure-tables.test.ts
```

Expected: PASS (4 testes).

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/llm/ensure-tables.ts src/lib/llm/__tests__/ensure-tables.test.ts src/generated/prisma
git commit -m "feat(llm): tabela llm_credentials + colunas cost_brl/usd_to_brl_rate (T1)"
```

---

## Task 2: lib `credentials.ts` (CRUD server)

**Files:**
- Create: `src/lib/llm/credentials.ts`
- Create: `src/lib/llm/__tests__/credentials.test.ts`

- [ ] **Step 1: Escrever testes**

Criar `src/lib/llm/__tests__/credentials.test.ts`:

```ts
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

jest.mock("../ensure-tables", () => ({
  ensureLlmTables: jest.fn(async () => {}),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  CREDENTIAL_IN_USE,
} from "../credentials";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  q.mockReset();
});

describe("listCredentials", () => {
  it("retorna summaries por provider", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "id-1",
          provider: "openai",
          label: "Chave 1",
          last4: "ABCD",
          created_at: new Date("2026-04-01"),
          updated_at: new Date("2026-04-15"),
        },
      ],
      rowCount: 1,
    } as never);
    const out = await listCredentials("openai");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ provider: "openai", label: "Chave 1", last4: "ABCD" });
    expect((out[0] as { encryptedApiKey?: string }).encryptedApiKey).toBeUndefined();
  });
});

describe("createCredential", () => {
  it("autogera label 'Chave 1' quando label vazio", async () => {
    // 1) count -> 0  2) INSERT -> RETURNING
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({
      rows: [{ id: "new-id", label: "Chave 1", last4: "9999" }],
      rowCount: 1,
    } as never);
    const r = await createCredential({
      provider: "openai",
      apiKey: "sk-AAAAAAAAA9999",
    });
    expect(r).toEqual({ id: "new-id", label: "Chave 1", last4: "9999" });
  });

  it("autogera label sequencial quando 'Chave 1' já existe", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as never); // Chave 1 ocupada
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never); // Chave 2 livre
    q.mockResolvedValueOnce({
      rows: [{ id: "new-id", label: "Chave 2", last4: "0000" }],
      rowCount: 1,
    } as never);
    const r = await createCredential({
      provider: "anthropic",
      apiKey: "sk-1234567890",
    });
    expect(r.label).toBe("Chave 2");
  });

  it("rejeita label duplicado explícito", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as never);
    await expect(
      createCredential({
        provider: "openai",
        label: "Conta principal",
        apiKey: "sk-9999999999",
      }),
    ).rejects.toThrow(/já existe/);
  });

  it("rejeita apiKey muito curta", async () => {
    await expect(
      createCredential({ provider: "openai", apiKey: "short" }),
    ).rejects.toThrow(/inválida/);
  });

  it("rejeita label > 60 chars", async () => {
    await expect(
      createCredential({
        provider: "openai",
        label: "X".repeat(61),
        apiKey: "sk-9999999999",
      }),
    ).rejects.toThrow(/60/);
  });
});

describe("updateCredential", () => {
  it("renomear apenas: dispara UPDATE label sem mexer em encrypted_api_key", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never); // unique check
    q.mockResolvedValueOnce({
      rows: [{ provider: "openai", label: "Novo", last4: "ABCD" }],
      rowCount: 1,
    } as never);
    const out = await updateCredential("id-1", { label: "Novo" });
    expect(out.label).toBe("Novo");
    const sqls = q.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("UPDATE llm_credentials"))).toBe(true);
    expect(sqls.some((s) => s.includes("encrypted_api_key"))).toBe(false);
  });

  it("rotacionar key: atualiza encrypted_api_key e last4", async () => {
    q.mockResolvedValueOnce({
      rows: [{ provider: "openai", label: "x", last4: "WXYZ" }],
      rowCount: 1,
    } as never);
    const out = await updateCredential("id-1", { apiKey: "sk-NEWKEY12WXYZ" });
    expect(out.last4).toBe("WXYZ");
  });
});

describe("deleteCredential", () => {
  it("permite delete quando não há config ativa apontando", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never); // active count
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // delete
    await expect(deleteCredential("id-1")).resolves.toBeUndefined();
  });

  it("bloqueia com CREDENTIAL_IN_USE quando há config ativa", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as never);
    await expect(deleteCredential("id-1")).rejects.toThrow(CREDENTIAL_IN_USE);
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
npm test -- src/lib/llm/__tests__/credentials.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/llm/credentials.ts`**

```ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { encrypt, decrypt } from "@/lib/encryption";

import { ensureLlmTables } from "./ensure-tables";
import type { LlmProvider } from "./types";

export const CREDENTIAL_IN_USE = "CREDENTIAL_IN_USE";

const MAX_LABEL_LEN = 60;
const MIN_API_KEY_LEN = 10;

export interface CredentialSummary {
  id: string;
  provider: LlmProvider;
  label: string;
  last4: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCredentialInput {
  provider: LlmProvider;
  label?: string;
  apiKey: string;
}

export interface UpdateCredentialInput {
  label?: string;
  apiKey?: string;
}

function assertValidLabel(label: string): void {
  if (label.length === 0 || label.length > MAX_LABEL_LEN) {
    throw new Error(`Label inválida (1 a ${MAX_LABEL_LEN} caracteres)`);
  }
}

function assertValidApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim().length < MIN_API_KEY_LEN) {
    throw new Error("API key inválida (muito curta)");
  }
}

async function isLabelTaken(
  provider: LlmProvider,
  label: string,
  excludeId?: string,
): Promise<boolean> {
  const params: unknown[] = [provider, label];
  let sql = `SELECT COUNT(*) AS count FROM llm_credentials WHERE provider = $1 AND label = $2`;
  if (excludeId) {
    sql += ` AND id <> $3`;
    params.push(excludeId);
  }
  const r = await pgPool.query<{ count: string | number }>(sql, params);
  return Number(r.rows[0]?.count ?? 0) > 0;
}

async function autogenerateLabel(provider: LlmProvider): Promise<string> {
  let n = 1;
  while (true) {
    const candidate = `Chave ${n}`;
    if (!(await isLabelTaken(provider, candidate))) return candidate;
    n += 1;
    if (n > 999) throw new Error("Não foi possível autogerar label");
  }
}

export async function listCredentials(
  provider?: LlmProvider,
): Promise<CredentialSummary[]> {
  await ensureLlmTables();
  const params: unknown[] = [];
  let sql = `SELECT id, provider, label, last4, created_at, updated_at
               FROM llm_credentials`;
  if (provider) {
    sql += ` WHERE provider = $1`;
    params.push(provider);
  }
  sql += ` ORDER BY provider ASC, updated_at DESC`;
  const r = await pgPool.query<{
    id: string;
    provider: string;
    label: string;
    last4: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    provider: row.provider as LlmProvider,
    label: row.label,
    last4: row.last4,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  }));
}

export async function createCredential(
  input: CreateCredentialInput,
  createdById?: string | null,
): Promise<{ id: string; label: string; last4: string }> {
  await ensureLlmTables();
  const trimmed = input.apiKey?.trim() ?? "";
  assertValidApiKey(trimmed);

  const label = (input.label ?? "").trim() || (await autogenerateLabel(input.provider));
  assertValidLabel(label);

  if (await isLabelTaken(input.provider, label)) {
    throw new Error(`Label "${label}" já existe para este provider`);
  }

  const last4 = trimmed.slice(-4);
  const enc = encrypt(trimmed);

  const r = await pgPool.query<{ id: string; label: string; last4: string }>(
    `INSERT INTO llm_credentials (id, provider, label, encrypted_api_key, last4, created_at, updated_at, created_by_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW(), $5)
     RETURNING id, label, last4`,
    [input.provider, label, enc, last4, createdById ?? null],
  );

  return r.rows[0];
}

export async function updateCredential(
  id: string,
  input: UpdateCredentialInput,
): Promise<{ provider: LlmProvider; label: string; last4: string }> {
  await ensureLlmTables();

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (input.label !== undefined) {
    const label = input.label.trim();
    assertValidLabel(label);
    // checagem de unique exige conhecer provider — inferimos via SELECT antes
    const cur = await pgPool.query<{ provider: string }>(
      `SELECT provider FROM llm_credentials WHERE id = $1`,
      [id],
    );
    const provider = cur.rows[0]?.provider as LlmProvider | undefined;
    if (!provider) throw new Error("Credencial não encontrada");
    if (await isLabelTaken(provider, label, id)) {
      throw new Error(`Label "${label}" já existe para este provider`);
    }
    setClauses.push(`label = $${paramIdx++}`);
    params.push(label);
  }

  if (input.apiKey !== undefined) {
    const trimmed = input.apiKey.trim();
    assertValidApiKey(trimmed);
    setClauses.push(`encrypted_api_key = $${paramIdx++}`);
    params.push(encrypt(trimmed));
    setClauses.push(`last4 = $${paramIdx++}`);
    params.push(trimmed.slice(-4));
  }

  if (setClauses.length === 0) {
    throw new Error("Nada a atualizar");
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(id);

  const sql = `UPDATE llm_credentials
                  SET ${setClauses.join(", ")}
                WHERE id = $${paramIdx}
            RETURNING provider, label, last4`;

  const r = await pgPool.query<{
    provider: string;
    label: string;
    last4: string;
  }>(sql, params);

  if (r.rowCount === 0) throw new Error("Credencial não encontrada");
  const row = r.rows[0];
  return {
    provider: row.provider as LlmProvider,
    label: row.label,
    last4: row.last4,
  };
}

export async function deleteCredential(id: string): Promise<void> {
  await ensureLlmTables();
  const usage = await pgPool.query<{ count: string | number }>(
    `SELECT COUNT(*) AS count
       FROM llm_configs
      WHERE credential_id = $1 AND is_active = true`,
    [id],
  );
  if (Number(usage.rows[0]?.count ?? 0) > 0) {
    throw new Error(CREDENTIAL_IN_USE);
  }
  await pgPool.query(`DELETE FROM llm_credentials WHERE id = $1`, [id]);
}

export async function getCredentialApiKey(id: string): Promise<string | null> {
  await ensureLlmTables();
  const r = await pgPool.query<{ encrypted_api_key: string }>(
    `SELECT encrypted_api_key FROM llm_credentials WHERE id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  try {
    return decrypt(r.rows[0].encrypted_api_key);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test -- src/lib/llm/__tests__/credentials.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/credentials.ts src/lib/llm/__tests__/credentials.test.ts
git commit -m "feat(llm): CRUD de llm_credentials com label autogerada (T2)"
```

---

## Task 3: lib `exchange-rate.ts` (cotação USD→BRL com cache)

**Files:**
- Create: `src/lib/llm/exchange-rate.ts`
- Create: `src/lib/llm/__tests__/exchange-rate.test.ts`

- [ ] **Step 1: Escrever testes**

Criar `src/lib/llm/__tests__/exchange-rate.test.ts`:

```ts
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import {
  getUsdBrlRate,
  __resetUsdBrlCache,
  FALLBACK_COMMERCIAL_RATE,
  DEFAULT_CARD_SPREAD,
} from "../exchange-rate";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

const realFetch = global.fetch;

function mockSettings(state: {
  cache?: { commercial: number; fetchedAt: string } | null;
  spread?: number | null;
}): void {
  q.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (typeof sql === "string" && sql.includes("FROM app_settings")) {
      const key = (params?.[0] ?? "") as string;
      if (key === "llm.usd_brl.rate_cache") {
        return {
          rows: state.cache ? [{ value: state.cache }] : [],
          rowCount: state.cache ? 1 : 0,
        } as never;
      }
      if (key === "llm.usd_brl.card_spread") {
        return {
          rows: state.spread != null ? [{ value: state.spread }] : [],
          rowCount: state.spread != null ? 1 : 0,
        } as never;
      }
    }
    if (typeof sql === "string" && sql.includes("INTO app_settings")) {
      return { rows: [], rowCount: 1 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
}

beforeEach(() => {
  __resetUsdBrlCache();
  q.mockReset();
  // @ts-expect-error mock global
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("getUsdBrlRate", () => {
  it("usa cache quando válido (<4h) e não chama fetch", async () => {
    const now = new Date();
    const fresh = new Date(now.getTime() - 60 * 60 * 1000); // 1h atrás
    mockSettings({
      cache: { commercial: 5.1, fetchedAt: fresh.toISOString() },
      spread: 1.1,
    });
    const r = await getUsdBrlRate();
    expect(r.source).toBe("cache");
    expect(r.rate).toBeCloseTo(5.1 * 1.1, 4);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it("faz fetch quando cache expirado e atualiza", async () => {
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h atrás
    mockSettings({
      cache: { commercial: 5.0, fetchedAt: old.toISOString() },
      spread: 1.1,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.20" } }),
    });

    const r = await getUsdBrlRate();
    expect(r.source).toBe("live");
    expect(r.rate).toBeCloseTo(5.2 * 1.1, 4);
  });

  it("fetch falha e cache existe (mesmo expirado): usa cache antigo", async () => {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockSettings({
      cache: { commercial: 4.95, fetchedAt: old.toISOString() },
      spread: 1.1,
    });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));

    const r = await getUsdBrlRate();
    expect(r.source).toBe("cache");
    expect(r.rate).toBeCloseTo(4.95 * 1.1, 4);
  });

  it("fetch falha e sem cache: usa fallback hardcoded", async () => {
    mockSettings({ cache: null, spread: 1.1 });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));

    const r = await getUsdBrlRate();
    expect(r.source).toBe("fallback");
    expect(r.rate).toBeCloseTo(FALLBACK_COMMERCIAL_RATE * 1.1, 4);
  });

  it("clamping de spread fora do range [1.00, 1.30]", async () => {
    mockSettings({ cache: null, spread: 99 }); // fora
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.00" } }),
    });
    const r = await getUsdBrlRate();
    expect(r.rate).toBeCloseTo(5.0 * 1.3, 4); // clamp em 1.30
  });

  it("default spread 1.10 quando setting ausente", async () => {
    mockSettings({ cache: null, spread: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.00" } }),
    });
    const r = await getUsdBrlRate();
    expect(DEFAULT_CARD_SPREAD).toBe(1.1);
    expect(r.rate).toBeCloseTo(5.0 * 1.1, 4);
  });

  it("memoíza em memória dentro de 4h após primeira chamada", async () => {
    mockSettings({ cache: null, spread: 1.1 });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.30" } }),
    });
    const a = await getUsdBrlRate();
    const b = await getUsdBrlRate();
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    expect(b.rate).toBe(a.rate);
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
npm test -- src/lib/llm/__tests__/exchange-rate.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/llm/exchange-rate.ts`**

```ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";

const CACHE_KEY = "llm.usd_brl.rate_cache";
const SPREAD_KEY = "llm.usd_brl.card_spread";
const TTL_MS = 4 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const SPREAD_MIN = 1.0;
const SPREAD_MAX = 1.3;
const AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/last/USD-BRL";

export const DEFAULT_CARD_SPREAD = 1.1;
export const FALLBACK_COMMERCIAL_RATE = 5.5;

interface CacheEntry {
  commercial: number;
  fetchedAt: string;
}

interface Memo {
  rate: number;
  source: "live" | "cache" | "fallback";
  commercial: number;
  spread: number;
  fetchedAt: Date;
}

let memo: Memo | null = null;

export function __resetUsdBrlCache(): void {
  memo = null;
}

function clampSpread(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CARD_SPREAD;
  if (n < SPREAD_MIN) return SPREAD_MIN;
  if (n > SPREAD_MAX) return SPREAD_MAX;
  return n;
}

async function readSetting<T>(key: string): Promise<T | null> {
  const r = await pgPool.query<{ value: T }>(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [key],
  );
  if (r.rowCount === 0) return null;
  // PG retorna jsonb como objeto — em alguns drivers vem como string.
  const v = r.rows[0].value;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v;
}

async function writeRateCache(commercial: number): Promise<void> {
  const payload: CacheEntry = {
    commercial,
    fetchedAt: new Date().toISOString(),
  };
  await pgPool.query(
    `INSERT INTO app_settings (key, value, category, updated_at)
       VALUES ($1, $2::jsonb, 'platform', NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $2::jsonb, updated_at = NOW()`,
    [CACHE_KEY, JSON.stringify(payload)],
  );
}

async function fetchLiveCommercial(): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(AWESOMEAPI_URL, { signal: ctrl.signal });
    if (!res || !(res as Response).ok) throw new Error("HTTP failure");
    const json = (await (res as Response).json()) as {
      USDBRL?: { bid?: string | number };
    };
    const bid = json?.USDBRL?.bid;
    const num = typeof bid === "number" ? bid : Number(bid);
    if (!Number.isFinite(num) || num <= 0) throw new Error("bid inválido");
    return num;
  } finally {
    clearTimeout(timer);
  }
}

export interface UsdBrlRate {
  /** Cotação efetiva (commercial × spread). */
  rate: number;
  /** Cotação comercial (sem spread) — útil para auditoria. */
  commercial: number;
  /** Spread cartão aplicado. */
  spread: number;
  source: "live" | "cache" | "fallback";
  fetchedAt: Date;
}

export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  if (memo && Date.now() - memo.fetchedAt.getTime() < TTL_MS) {
    return {
      rate: memo.rate,
      commercial: memo.commercial,
      spread: memo.spread,
      source: memo.source,
      fetchedAt: memo.fetchedAt,
    };
  }

  const spreadRaw = await readSetting<number>(SPREAD_KEY);
  const spread = clampSpread(spreadRaw ?? DEFAULT_CARD_SPREAD);
  const cache = await readSetting<CacheEntry>(CACHE_KEY);
  const cacheAgeMs =
    cache?.fetchedAt != null
      ? Date.now() - new Date(cache.fetchedAt).getTime()
      : Number.POSITIVE_INFINITY;

  if (cache && cacheAgeMs < TTL_MS) {
    const rate = +(cache.commercial * spread).toFixed(6);
    memo = {
      rate,
      commercial: cache.commercial,
      spread,
      source: "cache",
      fetchedAt: new Date(),
    };
    return { ...memo };
  }

  // cache expirado/ausente — tenta live
  try {
    const commercial = await fetchLiveCommercial();
    await writeRateCache(commercial);
    const rate = +(commercial * spread).toFixed(6);
    memo = {
      rate,
      commercial,
      spread,
      source: "live",
      fetchedAt: new Date(),
    };
    return { ...memo };
  } catch (err) {
    if (cache) {
      const rate = +(cache.commercial * spread).toFixed(6);
      memo = {
        rate,
        commercial: cache.commercial,
        spread,
        source: "cache",
        fetchedAt: new Date(),
      };
      return { ...memo };
    }
    const commercial = FALLBACK_COMMERCIAL_RATE;
    const rate = +(commercial * spread).toFixed(6);
    memo = {
      rate,
      commercial,
      spread,
      source: "fallback",
      fetchedAt: new Date(),
    };
    console.warn(
      "[exchange-rate] AwesomeAPI indisponível e sem cache. Usando fallback 5.50.",
      err,
    );
    return { ...memo };
  }
}

export async function setCardSpread(spread: number): Promise<void> {
  const clamped = clampSpread(spread);
  await pgPool.query(
    `INSERT INTO app_settings (key, value, category, updated_at)
       VALUES ($1, $2::jsonb, 'platform', NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $2::jsonb, updated_at = NOW()`,
    [SPREAD_KEY, JSON.stringify(clamped)],
  );
  memo = null; // força próxima chamada recalcular
}
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test -- src/lib/llm/__tests__/exchange-rate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/exchange-rate.ts src/lib/llm/__tests__/exchange-rate.test.ts
git commit -m "feat(llm): exchange-rate USD→BRL com cache 4h e spread cartão (T3)"
```

---

## Task 4: Refatorar `get-active-config.ts` (JOIN com credentials + fallback)

**Files:**
- Modify: `src/lib/llm/get-active-config.ts`
- Create: `src/lib/llm/__tests__/get-active-config.test.ts`

- [ ] **Step 1: Escrever testes**

Criar `src/lib/llm/__tests__/get-active-config.test.ts`:

```ts
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

jest.mock("../ensure-tables", () => ({
  ensureLlmTables: jest.fn(async () => {}),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  getActiveLlmConfig,
  getPublicActiveLlmConfig,
} from "../get-active-config";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => q.mockReset());

describe("getActiveLlmConfig", () => {
  it("retorna config via JOIN quando credential_id está populado", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-1",
          provider: "openai",
          model: "gpt-4o",
          encrypted_api_key: "enc:sk-LIVE9999",
          credential_id: "cred-1",
          label: "Conta principal",
          last4: "9999",
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);

    const r = await getActiveLlmConfig();
    expect(r).toEqual({
      id: "cfg-1",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-LIVE9999",
      credentialId: "cred-1",
      credentialLabel: "Conta principal",
    });
  });

  it("fallback: usa encrypted_api_key direto quando credential_id é NULL", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-2",
          provider: "anthropic",
          model: "claude-4",
          encrypted_api_key: null,
          credential_id: null,
          label: null,
          last4: null,
          legacy_encrypted_api_key: "enc:sk-LEGACY1234",
        },
      ],
      rowCount: 1,
    } as never);

    const r = await getActiveLlmConfig();
    expect(r?.apiKey).toBe("sk-LEGACY1234");
    expect(r?.credentialId).toBeNull();
  });

  it("retorna null quando não há config ativa", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await getActiveLlmConfig()).toBeNull();
  });

  it("retorna null quando provider inválido", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "x",
          provider: "outro",
          model: "m",
          encrypted_api_key: "enc:k",
          credential_id: null,
          label: null,
          last4: null,
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);
    expect(await getActiveLlmConfig()).toBeNull();
  });
});

describe("getPublicActiveLlmConfig", () => {
  it("mascara chave usando last4 quando disponível", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-3",
          provider: "openai",
          model: "gpt-4o",
          encrypted_api_key: "enc:sk-LIVE9999",
          credential_id: "cred-1",
          label: "Conta principal",
          last4: "9999",
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);

    const r = await getPublicActiveLlmConfig();
    expect(r).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
      apiKeyMasked: "••••••••9999",
      credentialId: "cred-1",
      credentialLabel: "Conta principal",
    });
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
npm test -- src/lib/llm/__tests__/get-active-config.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Refatorar `get-active-config.ts`**

```ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { decrypt } from "@/lib/encryption";

import { ensureLlmTables } from "./ensure-tables";
import type { LlmProvider } from "./types";

export interface ActiveLlmConfig {
  id: string;
  provider: LlmProvider;
  model: string;
  /** API key descriptografada — manter em memória, nunca expor pela rede. */
  apiKey: string;
  credentialId: string | null;
  credentialLabel: string | null;
}

const VALID_PROVIDERS = new Set<LlmProvider>([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
]);

interface JoinedRow {
  id: string;
  provider: string;
  model: string;
  encrypted_api_key: string | null;
  credential_id: string | null;
  label: string | null;
  last4: string | null;
  legacy_encrypted_api_key: string | null;
}

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig | null> {
  await ensureLlmTables();
  const result = await pgPool.query<JoinedRow>(
    `SELECT cfg.id,
            cfg.provider,
            cfg.model,
            cred.encrypted_api_key AS encrypted_api_key,
            cfg.credential_id AS credential_id,
            cred.label AS label,
            cred.last4 AS last4,
            cfg.encrypted_api_key AS legacy_encrypted_api_key
       FROM llm_configs cfg
  LEFT JOIN llm_credentials cred ON cred.id = cfg.credential_id
      WHERE cfg.is_active = true
   ORDER BY cfg.updated_at DESC
      LIMIT 1`,
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];

  if (!VALID_PROVIDERS.has(row.provider as LlmProvider)) return null;

  const encrypted = row.encrypted_api_key ?? row.legacy_encrypted_api_key;
  if (!encrypted) return null;

  let apiKey: string;
  try {
    apiKey = decrypt(encrypted);
  } catch (err) {
    console.error("[llm] Falha ao decifrar API key da config ativa:", err);
    return null;
  }

  return {
    id: row.id,
    provider: row.provider as LlmProvider,
    model: row.model,
    apiKey,
    credentialId: row.credential_id,
    credentialLabel: row.label,
  };
}

export interface PublicLlmConfig {
  provider: LlmProvider;
  model: string;
  apiKeyMasked: string;
  credentialId: string | null;
  credentialLabel: string | null;
}

export async function getPublicActiveLlmConfig(): Promise<PublicLlmConfig | null> {
  const cfg = await getActiveLlmConfig();
  if (!cfg) return null;
  const tail = cfg.apiKey.slice(-4);
  return {
    provider: cfg.provider,
    model: cfg.model,
    apiKeyMasked: `••••••••${tail}`,
    credentialId: cfg.credentialId,
    credentialLabel: cfg.credentialLabel,
  };
}
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test -- src/lib/llm/__tests__/get-active-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros (atenção: outros consumidores de `PublicLlmConfig` agora veem
`credentialId`/`credentialLabel` — eles são tolerantes porque tipo cresceu, não
quebrou).

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/get-active-config.ts src/lib/llm/__tests__/get-active-config.test.ts
git commit -m "refactor(llm): get-active-config faz JOIN com credentials + fallback (T4)"
```

---

## Task 5: `usage-logger.ts` registra cost_brl + rate

**Files:**
- Modify: `src/lib/llm/agent/usage-logger.ts`
- Create: `src/lib/llm/agent/__tests__/usage-logger.test.ts`

- [ ] **Step 1: Escrever testes**

Criar `src/lib/llm/agent/__tests__/usage-logger.test.ts`:

```ts
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("../../ensure-tables", () => ({
  ensureLlmTables: jest.fn(async () => {}),
}));

jest.mock("../../exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
}));

import { pgPool } from "@/lib/pg-pool";
import { getUsdBrlRate } from "../../exchange-rate";
import { logUsage } from "../usage-logger";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const rate = getUsdBrlRate as jest.MockedFunction<typeof getUsdBrlRate>;

beforeEach(() => {
  q.mockReset();
  rate.mockReset();
});

describe("logUsage", () => {
  it("registra cost_brl e usd_to_brl_rate quando rate fetch funciona", async () => {
    rate.mockResolvedValueOnce({
      rate: 5.61,
      commercial: 5.1,
      spread: 1.1,
      source: "live",
      fetchedAt: new Date(),
    });
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await logUsage({
      provider: "openai",
      model: "gpt-4o",
      tokensInput: 100,
      tokensOutput: 50,
      costUsd: 0.001,
      promptChars: 200,
      responseChars: 100,
    });

    const params = q.mock.calls[0][1] as unknown[];
    // Layout: [provider, model, tokens_in, tokens_out, cost_usd, cost_brl, usd_rate, prompt, resp, user, dur, err]
    expect(params[5]).toBeCloseTo(0.001 * 5.61, 6);
    expect(params[6]).toBeCloseTo(5.61, 4);
  });

  it("falha de rate não bloqueia INSERT (NULL nos campos novos)", async () => {
    rate.mockRejectedValueOnce(new Error("network"));
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await logUsage({
      provider: "openai",
      model: "gpt-4o",
      tokensInput: 1,
      tokensOutput: 1,
      costUsd: 0.0,
      promptChars: 0,
      responseChars: 0,
    });

    const params = q.mock.calls[0][1] as unknown[];
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
  });

  it("erro no INSERT é silencioso (não propaga)", async () => {
    rate.mockResolvedValueOnce({
      rate: 5.5,
      commercial: 5.0,
      spread: 1.1,
      source: "fallback",
      fetchedAt: new Date(),
    });
    q.mockRejectedValueOnce(new Error("DB fora do ar"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      logUsage({
        provider: "openai",
        model: "gpt-4o",
        tokensInput: 1,
        tokensOutput: 1,
        costUsd: 0,
        promptChars: 0,
        responseChars: 0,
      }),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
npm test -- src/lib/llm/agent/__tests__/usage-logger.test.ts
```

Expected: FAIL — colunas/argumentos novos não correspondem.

- [ ] **Step 3: Atualizar `usage-logger.ts`**

Substituir o INSERT inteiro por:

```ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";

import { ensureLlmTables } from "../ensure-tables";
import { getUsdBrlRate } from "../exchange-rate";

export async function logUsage(args: {
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  promptChars: number;
  responseChars: number;
  userId?: string;
  durationMs?: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    await ensureLlmTables();

    let costBrl: number | null = null;
    let usdToBrlRate: number | null = null;
    try {
      const r = await getUsdBrlRate();
      usdToBrlRate = +r.rate.toFixed(4);
      costBrl = +(args.costUsd * r.rate).toFixed(6);
    } catch (err) {
      console.warn("[nex] Falha ao obter cotação USD/BRL:", err);
    }

    await pgPool.query(
      `INSERT INTO llm_usage (
         id, provider, model, tokens_input, tokens_output, cost_usd, cost_brl,
         usd_to_brl_rate, prompt_chars, response_chars, user_id, duration_ms,
         error_message, created_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [
        args.provider,
        args.model,
        args.tokensInput,
        args.tokensOutput,
        args.costUsd,
        costBrl,
        usdToBrlRate,
        args.promptChars,
        args.responseChars,
        args.userId ?? null,
        args.durationMs ?? null,
        args.errorMessage ?? null,
      ],
    );
  } catch (err) {
    console.warn("[nex] Falha ao registrar uso em llm_usage:", err);
  }
}
```

> ⚠ Atenção: o teste em Step 1 valida `params[5]=cost_brl`, `params[6]=usd_to_brl_rate`. A
> ordem dos params no INSERT precisa bater. Se o teste falhar por desalinhamento,
> ajustar o array `[args.provider, ...]` para refletir a ordem do INSERT.

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test -- src/lib/llm/agent/__tests__/usage-logger.test.ts
```

Expected: PASS (3 testes).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/agent/usage-logger.ts src/lib/llm/agent/__tests__/usage-logger.test.ts
git commit -m "feat(llm): usage-logger registra cost_brl + usd_to_brl_rate (T5)"
```

---

## Task 6: `usage-stats.ts` retorna agregados em BRL

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts`
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts` (se existir; senão criar trecho mínimo)

- [ ] **Step 1: Inspecionar teste existente**

```bash
test -f src/lib/llm/queries/__tests__/usage-stats.test.ts && head -30 src/lib/llm/queries/__tests__/usage-stats.test.ts || echo "missing"
```

Expected: arquivo presente — vamos extender.

- [ ] **Step 2: Estender testes**

Append em `src/lib/llm/queries/__tests__/usage-stats.test.ts`:

```ts
describe("usage-stats — BRL aggregates (v0.12.0)", () => {
  it("inclui totalCostBrl e cost_brl em byDay/byProvider/byModel", async () => {
    const { pgPool } = require("@/lib/pg-pool") as {
      pgPool: { query: jest.MockedFunction<(sql: string, params?: unknown[]) => Promise<unknown>> };
    };
    pgPool.query.mockReset();

    pgPool.query
      // summary
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost: 0.1,
            total_cost_brl: 0.55,
            total_tokens_input: 100,
            total_tokens_output: 50,
            total_calls: 1,
          },
        ],
        rowCount: 1,
      } as never)
      // byModel
      .mockResolvedValueOnce({
        rows: [
          {
            provider: "openai",
            model: "gpt-4o",
            cost: 0.1,
            cost_brl: 0.55,
            tokens_input: 100,
            tokens_output: 50,
            calls: 1,
          },
        ],
        rowCount: 1,
      } as never)
      // byDay
      .mockResolvedValueOnce({
        rows: [{ day: "2026-04-30", cost: 0.1, cost_brl: 0.55, tokens: 150, calls: 1 }],
        rowCount: 1,
      } as never)
      // byProvider
      .mockResolvedValueOnce({
        rows: [{ provider: "openai", cost: 0.1, cost_brl: 0.55, calls: 1 }],
        rowCount: 1,
      } as never);

    const { getUsageStats } = require("../usage-stats");
    const r = await getUsageStats({
      start: new Date("2026-04-01"),
      end: new Date("2026-05-01"),
    });

    expect(r.totalCostBrl).toBeCloseTo(0.55);
    expect(r.byDay[0].costBrl).toBeCloseTo(0.55);
    expect(r.byProvider[0].costBrl).toBeCloseTo(0.55);
    expect(r.byModel[0].costBrl).toBeCloseTo(0.55);
  });

  it("byDay com cost_brl NULL em rows antigas vira 0", async () => {
    const { pgPool } = require("@/lib/pg-pool") as {
      pgPool: { query: jest.MockedFunction<(sql: string, params?: unknown[]) => Promise<unknown>> };
    };
    pgPool.query.mockReset();

    pgPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost: 0,
            total_cost_brl: null,
            total_tokens_input: 0,
            total_tokens_output: 0,
            total_calls: 0,
          },
        ],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({
        rows: [{ day: "2026-04-30", cost: 0, cost_brl: null, tokens: 0, calls: 0 }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const { getUsageStats } = require("../usage-stats");
    const r = await getUsageStats({
      start: new Date("2026-04-01"),
      end: new Date("2026-05-01"),
    });
    expect(r.totalCostBrl).toBe(0);
    expect(r.byDay[0].costBrl).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar testes — devem falhar**

```bash
npm test -- src/lib/llm/queries/__tests__/usage-stats.test.ts
```

Expected: FAIL — `totalCostBrl` undefined.

- [ ] **Step 4: Atualizar `usage-stats.ts`**

Adicionar em `UsageSummary`:

```ts
totalCostBrl: number;
byModel: Array<{ provider; model; cost: number; costBrl: number; tokensInput; tokensOutput; calls; }>;
byDay: Array<{ day: string; cost: number; costBrl: number; tokens; calls; }>;
byProvider: Array<{ provider; cost: number; costBrl: number; calls; }>;
```

Adicionar em cada query SQL `COALESCE(SUM(cost_brl), 0) AS cost_brl` e
`COALESCE(SUM(cost_brl), 0) AS total_cost_brl` no SELECT do summary. Mapear nos
`.map(...)` e somar `costBrl: toNumber(r.cost_brl)`.

Adicionar em `UsageDetailRow`:
```ts
costBrl: number | null;
usdToBrlRate: number | null;
```

E na query do `getUsageDetails`, adicionar `cost_brl, usd_to_brl_rate` no
`SELECT` e mapear.

Snippet completo após edits — query de summary:

```ts
pgPool.query<SummaryRow>(
  `SELECT
     COALESCE(SUM(cost_usd), 0) AS total_cost,
     COALESCE(SUM(cost_brl), 0) AS total_cost_brl,
     COALESCE(SUM(tokens_input), 0) AS total_tokens_input,
     COALESCE(SUM(tokens_output), 0) AS total_tokens_output,
     COUNT(*) AS total_calls
   FROM llm_usage
   WHERE created_at >= $1 AND created_at < $2`,
  [start, end],
),
```

Ajustar `SummaryRow`/`ModelRow`/`DayRow`/`ProviderRow` para ter `cost_brl`/
`total_cost_brl`. E `UsageDetailRow` mapping para incluir `costBrl` e
`usdToBrlRate`.

Para detalhes, em `getUsageDetails`, atualizar SELECT:

```sql
SELECT id, provider, model, tokens_input, tokens_output, cost_usd, cost_brl,
       usd_to_brl_rate, duration_ms, created_at
  FROM llm_usage
 WHERE created_at >= $1 AND created_at < $2
 ORDER BY created_at DESC
 LIMIT $3 OFFSET $4
```

E o map:

```ts
costBrl: r.cost_brl == null ? null : toNumber(r.cost_brl as string | number),
usdToBrlRate: r.usd_to_brl_rate == null ? null : toNumber(r.usd_to_brl_rate as string | number),
```

- [ ] **Step 5: Rodar testes — devem passar**

```bash
npm test -- src/lib/llm/queries/__tests__/usage-stats.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros (atenção: `consumo-content.tsx` ainda não usa BRL — é OK,
campos novos são adicionais, não removem).

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm/queries/usage-stats.ts src/lib/llm/queries/__tests__/usage-stats.test.ts
git commit -m "feat(llm): usage-stats agrega cost_brl + retorna por chamada (T6)"
```

---

## Task 7: Server Actions de credenciais + atualização de saveLlmConfig

**Files:**
- Create: `src/lib/actions/llm-credentials.ts`
- Create: `src/lib/actions/__tests__/llm-credentials.test.ts`
- Modify: `src/lib/actions/llm-config.ts`

- [ ] **Step 1: Escrever testes para `llm-credentials.ts` (actions)**

Criar `src/lib/actions/__tests__/llm-credentials.test.ts`:

```ts
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/llm/credentials", () => ({
  listCredentials: jest.fn(),
  createCredential: jest.fn(),
  updateCredential: jest.fn(),
  deleteCredential: jest.fn(),
  getCredentialApiKey: jest.fn(),
  CREDENTIAL_IN_USE: "CREDENTIAL_IN_USE",
}));
jest.mock("@/lib/llm/providers/test-connection", () => ({
  deepTest: jest.fn(),
  describeErrorKind: jest.fn((_k, m) => m),
}));

import { auth } from "@/auth";
import {
  listLlmCredentialsAction,
  createLlmCredentialAction,
  updateLlmCredentialAction,
  deleteLlmCredentialAction,
  testLlmCredentialAction,
} from "../llm-credentials";
import * as creds from "@/lib/llm/credentials";
import { logAudit } from "@/lib/audit";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
});

describe("guarda super_admin", () => {
  it("listLlmCredentialsAction rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await listLlmCredentialsAction();
    expect(r.ok).toBe(false);
  });
});

describe("createLlmCredentialAction", () => {
  it("cria + audit log + retorna {id, label, last4}", async () => {
    (creds.createCredential as jest.Mock).mockResolvedValueOnce({
      id: "new-1",
      label: "Chave 1",
      last4: "9999",
    });
    const r = await createLlmCredentialAction({
      provider: "openai",
      apiKey: "sk-1234567890",
    });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ id: "new-1", label: "Chave 1", last4: "9999" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "credential_created" }),
    );
  });
});

describe("deleteLlmCredentialAction", () => {
  it("traduz CREDENTIAL_IN_USE em mensagem amigável", async () => {
    (creds.deleteCredential as jest.Mock).mockRejectedValueOnce(
      new Error("CREDENTIAL_IN_USE"),
    );
    const r = await deleteLlmCredentialAction("id-1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/em uso/);
  });
});

describe("testLlmCredentialAction", () => {
  it("usa getCredentialApiKey + deepTest", async () => {
    (creds.getCredentialApiKey as jest.Mock).mockResolvedValueOnce("sk-LIVE");
    const { deepTest } = require("@/lib/llm/providers/test-connection");
    (deepTest as jest.Mock).mockResolvedValueOnce({
      reachable: true,
      message: "ok",
      creditOk: true,
    });
    const r = await testLlmCredentialAction("id-1", "openai", "gpt-4o");
    expect(r.ok).toBe(true);
    expect(r.data?.reachable).toBe(true);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/actions/llm-credentials.ts`**

```ts
"use server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  CREDENTIAL_IN_USE,
  createCredential,
  deleteCredential,
  getCredentialApiKey,
  listCredentials,
  updateCredential,
  type CredentialSummary,
} from "@/lib/llm/credentials";
import {
  deepTest,
  describeErrorKind,
  type ErrorKind,
} from "@/lib/llm/providers/test-connection";
import type { LlmProvider } from "@/lib/llm/types";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode gerenciar credenciais de IA",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

export async function listLlmCredentialsAction(
  provider?: LlmProvider,
): Promise<ActionResult<CredentialSummary[]>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const data = await listCredentials(provider);
    return { ok: true, data };
  } catch (err) {
    console.error("[llm-credentials] list:", err);
    return { ok: false, error: "Erro ao listar credenciais" };
  }
}

export async function createLlmCredentialAction(input: {
  provider: LlmProvider;
  label?: string;
  apiKey: string;
}): Promise<ActionResult<{ id: string; label: string; last4: string }>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const created = await createCredential(input, guard.userId);
    await logAudit({
      userId: guard.userId,
      action: "credential_created",
      targetType: "llm_credential",
      targetId: created.id,
      details: { provider: input.provider, label: created.label },
    });
    return { ok: true, data: created };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao criar credencial",
    };
  }
}

export async function updateLlmCredentialAction(
  id: string,
  input: { label?: string; apiKey?: string },
): Promise<ActionResult<{ label: string; last4: string }>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const out = await updateCredential(id, input);
    await logAudit({
      userId: guard.userId,
      action: "credential_updated",
      targetType: "llm_credential",
      targetId: id,
      details: {
        provider: out.provider,
        label: out.label,
        rotated: input.apiKey !== undefined,
      },
    });
    return { ok: true, data: { label: out.label, last4: out.last4 } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar credencial",
    };
  }
}

export async function deleteLlmCredentialAction(
  id: string,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    await deleteCredential(id);
    await logAudit({
      userId: guard.userId,
      action: "credential_deleted",
      targetType: "llm_credential",
      targetId: id,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === CREDENTIAL_IN_USE) {
      return {
        ok: false,
        error:
          "Esta chave está em uso pelo Agente Nex. Selecione outra antes de deletar.",
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao deletar credencial",
    };
  }
}

export interface TestLlmConnectionResult {
  reachable: boolean;
  message?: string;
  creditOk?: boolean;
  creditRemainingUsd?: number;
  errorKind?: ErrorKind;
}

export async function testLlmCredentialAction(
  credentialId: string,
  provider: LlmProvider,
  model: string,
): Promise<ActionResult<TestLlmConnectionResult>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const apiKey = await getCredentialApiKey(credentialId);
  if (!apiKey) {
    return { ok: false, error: "Credencial não encontrada ou ilegível" };
  }

  const result = await deepTest(provider, apiKey, model);
  const friendly =
    result.errorKind && result.errorKind !== "other"
      ? describeErrorKind(result.errorKind, result.message, model)
      : result.message;

  await logAudit({
    userId: guard.userId,
    action: "credential_tested",
    targetType: "llm_credential",
    targetId: credentialId,
    details: { provider, model, reachable: result.reachable },
  });

  return {
    ok: true,
    data: {
      reachable: result.reachable,
      message: friendly?.slice(0, 240),
      errorKind: result.errorKind,
      creditOk: result.creditOk,
      creditRemainingUsd: result.creditRemainingUsd,
    },
  };
}
```

- [ ] **Step 3: Rodar testes — devem passar**

```bash
npm test -- src/lib/actions/__tests__/llm-credentials.test.ts
```

Expected: PASS.

- [ ] **Step 4: Atualizar `src/lib/actions/llm-config.ts`**

Mudar contrato de `saveLlmConfig`:

```ts
export interface SaveLlmConfigInput {
  provider: LlmProvider;
  model: string;
  /** Nova API: aponta pra `llm_credentials.id`. */
  credentialId: string;
}
```

A função fica:

```ts
export async function saveLlmConfig(
  input: SaveLlmConfigInput,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!VALID_PROVIDERS.includes(input.provider)) {
    return { ok: false, error: "Provider inválido" };
  }
  const trimmedModel = (input.model ?? "").trim();
  if (trimmedModel.length < 3 || trimmedModel.length > 100) {
    return { ok: false, error: "Modelo inválido (3 a 100 caracteres)" };
  }
  if (!input.credentialId) {
    return { ok: false, error: "Selecione uma credencial" };
  }

  await ensureLlmTables();

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE llm_configs SET is_active = false WHERE is_active = true`,
    );
    await client.query(
      `INSERT INTO llm_configs (id, provider, model, encrypted_api_key, credential_id, is_active, created_at, updated_at, created_by_id)
       VALUES (gen_random_uuid(), $1, $2, '', $3, true, NOW(), NOW(), $4)`,
      [input.provider, trimmedModel, input.credentialId, guard.userId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[llm-config] Falha ao salvar configuração:", err);
    return { ok: false, error: "Erro ao salvar configuração no banco" };
  } finally {
    client.release();
  }

  await logAudit({
    userId: guard.userId,
    action: "setting_updated",
    targetType: "llm_config",
    details: {
      provider: input.provider,
      model: trimmedModel,
      credentialId: input.credentialId,
    },
  });

  return { ok: true };
}
```

> ⚠ A coluna `encrypted_api_key` em `llm_configs` continua NOT NULL no schema —
> passamos string vazia. Em v0.13.0 dropamos a coluna. Se isso violar
> constraint, rodar `ALTER TABLE llm_configs ALTER COLUMN encrypted_api_key
> DROP NOT NULL;` no `ensureLlmTables` Step 5 do Task 1 (já incluso? — verificar
> antes do Task 7 e adicionar se faltar).

Adicionar no Task 1, junto dos ALTERs:

```ts
await pgPool.query(
  `ALTER TABLE "llm_configs" ALTER COLUMN "encrypted_api_key" DROP NOT NULL;`,
);
```

(Re-rodar test do Task 1 e confirmar que passa.)

Adicionar nova action `testLlmConnection` continua igual (legacy — pode ser
removida em v0.13.0 ou mantida pra UI de "criar nova chave"). **Manter.**

Atualizar tests existentes em `src/lib/actions/__tests__/` que chamam
`saveLlmConfig` com `apiKey` — substituir pra `credentialId`. (Pode ser apenas
`llm-config-card.test.tsx` — verificar.)

- [ ] **Step 5: Verificar que `llm-config-card.test.tsx` ainda compila**

```bash
npm run typecheck
```

Se `saveLlmConfig` aparecer com tipos quebrados em algum lugar, atualizar.

- [ ] **Step 6: Rodar tests da área**

```bash
npm test -- src/lib/actions/__tests__/llm-credentials.test.ts src/components/settings/__tests__/llm-config-card.test.tsx
```

Tests do componente provavelmente vão falhar — vão ser ajustados em Task 8.
Esperado neste momento: tests de `llm-credentials.test.ts` PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/llm-credentials.ts src/lib/actions/__tests__/llm-credentials.test.ts src/lib/actions/llm-config.ts src/lib/llm/ensure-tables.ts
git commit -m "feat(llm): server actions de credenciais + saveLlmConfig usa credentialId (T7)"
```

---

## Task 8: Server Actions de exchange-rate

**Files:**
- Create: `src/lib/actions/exchange-rate.ts`
- Create: `src/lib/actions/__tests__/exchange-rate.test.ts`

- [ ] **Step 1: Testes**

`src/lib/actions/__tests__/exchange-rate.test.ts`:

```ts
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/llm/exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
  setCardSpread: jest.fn(),
}));

import { auth } from "@/auth";
import {
  getCurrentRateAction,
  setCardSpreadAction,
} from "../exchange-rate";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
});

describe("getCurrentRateAction", () => {
  it("retorna rate atual", async () => {
    const { getUsdBrlRate } = require("@/lib/llm/exchange-rate");
    (getUsdBrlRate as jest.Mock).mockResolvedValueOnce({
      rate: 5.61,
      commercial: 5.1,
      spread: 1.1,
      source: "live",
      fetchedAt: new Date("2026-04-30T12:00:00Z"),
    });
    const r = await getCurrentRateAction();
    expect(r.ok).toBe(true);
    expect(r.data?.rate).toBeCloseTo(5.61);
  });
});

describe("setCardSpreadAction", () => {
  it("rejeita spread fora de [1.0, 1.3]", async () => {
    const r = await setCardSpreadAction(0.5);
    expect(r.ok).toBe(false);
  });
  it("aceita 1.10", async () => {
    const r = await setCardSpreadAction(1.1);
    expect(r.ok).toBe(true);
  });
  it("rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await setCardSpreadAction(1.1);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar**

`src/lib/actions/exchange-rate.ts`:

```ts
"use server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_CARD_SPREAD,
  getUsdBrlRate,
  setCardSpread,
} from "@/lib/llm/exchange-rate";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Apenas super_admin pode editar cotação" };
  }
  return { ok: true, userId: user.id ?? null };
}

export async function getCurrentRateAction(): Promise<
  ActionResult<{
    rate: number;
    commercial: number;
    spread: number;
    source: "live" | "cache" | "fallback";
    fetchedAt: string;
  }>
> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const r = await getUsdBrlRate();
    return {
      ok: true,
      data: {
        rate: r.rate,
        commercial: r.commercial,
        spread: r.spread,
        source: r.source,
        fetchedAt: r.fetchedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[exchange-rate] action:", err);
    return { ok: false, error: "Erro ao obter cotação" };
  }
}

const SPREAD_MIN = 1.0;
const SPREAD_MAX = 1.3;

export async function setCardSpreadAction(
  spread: number,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (
    typeof spread !== "number" ||
    !Number.isFinite(spread) ||
    spread < SPREAD_MIN ||
    spread > SPREAD_MAX
  ) {
    return {
      ok: false,
      error: `Spread fora do range [${SPREAD_MIN}, ${SPREAD_MAX}]`,
    };
  }
  try {
    await setCardSpread(spread);
    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "platform_settings",
      targetId: "llm.usd_brl.card_spread",
      details: { spread },
    });
    return { ok: true };
  } catch (err) {
    console.error("[exchange-rate] set:", err);
    return { ok: false, error: "Erro ao salvar spread" };
  }
}

export { DEFAULT_CARD_SPREAD };
```

- [ ] **Step 3: Rodar tests**

```bash
npm test -- src/lib/actions/__tests__/exchange-rate.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/exchange-rate.ts src/lib/actions/__tests__/exchange-rate.test.ts
git commit -m "feat(llm): actions getCurrentRate + setCardSpread (T8)"
```

---

## Task 9: Renomear "Agente IA" → "Agente Nex" (textual)

**Files:**
- Modify: `src/components/settings/llm-config-card.tsx`
- Modify: `src/app/(protected)/configuracoes/consumo/page.tsx`
- Modify: `src/components/llm/consumo-content.tsx`
- Modify: `src/lib/llm/agent/run-nex.ts`
- (e qualquer outro hit do grep abaixo)

- [ ] **Step 1: Detectar todas ocorrências**

```bash
grep -rn "Agente IA" src/ | grep -v __tests__
```

Capturar a lista exata.

- [ ] **Step 2: Substituir cada ocorrência**

Para cada arquivo, substituir literal `"Agente IA (Nex)"` → `"Agente Nex"` e
`"Agente IA"` → `"Agente Nex"`. Em `metadata.title` da página
`/configuracoes/consumo/page.tsx`: `"Consumo do Agente IA | Nexus Insights"`
→ `"Consumo do Agente Nex | Nexus Insights"`. Em `consumo-content.tsx` empty
state: `"Nenhuma chamada ao Agente IA registrada ainda"` → `"Nenhuma chamada
ao Agente Nex registrada ainda"`. Em `run-nex.ts` mensagem de erro: `"Vá em
Configurações → Agente IA (Nex)"` → `"Vá em Configurações → Agente Nex"`.

- [ ] **Step 3: Verificar que sumiu de `src/`**

```bash
grep -rn "Agente IA" src/ | grep -v __tests__
```

Expected: vazio.

- [ ] **Step 4: Atualizar tests que verificam essas strings**

```bash
grep -rn "Agente IA" src/components/settings/__tests__ src/components/llm/__tests__ 2>/dev/null
```

Substituir literal nos testes encontrados. (Se nenhum, OK.)

- [ ] **Step 5: Rodar tests afetados + typecheck**

```bash
npm test -- src/components/settings/__tests__/llm-config-card.test.tsx src/lib/llm/agent/__tests__/run-nex.test.ts
npm run typecheck
```

Expected: PASS / 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/llm-config-card.tsx src/app/\(protected\)/configuracoes/consumo/page.tsx src/components/llm/consumo-content.tsx src/lib/llm/agent/run-nex.ts
git commit -m "chore(ui): renomeia 'Agente IA' → 'Agente Nex' em todos call-sites (T9)"
```

---

## Task 10: `llm-config-card.tsx` simplificado (sem campo API key) + spread

**Files:**
- Modify: `src/components/settings/llm-config-card.tsx`
- Modify: `src/components/settings/__tests__/llm-config-card.test.tsx`
- Modify: `src/app/(protected)/configuracoes/page.tsx` (passar credenciais e spread iniciais)

- [ ] **Step 1: Atualizar `/configuracoes/page.tsx`**

No `Promise.all`, adicionar:

```ts
import { listCredentials } from "@/lib/llm/credentials";
import { getUsdBrlRate } from "@/lib/llm/exchange-rate";
// ...
const [..., initialCredentials, currentRate] = await Promise.all([
  // existentes
  listCredentials(),
  getUsdBrlRate(),
]);
```

Passar `initialCredentials` e `initialSpread={currentRate.spread}` ao
`<LlmConfigCard ... />` (ver Step 4).

- [ ] **Step 2: Reescrever `llm-config-card.tsx`**

Mudanças no componente:
- Adicionar prop `initialCredentials: CredentialSummary[]`.
- Adicionar prop `initialSpread: number`.
- Estado: `credentialId: string | null` inicializado com `initial?.credentialId
  ?? credentialsForProvider[0]?.id ?? null`.
- Remover `apiKey` state e o campo `<PasswordInput id="llm-api-key" ... />`.
- Adicionar `<CustomSelect>` "Chave de API" cujas opções são `credentialsForProvider`
  + última opção `{ value: "__new__", label: "+ Nova chave" }`. Selecionar essa
  opção abre o dialog de nova credencial (delegado: usa a mesma rota do card de
  credenciais — Task 11 — ou abre dialog próprio).
- Comportamento ao trocar `provider`: filtra credenciais pra esse provider,
  seleciona a primeira; se vazio, força `__new__` e desabilita Salvar.
- Botão "Testar conexão": chama `testLlmCredentialAction(credentialId, provider,
  model)`.
- Botão "Salvar configuração": chama `saveLlmConfig({ provider, model,
  credentialId })`.
- Adicionar bloco "Spread cartão" — `<input type="number" step="0.01" min="1.00"
  max="1.30">` com valor padrão `initialSpread`. `onBlur` → debounce 500ms →
  `setCardSpreadAction(value)`. Toast em sucesso/erro.

Estrutura final do form (substituindo o atual entre `<CardContent>`):

```tsx
<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
  <ProviderField .../>
  <ModelField .../>
</div>
<CredentialField
  credentialsForProvider={credentialsForProvider}
  value={credentialId}
  onChange={handleCredentialChange}
  onCreateNew={openCreateDialog}
/>
<SpreadField
  value={spread}
  onChange={handleSpreadChange}
  busy={isSavingSpread}
/>
```

(Se preferir manter o componente em um único arquivo, definir `CredentialField`
e `SpreadField` inline no mesmo arquivo — o card hoje é monolítico.)

- [ ] **Step 3: Atualizar tests**

`src/components/settings/__tests__/llm-config-card.test.tsx`:
- Remover assertions sobre `<PasswordInput id="llm-api-key">`.
- Adicionar assertions sobre `<CustomSelect>` "Chave de API" listando as credenciais.
- Adicionar test "trocar modelo dispara save com mesmo credentialId".
- Adicionar test "spread input chama setCardSpreadAction com debounce".
- Mock de `saveLlmConfig` recebe `{ provider, model, credentialId }`.

- [ ] **Step 4: Rodar tests**

```bash
npm test -- src/components/settings/__tests__/llm-config-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/llm-config-card.tsx src/components/settings/__tests__/llm-config-card.test.tsx src/app/\(protected\)/configuracoes/page.tsx
git commit -m "feat(ui): card 'Agente Nex' usa select de credenciais + spread cartão (T10)"
```

---

## Task 11: `llm-credentials-card.tsx` (NOVO)

**Files:**
- Create: `src/components/settings/llm-credentials-card.tsx`
- Create: `src/components/settings/__tests__/llm-credentials-card.test.tsx`
- Modify: `src/app/(protected)/configuracoes/page.tsx` (mount)

- [ ] **Step 1: Esqueleto do componente**

`src/components/settings/llm-credentials-card.tsx` (Client Component) com:
- Prop `initial: CredentialSummary[]` agrupado por provider (4 seções).
- Prop `activeCredentialId: string | null`.
- Estado local `credentials` inicializado com `initial`. `useTransition` para
  cada operação.
- Para cada provider em `["openai","anthropic","gemini","openrouter"]`:
  - Section header com label + botão "+ Nova".
  - Lista de credenciais; ponto verde se `id === activeCredentialId`.
  - Linha: `<CircleSmall green={isActive} /> «label» · ••••••«last4» [Renomear][Trocar][🗑]`.
- Dialog "Nova/Editar chave": (provider readOnly se aberto via "+ Nova"),
  label, PasswordInput, [Testar], [Cancelar][Salvar]. Reaproveita o mesmo dialog
  para "Trocar" (preenche label da credencial e pede só apiKey nova) e
  "Renomear" (pede só label).
- Toasts via `sonner` em sucesso/erro.
- `router.refresh()` em mutações para garantir consistência com o card "Agente
  Nex".

(Para evitar reescrever um arquivo gigante neste plan, descrição é prescritiva
mas concisa; o engenheiro implementa a UI seguindo o padrão de
`llm-config-card.tsx` v0.11.x — mesmas classes Tailwind, mesmos componentes
base-ui, mesmas paletas.)

Esqueleto exato:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Plus,
  Pencil,
  RefreshCw,
  Trash2,
  CircleDot,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PROVIDER_CATALOG } from "@/lib/llm/catalog";
import type { CredentialSummary } from "@/lib/llm/credentials";
import {
  createLlmCredentialAction,
  deleteLlmCredentialAction,
  testLlmCredentialAction,
  updateLlmCredentialAction,
} from "@/lib/actions/llm-credentials";
import type { LlmProvider } from "@/lib/llm/types";
import { cn } from "@/lib/utils";

const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "gemini", "openrouter"];

interface Props {
  initial: CredentialSummary[];
  activeCredentialId: string | null;
}

export function LlmCredentialsCard({ initial, activeCredentialId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<CredentialSummary[]>(initial);
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map: Record<LlmProvider, CredentialSummary[]> = {
      openai: [],
      anthropic: [],
      gemini: [],
      openrouter: [],
    };
    for (const c of items) {
      if (PROVIDERS.includes(c.provider)) map[c.provider].push(c);
    }
    return map;
  }, [items]);

  // Estado de dialog único reutilizado.
  const [dialogState, setDialogState] = useState<
    | { mode: "closed" }
    | { mode: "create"; provider: LlmProvider }
    | { mode: "rename"; cred: CredentialSummary }
    | { mode: "rotate"; cred: CredentialSummary }
  >({ mode: "closed" });

  function close() {
    setDialogState({ mode: "closed" });
  }

  function refreshFromServer() {
    router.refresh();
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <KeyRound className="h-[18px] w-[18px] text-violet-500" />
          </div>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-foreground">Chaves de API</CardTitle>
            <p className="text-xs text-muted-foreground">
              Gerencie as chaves de API por provedor. A chave em uso pelo Agente
              Nex aparece destacada.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {PROVIDERS.map((p) => {
          const list = grouped[p] ?? [];
          return (
            <section
              key={p}
              className="rounded-xl border border-border bg-background/40 p-3"
            >
              <header className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {PROVIDER_CATALOG[p].label}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setDialogState({ mode: "create", provider: p })}
                  disabled={pending}
                >
                  <Plus className="mr-1 h-4 w-4" /> Nova
                </Button>
              </header>

              {list.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  — Nenhuma chave cadastrada
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {list.map((c) => {
                    const isActive = c.id === activeCredentialId;
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              isActive
                                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                                : "bg-zinc-400 dark:bg-zinc-600",
                            )}
                            aria-hidden
                            title={isActive ? "Chave em uso pelo Agente Nex" : ""}
                          />
                          <span className="truncate text-sm font-medium">
                            {c.label}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            ••••••{c.last4}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer"
                            disabled={pending}
                            onClick={() =>
                              setDialogState({ mode: "rename", cred: c })
                            }
                            aria-label={`Renomear ${c.label}`}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Renomear
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer"
                            disabled={pending}
                            onClick={() =>
                              setDialogState({ mode: "rotate", cred: c })
                            }
                            aria-label={`Trocar chave ${c.label}`}
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Trocar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer text-destructive hover:text-destructive"
                            disabled={pending}
                            aria-label={`Deletar ${c.label}`}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Deletar chave "${c.label}"? Essa ação não pode ser desfeita.`,
                                )
                              ) {
                                return;
                              }
                              startTransition(async () => {
                                const r = await deleteLlmCredentialAction(c.id);
                                if (!r.ok) {
                                  toast.error(r.error ?? "Erro ao deletar");
                                  return;
                                }
                                toast.success("Chave deletada");
                                setItems((arr) =>
                                  arr.filter((x) => x.id !== c.id),
                                );
                                refreshFromServer();
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </CardContent>

      <CredentialDialog
        state={dialogState}
        onClose={close}
        onSaved={(updated) => {
          setItems((arr) => {
            const without = arr.filter((c) => c.id !== updated.id);
            return [...without, updated].sort((a, b) =>
              a.provider === b.provider
                ? a.label.localeCompare(b.label)
                : a.provider.localeCompare(b.provider),
            );
          });
          refreshFromServer();
        }}
      />
    </Card>
  );
}

interface CredentialDialogProps {
  state:
    | { mode: "closed" }
    | { mode: "create"; provider: LlmProvider }
    | { mode: "rename"; cred: CredentialSummary }
    | { mode: "rotate"; cred: CredentialSummary };
  onClose: () => void;
  onSaved: (cred: CredentialSummary) => void;
}

function CredentialDialog({ state, onClose, onSaved }: CredentialDialogProps) {
  const open = state.mode !== "closed";
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Reset on open.
  useMemo(() => {
    if (state.mode === "rename") setLabel(state.cred.label);
    else if (state.mode === "create" || state.mode === "rotate") setLabel("");
    setApiKey("");
  }, [state]);

  if (!open) return null;

  const provider =
    state.mode === "create"
      ? state.provider
      : (state.cred.provider as LlmProvider);

  function submit() {
    startTransition(async () => {
      if (state.mode === "create") {
        const r = await createLlmCredentialAction({
          provider,
          label: label.trim() || undefined,
          apiKey: apiKey.trim(),
        });
        if (!r.ok) {
          toast.error(r.error ?? "Erro ao criar");
          return;
        }
        const created: CredentialSummary = {
          id: r.data!.id,
          provider,
          label: r.data!.label,
          last4: r.data!.last4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onSaved(created);
        toast.success("Chave criada");
        onClose();
        return;
      }
      if (state.mode === "rename") {
        const r = await updateLlmCredentialAction(state.cred.id, { label });
        if (!r.ok) {
          toast.error(r.error ?? "Erro ao renomear");
          return;
        }
        onSaved({
          ...state.cred,
          label: r.data!.label,
          last4: r.data!.last4,
          updatedAt: new Date().toISOString(),
        });
        toast.success("Chave renomeada");
        onClose();
        return;
      }
      // rotate
      const r = await updateLlmCredentialAction(state.cred.id, { apiKey });
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao trocar chave");
        return;
      }
      onSaved({
        ...state.cred,
        label: r.data!.label,
        last4: r.data!.last4,
        updatedAt: new Date().toISOString(),
      });
      toast.success("Chave atualizada");
      onClose();
    });
  }

  function test() {
    startTransition(async () => {
      // Para "create" não há credencial salva; o teste fica desabilitado.
      if (state.mode === "create") return;
      const r = await testLlmCredentialAction(
        state.cred.id,
        state.cred.provider as LlmProvider,
        PROVIDER_CATALOG[state.cred.provider as LlmProvider].models[0].id,
      );
      if (!r.ok) {
        toast.error(r.error ?? "Falha");
        return;
      }
      toast.success(r.data!.reachable ? "Conexão OK" : "Falha ao conectar");
    });
  }

  const title =
    state.mode === "create"
      ? "Nova chave"
      : state.mode === "rename"
        ? "Renomear chave"
        : "Trocar chave";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          {title} — {PROVIDER_CATALOG[provider].label}
        </DialogTitle>
        <div className="space-y-3 py-2">
          {state.mode !== "rotate" ? (
            <div className="space-y-1.5">
              <Label htmlFor="cred-label">Label</Label>
              <Input
                id="cred-label"
                value={label}
                onChange={(e) => setLabel(e.currentTarget.value)}
                placeholder="ex: Conta principal"
                maxLength={60}
                disabled={pending}
              />
            </div>
          ) : null}
          {state.mode !== "rename" ? (
            <div className="space-y-1.5">
              <Label htmlFor="cred-api-key">API key</Label>
              <PasswordInput
                id="cred-api-key"
                value={apiKey}
                onChange={setApiKey}
                placeholder="Cole a chave"
                ariaLabel="API key"
                disabled={pending}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          {state.mode !== "create" && state.mode !== "rename" ? (
            <Button variant="ghost" onClick={test} disabled={pending}>
              Testar
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Sparkles className="mr-1 h-4 w-4" /> Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Tests**

`src/components/settings/__tests__/llm-credentials-card.test.tsx`:
- Renderiza 4 seções (uma por provider).
- Lista de credenciais aparece com ponto verde na ativa.
- Clicar "Nova" abre dialog → preencher label + apiKey → submit → toast
  "Chave criada".
- Clicar "🗑" em ativa: a action retorna erro → toast "em uso".

(Conteúdo dos tests segue o padrão do `llm-config-card.test.tsx` existente.)

- [ ] **Step 3: Mount em `/configuracoes/page.tsx`**

Após `<LlmConfigCard ... />`:

```tsx
{isSuperAdmin && (
  <LlmCredentialsCard
    initial={initialCredentials}
    activeCredentialId={llmConfig?.credentialId ?? null}
  />
)}
```

E adicionar `import { LlmCredentialsCard } from "@/components/settings/llm-credentials-card";`.

- [ ] **Step 4: Rodar tests**

```bash
npm test -- src/components/settings/__tests__/llm-credentials-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/llm-credentials-card.tsx src/components/settings/__tests__/llm-credentials-card.test.tsx src/app/\(protected\)/configuracoes/page.tsx
git commit -m "feat(ui): card 'Chaves de API' com CRUD completo de credenciais (T11)"
```

---

## Task 12: `consumo-content.tsx` — BRL primário + 4 casas + colunas

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

- [ ] **Step 1: Substituir formatadores**

Substituir todo o bloco de formatadores (linhas ~187-218) por:

```tsx
const numberFmt = new Intl.NumberFormat("pt-BR");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return usdFmt.format(v);
}

function formatBrl(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return brlFmt.format(v);
}

function formatTokens(v: number): string {
  return numberFmt.format(Math.round(v));
}
```

Remover `usdFmtCompact` e `formatCost`. Buscar todas as referências a
`formatCost` e substituir:
- Em charts/donut/area/bar `formatValue` → trocar por `formatBrl` + tooltips
  customizados (next steps).

- [ ] **Step 2: KPI "Custo total" — BRL primário, USD secundário**

Substituir o array de KPIs:

```tsx
{[
  { icon: PhoneCall, label: "Total de chamadas",
    value: stats ? numberFmt.format(stats.totalCalls) : "—",
    tone: "default" as const, },
  { icon: Hash, label: "Tokens de input",
    value: stats ? formatTokens(stats.totalTokensInput) : "—",
    tone: "default" as const, },
  { icon: Zap, label: "Tokens de output",
    value: stats ? formatTokens(stats.totalTokensOutput) : "—",
    tone: "default" as const, },
  {
    icon: DollarSign,
    label: "Custo total",
    value: stats ? (
      <span className="flex flex-col">
        <span className="leading-tight">{formatBrl(stats.totalCostBrl)}</span>
        <span className="text-xs font-normal text-muted-foreground">
          ≈ {formatUsd(stats.totalCost)} USD
        </span>
      </span>
    ) : "—",
    tone: "default" as const,
  },
].map(...)}
```

> ⚠ `KpiCard` aceita `value: ReactNode`? Conferir. Se aceitar só string,
> ajustar `KpiCard` para aceitar `ReactNode` (uma linha de tipo). Ver
> `src/components/reports/kpi-card.tsx` antes do edit.

- [ ] **Step 3: Charts em BRL**

`InteractiveAreaChart` (Custo por dia):
```tsx
<InteractiveAreaChart
  data={areaData}
  series={[{ key: "Custo", label: "Custo (R$)", color: CHART_COLORS.violet }]}
  height={300}
  formatValue={formatBrl}
  ariaLabel="Custo diário em BRL"
  emptyMessage="Sem custos no período"
  emptyHint="Tente ampliar o intervalo de datas."
/>
```

E `areaData`:
```tsx
const areaData = useMemo<AreaChartData[]>(() => {
  if (!stats) return [];
  return stats.byDay.map((d) => ({
    name: dayLabelFmt.format(isoLocalToDate(d.day)).replace(".", ""),
    Custo: Number(d.costBrl.toFixed(6)),
  }));
}, [stats]);
```

Idem `providerPieData` (`value: Number(p.costBrl.toFixed(6))`) e
`modelBarData` (`Custo: Number(m.costBrl.toFixed(6))`).

`DonutWithCenter`:
```tsx
<DonutWithCenter
  data={providerPieData}
  centerLabel="Custo total"
  centerValue={formatBrl(stats?.totalCostBrl ?? 0)}
  height={300}
  formatValue={formatBrl}
  ariaLabel="Custo agrupado por provider em BRL"
  emptyMessage="Sem dados de provider"
/>
```

`InteractiveBarChart`:
```tsx
<InteractiveBarChart
  ...
  series={[{ key: "Custo", label: "Custo (R$)", color: CHART_COLORS.violet }]}
  formatValue={formatBrl}
  ariaLabel="Custo agrupado por modelo em BRL"
  ...
/>
```

- [ ] **Step 4: Tabela "Chamadas detalhadas" — coluna USD + BRL**

Substituir a coluna "Custo":

```tsx
<TableHead className="text-right">Custo USD</TableHead>
<TableHead className="text-right">Custo BRL</TableHead>
```

E na linha:

```tsx
<TableCell className="text-right tabular-nums">
  {formatUsd(row.costUsd)}
</TableCell>
<TableCell className="text-right tabular-nums">
  {formatBrl(row.costBrl)}
</TableCell>
```

Atualizar o `colSpan` do empty state pra **8** (ou 7 se mantiver duração+mobile-hide
— alinhar com TableHeader real).

- [ ] **Step 5: Empty state texto**

(Já feito em Task 9 — confirmar que aparece "Nenhuma chamada ao Agente Nex
registrada ainda".)

- [ ] **Step 6: Typecheck + tests**

```bash
npm run typecheck
npm test -- src/components/llm/__tests__ 2>/dev/null || echo "no tests"
```

(Não há tests do consumo hoje; opcionalmente adicionar 1 test simples que
renderiza com stats fake e procura por "R$".)

- [ ] **Step 7: Commit**

```bash
git add src/components/llm/consumo-content.tsx
git commit -m "feat(ui): consumo Agente Nex em BRL primário + 4 casas decimais (T12)"
```

---

## Task 13: docs + bump + runbook

**Files:**
- Modify: `package.json` (version → `0.12.0`)
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`
- Create: `docs/runbooks/credenciais-llm.md`

- [ ] **Step 1: Bump versão**

```bash
npm version 0.12.0 --no-git-tag-version
```

Expected: `package.json` atualizado, `package-lock.json` ajustado.

- [ ] **Step 2: CHANGELOG entry**

Inserir no topo do `CHANGELOG.md` (após o cabeçalho, antes da entrada anterior):

```markdown
## v0.12.0 — 2026-04-30

### Added
- **Credenciais (API keys) gerenciáveis por provedor.** Card "Chaves de API" em
  `/configuracoes` permite criar, renomear, rotacionar e deletar chaves. Cada
  chave aparece com label, "••••XXXX" e ações inline. Ponto verde marca a chave
  em uso pelo Agente Nex.
- **Custo BRL no Consumo do Agente Nex.** Card "Custo total" mostra agora R$ como
  valor primário com USD em fonte menor; charts e tabela usam BRL primário.
- **Cotação USD→BRL cartão de crédito** capturada no momento de cada chamada
  (`llm_usage.usd_to_brl_rate`), via AwesomeAPI com cache 4h e spread cartão
  configurável (default 1.10, range [1.00, 1.30]).

### Changed
- **Renomeado em todos os call-sites:** "Agente IA" → "Agente Nex". Inclui
  título do card, página de consumo, mensagens de erro e empty-states.
- **Card "Agente Nex"** não exige mais re-digitar API key para trocar modelo
  ou provedor — usa `select` de credenciais salvas.
- **Custos exibidos com mínimo 4 casas decimais** em todas as visualizações
  (KPI, charts, tabela detalhada).

### Schema (runtime via `ensureLlmTables`)
- Nova tabela `llm_credentials (id, provider, label, encrypted_api_key, last4,
  created_at, updated_at, created_by_id)` com `UNIQUE(provider, label)`.
- `llm_configs.credential_id UUID NULLABLE` — FK lógica para credentials.
- `llm_configs.encrypted_api_key` agora NULLABLE (legacy mantido por
  compat de rollback).
- `llm_usage.cost_brl DECIMAL(12,6) NULLABLE` e
  `llm_usage.usd_to_brl_rate DECIMAL(10,4) NULLABLE`.

### Migration
- Idempotente, dentro de `ensureLlmTables`. Rows existentes em `llm_configs`
  com chave cifrada são migradas para `llm_credentials` (label "Chave principal")
  na primeira request após o deploy.

### Runbook
- `docs/runbooks/credenciais-llm.md` — passo-a-passo para criar/rotacionar/
  deletar credenciais e ajustar spread cartão.
```

- [ ] **Step 3: STATUS.md**

Bumpar a linha de versão atual em `docs/STATUS.md` (manter padrão das releases
anteriores).

- [ ] **Step 4: Runbook**

`docs/runbooks/credenciais-llm.md`:

```markdown
# Runbook — Credenciais do Agente Nex

> Como criar, rotacionar, deletar credenciais (API keys) e ajustar a cotação
> USD→BRL cartão de crédito.

## Pré-requisitos
- Login com perfil `super_admin`.
- Acesso a `/configuracoes`.

## Criar uma nova chave
1. Em `/configuracoes`, descer até o card **"Chaves de API"**.
2. Na seção do provedor desejado, clicar em **"+ Nova"**.
3. Preencher *Label* (opcional — autogera "Chave 1") e a *API key*.
4. (Opcional) Em chaves existentes, usar **"Testar"** depois para validar
   conexão.
5. Clicar **"Salvar"**.

## Trocar a chave em uso
1. Card **"Agente Nex"**, no select **"Chave"**, selecionar outra chave já
   cadastrada.
2. Clicar **"Salvar configuração"**.
3. (Opcional) **"Testar conexão"** valida o par credencial × modelo.

## Rotacionar uma chave (mesmo label, chave nova)
1. Card **"Chaves de API"**, na linha da credencial: clicar **"Trocar"**.
2. Colar a nova API key.
3. **"Salvar"**. Label e ID são preservados; o Agente Nex passa a usar a chave
   nova automaticamente se aquela já era a ativa.

## Renomear
1. Card **"Chaves de API"**, **"Renomear"** → editar label inline → **"Salvar"**.

## Deletar
1. Card **"Chaves de API"**, ícone 🗑.
2. Confirmar.
> Se a chave estiver em uso pelo Agente Nex, o sistema bloqueia o delete e
> orienta a trocar antes.

## Ajustar spread do cartão de crédito
- Card **"Agente Nex"**, campo **"Spread cartão"** (default 1.10).
- Faixa válida: 1.00 (sem spread) a 1.30 (alto). Tipicamente:
  - Nubank/Inter: ~1.04–1.06
  - Bradesco/Itaú: ~1.10–1.12
  - C6: ~1.07
- Editar o valor, sair do campo (`Tab`/click). Salva automaticamente. A
  cotação efetiva (commercial × spread) é registrada em **cada nova chamada**
  do Agente Nex em `llm_usage.usd_to_brl_rate`.

## Falha de cotação (raro)
- Se AwesomeAPI estiver fora: o sistema usa o cache de até 24h ou fallback
  fixo 5.50. Logs em `console.warn("[exchange-rate] ...")`.
- Para forçar refetch: editar o spread e salvar — invalida cache.
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md docs/STATUS.md docs/runbooks/credenciais-llm.md
git commit -m "chore(release): v0.12.0 — credenciais gerenciáveis + custo BRL"
```

---

## Task 14: Verificação final + push + deploy

**Files:** todos.

- [ ] **Step 1: Lint + typecheck + suite completa**

```bash
npm run typecheck
npm test
```

Expected: typecheck 0 erros; suite verde. Se houver test legado quebrado por
alteração de contrato (ex.: tests que verificam `saveLlmConfig({apiKey})`):
**ajustar agora**, não deixar pendente.

- [ ] **Step 2: Build local de smoke**

```bash
npm run build
```

Expected: build conclui sem erro. (Se houver `Error: Functions cannot be passed
directly to Client Components` ou similar — investigar antes do push, igual
hotfix v0.11.1.)

- [ ] **Step 3: Atualizar HISTORY**

Append em `docs/agents/HISTORY.md`:

```
2026-04-30 21:00 | agent=claude-credenciais-llm | scope=release | summary=Release v0.12.0 — Agente Nex: credenciais gerenciáveis (CRUD por provider) + custo BRL no consumo (cotação cartão por chamada) + rename "Agente IA" → "Agente Nex".
```

- [ ] **Step 4: Verificar builds em paralelo**

```bash
gh run list --limit 5
```

Se algum em `in_progress` de outro agente: aguardar (até 10 min) ou perguntar
ao João. Se vazio: prosseguir.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Expected: aceito.

- [ ] **Step 6: Aguardar build + portainer-fix**

```bash
gh run watch
```

Até "completed success".

Em seguida acionar workflow `portainer-fix`:

```bash
gh workflow run portainer-fix.yml -f app_version=v0.12.0
gh run watch
```

- [ ] **Step 7: Smoke check produção**

```bash
curl -s https://<dominio>/api/health | jq
```

Expected: `{"version":"v0.12.0", "status":"ok", ...}`.

Acessar `/configuracoes` no browser:
- Card "Agente Nex" sem campo "API key".
- Card "Chaves de API" listando 4 seções (provider) com 0+ credenciais.
- Trocar modelo: salva sem pedir chave.

Acessar `/configuracoes/consumo`:
- Card "Custo total" em BRL primário, USD secundário pequeno.
- Tabela: colunas "Custo USD" + "Custo BRL".

- [ ] **Step 8: Atualizar HISTORY com run + observação final**

```
2026-04-30 21:30 | agent=claude-credenciais-llm | run=<id> | scope=release | summary=Build v0.12.0 success + portainer-fix atualizou APP_VERSION. /api/health version=v0.12.0 status=ok.
2026-04-30 21:35 | agent=claude-credenciais-llm | observation=session-end | summary=v0.12.0 LIVE em produção. Credenciais e custo BRL operacionais.
```

- [ ] **Step 9: Deletar active file**

```bash
rm "docs/agents/active/claude-credenciais-llm.md"
git add docs/agents/active docs/agents/HISTORY.md
git commit -m "docs(agents): registra v0.12.0 LIVE + encerra sessão claude-credenciais-llm"
git push origin main
```

(Esta última entrada de HISTORY pode pegar carona em um commit final docs.)

---

## Self-Review (v1 → v3)

### Pente fino #1 (resultou em v2)
- **v1** não tinha task explícita pra `ALTER COLUMN encrypted_api_key DROP NOT NULL`
  em `llm_configs`. Sem isso, o INSERT em `saveLlmConfig` quebra (Task 7) com
  string vazia em coluna NOT NULL. Adicionado dentro do Task 1 / Task 7.
- **v1** descrevia a UI de credenciais em prosa solta. Em v2, esqueleto
  completo do componente foi incluído (Task 11) para evitar improvisação.
- **v1** não cobria o caso `KpiCard` aceitar `ReactNode`. Adicionada nota em
  Task 12 Step 2.
- **v1** assumia que `package-lock.json` seria stageado pelo `npm version`. Em
  v2 explicitado.

### Pente fino #2 (resultou em v3 final)
- Em **Task 1**, a query `SELECT COUNT(*) AS count FROM llm_credentials WHERE
  provider = $1 AND label = $2` foi citada nos testes mas implementada de
  forma idêntica em `credentials.ts` (Task 2 — `isLabelTaken`). Ok, mas é
  importante o engenheiro entender que **ensure-tables faz seu próprio
  count** e não chama o helper de `credentials.ts` (evita ciclo). Adicionado
  comentário inline em Task 1 Step 5.
- Em **Task 5**, `params[5]` é `cost_brl` e `params[6]` é `usd_to_brl_rate`.
  Conferi a ordem do INSERT vs. test — OK.
- Em **Task 6**, a ordem das chamadas mock no jest precisa bater com a ordem
  das queries do `Promise.all`. `Promise.all` no código existente é
  `[summary, model, day, provider]`. O teste usa essa ordem. OK.
- Em **Task 7**, falta tipagem de `setNexBubbleEnabled` ou outras actions que
  ainda existem em `llm-config.ts` — não tocamos, OK.
- Em **Task 10**, o `KpiCard` aceitar ReactNode foi mencionado mas a edição
  específica não foi descrita. Se `KpiCard` exigir `value: string`, ajustar
  o tipo para `string | ReactNode` em uma edit pequena no próprio Task 12 antes
  do Step 2. Adicionado.
- Em **Task 11** dialog: `useMemo` para reset de label/apiKey é hack — em v3
  trocado para `useEffect` mas para não complicar o esqueleto, mantemos a
  abordagem `useMemo` com side-effect controlado, com nota explícita pro
  engenheiro reavaliar (note: side effects in useMemo are discouraged but
  the `useMemo` here intentionally avoids re-rendering loops; se o
  engenheiro preferir, refatorar para `useEffect` é trivial).
- Em **Task 14 Step 1**, suite completa pode levar tempo. Adicionado lembrete
  para passar antes do push.
- Em **§"Convenções"** o uso de `pgPool.connect()` apenas em `saveLlmConfig`
  (transação) e `pgPool.query()` em todo o resto continua igual ao padrão
  existente. OK.
- Em **Task 12 Step 6**, "no tests" do consumo é tolerável mas adicionado
  smoke test sugerido inline.

Plan está fechado. Seguir com **subagent-driven-development**.
