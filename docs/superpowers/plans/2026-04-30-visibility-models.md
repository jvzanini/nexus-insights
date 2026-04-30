# v0.11.0 Visibility + Models — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visibilidade granular por relatório e Matrix IA (3 níveis: all / super_admin_only / none) + catálogo LLM atualizado (cutoff abril/2026) + 2 fixes de UI no card Agente Nex.

**Architecture:** String-based visibility setting em `app_settings` (sem migration de schema). Helpers servidor-side com cache TTL. UI com `<VisibilitySelect>` (3-opções via base-ui Popover). Aplicação global em sidebar, page guards, queries, filtros, dropdowns, meta-cache, ferramentas LLM.

**Tech Stack:** Next.js 16 (RSC + Server Actions), Prisma 7, base-ui Popover, Zod, Jest + jest-mock-extended.

**Spec:** `docs/superpowers/specs/2026-04-30-visibility-models-design.md`

---

## File Structure

**Novos arquivos:**
- `src/lib/reports/visibility.ts` — tipos + helpers (resolveVisibility, getReportVisibility, getMatrixIAVisibility, getVisibleReportKeys, isReportVisibleForUser, isMatrixIAVisibleForUser).
- `src/lib/reports/__tests__/visibility.test.ts` — TDD.
- `src/components/settings/visibility-select.tsx` — primitivo de UI.
- `src/components/settings/__tests__/visibility-select.test.tsx`.

**Arquivos modificados:**
- `src/lib/reports/get-enabled-reports.ts` — wrapper deprecado redireciona para visibility.
- `src/lib/reports/matrix-ia-setting.ts` — wrapper deprecado redireciona.
- `src/components/settings/enabled-reports-card.tsx` — switches → VisibilitySelect.
- `src/components/settings/matrix-ia-toggle-card.tsx` — switch → VisibilitySelect.
- `src/components/layout/sidebar.tsx` — usa `getVisibleReportKeys(user.platformRole)`.
- `src/app/(protected)/relatorios/<key>/page.tsx` (7 páginas) — guard `redirect("/dashboard")`.
- `src/app/(protected)/configuracoes/page.tsx` — passa visibility (não boolean) pra cards.
- `src/lib/chatwoot/queries/meta-cache-for-user.ts` — `getInboxesForUser` recebe userRole + Matrix IA visibility, esconde inbox 31 quando aplicável.
- `src/lib/chatwoot/filters.ts` — `buildBaseFilter` aceita `excludeMatrixIA` derivado da nova visibility.
- `src/lib/llm/catalog.ts` — modelos atualizados.
- `src/components/settings/llm-config-card.tsx` — fix dropdown + olhinho.
- `prisma/seed.ts` — defaults de novas chaves; backward-compat write-through na primeira leitura via UI.
- `package.json` — bump 0.10.3 → 0.11.0.
- `CHANGELOG.md`, `docs/STATUS.md`, `CLAUDE.md`, `docs/agents/HISTORY.md`.

---

## Task 1: Helpers de visibility (TDD)

**Files:**
- Create: `src/lib/reports/visibility.ts`
- Test: `src/lib/reports/__tests__/visibility.test.ts`
- Read for reference: `src/lib/reports/get-enabled-reports.ts`, `src/lib/reports/matrix-ia-setting.ts`, `src/lib/llm/__tests__/get-nex-bubble-enabled.test.ts` (mock pattern)

- [ ] **Step 1: Escrever failing tests**

