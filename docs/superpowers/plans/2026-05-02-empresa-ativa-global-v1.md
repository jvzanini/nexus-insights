# Plan v1 — Empresa Ativa Global (v0.21.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a empresa ativa do `AccountSwitcher` a fonte ÚNICA e GLOBAL de escopo: hardening do helper (fail-closed), `assertAccountAccess` em todas as 8 pages, 3 novas tools read-only do Nex e injeção de contexto da empresa no system prompt.

**Architecture:** `getActiveAccountId(user)` envolto em `cache()` valida acesso e fail-closed na primeira conta permitida. Cada page que lê o helper chama também `assertAccountAccess` (defense-in-depth). 3 novas tools (`get_active_company`, `get_integrations_status`, `get_nex_config_summary`) ampliam o conhecimento do Nex. `buildActiveCompanyContext` injeta nome da empresa no system prompt.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind + Prisma + Postgres + BullMQ. Tests: Jest + jest-mock-extended.

**Spec source-of-truth:** `docs/superpowers/specs/2026-05-02-empresa-ativa-global-design.md` (v3 final).

**File map:**

```
[NEW]      src/lib/reports/active-account.ts          (substitui o atual; assinatura nova)
[NEW]      src/lib/llm/agent/active-company-context.ts (helper buildActiveCompanyContext)
[NEW]      src/lib/reports/__tests__/active-account.test.ts
[NEW]      src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
[NEW]      src/lib/llm/agent/__tests__/active-company-context.test.ts
[NEW]      docs/runbooks/escopo-por-empresa.md
[MODIFY]   src/app/(protected)/layout.tsx
[MODIFY]   src/app/(protected)/dashboard/page.tsx
[MODIFY]   src/app/(protected)/relatorios/conversas/page.tsx        (CUIDADO — agente claude-conversas-v019 ativo)
[MODIFY]   src/app/(protected)/relatorios/distribuicao/page.tsx
[MODIFY]   src/app/(protected)/relatorios/equipe/page.tsx
[MODIFY]   src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx
[MODIFY]   src/app/(protected)/relatorios/origem-ia/page.tsx
[MODIFY]   src/app/(protected)/relatorios/performance/page.tsx
[MODIFY]   src/app/(protected)/relatorios/visao-geral/page.tsx
[MODIFY]   src/lib/actions/nex-chat.ts
[MODIFY]   src/lib/llm/agent/run-nex.ts
[MODIFY]   src/lib/llm/tools/definitions.ts                          (adicionar 3 tools)
[MODIFY]   src/lib/llm/tools/executor.ts                              (assinatura + branches)
[MODIFY]   package.json                                               (0.18.0 → 0.21.0)
[MODIFY]   CHANGELOG.md
[MODIFY]   docs/STATUS.md
```

**Coordenação multi-agente:**

- `claude-conversas-v019` (v0.19) toca `src/app/(protected)/relatorios/conversas/page.tsx` e dependências. Minha edição lá é mínima (1 linha de `assertAccountAccess`) — alto risco de conflito; **fica para o final** (Task 11) e considero pular se conversas-v019 não tiver mergeado ainda.
- `claude-nex-suite-polish-v020` (v0.20) toca `src/lib/nex/prompt.ts`, `src/components/agente-nex/*`, `src/lib/llm/{pricing,catalog}.ts`, `prisma/schema.prisma`. **Não** toca `run-nex.ts`, `tools/{definitions,executor}.ts`, `tools/__tests__/`. Sem conflito direto.
- `claude-t10-filter-chip-list-popover` — só novos arquivos isolados; sem conflito.

---

## Task 1: Refactor `getActiveAccountId(user)` com fail-closed e cache

**Files:**
- Modify: `src/lib/reports/active-account.ts`
- Test: `src/lib/reports/__tests__/active-account.test.ts` (novo)

- [ ] **Step 1.1: Escrever testes failing**

