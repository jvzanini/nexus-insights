# Empresa Ativa Global Implementation Plan (v0.21.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a empresa ativa do `AccountSwitcher` a fonte ÚNICA e GLOBAL de escopo: hardening do helper (fail-closed), `assertAccountAccess` em todas as 8 pages, 3 novas tools read-only do Nex e injeção de contexto da empresa no system prompt do Nex.

**Architecture:** `getActiveAccountId(user)` envolto em `cache()` valida acesso e fail-closed na primeira conta permitida (não Matrix hardcoded). Cada page que lê o helper chama também `assertAccountAccess` (defense-in-depth). 3 novas tools (`get_active_company`, `get_integrations_status`, `get_nex_config_summary`) ampliam o conhecimento do Nex sobre a empresa ativa. `buildActiveCompanyContext` injeta nome da empresa no system prompt em `run-nex.ts` (sem tocar `prompt.ts` — coordenação com `claude-nex-suite-polish-v020`).

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind + Prisma 7 + Postgres + BullMQ. Tests: Jest + jest-mock-extended.

**Spec source-of-truth:** `docs/superpowers/specs/2026-05-02-empresa-ativa-global-design.md` (v3 final).

**Multi-agent coordination:**
- `claude-conversas-v019` toca `src/app/(protected)/relatorios/conversas/page.tsx` — minha edição lá é mínima (1 linha) mas alto risco; **fica para o final** (Task 4h).
- `claude-nex-suite-polish-v020` toca `src/lib/nex/prompt.ts` e `prisma/schema.prisma` — **eu não toco** esses; injeto contexto em `run-nex.ts` em vez de `prompt.ts`.
- `claude-t10-filter-chip-list-popover` — só novos arquivos isolados, sem conflito.

**File map:**

```
[NEW]    src/lib/llm/agent/active-company-context.ts
[NEW]    src/lib/reports/__tests__/active-account.test.ts
[NEW]    src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
[NEW]    src/lib/llm/agent/__tests__/active-company-context.test.ts
[NEW]    docs/runbooks/escopo-por-empresa.md
[MOD]    src/lib/reports/active-account.ts (assinatura + cache + error)
[MOD]    src/app/(protected)/layout.tsx
[MOD]    src/app/(protected)/dashboard/page.tsx
[MOD]    src/app/(protected)/relatorios/{distribuicao,equipe,mensagens-nao-respondidas,origem-ia,performance,visao-geral,conversas}/page.tsx
[MOD]    src/lib/actions/nex-chat.ts
[MOD]    src/lib/llm/agent/run-nex.ts
[MOD]    src/lib/llm/tools/definitions.ts
[MOD]    src/lib/llm/tools/executor.ts
[MOD]    package.json (0.18.0 → 0.21.0; ajustar se v0.19/v0.20 mergeou)
[MOD]    CHANGELOG.md
[MOD]    docs/STATUS.md
```

**Build green policy:** as Tasks 1–4 deixam typecheck QUEBRADO localmente até T4 terminar (TDD). Não pushar até T12. CI só roda no push.

---

## Task 1: Refactor `getActiveAccountId(user)` com fail-closed e cache

**Files:**
- Modify: `src/lib/reports/active-account.ts`
- Test: Create `src/lib/reports/__tests__/active-account.test.ts`

- [ ] **Step 1.1: Escrever testes failing**

```ts
// src/lib/reports/__tests__/active-account.test.ts
import { cookies } from "next/headers";
import {
  getActiveAccountId,
  NoAccessibleAccountError,
} from "@/lib/reports/active-account";
import * as tenant from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

jest.mock("next/headers");
jest.mock("@/lib/tenant");
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
}));

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockedGetAccessibleAccountIds = tenant.getAccessibleAccountIds as jest.MockedFunction<
  typeof tenant.getAccessibleAccountIds
>;

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "u1@x.com",
    name: "User 1",
    platformRole: "viewer",
    accountIds: [2, 9],
    isOwner: false,
    avatarUrl: null,
    teamIds: [],
    ...overrides,
  } as AuthUser;
}

function setCookie(value: string | undefined) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  mockedCookies.mockResolvedValue({ get } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe("getActiveAccountId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("retorna primeira conta permitida quando cookie ausente (não 9 hardcoded)", async () => {
    setCookie(undefined);
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(2);
  });

  it("retorna cookie quando válido e user tem acesso", async () => {
    setCookie("9");
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(9);
  });

  it("ignora cookie inválido e cai pra primeira permitida", async () => {
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    for (const bad of ["abc", "-1", "0", ""]) {
      setCookie(bad);
      expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(2);
    }
  });

  it("cookie aponta pra conta proibida → primeira permitida", async () => {
    setCookie("99");
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(2);
  });

  it("user sem nenhuma conta acessível → throws NoAccessibleAccountError", async () => {
    setCookie(undefined);
    mockedGetAccessibleAccountIds.mockResolvedValue([]);
    await expect(getActiveAccountId(makeUser({ accountIds: [] }))).rejects.toBeInstanceOf(
      NoAccessibleAccountError,
    );
  });
});
```

- [ ] **Step 1.2: Rodar — devem falhar**