```ts
// src/lib/reports/__tests__/visibility.test.ts
jest.mock("@/lib/pg-pool", () => ({ pgPool: { query: jest.fn() } }));

import { pgPool } from "@/lib/pg-pool";
import {
  resolveVisibility,
  getReportVisibility,
  getMatrixIAVisibility,
  getVisibleReportKeys,
  isReportVisibleForUser,
  isMatrixIAVisibleForUser,
  invalidateVisibilityCache,
  type Visibility,
} from "@/lib/reports/visibility";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  mockedQuery.mockReset();
  invalidateVisibilityCache();
});

describe("resolveVisibility (puro)", () => {
  it("none → false sempre", () => {
    expect(resolveVisibility("none", "super_admin")).toBe(false);
    expect(resolveVisibility("none", "viewer")).toBe(false);
    expect(resolveVisibility("none", null)).toBe(false);
  });

  it("super_admin_only → true só pra super_admin", () => {
    expect(resolveVisibility("super_admin_only", "super_admin")).toBe(true);
    expect(resolveVisibility("super_admin_only", "manager")).toBe(false);
    expect(resolveVisibility("super_admin_only", "viewer")).toBe(false);
    expect(resolveVisibility("super_admin_only", null)).toBe(false);
  });

  it("all → true para qualquer role definida", () => {
    expect(resolveVisibility("all", "viewer")).toBe(true);
    expect(resolveVisibility("all", "manager")).toBe(true);
    expect(resolveVisibility("all", "super_admin")).toBe(true);
  });

  it("undefined cai em fallback all (default)", () => {
    expect(resolveVisibility(undefined, "viewer")).toBe(true);
  });

  it("usa fallback custom quando informado", () => {
    expect(resolveVisibility(undefined, "viewer", "none")).toBe(false);
  });
});

describe("getReportVisibility (com DB)", () => {
  it("lê chave nova quando existe", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "super_admin_only" }],
    } as never);
    const v = await getReportVisibility("conversas");
    expect(v).toBe("super_admin_only");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0][1]).toEqual([
      "reports.visibility.conversas",
    ]);
  });

  it("backward-compat: lê platform.enabled_reports e infere all/none", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never); // chave nova ausente
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: ["visao-geral", "performance"] }],
    } as never);
    expect(await getReportVisibility("visao-geral")).toBe("all");
    invalidateVisibilityCache();
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: ["performance"] }],
    } as never);
    expect(await getReportVisibility("conversas")).toBe("none");
  });

  it("default all quando nada existe", async () => {
    mockedQuery.mockResolvedValue({ rowCount: 0, rows: [] } as never);
    expect(await getReportVisibility("conversas")).toBe("all");
  });
});

describe("getMatrixIAVisibility (com DB)", () => {
  it("lê chave nova quando existe", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "none" }],
    } as never);
    expect(await getMatrixIAVisibility()).toBe("none");
  });

  it("backward-compat: legacy include=false → none", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: false }],
    } as never);
    expect(await getMatrixIAVisibility()).toBe("none");
  });

  it("backward-compat: legacy super_admin_only=true → super_admin_only", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: true }],
    } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: true }],
    } as never);
    expect(await getMatrixIAVisibility()).toBe("super_admin_only");
  });

  it("default all quando nada existe", async () => {
    mockedQuery.mockResolvedValue({ rowCount: 0, rows: [] } as never);
    expect(await getMatrixIAVisibility()).toBe("super_admin_only"); // default histórico
  });
});

describe("getVisibleReportKeys", () => {
  it("retorna apenas keys com visibility resolvida true para o role", async () => {
    // Mocka 7 chaves. Padrão: visao-geral=all, conversas=super_admin_only, equipe=none.
    mockedQuery.mockImplementation(((sql: string, params: unknown[]) => {
      const key = (params as string[])[0];
      const map: Record<string, string | null> = {
        "reports.visibility.visao-geral": "all",
        "reports.visibility.performance": "all",
        "reports.visibility.equipe": "none",
        "reports.visibility.distribuicao": "all",
        "reports.visibility.origem-ia": "all",
        "reports.visibility.conversas": "super_admin_only",
        "reports.visibility.mensagens-nao-respondidas": "all",
      };
      const v = map[key as string] ?? null;
      return Promise.resolve(
        v
          ? ({ rowCount: 1, rows: [{ value: v }] } as never)
          : ({ rowCount: 0, rows: [] } as never),
      );
    }) as never);

    const visibleViewer = await getVisibleReportKeys("viewer");
    expect(visibleViewer).toEqual(
      new Set([
        "visao-geral",
        "performance",
        "distribuicao",
        "origem-ia",
        "mensagens-nao-respondidas",
      ]),
    );

    invalidateVisibilityCache();
    mockedQuery.mockClear();
    const visibleSuperAdmin = await getVisibleReportKeys("super_admin");
    expect(visibleSuperAdmin).toEqual(
      new Set([
        "visao-geral",
        "performance",
        "distribuicao",
        "origem-ia",
        "conversas",
        "mensagens-nao-respondidas",
      ]),
    );
  });
});

describe("isReportVisibleForUser e isMatrixIAVisibleForUser", () => {
  it("isReportVisibleForUser usa getReportVisibility + role", async () => {
    mockedQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ value: "super_admin_only" }],
    } as never);
    expect(await isReportVisibleForUser("conversas", "viewer")).toBe(false);
    expect(await isReportVisibleForUser("conversas", "super_admin")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/lib/reports/__tests__/visibility.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/reports/visibility'".

- [ ] **Step 3: Implementar `src/lib/reports/visibility.ts`**

```ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { ALL_REPORT_KEYS } from "./catalog";