```ts
// src/lib/reports/__tests__/active-account.test.ts
import { cookies } from "next/headers";
import { getActiveAccountId, NoAccessibleAccountError } from "@/lib/reports/active-account";
import * as tenant from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

jest.mock("next/headers");
jest.mock("@/lib/tenant");

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
    ...overrides,
  } as AuthUser;
}

function setCookie(value: string | undefined) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  mockedCookies.mockResolvedValue({ get } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe("getActiveAccountId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna primeira conta permitida quando cookie ausente (não 9 hardcoded)", async () => {
    const user = makeUser({ accountIds: [2, 9] });
    setCookie(undefined);
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(user)).toBe(2);
  });

  it("retorna cookie quando válido e user tem acesso", async () => {
    const user = makeUser({ accountIds: [2, 9] });
    setCookie("9");
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(user)).toBe(9);
  });

  it("ignora cookie inválido (NaN, negativo, zero) e cai pra primeira permitida", async () => {
    const user = makeUser({ accountIds: [2, 9] });
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    for (const bad of ["abc", "-1", "0", ""]) {
      setCookie(bad);
      expect(await getActiveAccountId(user)).toBe(2);
    }
  });

  it("cookie aponta pra conta proibida → primeira permitida", async () => {
    const user = makeUser({ accountIds: [2, 9] });
    setCookie("99");
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(user)).toBe(2);
  });

  it("user sem nenhuma conta acessível → throws NoAccessibleAccountError", async () => {
    const user = makeUser({ accountIds: [] });
    setCookie(undefined);
    mockedGetAccessibleAccountIds.mockResolvedValue([]);
    await expect(getActiveAccountId(user)).rejects.toThrow(NoAccessibleAccountError);
  });
});
```

- [ ] **Step 1.2: Rodar testes — devem falhar**

Run: `npx jest src/lib/reports/__tests__/active-account.test.ts`
Expected: FAIL — `NoAccessibleAccountError` not exported, helper signature mismatch.

- [ ] **Step 1.3: Implementar refactor**

```ts
// src/lib/reports/active-account.ts
import { cookies } from "next/headers";
import { cache } from "react";
import { getAccessibleAccountIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const COOKIE_NAME = "nexus_active_account";

/**
 * Lançado quando o user não tem acesso a NENHUMA conta — situação que
 * não deveria acontecer em produção (auth garante membership ≥ 1).
 * Capturado no `(protected)/layout.tsx` para redirecionar com mensagem amigável.
 */
export class NoAccessibleAccountError extends Error {
  constructor(userId: string) {
    super(`User ${userId} não tem acesso a nenhuma conta`);
    this.name = "NoAccessibleAccountError";
  }
}

/**
 * Resolve a conta ativa para o user corrente:
 *  1. Lê cookie `nexus_active_account`.
 *  2. Verifica se a conta do cookie está em `getAccessibleAccountIds(user)`.
 *  3. Se sim, retorna. Se não, retorna a primeira permitida (fail-closed).
 *  4. Se o user não tem nenhuma, throws `NoAccessibleAccountError`.
 *
 * Envolto em `cache()` do React → dedupe por request RSC.
 *
 * NOTA: substituiu a versão pre-v0.21 que devolvia DEFAULT_ACCOUNT_ID=9
 * (Matrix) sem checar acesso — leak latente para usuários sem cookie ou
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

- [ ] **Step 1.5: Rodar typecheck**

Run: `npm run typecheck`
Expected: 0 errors. Os 10 callers vão acusar erro porque a assinatura mudou — esses serão corrigidos em Tasks 2-4.

⚠️ **Esperado nesta task**: typecheck QUEBRA. Vai ser corrigido nas próximas tasks. Commit assim mesmo (TDD).

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/reports/active-account.ts src/lib/reports/__tests__/active-account.test.ts
git commit -m "feat(tenant): T1 — getActiveAccountId(user) fail-closed + cache + NoAccessibleAccountError

Substituí o helper antigo (DEFAULT_ACCOUNT_ID=9 hardcoded) por uma versão
que valida acesso via getAccessibleAccountIds e devolve a primeira conta
permitida em vez de Matrix. Lança NoAccessibleAccountError se user não
tem nenhuma conta. Envolto em cache() do React para dedupe por request.

Tests: 5/5 passing.
Typecheck: BREAKING (callers serão atualizados nas Tasks 2-4)."
```

---

## Task 2: Atualizar `(protected)/layout.tsx` para usar o helper

**Files:**
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 2.1: Editar layout**

Substituir o bloco `let activeAccountId: number; if (cookieAccountId && allowedIds.has(...)) ...` por:

```ts
import { getActiveAccountId, NoAccessibleAccountError } from "@/lib/reports/active-account";
import { redirect } from "next/navigation";

// (dentro do component, após user e availableAccounts resolvidos)
let activeAccountId: number;
try {
  activeAccountId = await getActiveAccountId(user as unknown as import("@/lib/auth-helpers").AuthUser);
} catch (err) {
  if (err instanceof NoAccessibleAccountError) {
    redirect("/login?reason=no-access");
  }
  throw err;
}
```