Run: `npx jest src/lib/reports/__tests__/active-account.test.ts`
Expected: FAIL — `NoAccessibleAccountError` não exportado.

- [ ] **Step 1.3: Implementar refactor**

```ts
// src/lib/reports/active-account.ts
import { cookies } from "next/headers";
import { cache } from "react";
import { getAccessibleAccountIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const COOKIE_NAME = "nexus_active_account";

/**
 * Lançado quando o user não tem acesso a NENHUMA conta. Capturado
 * em `(protected)/layout.tsx` para redirecionar com mensagem amigável.
 */
export class NoAccessibleAccountError extends Error {
  constructor(userId: string) {
    super(`User ${userId} não tem acesso a nenhuma conta`);
    this.name = "NoAccessibleAccountError";
  }
}

/**
 * Resolve a conta ativa para o user corrente:
 *   1. Lê cookie `nexus_active_account`.
 *   2. Verifica se a conta do cookie está em `getAccessibleAccountIds(user)`.
 *   3. Se sim → retorna. Se não → primeira permitida (fail-closed).
 *   4. Se nenhuma → throws NoAccessibleAccountError.
 *
 * Envolto em `cache()` do React → dedupe por request RSC. Layout chama
 * 1× → 8 pages chamam 1× cada (mas todas dentro do mesmo render tree
 * compartilham o cache).
 *
 * NOTA: substituiu a versão pre-v0.21 que devolvia DEFAULT_ACCOUNT_ID=9
 * (Matrix) sem checar acesso — leak latente para users sem cookie ou
 * com cookie stale.
 */
export const getActiveAccountId = cache(async (user: AuthUser): Promise<number> => {
  const allowed = await getAccessibleAccountIds(user);

  if (allowed.length === 0) {
    throw new NoAccessibleAccountError(user.id);
  }

  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const cookieAccountId =
    Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  if (cookieAccountId !== null && allowed.includes(cookieAccountId)) {
    return cookieAccountId;
  }

  return allowed[0];
});
```

- [ ] **Step 1.4: Rodar testes — devem passar**

Run: `npx jest src/lib/reports/__tests__/active-account.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 1.5: Typecheck**

Run: `npm run typecheck`
Expected: ❌ FAIL nos 10 callers (assinatura mudou). É esperado — corrigido nas Tasks 2–4.

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/reports/active-account.ts src/lib/reports/__tests__/active-account.test.ts
git commit -m "feat(tenant): T1 — getActiveAccountId(user) fail-closed + cache + NoAccessibleAccountError

Substitui o helper antigo (DEFAULT_ACCOUNT_ID=9 hardcoded) por uma
versão que valida acesso via getAccessibleAccountIds e devolve a
primeira conta permitida em vez de Matrix. Lança NoAccessibleAccountError
se user sem nenhuma conta. Envolto em cache() do React para dedupe.

Tests: 5/5 passing.
Typecheck: BREAKING (callers serão atualizados em T2-T4)."
```

---

## Task 2: Atualizar `(protected)/layout.tsx` para usar o helper

**Files:**
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 2.1: Editar layout — substituir bloco de resolução**

Remover:
- `const ACCOUNT_COOKIE = "nexus_active_account";`
- `const DEFAULT_ACCOUNT_ID = 9;`
- `const cookieStore = await cookies();` ... `let activeAccountId: number; if (cookieAccountId && allowedIds.has(...)) ...` (todo o bloco).

Adicionar:

```ts
import {
  getActiveAccountId,
  NoAccessibleAccountError,
} from "@/lib/reports/active-account";
import { getCurrentUser } from "@/lib/auth-helpers";

// dentro do component, ANTES de `availableAccounts`:
const authUser = await getCurrentUser();
if (!authUser) redirect("/login");

// DEPOIS de `availableAccounts` resolvido:
let activeAccountId: number;
try {
  activeAccountId = await getActiveAccountId(authUser);
} catch (err) {
  if (err instanceof NoAccessibleAccountError) {
    redirect("/login?reason=no-access");
  }
  throw err;
}
```

Também remover `import { cookies } from "next/headers";` se não for mais usado.

- [ ] **Step 2.2: Typecheck do layout**

Run: `npm run typecheck`
Expected: layout.tsx OK; pages ainda quebram.

- [ ] **Step 2.3: Smoke local**

Run: `npm run dev`
Expected: login funciona; sidebar mostra empresa correta; switcher troca conta.

- [ ] **Step 2.4: Commit**

```bash
git add src/app/(protected)/layout.tsx
git commit -m "feat(tenant): T2 — layout.tsx usa getActiveAccountId(user) (DRY)

Removida duplicação do fallback (cookie → DEFAULT 9 → first → 9).
Layout chama o mesmo helper das pages — fonte ÚNICA. Captura
NoAccessibleAccountError → redirect /login?reason=no-access."
```

---

## Task 3: Atualizar `nex-chat.ts`

**Files:**
- Modify: `src/lib/actions/nex-chat.ts`

- [ ] **Step 3.1: Patch**