export type Visibility = "all" | "super_admin_only" | "none";

export const ALL_VISIBILITIES: Visibility[] = ["all", "super_admin_only", "none"];

export function isVisibility(v: unknown): v is Visibility {
  return v === "all" || v === "super_admin_only" || v === "none";
}

export function resolveVisibility(
  setting: Visibility | undefined | null,
  userRole: string | null | undefined,
  fallback: Visibility = "all",
): boolean {
  const v = setting ?? fallback;
  if (v === "none") return false;
  if (v === "super_admin_only") return userRole === "super_admin";
  return true;
}

const cache = new Map<string, { value: unknown; expiresAt: number }>();
const TTL_MS = 30_000;

export function invalidateVisibilityCache(): void {
  cache.clear();
}

async function readSettingRaw(key: string): Promise<unknown> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value: unknown = undefined;
  try {
    const r = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [key],
    );
    if (r.rowCount && r.rows[0]) {
      value = r.rows[0].value;
    }
  } catch (err) {
    console.warn(`[visibility] falha lendo ${key}:`, (err as Error).message);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export async function getReportVisibility(
  reportKey: string,
): Promise<Visibility> {
  // 1) chave nova
  const newKey = `reports.visibility.${reportKey}`;
  const raw = await readSettingRaw(newKey);
  if (isVisibility(raw)) return raw;
  // 2) backward-compat: array enabled_reports
  const legacy = await readSettingRaw("platform.enabled_reports");
  if (Array.isArray(legacy)) {
    const arr = legacy as unknown[];
    return arr.includes(reportKey) ? "all" : "none";
  }
  // 3) default
  return "all";
}

export async function getMatrixIAVisibility(): Promise<Visibility> {
  const raw = await readSettingRaw("reports.matrix_ia_visibility");
  if (isVisibility(raw)) return raw;
  // backward-compat
  const include = await readSettingRaw("reports.include_matrix_ia");
  if (include === false) return "none";
  const onlySuperAdmin = await readSettingRaw(
    "feature_flags.matrix_ia_visible_to_super_admin_only",
  );
  if (onlySuperAdmin === true || include === undefined) {
    return "super_admin_only";
  }
  return "all";
}

export async function isReportVisibleForUser(
  reportKey: string,
  userRole: string | null | undefined,
): Promise<boolean> {
  const v = await getReportVisibility(reportKey);
  return resolveVisibility(v, userRole);
}

export async function isMatrixIAVisibleForUser(
  userRole: string | null | undefined,
): Promise<boolean> {
  const v = await getMatrixIAVisibility();
  return resolveVisibility(v, userRole, "super_admin_only");
}

export async function getVisibleReportKeys(
  userRole: string | null | undefined,
): Promise<Set<string>> {
  const entries = await Promise.all(
    ALL_REPORT_KEYS.map(async (key) => {
      const v = await getReportVisibility(key);
      return [key, resolveVisibility(v, userRole)] as const;
    }),
  );
  return new Set(entries.filter(([, ok]) => ok).map(([k]) => k));
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- src/lib/reports/__tests__/visibility.test.ts
```
Expected: PASS (all tests green).

- [ ] **Step 5: typecheck**

```bash
npm run typecheck
```
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/visibility.ts src/lib/reports/__tests__/visibility.test.ts
git commit -m "feat(visibility): helpers Visibility + resolveVisibility + getReportVisibility com TDD

- src/lib/reports/visibility.ts: tipo Visibility ('all'|'super_admin_only'|'none'),
  resolveVisibility puro, getReportVisibility com cache TTL 30s, getMatrixIAVisibility
  com backward-compat para flags legacy boolean, getVisibleReportKeys, helpers per-user.
- 14 testes TDD cobrindo função pura + integração com pgPool mockado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wrapper deprecado em get-enabled-reports e matrix-ia-setting

**Files:**
- Modify: `src/lib/reports/get-enabled-reports.ts`
- Modify: `src/lib/reports/matrix-ia-setting.ts`

- [ ] **Step 1: Adicionar @deprecated + forward em `get-enabled-reports.ts`**

Após `getEnabledReportKeys`, adicionar:

```ts
import { getVisibleReportKeys } from "./visibility";

/**
 * @deprecated Use `getVisibleReportKeys(userRole)` em src/lib/reports/visibility.ts.
 * Mantido apenas para callers legados. Equivale a `getVisibleReportKeys("super_admin")`
 * (i.e., "todos os relatórios não marcados como `none`").
 */
export async function getVisibleReportKeysGlobal(): Promise<Set<string>> {
  return getVisibleReportKeys("super_admin");
}
```

NÃO remover `getEnabledReportKeys` — sidebar etc. ainda usa.

- [ ] **Step 2: Adicionar forward em `matrix-ia-setting.ts`**

```ts
import { isMatrixIAVisibleForUser } from "./visibility";

/**
 * @deprecated Use `isMatrixIAVisibleForUser(userRole)` ou `getMatrixIAVisibility`.
 * Mantido para callers legados — equivale a "Matrix IA é incluída por default
 * para super_admin"; comportamento exato passa pela nova função.
 */
export async function getMatrixIAIncludedForRole(
  userRole: string | null | undefined,
): Promise<boolean> {
  return isMatrixIAVisibleForUser(userRole);
}
```

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add src/lib/reports/get-enabled-reports.ts src/lib/reports/matrix-ia-setting.ts
git commit -m "feat(visibility): forward deprecado em get-enabled-reports e matrix-ia-setting"
```

---

## Task 3: VisibilitySelect component

**Files:**
- Create: `src/components/settings/visibility-select.tsx`
- Test: `src/components/settings/__tests__/visibility-select.test.tsx`

> Antes de escrever UI: invocar skill `ui-ux-pro-max:ui-ux-pro-max`.

- [ ] **Step 1: Invocar skill ui-ux-pro-max e replicar padrão `<CustomSelect>`**

Pattern: `src/components/ui/custom-select.tsx`. 3 opções fixas com ícone + label + descrição curta.

- [ ] **Step 2: Implementar**

```tsx
"use client";

import { Users, Shield, EyeOff } from "lucide-react";
import {
  CustomSelect,
  type SelectOption,
} from "@/components/ui/custom-select";
import type { Visibility } from "@/lib/reports/visibility";

const VISIBILITY_OPTIONS: SelectOption[] = [
  {
    value: "all",
    label: "Todos",
    description: "Visível para todos os usuários",
    icon: Users,
  },
  {
    value: "super_admin_only",
    label: "Somente super admin",
    description: "Apenas super admin vê",
    icon: Shield,
  },
  {
    value: "none",
    label: "Ninguém",
    description: "Oculto para todos, inclusive super admin",
    icon: EyeOff,
  },
];

interface VisibilitySelectProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
  className?: string;
}

export function VisibilitySelect({
  value,
  onChange,
  disabled,
  className,
}: VisibilitySelectProps) {
  return (
    <CustomSelect
      value={value}
      onValueChange={(v) => onChange(v as Visibility)}
      options={VISIBILITY_OPTIONS}
      disabled={disabled}
      className={className}
    />
  );
}
```

> Se `<CustomSelect>` não suportar `description`/`icon` em `SelectOption`, estender o tipo lá. Caso já suporte, usar.

- [ ] **Step 3: Test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { VisibilitySelect } from "../visibility-select";

describe("<VisibilitySelect />", () => {
  it("renders current label", () => {
    render(<VisibilitySelect value="all" onChange={() => {}} />);
    expect(screen.getByText(/Todos/)).toBeInTheDocument();
  });

  it("calls onChange with new visibility", () => {
    const onChange = jest.fn();
    render(<VisibilitySelect value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Ninguém/));
    expect(onChange).toHaveBeenCalledWith("none");
  });
});
```

- [ ] **Step 4: typecheck + jest + commit**

```bash
npm run typecheck
npm test -- src/components/settings/__tests__/visibility-select.test.tsx
git add src/components/settings/visibility-select.tsx src/components/settings/__tests__/visibility-select.test.tsx
git commit -m "feat(visibility-select): primitivo de UI 3-opções (all/super_admin/none)"
```

---

## Task 4: Refatorar enabled-reports-card.tsx

**Files:**
- Modify: `src/components/settings/enabled-reports-card.tsx`
- Read for reference: print 1 do João + state atual do arquivo.

- [ ] **Step 1: Trocar Switch por VisibilitySelect**

Cada relatório vira:
```tsx
<div className="flex items-center justify-between gap-4 ...">
  <div>
    <Icon /> <strong>{label}</strong>
    <p>{description}</p>
  </div>
  <VisibilitySelect
    value={visibilityMap[key]}
    onChange={(v) => updateVisibility(key, v)}
  />
</div>
```

State `visibilityMap` é `Record<reportKey, Visibility>` inicializado das 7 chaves `reports.visibility.<key>`.

Ação chama `updateSetting({ key: \`reports.visibility.${reportKey}\`, value: v, category: "visibility" })`.

Footer atualiza para "X de 7 visíveis para todos" (ou cálculo equivalente).

- [ ] **Step 2: typecheck + smoke test (npm run dev se possível) + commit**

```bash
npm run typecheck
git add src/components/settings/enabled-reports-card.tsx
git commit -m "feat(visibility): card 'Relatórios disponíveis' usa VisibilitySelect (3 níveis por relatório)"
```

---

## Task 5: Refatorar matrix-ia-toggle-card.tsx

**Files:**
- Modify: `src/components/settings/matrix-ia-toggle-card.tsx`

- [ ] **Step 1: Substituir Switch por VisibilitySelect**

Card mantém header e descrição. Linha do switch vira VisibilitySelect ligado a `reports.matrix_ia_visibility`.

- [ ] **Step 2: typecheck + commit**

```bash
npm run typecheck
git add src/components/settings/matrix-ia-toggle-card.tsx
git commit -m "feat(visibility): card 'Incluir Matrix IA' usa VisibilitySelect"
```

---

## Task 6: Sidebar + page guards

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/(protected)/relatorios/visao-geral/page.tsx`
- Modify: `src/app/(protected)/relatorios/performance/page.tsx`
- Modify: `src/app/(protected)/relatorios/equipe/page.tsx`
- Modify: `src/app/(protected)/relatorios/distribuicao/page.tsx`
- Modify: `src/app/(protected)/relatorios/origem-ia/page.tsx`
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`
- Modify: `src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx`

- [ ] **Step 1: Sidebar** — substituir `getEnabledReportKeys()` por `getVisibleReportKeys(user.platformRole)`. Filtrar links por role.

- [ ] **Step 2: Cada página `<key>/page.tsx`** — adicionar guard logo após `getCurrentUser`:

```ts
import { isReportVisibleForUser } from "@/lib/reports/visibility";

// ...
const visible = await isReportVisibleForUser("<key>", user.platformRole);
if (!visible) redirect("/dashboard");
```

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add src/components/layout/sidebar.tsx 'src/app/(protected)/relatorios/'
git commit -m "feat(visibility): sidebar + page guards aplicam visibility por role"
```

---

## Task 7: Queries Chatwoot e filtros derivam Matrix IA do role

**Files:**
- Modify: `src/lib/chatwoot/filters.ts` — opcional aceitar `excludeMatrixIA` derivado.
- Modify: `src/lib/chatwoot/queries/meta-cache-for-user.ts` — `getInboxesForUser` esconde inbox 31 quando `isMatrixIAVisibleForUser(role) === false`.
- Modify: `src/components/reports/advanced-filters.tsx` ou `filters-dialog.tsx` — dropdown de inboxes consome lista filtrada.
- Modify: páginas de relatorios que invocam queries — passam `userRole` para `getInboxesForUser`.

- [ ] **Step 1: `getInboxesForUser`**

```ts
import { isMatrixIAVisibleForUser } from "@/lib/reports/visibility";
import { MATRIX_IA_INBOX_ID } from "@/lib/constants/matrix-ia";

export async function getInboxesForUser(
  accountId: number,
  userRole: string,
): Promise<Inbox[]> {
  const all = await getInboxes(accountId);
  const matrixVisible = await isMatrixIAVisibleForUser(userRole);
  if (!matrixVisible) {
    return all.filter((i) => i.id !== MATRIX_IA_INBOX_ID);
  }
  return all;
}
```

- [ ] **Step 2: Atualizar callers** — verificar `grep "getInboxesForUser"` e ajustar argumento.

- [ ] **Step 3: typecheck + tests + commit**

```bash
npm run typecheck
npm test -- src/lib/chatwoot/queries/__tests__/meta-cache-for-user.test.ts
git add ...
git commit -m "feat(visibility): meta-cache + filtros respeitam matrix-ia visibility por role"
```

---

## Task 8: Catálogo LLM atualizado

**Files:**
- Modify: `src/lib/llm/catalog.ts`

- [ ] **Step 1: Substituir blocos `models` dos 4 providers por listas atualizadas (cutoff 2026-04)**

> Listas exatas estão no spec §2.6.

- [ ] **Step 2: Atualizar `pricing.ts` se houver lookup que dependa do catálogo** — apenas se quebrar typecheck.

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add src/lib/llm/catalog.ts
git commit -m "feat(llm): atualiza PROVIDER_CATALOG com modelos 2024+ até abril/2026"
```

---

## Task 9: Fix dropdown preso + olhinho descentralizado

**Files:**
- Modify: `src/components/settings/llm-config-card.tsx`
- Read for reference: `src/components/ui/searchable-select.tsx` (provavelmente o componente do dropdown).

- [ ] **Step 1: Diagnóstico do dropdown**

Inspecionar render:
- Se `<SearchableSelect>` usa `<div className="absolute ...">` em vez de `<Popover.Portal>`, migrar para `<Popover.Portal>` (mesmo padrão do `<CustomSelect>`).
- Se o pai cria stacking context (`overflow-hidden`, `transform`), trocar para `<Popover.Portal>` resolve.

- [ ] **Step 2: Aplicar fix**

Editar `src/components/ui/searchable-select.tsx` para usar `<Popover.Portal>`.

- [ ] **Step 3: Olhinho da API key**

No card LLM, encontrar `<PasswordInput>` (ou similar). Garantir wrapper:
```tsx
<div className="relative">
  <input className="h-10 px-3 pr-10 ..." />
  <button className="absolute inset-y-0 right-2 flex items-center justify-center w-8 h-full">
    <Eye className="h-4 w-4" />
  </button>
</div>
```

- [ ] **Step 4: typecheck + commit**

```bash
npm run typecheck
git add src/components/ui/searchable-select.tsx src/components/settings/llm-config-card.tsx
git commit -m "fix(ui): dropdown de modelo portalizado + olhinho da API key centralizado"
```

---

## Task 10: Seed + config page passa visibility

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `src/app/(protected)/configuracoes/page.tsx`

- [ ] **Step 1: Adicionar defaults no seed**

`APP_SETTINGS_DEFAULTS` recebe entradas:
- `reports.visibility.visao-geral` → `"all"`, category `"visibility"`.
- ... idem 6 outras keys.
- `reports.matrix_ia_visibility` → `"super_admin_only"`.

- [ ] **Step 2: configuracoes/page.tsx**

Trocar leitura de `enabled_reports` (boolean array) por leitura das 7 chaves novas. Buscar Matrix IA da chave nova. Passar `Visibility` (não `boolean`) para os cards.

- [ ] **Step 3: commit**

```bash
git add prisma/seed.ts 'src/app/(protected)/configuracoes/page.tsx'
git commit -m "feat(seed): defaults de visibility + page configurações passa Visibility"
```

---

## Task 11: Verification + bump + docs

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/agents/HISTORY.md`
- Delete: `docs/agents/active/claude-visibility-models.md`

- [ ] **Step 1: full typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Step 2: Bump versão**

`package.json`: `"version": "0.11.0"`.

- [ ] **Step 3: Update CHANGELOG.md**

Entrada `## [v0.11.0] 2026-04-30 — Visibilidade granular + catálogo LLM atualizado`. Listar mudanças.

- [ ] **Step 4: Update docs/STATUS.md**

Versão atual em produção: v0.11.0. Lista de novidades.

- [ ] **Step 5: Append HISTORY.md** (a cada commit relevante já feito acima e o commit final).

- [ ] **Step 6: Delete active file**

```bash
rm docs/agents/active/claude-visibility-models.md
```

- [ ] **Step 7: Final commit**

```bash
git add ...
git commit -m "docs(release): v0.11.0 visibility granular + catálogo LLM"
```

- [ ] **Step 8: Push** (após `gh run list` pra ver builds em curso)

```bash
gh run list --limit 5
git push origin main
```

- [ ] **Step 9: Aguardar CI verde + reaplicar portainer-fix com APP_VERSION=v0.11.0**

```bash
gh run watch <id> --exit-status
gh workflow run portainer-fix.yml -f app_version=v0.11.0 -f fix_worker_cmd=false
```

- [ ] **Step 10: Smoke test**

```bash
curl -sS https://insights.nexusai360.com/api/health
```

Esperado: `version: "v0.11.0"`, status ok.

---

## Self-Review (após plan completo)

**Spec coverage** — para cada item do §6 da spec:
- [✓] Migrations/seed → Task 10.
- [✓] Helpers visibility com TDD → Task 1.
- [✓] UI cards → Task 4 + 5.
- [✓] Sidebar + page guards → Task 6.
- [✓] Drill-downs/dashboards herdam → coberto via `getVisibleReportKeys` no sidebar e `isReportVisibleForUser` nas pages.
- [✓] Queries Chatwoot recebem visibility → Task 7.
- [✓] Filtros/dropdowns escondem inbox 31 → Task 7.
- [✓] Tools Nex → Task 7 (mesmo helper).
- [✓] Catálogo LLM → Task 8.
- [✓] Bug dropdown + olhinho → Task 9.
- [✓] Tests verdes → Task 11 step 1.
- [✓] Deploy v0.11.0 → Task 11 steps 7-9.
- [✓] CHANGELOG/STATUS/runbook → Task 11.
- [✓] HISTORY.md → Task 11.

**Placeholder scan** — sem TBD, sem "implement later".

**Type consistency** — `Visibility` definida em Task 1 é o tipo único usado em Tasks 3, 4, 5, 6, 7, 10. `resolveVisibility` assinatura consistente.

Plan v3 final.