Remover variáveis antigas (`ACCOUNT_COOKIE`, `DEFAULT_ACCOUNT_ID`, todo o bloco `if/else if/else if/else`).

- [ ] **Step 2.2: Rodar typecheck do layout**

Run: `npm run typecheck`
Expected: layout.tsx OK. As 9 outras pages ainda quebram.

- [ ] **Step 2.3: Smoke local**

Run: `npm run dev`
Manual: login, verificar que sidebar mostra empresa correta. Trocar conta — deve funcionar.

- [ ] **Step 2.4: Commit**

```bash
git add src/app/(protected)/layout.tsx
git commit -m "feat(tenant): T2 — layout.tsx usa getActiveAccountId(user) (DRY)

Removida a duplicação do fallback (cookie → DEFAULT 9 → first → 9).
Agora layout chama o mesmo helper das pages — fonte ÚNICA da resolução.
Captura NoAccessibleAccountError → redirect /login?reason=no-access."
```

---

## Task 3: Atualizar `nex-chat.ts` (sendNexMessage + testNexPromptAction)

**Files:**
- Modify: `src/lib/actions/nex-chat.ts`

- [ ] **Step 3.1: Editar nex-chat.ts**

Substituir 2 ocorrências de `await getActiveAccountId()` por `await getActiveAccountId(user as AuthUser)` onde `user = session?.user`. Importar `AuthUser` se necessário. Tratar `NoAccessibleAccountError`.

```ts
// src/lib/actions/nex-chat.ts (parcial — funções sendNexMessage e testNexPromptAction)
import { NoAccessibleAccountError } from "@/lib/reports/active-account";
import type { AuthUser } from "@/lib/auth-helpers";

// dentro de sendNexMessage:
let accountId: number;
try {
  accountId = await getActiveAccountId(session.user as unknown as AuthUser);
} catch (err) {
  if (err instanceof NoAccessibleAccountError) {
    return { ok: false, error: "Sem acesso a nenhuma conta" };
  }
  throw err;
}

// idem em testNexPromptAction
```

- [ ] **Step 3.2: Typecheck**

Run: `npm run typecheck`
Expected: nex-chat.ts OK.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/actions/nex-chat.ts
git commit -m "feat(tenant): T3 — nex-chat.ts usa getActiveAccountId(user)

sendNexMessage e testNexPromptAction tratam NoAccessibleAccountError
graciosamente, devolvendo { ok: false, error }."
```

---

## Task 4: Atualizar 8 pages (`assertAccountAccess` + nova assinatura)

**Files:** 8 pages — `dashboard/page.tsx`, `relatorios/{conversas,distribuicao,equipe,mensagens-nao-respondidas,origem-ia,performance,visao-geral}/page.tsx`.

⚠️ **Coordenação**: `relatorios/conversas/page.tsx` é tocado pelo `claude-conversas-v019`. Verificar `git log -3 --oneline -- src/app/(protected)/relatorios/conversas/page.tsx` antes; se commit muito recente (<30 min), pausar e coordenar.

- [ ] **Step 4.1: Para cada page (8x), aplicar o patch**

Substituir:
```ts
const accountId = await getActiveAccountId();
```
Por:
```ts
const session = await auth();   // ou getCurrentUser()
const user = session.user as unknown as AuthUser;
const accountId = await getActiveAccountId(user);
await assertAccountAccess(user, accountId);
```

Imports a adicionar:
```ts
import { auth } from "@/auth";   // ou getCurrentUser de auth-helpers
import { assertAccountAccess } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";
```

- [ ] **Step 4.2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4.3: Tests**

Run: `npm test`
Expected: 0 regressions.

- [ ] **Step 4.4: Commit (1 commit por grupo de pages — 3 commits)**

```bash
# 4.4a — dashboard
git add src/app/(protected)/dashboard/page.tsx
git commit -m "feat(tenant): T4a — dashboard.page.tsx assertAccountAccess + helper(user)"

# 4.4b — 6 relatórios (sem conversas)
git add src/app/(protected)/relatorios/{distribuicao,equipe,mensagens-nao-respondidas,origem-ia,performance,visao-geral}/page.tsx
git commit -m "feat(tenant): T4b — 6 relatórios assertAccountAccess + helper(user)"