```ts
// imports (adicionar)
import { NoAccessibleAccountError } from "@/lib/reports/active-account";
import { getCurrentUser } from "@/lib/auth-helpers";

// dentro de sendNexMessage — substituir:
//    const accountId = await getActiveAccountId();
// por:
const authUser = await getCurrentUser();
if (!authUser) return { ok: false, error: "Não autenticado" };
let accountId: number;
try {
  accountId = await getActiveAccountId(authUser);
} catch (err) {
  if (err instanceof NoAccessibleAccountError) {
    return { ok: false, error: "Sem acesso a nenhuma conta" };
  }
  throw err;
}

// idem em testNexPromptAction
```

Também propagar `userName: authUser.name ?? null` em `runNexAgent({ ... })` se T6 já passou. (Se T3 vier antes de T6, deixar a passagem do userName para T6 — ver dependência abaixo.)

- [ ] **Step 3.2: Typecheck**

Run: `npm run typecheck`
Expected: nex-chat.ts OK; pages ainda quebram.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/actions/nex-chat.ts
git commit -m "feat(tenant): T3 — nex-chat.ts usa getActiveAccountId(user)

sendNexMessage e testNexPromptAction usam getCurrentUser e tratam
NoAccessibleAccountError com { ok: false, error }."
```

---

## Task 4: Atualizar 8 pages — assertAccountAccess + nova assinatura

**Files:** 8 pages — uma sub-task por page.

⚠️ **Antes de iniciar T4h (conversas)**: rodar `git log -1 --format='%cr' -- src/app/\(protected\)/relatorios/conversas/page.tsx`. Se ≤30 min, **PARAR** e coordenar com `claude-conversas-v019`. Caso contrário, prosseguir.

**Patch comum a todas:** substituir o bloco

```ts
const accountId = await getActiveAccountId();
```

por

```ts
const authUser = await getCurrentUser();
if (!authUser) redirect("/login");
const accountId = await getActiveAccountId(authUser);
await assertAccountAccess(authUser, accountId);  // defense-in-depth
```

Imports a adicionar:

```ts
import { getCurrentUser } from "@/lib/auth-helpers";
import { assertAccountAccess } from "@/lib/tenant";
import { redirect } from "next/navigation";  // se ainda não importado
```

- [ ] **Step 4a: dashboard/page.tsx**
- [ ] **Step 4b: relatorios/distribuicao/page.tsx**
- [ ] **Step 4c: relatorios/equipe/page.tsx**
- [ ] **Step 4d: relatorios/mensagens-nao-respondidas/page.tsx**
- [ ] **Step 4e: relatorios/origem-ia/page.tsx**
- [ ] **Step 4f: relatorios/performance/page.tsx**
- [ ] **Step 4g: relatorios/visao-geral/page.tsx**
- [ ] **Step 4h: relatorios/conversas/page.tsx (com check de coordenação)**

- [ ] **Step 4.9: Typecheck + tests**

```bash
npm run typecheck    # 0 erros
npm test             # 0 regressões
```

- [ ] **Step 4.10: Commit (3 commits agrupados)**

```bash
# 4.10a — dashboard
git add src/app/(protected)/dashboard/page.tsx
git commit -m "feat(tenant): T4a — dashboard.page.tsx assertAccountAccess + helper(user)"

# 4.10b — 6 relatórios sem conversas
git add src/app/(protected)/relatorios/{distribuicao,equipe,mensagens-nao-respondidas,origem-ia,performance,visao-geral}/page.tsx
git commit -m "feat(tenant): T4b — 6 relatórios assertAccountAccess + helper(user)"

# 4.10c — conversas
git add src/app/(protected)/relatorios/conversas/page.tsx
git commit -m "feat(tenant): T4c — conversas.page.tsx assertAccountAccess + helper(user)"
```

---

## Task 5: Helper `buildActiveCompanyContext` + tests

**Files:**
- Create: `src/lib/llm/agent/active-company-context.ts`
- Test: Create `src/lib/llm/agent/__tests__/active-company-context.test.ts`

- [ ] **Step 5.1: Escrever tests failing**

```ts
// src/lib/llm/agent/__tests__/active-company-context.test.ts
import { buildActiveCompanyContext } from "../active-company-context";
import * as tenant from "@/lib/tenant";

jest.mock("@/lib/tenant");
const mockedGetKnownAccounts = tenant.getKnownAccounts as jest.MockedFunction<
  typeof tenant.getKnownAccounts
>;

describe("buildActiveCompanyContext", () => {
  beforeEach(() => jest.clearAllMocks());

  it("inclui nome da empresa e accountId", async () => {
    mockedGetKnownAccounts.mockResolvedValue([
      { id: 9, name: "Matrix Fitness Group" },
      { id: 2, name: "Invest Soluções" },
    ]);
    const ctx = await buildActiveCompanyContext(9);
    expect(ctx).toContain("Matrix Fitness Group");
    expect(ctx).toContain("Account ID: 9");
    expect(ctx).toContain("CONTEXTO ATIVO");
  });

  it("fallback gracioso para ID desconhecido", async () => {
    mockedGetKnownAccounts.mockResolvedValue([{ id: 9, name: "Matrix" }]);
    const ctx = await buildActiveCompanyContext(99);
    expect(ctx).toContain("Empresa #99");
    expect(ctx).toContain("Account ID: 99");
  });

  it("inclui linha de user quando user passado", async () => {
    mockedGetKnownAccounts.mockResolvedValue([{ id: 9, name: "Matrix" }]);
    const ctx = await buildActiveCompanyContext(9, {
      name: "João Vitor Zanini",
      platformRole: "super_admin",
    });
    expect(ctx).toContain("João Vitor Zanini");
    expect(ctx).toMatch(/Super Admin|super_admin/i);
  });

  it("não quebra se getKnownAccounts falhar", async () => {
    mockedGetKnownAccounts.mockRejectedValue(new Error("DB down"));
    const ctx = await buildActiveCompanyContext(9);
    expect(ctx).toContain("Empresa #9");
    expect(ctx).toContain("CONTEXTO ATIVO");
  });
});
```

- [ ] **Step 5.2: Rodar — devem falhar**

Run: `npx jest src/lib/llm/agent/__tests__/active-company-context.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 5.3: Implementar**

```ts
// src/lib/llm/agent/active-company-context.ts
import "server-only";
import { getKnownAccounts } from "@/lib/tenant";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

interface UserMinimal {
  name?: string | null;
  platformRole?: string | null;
}

/**
 * Constrói o bloco "CONTEXTO ATIVO" do system prompt do Nex:
 *  - Nome e accountId da empresa.
 *  - (opcional) Identidade do user e role.
 *  - Inventário curto das tools que ampliam conhecimento sobre a plataforma.
 *
 * Falha gracioso: se `getKnownAccounts` lançar, usa "Empresa #N".
 * Nunca quebra o orquestrador.
 */
export async function buildActiveCompanyContext(
  accountId: number,
  user?: UserMinimal,
): Promise<string> {
  let companyName = `Empresa #${accountId}`;
  try {
    const known = await getKnownAccounts();
    const match = known.find((a) => a.id === accountId);
    if (match) companyName = match.name;
  } catch {
    // mantém fallback
  }

  const userLine = user?.name
    ? `Você está respondendo para ${user.name}${
        user.platformRole
          ? ` (${PLATFORM_ROLE_LABELS[user.platformRole as keyof typeof PLATFORM_ROLE_LABELS] ?? user.platformRole})`
          : ""
      } dentro desta empresa.`
    : null;

  const lines = [
    "═══ CONTEXTO ATIVO ═══",
    `Empresa: ${companyName}`,
    `Account ID: ${accountId}`,
    userLine,
    "",
    "Você responde SEMPRE no contexto desta empresa. Todas as tools de Chatwoot",
    "(query_conversations, query_messages, etc.) já filtram por este escopo automaticamente.",
    "",
    "Para responder sobre o estado da plataforma desta empresa, use:",
    "- get_active_company       → identidade da empresa e seu role",
    "- get_integrations_status  → integrações configuradas (Power BI, etc.)",
    "- get_nex_config_summary   → modelo de IA, KB, áudio, visibilidades",
    "",
    "NUNCA responda sobre outra empresa, mesmo que perguntem.",
    "═══",
  ].filter((l): l is string => l !== null);

  return lines.join("\n");
}
```

- [ ] **Step 5.4: Tests pass**

Run: `npx jest src/lib/llm/agent/__tests__/active-company-context.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/llm/agent/active-company-context.ts src/lib/llm/agent/__tests__/active-company-context.test.ts
git commit -m "feat(nex): T5 — buildActiveCompanyContext helper + tests 4/4"
```

---

## Task 6: Wire context em `run-nex.ts`

**Files:**
- Modify: `src/lib/llm/agent/run-nex.ts`
- Modify: `src/lib/actions/nex-chat.ts` (passar `userName`)

- [ ] **Step 6.1: Editar `RunNexInput`**

Adicionar campo opcional:

```ts
export interface RunNexInput {
  messages: ChatMessage[];
  accountId: number;
  userId?: string;
  userName?: string | null;       // NEW
  platformRole?: string | null;
  clientOverride?: ProviderClient | null;
  promptOverride?: string;
  isPlayground?: boolean;
}
```

- [ ] **Step 6.2: Importar e usar helper**

No topo:
```ts
import { buildActiveCompanyContext } from "./active-company-context";
```

Substituir o trecho que monta `conversation`:

```ts
const baseSystemPrompt = await resolveSystemPrompt(args.promptOverride);
const companyContext = await buildActiveCompanyContext(
  args.accountId,
  args.userId
    ? { name: args.userName ?? null, platformRole: args.platformRole ?? null }
    : undefined,
);
const systemPrompt = baseSystemPrompt + "\n\n" + companyContext;

const conversation: ChatMessage[] = [
  { role: "system", content: systemPrompt },
  ...args.messages,
];
```

- [ ] **Step 6.3: Atualizar `nex-chat.ts` (sendNexMessage e testNexPromptAction)**

Em ambos, ao chamar `runNexAgent({ ... })`, adicionar:

```ts
userName: authUser.name ?? null,
```

- [ ] **Step 6.4: Tests existentes não regridem**

Run: `npx jest src/lib/llm/agent/`
Expected: 0 regressões.

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/llm/agent/run-nex.ts src/lib/actions/nex-chat.ts
git commit -m "feat(nex): T6 — system prompt do Nex injeta CONTEXTO ATIVO

run-nex.ts compõe baseSystemPrompt + companyContext.
Não toca prompt.ts (coordenação com nex-suite-polish-v020 que está editando prompt.ts)."
```