# 4.4c — conversas (cuidado com conversas-v019)
git add src/app/(protected)/relatorios/conversas/page.tsx
git commit -m "feat(tenant): T4c — conversas.page.tsx assertAccountAccess + helper(user)"
```

---

## Task 5: `buildActiveCompanyContext` helper + testes

**Files:**
- Create: `src/lib/llm/agent/active-company-context.ts`
- Test: `src/lib/llm/agent/__tests__/active-company-context.test.ts`

- [ ] **Step 5.1: Escrever testes failing**

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
    } as any);
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
 * Constrói o bloco "CONTEXTO ATIVO" do system prompt do Nex, anexando:
 *  - Nome e accountId da empresa.
 *  - (opcional) Identidade do user e role.
 *  - Inventário curto das tools que o agente pode usar.
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
    : "";

  return [
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
  ]
    .filter((l) => l !== "")
    .join("\n");
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

## Task 6: Wire `buildActiveCompanyContext` em `run-nex.ts`

**Files:**
- Modify: `src/lib/llm/agent/run-nex.ts`

- [ ] **Step 6.1: Editar `runNexAgent`**

```ts
// src/lib/llm/agent/run-nex.ts (trecho)
import { buildActiveCompanyContext } from "./active-company-context";

// dentro de runNexAgent, ANTES do for loop:
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

E adicionar `userName?: string | null` ao `RunNexInput`.

- [ ] **Step 6.2: Atualizar callers de `runNexAgent`**

Em `src/lib/actions/nex-chat.ts`, passar `userName: session.user.name ?? null` em `runNexAgent({ ... })`.

- [ ] **Step 6.3: Tests existentes não devem regredir**

Run: `npx jest src/lib/llm/agent/`
Expected: 0 regressions.

- [ ] **Step 6.4: Commit**

```bash
git add src/lib/llm/agent/run-nex.ts src/lib/actions/nex-chat.ts
git commit -m "feat(nex): T6 — system prompt do Nex injeta CONTEXTO ATIVO da empresa

run-nex.ts compõe baseSystemPrompt + companyContext. Não toca prompt.ts
(coordenação com claude-nex-suite-polish-v020 que está editando prompt.ts)."
```

---

## Task 7: Executor recebe `platformRole`

**Files:**
- Modify: `src/lib/llm/tools/executor.ts`
- Modify: `src/lib/llm/agent/run-nex.ts`

- [ ] **Step 7.1: Editar `executor.ts`**

```ts
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  accountId: number,
  excludeMatrixIA: boolean = true,
  platformRole: string | null = null,
): Promise<ToolExecutionResult> {
  // ... switch case existente, sem mudança nas tools antigas
}
```

- [ ] **Step 7.2: Editar `run-nex.ts`**

Onde chama `executeTool(...)`, propagar `args.platformRole ?? null`:

```ts
const toolResult = await executeTool(
  tc.name,
  (tc.arguments ?? {}) as Record<string, unknown>,
  args.accountId,
  excludeMatrixIA,
  args.platformRole ?? null,
);
```

- [ ] **Step 7.3: Tests existentes não regridem**

Run: `npm test`
Expected: 0 regressions.

- [ ] **Step 7.4: Commit**

```bash
git add src/lib/llm/tools/executor.ts src/lib/llm/agent/run-nex.ts
git commit -m "feat(nex): T7 — executor.executeTool recebe platformRole (gating de tools novas)"
```

---

## Task 8: Tool `get_active_company`

**Files:**
- Modify: `src/lib/llm/tools/definitions.ts`
- Modify: `src/lib/llm/tools/executor.ts`
- Test: `src/lib/llm/tools/__tests__/executor-platform-tools.test.ts` (novo)

- [ ] **Step 8.1: Definição**

Append em `NEX_TOOLS`:

```ts
{
  name: "get_active_company",
  description:
    "Devolve a empresa (account Chatwoot) ativa para o usuário corrente, junto com role da plataforma e da empresa. Use sempre que o usuário perguntar 'em qual empresa estou?', 'quem sou eu aqui?', 'qual conta?'.",
  parameters: { type: "object", properties: {} },
}
```

- [ ] **Step 8.2: Test failing**

```ts
// src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
import { executeTool } from "../executor";
// mocks: getKnownAccounts, prisma.userAccountAccess.findMany, prisma.userCompanyMembership.findFirst

describe("get_active_company", () => {
  it("retorna shape correto para super_admin", async () => {
    // ... arrange + assert
    const result = await executeTool("get_active_company", {}, 9, true, "super_admin");
    expect(result.result).toMatchObject({ id: 9, name: expect.any(String), platformRole: "super_admin" });
  });
});
```