---

## Task 7: Executor recebe `platformRole`

**Files:**
- Modify: `src/lib/llm/tools/executor.ts`
- Modify: `src/lib/llm/agent/run-nex.ts`

- [ ] **Step 7.1: Editar `executeTool`**

Mudar assinatura:

```ts
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  accountId: number,
  excludeMatrixIA: boolean = true,
  platformRole: string | null = null,    // NEW
): Promise<ToolExecutionResult> {
  // switch existente — sem mudança ainda; novas tools vão em T8/9/10
}
```

- [ ] **Step 7.2: Editar `run-nex.ts`**

Onde chama `executeTool(...)`, propagar `args.platformRole`:

```ts
const toolResult = await executeTool(
  tc.name,
  (tc.arguments ?? {}) as Record<string, unknown>,
  args.accountId,
  excludeMatrixIA,
  args.platformRole ?? null,
);
```

- [ ] **Step 7.3: Typecheck + tests**

```bash
npm run typecheck
npx jest src/lib/llm/
```

Expected: 0 erros, 0 regressões.

- [ ] **Step 7.4: Commit**

```bash
git add src/lib/llm/tools/executor.ts src/lib/llm/agent/run-nex.ts
git commit -m "feat(nex): T7 — executor.executeTool recebe platformRole (gating)"
```

---

## Task 8: Tool `get_active_company`

**Files:**
- Modify: `src/lib/llm/tools/{definitions,executor}.ts`
- Test: Create `src/lib/llm/tools/__tests__/executor-platform-tools.test.ts`

- [ ] **Step 8.1: Adicionar definição**

Append em `NEX_TOOLS` (`src/lib/llm/tools/definitions.ts`):

```ts
{
  name: "get_active_company",
  description:
    "Devolve a empresa (account Chatwoot) ativa para o usuário corrente, junto com role da plataforma. Use sempre que o usuário perguntar 'em qual empresa estou?', 'quem sou eu aqui?', 'qual conta?'.",
  parameters: { type: "object", properties: {} },
},
```

- [ ] **Step 8.2: Tests failing**

```ts
// src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
import { executeTool } from "../executor";
import * as tenant from "@/lib/tenant";

jest.mock("@/lib/tenant");
const mockedGetKnownAccounts = tenant.getKnownAccounts as jest.MockedFunction<
  typeof tenant.getKnownAccounts
>;

describe("get_active_company", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetKnownAccounts.mockResolvedValue([
      { id: 9, name: "Matrix Fitness Group" },
    ]);
  });

  it("retorna shape correto para super_admin", async () => {
    const r = await executeTool("get_active_company", {}, 9, true, "super_admin");
    expect(r.error).toBeUndefined();
    expect(r.result).toMatchObject({
      id: 9,
      name: "Matrix Fitness Group",
      platformRole: "super_admin",
      companyRole: null,
      isOwner: false,
    });
  });

  it("fallback para Empresa #X quando getKnownAccounts não conhece", async () => {
    mockedGetKnownAccounts.mockResolvedValue([]);
    const r = await executeTool("get_active_company", {}, 99, true, "viewer");
    expect((r.result as { name: string }).name).toBe("Empresa #99");
    expect((r.result as { platformRole: string }).platformRole).toBe("viewer");
  });
});
```

- [ ] **Step 8.3: Implementar**

Adicionar branch no switch do `executor.ts`:

```ts
case "get_active_company":
  return { result: await getActiveCompany(accountId, platformRole) };
```

E função:

```ts
import { getKnownAccounts } from "@/lib/tenant";

async function getActiveCompany(
  accountId: number,
  platformRole: string | null,
): Promise<{
  id: number;
  name: string;
  platformRole: string;
  companyRole: string | null;
  isOwner: boolean;
}> {
  let name = `Empresa #${accountId}`;
  try {
    const known = await getKnownAccounts();
    const match = known.find((a) => a.id === accountId);
    if (match) name = match.name;
  } catch {
    /* fallback */
  }
  return {
    id: accountId,
    name,
    platformRole: platformRole ?? "viewer",
    companyRole: null,    // v0.21 simplificação; UserCompanyMembership FK ausente
    isOwner: false,       // idem; follow-up
  };
}
```

- [ ] **Step 8.4: Tests pass**

Run: `npx jest src/lib/llm/tools/__tests__/executor-platform-tools.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/llm/tools/definitions.ts src/lib/llm/tools/executor.ts src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
git commit -m "feat(nex): T8 — tool get_active_company"
```

---

## Task 9: Tool `get_integrations_status`

**Files:** mesmos da T8.

- [ ] **Step 9.1: Adicionar definição**

```ts
{
  name: "get_integrations_status",
  description:
    "Lista integrações configuradas para a empresa ativa (Power BI, futuras), com contadores de profiles ativos/com erro. Use quando o usuário perguntar sobre integrações, Power BI, dashboards externos.",
  parameters: { type: "object", properties: {} },
},
```

- [ ] **Step 9.2: Tests failing**

```ts
// append em executor-platform-tools.test.ts
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    integrationProfile: {
      findMany: jest.fn(),
    },
  },
}));

const mockedFindMany = prisma.integrationProfile.findMany as jest.MockedFunction<
  typeof prisma.integrationProfile.findMany
>;

describe("get_integrations_status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("filtra IntegrationProfile pelo accountIdFilter", async () => {
    mockedFindMany.mockResolvedValue([
      { kind: "power_bi", status: "active", accountIdFilter: [9], lastSyncAt: new Date("2026-05-01T00:00Z") },
      { kind: "power_bi", status: "active", accountIdFilter: [2], lastSyncAt: new Date("2026-05-01T00:00Z") },
      { kind: "power_bi", status: "errored", accountIdFilter: null, lastSyncAt: null },
    ] as never);
    const r = await executeTool("get_integrations_status", {}, 9, true, "super_admin");
    const power = (r.result as { kindCounts: { power_bi: { total: number; active: number; errored: number } } }).kindCounts.power_bi;
    expect(power.total).toBe(2);    // 1 acc=9 + 1 null (cobre todas)
    expect(power.active).toBe(1);
    expect(power.errored).toBe(1);
  });

  it("viewer não vê lastSyncAt", async () => {
    mockedFindMany.mockResolvedValue([
      { kind: "power_bi", status: "active", accountIdFilter: [9], lastSyncAt: new Date() },
    ] as never);
    const r = await executeTool("get_integrations_status", {}, 9, true, "viewer");
    const power = (r.result as { kindCounts: { power_bi: { lastSyncAt?: string } } }).kindCounts.power_bi;
    expect(power.lastSyncAt).toBeUndefined();
  });
});
```

- [ ] **Step 9.3: Implementar**

Branch novo:

```ts
case "get_integrations_status":
  return { result: await getIntegrationsStatus(accountId, platformRole) };
```

Função:

```ts
import { prisma } from "@/lib/prisma";

interface KindCounter {
  total: number;
  active: number;
  errored: number;
  disabled: number;
  lastSyncAt?: string | null;   // só super_admin
}

async function getIntegrationsStatus(
  accountId: number,
  platformRole: string | null,
): Promise<{ kindCounts: Record<string, KindCounter> }> {
  const profiles = await prisma.integrationProfile.findMany({
    select: {
      kind: true,
      status: true,
      accountIdFilter: true,
      lastSyncAt: true,
    },
  });

  const filtered = profiles.filter((p) => {
    const filter = p.accountIdFilter as number[] | null;
    return !filter || filter.includes(accountId);
  });

  const includeOps = platformRole === "super_admin";
  const kindCounts: Record<string, KindCounter> = {};

  for (const p of filtered) {
    const k = p.kind;
    if (!kindCounts[k]) {
      kindCounts[k] = { total: 0, active: 0, errored: 0, disabled: 0 };
      if (includeOps) kindCounts[k].lastSyncAt = null;
    }
    const c = kindCounts[k];
    c.total += 1;
    // status comparado como string (Prisma enum vem como string). Equivalência segura.
    if (p.status === "active") c.active += 1;
    if (p.status === "errored") c.errored += 1;
    if (p.status === "disabled") c.disabled += 1;
    if (includeOps && p.lastSyncAt) {
      const candidate = p.lastSyncAt.toISOString();
      if (!c.lastSyncAt || candidate > c.lastSyncAt) c.lastSyncAt = candidate;
    }
  }

  return { kindCounts };
}
```

- [ ] **Step 9.4: Tests pass**

Run: `npx jest src/lib/llm/tools/__tests__/executor-platform-tools.test.ts`
Expected: 4/4 PASS (2 do T8 + 2 do T9).

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/llm/tools/definitions.ts src/lib/llm/tools/executor.ts src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
git commit -m "feat(nex): T9 — tool get_integrations_status (gating super_admin)"
```

---

## Task 10: Tool `get_nex_config_summary`

**Files:** mesmos da T8/9.

- [ ] **Step 10.1: Adicionar definição**

```ts
{
  name: "get_nex_config_summary",
  description:
    "Resumo da configuração do Agente Nex e da plataforma: provedor/modelo de IA ativo, KB ligada, áudio, visibilidades de bubble e relatórios. NÃO retorna chaves nem segredos.",
  parameters: { type: "object", properties: {} },
},
```

- [ ] **Step 10.2: Tests failing**