- [ ] **Step 8.3: Implementar**

Branch novo no switch do `executor.ts`:

```ts
case "get_active_company":
  return { result: await getActiveCompany(accountId, platformRole) };
```

E função:

```ts
async function getActiveCompany(
  accountId: number,
  platformRole: string | null,
) {
  const known = await getKnownAccounts();
  const match = known.find((a) => a.id === accountId);
  // companyRole via UserCompanyMembership — defer ou retorna null se schema não tem
  return {
    id: accountId,
    name: match?.name ?? `Empresa #${accountId}`,
    platformRole: platformRole ?? "viewer",
    companyRole: null,  // simplificação v0.21; UserCompanyMembership FK ausente
    isOwner: false,    // idem
  };
}
```

- [ ] **Step 8.4: Tests pass**

Run: `npx jest src/lib/llm/tools/__tests__/executor-platform-tools.test.ts`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/llm/tools/definitions.ts src/lib/llm/tools/executor.ts src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
git commit -m "feat(nex): T8 — tool get_active_company"
```

---

## Task 9: Tool `get_integrations_status`

**Files:**
- Modify: `src/lib/llm/tools/{definitions,executor}.ts`
- Test: append em `executor-platform-tools.test.ts`

- [ ] **Step 9.1: Definição**

```ts
{
  name: "get_integrations_status",
  description:
    "Lista integrações configuradas para a empresa ativa (Power BI, futuras), com contadores de profiles ativos/com erro. Use quando o usuário perguntar sobre integrações, Power BI, dashboards externos.",
  parameters: { type: "object", properties: {} },
}
```

- [ ] **Step 9.2: Tests failing**

```ts
it("filtra IntegrationProfile pelo accountIdFilter", async () => {
  // mock prisma.integrationProfile.findMany retorna 3 profiles, 2 cobrem accountId=9
  const result = await executeTool("get_integrations_status", {}, 9, true, "super_admin");
  expect(result.result).toMatchObject({ kindCounts: { power_bi: { total: 2 } } });
});

it("viewer não vê lastSyncAt", async () => {
  const result = await executeTool("get_integrations_status", {}, 9, true, "viewer");
  expect((result.result as any).kindCounts.power_bi.lastSyncAt).toBeUndefined();
});
```

- [ ] **Step 9.3: Implementar**

```ts
async function getIntegrationsStatus(
  accountId: number,
  platformRole: string | null,
) {
  const profiles = await prisma.integrationProfile.findMany({
    select: {
      kind: true,
      status: true,
      accountIdFilter: true,
      lastSyncAt: true,
    },
  });

  const filtered = profiles.filter((p) =>
    !p.accountIdFilter || (p.accountIdFilter as number[]).includes(accountId),
  );

  const includeOps = platformRole === "super_admin";

  const kindCounts: Record<string, any> = {};
  for (const p of filtered) {
    const k = p.kind;
    if (!kindCounts[k]) {
      kindCounts[k] = { total: 0, active: 0, errored: 0, disabled: 0 };
      if (includeOps) kindCounts[k].lastSyncAt = null;
    }
    kindCounts[k].total += 1;
    if (p.status === "active") kindCounts[k].active += 1;
    if (p.status === "errored") kindCounts[k].errored += 1;
    if (p.status === "disabled") kindCounts[k].disabled += 1;
    if (includeOps && p.lastSyncAt) {
      const cur = kindCounts[k].lastSyncAt;
      const candidate = p.lastSyncAt.toISOString();
      if (!cur || candidate > cur) kindCounts[k].lastSyncAt = candidate;
    }
  }
  return { kindCounts };
}
```

- [ ] **Step 9.4: Tests pass + commit**

```bash
git add src/lib/llm/tools/definitions.ts src/lib/llm/tools/executor.ts src/lib/llm/tools/__tests__/executor-platform-tools.test.ts
git commit -m "feat(nex): T9 — tool get_integrations_status (gating super_admin)"
```

---

## Task 10: Tool `get_nex_config_summary`

**Files:** mesmos da Task 8/9.

- [ ] **Step 10.1: Definição**

```ts
{
  name: "get_nex_config_summary",
  description:
    "Resumo da configuração do Agente Nex e da plataforma: provedor/modelo de IA ativo, KB ligada, áudio, visibilidades de bubble e relatórios. NÃO retorna chaves nem segredos.",
  parameters: { type: "object", properties: {} },
}
```