```ts
// append em executor-platform-tools.test.ts
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getKbDocsForPrompt } from "@/lib/nex/kb";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

jest.mock("@/lib/llm/get-active-config");
jest.mock("@/lib/nex/prompt");
jest.mock("@/lib/nex/kb");
jest.mock("@/lib/llm/get-nex-bubble-enabled");

describe("get_nex_config_summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveLlmConfig as jest.Mock).mockResolvedValue({ provider: "openai", model: "gpt-5-mini" });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({ kbEnabled: true, audioInputEnabled: true });
    (getKbDocsForPrompt as jest.Mock).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    (isNexBubbleEnabled as jest.Mock).mockResolvedValue(true);
  });

  it("retorna shape completo sem secrets", async () => {
    const r = await executeTool("get_nex_config_summary", {}, 9, true, "super_admin");
    const json = JSON.stringify(r.result);
    expect(json).not.toMatch(/sk-|api[_-]?key|secret/i);
    expect(r.result).toMatchObject({
      provider: "openai",
      model: "gpt-5-mini",
      kbEnabled: true,
      kbDocsCount: 2,
      audioInputEnabled: true,
      audioEffectivelyEnabled: true,
      bubbleEnabled: true,
    });
  });

  it("audioEffectivelyEnabled=false quando provider != openai", async () => {
    (getActiveLlmConfig as jest.Mock).mockResolvedValue({ provider: "anthropic", model: "claude" });
    const r = await executeTool("get_nex_config_summary", {}, 9, true, "super_admin");
    expect((r.result as { audioEffectivelyEnabled: boolean }).audioEffectivelyEnabled).toBe(false);
  });
});
```

- [ ] **Step 10.3: Implementar**

Branch novo:

```ts
case "get_nex_config_summary":
  return { result: await getNexConfigSummary(platformRole) };
```

Função:

```ts
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getKbDocsForPrompt } from "@/lib/nex/kb";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";
import { getVisibleReportKeys } from "@/lib/reports/visibility";

async function getNexConfigSummary(platformRole: string | null) {
  const role = platformRole ?? "viewer";
  const [llm, nex, kbDocs, bubbleEnabled, visibleKeys] = await Promise.all([
    getActiveLlmConfig().catch(() => null),
    getNexPromptConfig().catch(() => null),
    getKbDocsForPrompt().catch(() => [] as unknown[]),
    isNexBubbleEnabled().catch(() => false),
    getVisibleReportKeys(role).catch(() => new Set<string>()),
  ]);

  const reportsVisibility = {
    dashboard: visibleKeys.has("dashboard"),
    conversas: visibleKeys.has("conversas"),
    distribuicao: visibleKeys.has("distribuicao"),
    equipe: visibleKeys.has("equipe"),
    mensagensNaoRespondidas: visibleKeys.has("mensagens_nao_respondidas"),
    origemIa: visibleKeys.has("origem_ia"),
    performance: visibleKeys.has("performance"),
    visaoGeral: visibleKeys.has("visao_geral"),
  };

  return {
    provider: llm?.provider ?? null,
    model: llm?.model ?? null,
    kbEnabled: nex?.kbEnabled ?? false,
    kbDocsCount: kbDocs.length,
    audioInputEnabled: nex?.audioInputEnabled ?? false,
    audioEffectivelyEnabled:
      (nex?.audioInputEnabled ?? false) && llm?.provider === "openai",
    bubbleEnabled,
    nexBubbleVisibility: "all_users",  // v0.21 simplificação; refinar quando expor visibility por role
    reportsVisibility,
  };
}
```

- [ ] **Step 10.4: Tests pass**

Run: `npx jest src/lib/llm/tools/__tests__/executor-platform-tools.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/llm/tools/definitions.ts src/lib/llm/tools/executor.ts src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
git commit -m "feat(nex): T10 — tool get_nex_config_summary (sem secrets)"
```

---

## Task 11: Runbook `escopo-por-empresa.md`

**Files:**
- Create: `docs/runbooks/escopo-por-empresa.md`

- [ ] **Step 11.1: Escrever runbook**

Conteúdo (copiar e adaptar):

```markdown
# Runbook — Escopo por Empresa (canônico)

**Source-of-truth**: o `AccountSwitcher` no sidebar é a fonte ÚNICA da empresa ativa.
Cookie HttpOnly `nexus_active_account` (gravado por `switchAccount`) carrega o `accountId`.

## Tabela canônica (v0.21.0)

| Surface | Lê cookie? | Classificação | Notas |
|---|---|---|---|
| /dashboard | sim | per-company | assertAccountAccess obrigatório |
| /relatorios/* | sim | per-company | assertAccountAccess obrigatório |
| Nex chat / bubble | sim | per-company | sendNexMessage usa getActiveAccountId(user) |
| /agente-nex/{chaves,configuracao,consumo,prompt} | não | global | super_admin |
| /integracoes, /integracoes/power-bi | não | super_admin only | profiles têm accountIdFilter |
| /configuracoes/* | não | global | super_admin |
| /perfil | não | per-user | sem mudança |
| /usuarios | não | global | super_admin |

## Invariantes para qualquer NOVO caller que precise de accountId

```
1. const user = await getCurrentUser()
2. const accountId = await getActiveAccountId(user)        // helper valida acesso, fail-closed
3. await assertAccountAccess(user, accountId)              // defense in depth
4. query(accountId, ...)
```

Esta sequência é obrigatória.

## Comando de auditoria contínua

```bash
# Lista pages que chamam getActiveAccountId mas NÃO chamam assertAccountAccess.
# A lista deve ser vazia.
comm -23 \
  <(grep -rln "getActiveAccountId" src/app/\(protected\) | sort) \
  <(grep -rln "assertAccountAccess" src/app/\(protected\) | sort)
```

## Tools do Agente Nex relacionadas

- `get_active_company` → identidade + role.
- `get_integrations_status` → integrações configuradas.
- `get_nex_config_summary` → modelo de IA, KB, áudio, visibilidades.
```

- [ ] **Step 11.2: Commit**

```bash
git add docs/runbooks/escopo-por-empresa.md
git commit -m "docs(runbook): T11 — escopo-por-empresa (canônico per-company × global)"
```

---

## Task 12: Release v0.21.0

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `docs/agents/HISTORY.md`.

⚠️ **Pre-flight**:

```bash
git fetch origin main
git show origin/main:package.json | grep version
gh run list --limit 5
```

Se v0.19/v0.20 já mergeou e versão remota é `0.20.x`, OK pular pra `0.21.0`.
Se versão remota é `0.21.x` (alguém já bumpou), pular pra `0.22.0` e ajustar entradas.
Se há build em curso de outro agente, **esperar terminar** antes de pushar.

- [ ] **Step 12.1: Bump `package.json`**

```json
"version": "0.21.0"
```

- [ ] **Step 12.2: CHANGELOG.md (entrada nova no topo, padrão das releases anteriores)**

```markdown
## [0.21.0] — 2026-05-02

### Empresa Ativa Global

- **Hardening de `getActiveAccountId(user)`**: fail-closed na primeira conta permitida (não mais Matrix=9 hardcoded). Cobertura cross-account.
- **Defense-in-depth**: `assertAccountAccess` em todas as 8 pages que leem o helper.
- **3 novas tools read-only do Nex**:
  - `get_active_company` — identidade da empresa e role.
  - `get_integrations_status` — Power BI / futuras integrações por empresa.
  - `get_nex_config_summary` — modelo de IA, KB, áudio, visibilidades (sem secrets).
- **Contexto da empresa injetado no system prompt do Nex**: `buildActiveCompanyContext` em `run-nex.ts` (sem tocar `prompt.ts`).
- **Runbook canônico**: `docs/runbooks/escopo-por-empresa.md`.

### Tests

- 5 testes novos para `getActiveAccountId` (cookie ausente, válido, inválido, conta proibida, sem conta).
- 4 testes para `buildActiveCompanyContext` (nome, fallback, user line, falha de DB).
- 6 testes para tools novas (shape, gating por role, sem secrets, audio condicional).

### Notas

- Schema sem mudança.
- Cookie `nexus_active_account` mantido — apenas o helper valida acesso agora.
```

- [ ] **Step 12.3: docs/STATUS.md (atualizar versão atual, snapshot, próximos passos)**

(Seguir o padrão das releases anteriores no arquivo.)

- [ ] **Step 12.4: docs/agents/HISTORY.md — append**

```
2026-05-02 HH:MM | agent=claude-empresa-ativa-global | commit=<short> | scope=release | summary=v0.21.0 — empresa ativa global (hardening + 3 tools Nex + contexto)
```

- [ ] **Step 12.5: Pre-push checks**

```bash
npm run typecheck         # 0 erros
npm test                  # 0 regressões
gh run list --limit 5     # nenhum build empilhado
```

Se algo falhar, parar, investigar (`superpowers:systematic-debugging`).

- [ ] **Step 12.6: Commit + push**

```bash
git add package.json CHANGELOG.md docs/STATUS.md docs/agents/HISTORY.md
git commit -m "release(v0.21.0): empresa-ativa-global — auditoria + 3 tools Nex + contexto

Bump 0.18.0 → 0.21.0. Ver CHANGELOG.md."
git push origin main
```

- [ ] **Step 12.7: Smoke pós-deploy**

Aguardar GHCR build + Portainer redeploy.

```bash
curl -sS https://insights.example/api/health | jq .   # version: "0.21.0"
```

Login → trocar conta no switcher → verificar que dashboard refresca → perguntar "em qual empresa estou?" no Nex bubble. Se algo quebrar, `systematic-debugging`.

- [ ] **Step 12.8: Cleanup do active agent file + atualizar memória**

```bash
rm docs/agents/active/claude-empresa-ativa-global.md
git add -u
git commit -m "chore(agents): cleanup claude-empresa-ativa-global (sessão concluída)"
git push
```

Memória persistente: criar `~/.claude/projects/.../memory/project_v0.21_release.md` documentando o que foi entregue, e adicionar ao MEMORY.md.

---

## Self-review final

**Spec coverage:** spec §2.2 lista A1–A5, B1–B5, C1–C2 = 12 itens. Plan tasks: T1 (A1, A2), T2 (A4), T3+T4 (A2, A3), T5 (B4 helper), T6 (B4 wire), T7 (B5), T8 (B1), T9 (B2), T10 (B3), T11 (C1), T12 (C2). 100% coverage. ✓

**Placeholders:** scan executado. Nenhum "TBD"/"TODO"/"implement later" no plan. ✓

**Type consistency:** `getActiveAccountId(user)` consistente em T1–T4. `executeTool(... platformRole)` consistente em T7–T10. `buildActiveCompanyContext(accountId, user?)` consistente em T5–T6. ✓

**Multi-agent risk:** T4h (conversas) tem check explícito. T6 evita prompt.ts. T12 verifica versão remota. ✓

Plan aprovado autonomamente. Execução começa em T1.