- [ ] **Step 10.2: Tests failing**

```ts
it("nunca expõe apiKey ou secret", async () => {
  const result = await executeTool("get_nex_config_summary", {}, 9, true, "super_admin");
  const json = JSON.stringify(result.result);
  expect(json).not.toMatch(/sk-|api[_-]?key|secret/i);
});
```

- [ ] **Step 10.3: Implementar**

```ts
async function getNexConfigSummary() {
  const [llm, nex] = await Promise.all([
    getActiveLlmConfig().catch(() => null),
    getNexPromptConfig().catch(() => null),
  ]);
  const kbDocs = await getKbDocsForPrompt().catch(() => []);
  const bubbleEnabled = await isNexBubbleEnabled().catch(() => false);
  const visibility = await getNexBubbleVisibility().catch(() => "all_users");

  return {
    provider: llm?.provider ?? null,
    model: llm?.model ?? null,
    kbEnabled: nex?.kbEnabled ?? false,
    kbDocsCount: kbDocs.length,
    audioInputEnabled: nex?.audioInputEnabled ?? false,
    audioEffectivelyEnabled:
      (nex?.audioInputEnabled ?? false) && llm?.provider === "openai",
    bubbleEnabled,
    nexBubbleVisibility: visibility,
    reportsVisibility: await getReportsVisibilitySummary(),
  };
}
```

- [ ] **Step 10.4: Tests + commit**

```bash
git commit -m "feat(nex): T10 — tool get_nex_config_summary (sem secrets)"
```

---

## Task 11: Runbook `escopo-por-empresa.md`

**Files:**
- Create: `docs/runbooks/escopo-por-empresa.md`

- [ ] **Step 11.1: Escrever runbook**

Conteúdo: tabela canônica do §2.1 da spec; invariantes do §11; comando de auditoria do §11.2.

- [ ] **Step 11.2: Commit**

```bash
git add docs/runbooks/escopo-por-empresa.md
git commit -m "docs(runbook): T11 — escopo-por-empresa (canônico per-company × global)"
```

---

## Task 12: Bump v0.21.0 + CHANGELOG + STATUS

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `docs/STATUS.md`.

⚠️ **Coordenação**: rodar `git fetch origin main` ANTES de bumpar — se v0.19/v0.20 mergearam, ajustar para v0.22.0.

- [ ] **Step 12.1: Verificar versão remota**

```bash
git fetch origin main
git show origin/main:package.json | grep version
```

Se `0.18.0` → bump 0.21.0. Se `0.19.x` → bump 0.21.0 (espaço já reservado). Se `0.20.x` → bump 0.21.0. Se `0.21.x` → bump 0.22.0.

- [ ] **Step 12.2: Editar package.json**

```json
"version": "0.21.0"
```

- [ ] **Step 12.3: Editar CHANGELOG.md (entrada 0.21.0 no topo)**

Padrão das releases anteriores. Resumo + bullets das tasks.

- [ ] **Step 12.4: Editar docs/STATUS.md**

Atualizar versão atual, "última entrega", e seção "próximos passos".

- [ ] **Step 12.5: Append em docs/agents/HISTORY.md**

```
2026-05-02 HH:MM | agent=claude-empresa-ativa-global | commit=<short> | scope=release | summary=v0.21.0 — empresa ativa global (hardening + 3 tools Nex + contexto)
```

- [ ] **Step 12.6: Pre-push checks**

```bash
gh run list --limit 5  # nada empilhado de v0.19/v0.20?
npm run typecheck
npm test
```

- [ ] **Step 12.7: Commit + push**

```bash
git add package.json CHANGELOG.md docs/STATUS.md docs/agents/HISTORY.md
git commit -m "release(v0.21.0): empresa-ativa-global — auditoria + 3 tools Nex + contexto

Bump 0.18.0 → 0.21.0. Ver CHANGELOG.md."
git push origin main
```

- [ ] **Step 12.8: Post-deploy smoke**

Conforme spec §7.2. Se algo quebrar: investigar com systematic-debugging.

- [ ] **Step 12.9: Cleanup**

```bash
rm docs/agents/active/claude-empresa-ativa-global.md
git add -u
git commit -m "chore(agents): cleanup claude-empresa-ativa-global (sessão concluída)"
git push
```

---

## Self-review (gancho final do skill)

Vai ser feito no v3 deste plan.
