# Suite Agente Nex Polish v5 (v0.31.0) — Plano v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Implementar feature grande (nomenclaturas custom + sugestões em botões clicáveis) + 6 polish cirúrgicos no Agente Nex + bug fix da cotação USD/BRL inflada (>R$6/USD por bug de spread).

**Architecture:** 4 schema additives (`nex_settings.terminology JSONB`, `nex_settings.suggestions_enabled BOOLEAN`, `llm_usage.is_playground BOOLEAN`, hardcode spread=1.10). PromptCompose injeta seções "## Terminologia" + instrução de sugestões. Agent emite sufixo `[[suggestions]]:item1|item2` quando aplicável; backend parsea + retorna `{ message, suggestions }`. Frontend renderiza botões clicáveis. Consumo: Hoje vira hourly + coluna Origem (Bubble/Playground) + filtro Ambiente.

**Tech Stack:** Next.js 16 · TS · base-ui · Recharts · Tailwind v4 · NextAuth v5 · PostgreSQL · Lucide React · Jest + jest-mock-extended.

---

## Convenções

- **Antes de qualquer task UI:** subagente invoca `ui-ux-pro-max:ui-ux-pro-max` via Skill. Não negociável.
- **TDD obrigatório:** RED → GREEN → COMMIT por task com código testável.
- **Commits granulares:** 1 task = 1 commit. Padrão `feat(agente-nex): T-<N> v0.31 — <subject>` ou `fix(agente-nex): ...`.
- **Coordenação:** outro agente paralelo bumpou v0.27/v0.30 em /relatorios/conversas — escopo distinto, sem overlap em código fonte. Release files (package.json, CHANGELOG, STATUS) só toco no R1 com `git fetch` antes.

---

## Mapa de arquivos

### Group A — Schema additive (foundation)
- **Modify:** `src/lib/nex/ensure-tables.ts` — column `terminology JSONB DEFAULT '{}'` + column `suggestions_enabled BOOLEAN DEFAULT false` em `nex_settings`. Pre-seed terminology Matrix idempotente.
- **Modify:** `src/lib/llm/ensure-tables.ts` — column `is_playground BOOLEAN DEFAULT false` em `llm_usage`.
- **Test:** `src/lib/nex/__tests__/ensure-tables.test.ts` (existente, adicionar 3 asserts).
- **Test:** `src/lib/llm/__tests__/ensure-tables.test.ts` (existente — verificar pattern, adicionar assert).

### Group B — Configuração polish
- **Modify:** `src/lib/llm/exchange-rate.ts` — hardcode `FIXED_SPREAD = 1.10` em `getUsdBrlRate()`; `setCardSpread()` no-op + console.warn (back-compat).
- **Modify:** `src/components/agente-nex/llm-config-form.tsx` — remove Spread cartão Card violet, remove UsdRateTicker section, redesign toggle Nex linha única (sem Card aninhado), remove botão "Criar API key" inline (mantém "Adicionar crédito"), remove props `initialSpread/initialCommercialRate/initialRateSource/initialFetchedAt`.
- **Modify:** `src/app/(protected)/agente-nex/configuracao/page.tsx` — remove props extras passadas pra LlmConfigForm; remove `getUsdBrlRate().catch(...)` da Promise.all.
- **Test:** `src/lib/llm/__tests__/exchange-rate.test.ts` — verifica spread fixo 1.10 ignora setting do DB.

### Group C — Prompt features (Nomenclaturas + Sugestões + polish)
- **Modify:** `src/lib/nex/prompt-compose.ts` — `NexPromptConfig.terminology + suggestionsEnabled`; composeSystemPrompt injeta seções condicionais "## Terminologia" e "## Sugestões clicáveis".
- **Modify:** `src/lib/nex/prompt.ts` — getNexPromptConfig SELECT inclui terminology + suggestions_enabled; saveNexPromptConfig INSERT/UPDATE com 10 placeholders.
- **Modify:** `src/lib/actions/nex-prompt.ts` — `saveTerminologyAction(map)` + `setSuggestionsEnabledAction(enabled)` (super_admin gate).
- **Modify:** `src/components/agente-nex/prompt-config-form.tsx` — section "Nomenclaturas e termos" entre Tom e Guardrails; toggle "Sugestões em botões" entre Nomenclaturas e Guardrails.
- **Modify:** `src/components/agente-nex/prompt-preview-card.tsx` — remove `<p>Preview somente leitura. Use Editar...</p>`.
- **Modify:** `src/components/agente-nex/kb-section.tsx` — botão "Adicionar documento" → "Adicionar conhecimento".
- **Modify:** `src/components/agente-nex/kb-upload-dialog.tsx` — DialogTitle "Adicionar documento" → "Adicionar conhecimento".
- **Test:** `src/lib/nex/__tests__/prompt-compose.test.ts` (existente, adicionar 3 testes).
- **Test:** `src/lib/actions/__tests__/nex-prompt.test.ts` (existente, adicionar 4 testes).
- **Mocks de NexPromptConfig** (~9 arquivos) atualizados com `terminology: {}` + `suggestionsEnabled: false`.

### Group D — Bubble: sugestões clicáveis + isPlayground propagação
- **Modify:** `src/lib/llm/agent/run-nex.ts` — helper `extractSuggestions(text)`; emit `RunNexResult.suggestions: string[]`; SEMPRE chama logUsage (remove `if (!args.isPlayground)` skip); propaga `is_playground` ao logUsage.
- **Modify:** `src/lib/llm/agent/usage-logger.ts` — aceita `isPlayground?: boolean` no args; INSERT inclui na column nova.
- **Modify:** `src/lib/actions/nex-chat.ts` — `sendNexMessage(messages, options?: { isPlayground?: boolean })`; retorna `{ ok, message, suggestions: string[] }`.
- **Modify:** `src/components/nex/nex-chat-panel.tsx` — `UiMessage.suggestions?: string[]`; render botões abaixo da assistant message; click envia sugestão como nova msg + limpa suggestions da msg anterior.
- **Modify:** `src/components/agente-nex/playground-sheet.tsx` — `submitMessage` chama `sendNexMessage(history, { isPlayground: true })`.
- **Test:** `src/lib/llm/agent/__tests__/run-nex.test.ts` (existente — atualizar test "não chama logUsage quando isPlayground=true" pra "chama logUsage com is_playground=true"; adicionar parser test).
- **Test:** `src/lib/actions/__tests__/nex-chat.test.ts` (existente ou novo) — verifica suggestions retornadas.
- **Test:** `src/components/nex/__tests__/nex-chat-panel.test.tsx` (criar se não existir, ou adicionar caso ao existente) — botões renderizados, click consome.
- **Test:** `src/components/agente-nex/__tests__/playground-sheet.test.tsx` — verifica isPlayground=true passado.

### Group E — Consumo: Hoje hourly + Origem coluna + Ambiente filtro + Donut polish
- **Modify:** `src/components/charts/donut-with-center.tsx` — defaults `innerRadius=75, outerRadius=110` (era 80/120); `tooltipPosition` de volta como prop ATIVA (undeprecate); default position fixo "top-right" (não follow-mouse).
- **Modify:** `src/lib/llm/queries/usage-stats.ts` — `UsageSummary.byHour?: Array<{ hour: number; cost: number; costBrl: number; calls: number }>` quando range curto; query nova; `UsageDetailRow.isPlayground: boolean`; `getUsageDetails` aceita `isPlayground?: boolean | null` filter.
- **Modify:** `src/lib/actions/llm-usage.ts` — `fetchUsageDetails` propaga isPlayground filter.
- **Modify:** `src/components/llm/consumo-content.tsx` — when `pill === "hoje"`, renderiza area chart hourly (24 buckets); coluna nova "Origem" (Agente Nex/Playground com badge); filtro `<CustomSelect>` "Ambiente" ao lado do Provider global; state `ambiente: "all" | "bubble" | "playground"`.
- **Modify:** `src/components/charts/__tests__/donut-with-center.test.tsx` — defaults novos.
- **Modify:** `src/components/llm/__tests__/consumo-content.test.tsx` — testes hourly + coluna + filtro.

### Group R — Release
- `package.json` (0.30 → 0.31), `CHANGELOG.md`, `docs/STATUS.md`, `docs/agents/HISTORY.md`, deletar `docs/agents/active/claude-agente-nex-polish-v031.md`.

---

## Tasks (granulares com TDD completo)

### Task A1: Schema — terminology + suggestions_enabled em nex_settings

**Files:**
- Modify: `src/lib/nex/ensure-tables.ts`
- Modify: `src/lib/nex/__tests__/ensure-tables.test.ts`

- [ ] **Step 1:** Skill ui-ux-pro-max — não aplica (lib).

- [ ] **Step 2: Write failing tests** — adicionar a `src/lib/nex/__tests__/ensure-tables.test.ts`:

```typescript
describe("ensure-tables — terminology + suggestions_enabled (v0.31)", () => {
  it("adiciona column terminology JSONB DEFAULT '{}' (idempotente)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?terminology/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/JSONB/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+'\{\}'::jsonb/i);
  });

  it("adiciona column suggestions_enabled BOOLEAN DEFAULT false", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?suggestions_enabled/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/BOOLEAN/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+false/i);
  });

  it("pre-seed terminology Matrix idempotente (estados/agentes/teams)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const seedCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/UPDATE\s+"nex_settings".*SET\s+"terminology"/i),
    );
    expect(seedCall).toBeDefined();
    const sql = String(seedCall![0]);
    expect(sql).toMatch(/"estados":\s*"inboxes"/);
    expect(sql).toMatch(/"colaboradores":\s*"agentes"/);
    expect(sql).toMatch(/"departamento":\s*"teams"/);
    expect(sql).toMatch(/"terminology"\s+IS\s+NULL\s+OR\s+"terminology"\s*=\s*'\{\}'::jsonb/i);
  });
});
```

- [ ] **Step 3: RED** — `npm test -- ensure-tables`.

- [ ] **Step 4: Edit src/lib/nex/ensure-tables.ts** — adicionar APÓS o ALTER do `identity_base` (que existe da v0.28):

```typescript
// v0.31.0: terminology JSONB — mapa termo→significado pra interpretar nomenclaturas custom.
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "terminology" JSONB NOT NULL DEFAULT '{}'::jsonb;
`);

// v0.31.0: suggestions_enabled — toggle "Sugestões em botões" (default off).
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "suggestions_enabled" BOOLEAN NOT NULL DEFAULT false;
`);

// v0.31.0: pre-seed terminology padrão Matrix (idempotente — só se '{}').
await pgPool.query(`
  UPDATE "nex_settings"
  SET "terminology" = '{
    "estados": "inboxes",
    "colaboradores": "agentes",
    "funcionários": "agentes",
    "minha equipe": "agentes",
    "meu time": "agentes",
    "departamento": "teams",
    "setor": "teams",
    "time": "teams"
  }'::jsonb
  WHERE "id" = 'global'
    AND ("terminology" IS NULL OR "terminology" = '{}'::jsonb);
`);
```

- [ ] **Step 5: GREEN** — `npm test -- ensure-tables`.

- [ ] **Step 6: Commit:**

```bash
git add src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts
git commit -m "feat(agente-nex): T-A1 v0.31 — schema terminology JSONB + suggestions_enabled BOOLEAN em nex_settings + pre-seed Matrix (estados/equipe/departamento)"
```

---

### Task A2: Schema — is_playground em llm_usage

**Files:**
- Modify: `src/lib/llm/ensure-tables.ts`
- Modify: `src/lib/llm/__tests__/ensure-tables.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing test:**

```typescript
describe("ensure-tables (llm) — is_playground (v0.31)", () => {
  it("adiciona column is_playground BOOLEAN DEFAULT false (idempotente)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureLlmTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?is_playground/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/BOOLEAN/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+false/i);
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit src/lib/llm/ensure-tables.ts** — adicionar nova ALTER:

```typescript
// v0.31.0: is_playground — distingue chamadas do Bubble (false) vs Playground (true).
await pgPool.query(`
  ALTER TABLE "llm_usage"
    ADD COLUMN IF NOT EXISTS "is_playground" BOOLEAN NOT NULL DEFAULT false;
`);
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/llm/ensure-tables.ts src/lib/llm/__tests__/ensure-tables.test.ts
git commit -m "feat(agente-nex): T-A2 v0.31 — schema is_playground BOOLEAN em llm_usage (distingue Bubble vs Playground)"
```

---

### Task B1: exchange-rate — hardcode spread=1.10 (fix bug cotação inflada)

**Files:**
- Modify: `src/lib/llm/exchange-rate.ts`
- Modify: `src/lib/llm/__tests__/exchange-rate.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing test:**

```typescript
describe("getUsdBrlRate — spread fixo (v0.31)", () => {
  it("usa spread=1.10 hardcoded ignorando SPREAD_KEY do DB", async () => {
    __resetUsdBrlCache();
    // Mock DB com spread setado pra 1.40 (cenário do bug user)
    mockedPgPool.query.mockImplementation((sql: string) => {
      if (String(sql).includes("llm.usd_brl.card_spread")) {
        return Promise.resolve({ rowCount: 1, rows: [{ value: 1.4 }] });
      }
      if (String(sql).includes("llm.usd_brl.rate_cache")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ value: { commercial: 5.0, fetchedAt: new Date().toISOString() } }],
        });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    const result = await getUsdBrlRate();
    expect(result.spread).toBe(1.10);
    expect(result.rate).toBe(5.5); // 5.0 × 1.10, NÃO 5.0 × 1.40
  });
});
```

- [ ] **Step 3: RED** — `npm test -- exchange-rate`.

- [ ] **Step 4: Edit src/lib/llm/exchange-rate.ts:**

Adicionar constante:
```typescript
/** v0.31.0: spread fixo (≈ IOF 3.5% + 6.5% spread real do cartão).
 *  User removeu controle UI; antes era configurável e estava setado pra 1.40+
 *  causando cost_brl >R$6/USD. */
const FIXED_SPREAD = 1.10;
```

Em `getUsdBrlRate()`, substituir:
```typescript
const spreadRaw = await readSetting<number>(SPREAD_KEY);
const spread = clampSpread(spreadRaw ?? DEFAULT_CARD_SPREAD);
```

Por:
```typescript
// v0.31.0: hardcode spread — ignora SPREAD_KEY do DB.
const spread = FIXED_SPREAD;
```

E `setCardSpread()` vira no-op + warn:
```typescript
export async function setCardSpread(_spread: number): Promise<void> {
  console.warn(
    "[exchange-rate] setCardSpread chamado mas é no-op desde v0.31 — spread hardcoded em 1.10.",
  );
}
```

- [ ] **Step 5: GREEN + commit:**

```bash
git add src/lib/llm/exchange-rate.ts src/lib/llm/__tests__/exchange-rate.test.ts
git commit -m "fix(agente-nex): T-B1 v0.31 — exchange-rate hardcode spread=1.10 (ignora DB) — fix cotação inflada >R$6/USD reportada pelo user"
```

---

### Task B2: Configuração — remove Spread/Ticker UI + redesign toggle Nex + remove Criar API key

**Files:**
- Modify: `src/components/agente-nex/llm-config-form.tsx`
- Modify: `src/app/(protected)/agente-nex/configuracao/page.tsx`
- Modify: `src/components/agente-nex/__tests__/llm-config-form.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Toggle Nex ativo: linha única (border + bg-muted/30 + 1 row), sem Card aninhado.
  - Sem Spread input + sem UsdRateTicker.
  - Sem botão "Criar API key" inline (mantém só "Adicionar crédito" `topUpUrl`).
  - Touch target Switch ≥44pt mantido.

- [ ] **Step 2: Write/update failing tests:**

```typescript
describe("LlmConfigForm — v0.31 polish", () => {
  it("NÃO renderiza UsdRateTicker", () => {
    renderForm();
    expect(screen.queryByText(/USD\/BRL com spread/i)).not.toBeInTheDocument();
  });

  it("NÃO renderiza Spread cartão input", () => {
    renderForm();
    expect(screen.queryByLabelText(/Spread cartão/i)).not.toBeInTheDocument();
  });

  it("NÃO renderiza botão 'Criar API key' inline", () => {
    renderForm();
    expect(screen.queryByRole("link", { name: /Criar API key/i })).not.toBeInTheDocument();
  });

  it("Toggle Nex ativo NÃO está dentro de Card aninhado (estrutura linha única)", () => {
    const { container } = renderForm();
    const toggle = screen.getByRole("switch", { name: /Agente Nex|Ativar Agente|Desativar Agente/i });
    // Toggle deve estar em parent direto sem outro role=group entre ele e a section
    const parent = toggle.closest("[class*='rounded-xl']");
    expect(parent).not.toBeNull();
    // No parent atual NÃO deve haver outro div com role=group (era o pattern aninhado v0.26-v0.28)
    expect(parent?.querySelector("[role='group']")).toBeNull();
  });
});
```

- [ ] **Step 3: RED** — `npm test -- llm-config-form`.

- [ ] **Step 4: Edit llm-config-form.tsx** — remover blocos completos:

(a) Remover imports não-usados após edição: `UsdRateTicker`, `Coins` (se não usado em outro lugar), tipo `UsdBrlRate`.

(b) Remover state `currentSpreadValue` + `setCurrentSpreadValue` + helpers de spread (`spreadInput`, `setSpreadInput`, `lastSavedSpreadRef`, `spreadDebounceRef`, `isSavingSpread`, `setIsSavingSpread`, `commitSpread`, `handleSpreadChange`, `handleSpreadBlur`).

(c) Remover props `initialSpread`, `initialCommercialRate`, `initialRateSource`, `initialFetchedAt` da interface + destructuring.

(d) **Toggle Nex ativo — linha única.** Substituir o block existente (`<div ... role="group" aria-labelledby="nex-bubble-toggle-title">...</div>`) por:

```tsx
{/* Toggle Agente Nex ativo — linha única, sem Card aninhado (v0.31) */}
<div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
  <div className="flex min-w-0 items-center gap-3">
    <span
      aria-hidden
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full transition-[background-color,box-shadow] duration-200",
        nexEnabled
          ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
          : "bg-zinc-400 dark:bg-zinc-600",
      )}
    />
    <div className="min-w-0">
      <Label
        htmlFor="nex-bubble-toggle"
        className="cursor-pointer text-sm font-medium text-foreground"
      >
        {nexEnabled ? "Agente Nex ativo" : "Agente Nex desativado"}
      </Label>
      <p className="text-xs text-muted-foreground">
        {!isConfigured
          ? "Configure um provedor abaixo para liberar a bolha flutuante."
          : nexEnabled
            ? "A bolha flutuante aparece em todas as páginas autenticadas."
            : "A bolha flutuante está oculta para todos os usuários."}
      </p>
    </div>
  </div>
  <Switch
    id="nex-bubble-toggle"
    checked={nexEnabled}
    onCheckedChange={handleNexToggle}
    disabled={isTogglingNex || !isConfigured}
    aria-label={nexEnabled ? "Desativar Agente Nex" : "Ativar Agente Nex"}
  />
</div>
```

(e) **Remover botão "Criar API key" inline** — apagar o `<a data-testid="llm-shortcut-api-key">` inteiro. Manter o `<a data-testid="llm-shortcut-top-up">` ("Adicionar crédito") quando `catalog.topUpUrl` existir.

(f) **Remover Section 3 (UsdRateTicker)** e **Section 4 (Spread cartão Card violet)** completamente do JSX.

- [ ] **Step 5: Edit page.tsx:**

Remover `getUsdBrlRate().catch(() => null)` da Promise.all + `currentRate?.spread`/`commercial`/`source`/`fetchedAt` derivações + props extras. LlmConfigForm passa apenas: `initial`, `initialNexEnabled`, `initialCredentials`.

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/components/agente-nex/llm-config-form.tsx src/app/\(protected\)/agente-nex/configuracao/page.tsx src/components/agente-nex/__tests__/llm-config-form.test.tsx
git commit -m "feat(agente-nex): T-B2 v0.31 — Configuração polish (remove Spread/Ticker UI + toggle Nex linha única + remove Criar API key inline)"
```

---

### Task C1: prompt-compose suporta terminology + suggestions_enabled

**Files:**
- Modify: `src/lib/nex/prompt-compose.ts`
- Modify: `src/lib/nex/__tests__/prompt-compose.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("composeSystemPrompt — terminology (v0.31)", () => {
  it("injeta seção '## Terminologia' quando cfg.terminology não-vazio", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: { estados: "inboxes", "minha equipe": "agentes" },
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).toMatch(/## Terminologia/);
    expect(out).toMatch(/"estados".*→.*inboxes/);
    expect(out).toMatch(/"minha equipe".*→.*agentes/);
  });

  it("NÃO injeta seção quando terminology está vazio", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).not.toMatch(/## Terminologia/);
  });
});

describe("composeSystemPrompt — suggestions_enabled (v0.31)", () => {
  it("injeta instrução [[suggestions]] quando suggestionsEnabled=true", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: true,
      },
      [],
      [],
    );
    expect(out).toMatch(/## Sugestões clicáveis/);
    expect(out).toMatch(/\[\[suggestions\]\]:/);
    expect(out).toMatch(/máximo 4 sugestões/i);
  });

  it("NÃO injeta instrução quando suggestionsEnabled=false", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).not.toMatch(/## Sugestões clicáveis/);
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit prompt-compose.ts:**

Atualizar interface:
```typescript
export interface NexPromptConfig {
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
  /** v0.31.0: mapa termo→significado pra interpretar nomenclaturas custom do tenant. */
  terminology: Record<string, string>;
  /** v0.31.0: quando true, agent oferece sugestões em formato `[[suggestions]]:item|item`. */
  suggestionsEnabled: boolean;
}
```

Em `composeSystemPrompt`, ANTES do return final, adicionar 2 blocos condicionais:

```typescript
// v0.31.0: Terminologia custom (mapa termo→significado oficial).
if (Object.keys(cfg.terminology).length > 0) {
  const items = Object.entries(cfg.terminology)
    .map(([term, mean]) => `- "${term}" → ${mean}`)
    .join("\n");
  parts.push(
    `\n\n## Terminologia\nQuando o usuário usar os termos abaixo, interprete-os como o significado oficial:\n${items}`,
  );
}

// v0.31.0: Sugestões clicáveis (parser-friendly sufixo).
if (cfg.suggestionsEnabled) {
  parts.push(
    `\n\n## Sugestões clicáveis\nQuando você identificar 2-4 ações de follow-up úteis e o usuário se beneficiaria de continuar a conversa nessas direções, **inclua exatamente uma linha ao FINAL da sua resposta** no formato:\n\`[[suggestions]]:Sugestão 1|Sugestão 2|Sugestão 3\`\nCada sugestão deve ser uma pergunta curta e clicável (≤ 60 chars). Use no máximo 4 sugestões. NÃO use esse formato em todas as respostas — apenas quando fizer sentido oferecer continuidade lógica.`,
  );
}
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/nex/prompt-compose.ts src/lib/nex/__tests__/prompt-compose.test.ts
git commit -m "feat(agente-nex): T-C1 v0.31 — composeSystemPrompt suporta terminology + suggestions_enabled (seções condicionais '## Terminologia' e '## Sugestões clicáveis')"
```

---

### Task C2: prompt.ts read/write + Server Actions + atualiza mocks

**Files:**
- Modify: `src/lib/nex/prompt.ts` (SELECT + INSERT/UPDATE com 10 placeholders)
- Modify: `src/lib/actions/nex-prompt.ts` (saveTerminologyAction + setSuggestionsEnabledAction)
- Modify: `src/lib/actions/__tests__/nex-prompt.test.ts` (4 novos testes)
- Modify: ~9 arquivos com mocks de NexPromptConfig (adicionar `terminology: {}` + `suggestionsEnabled: false`)

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests** — adicionar a `nex-prompt.test.ts`:

```typescript
describe("saveTerminologyAction (v0.31)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin: persiste terminology no DB", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin", id: "u1" });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({ ...baseCfg });
    const result = await saveTerminologyAction({ estados: "inboxes" });
    expect(result.ok).toBe(true);
    expect(saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ terminology: { estados: "inboxes" } }),
      "u1",
    );
  });

  it("não-superadmin: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "viewer" });
    const result = await saveTerminologyAction({ x: "y" });
    expect(result.ok).toBe(false);
  });

  it("máximo 50 chaves: nega quando excede", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin", id: "u1" });
    const big: Record<string, string> = {};
    for (let i = 0; i < 51; i++) big[`k${i}`] = "v";
    const result = await saveTerminologyAction(big);
    expect(result.ok).toBe(false);
  });
});

describe("setSuggestionsEnabledAction (v0.31)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin: persiste flag no DB", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin", id: "u1" });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({ ...baseCfg });
    const result = await setSuggestionsEnabledAction(true);
    expect(result.ok).toBe(true);
    expect(saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ suggestionsEnabled: true }),
      "u1",
    );
  });
});
```

(Atualize `baseCfg` no topo do file pra incluir `terminology: {}, suggestionsEnabled: false`.)

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit prompt.ts** — atualizar SELECT + INSERT/UPDATE:

`getNexPromptConfig`:
```typescript
const r = await pgPool.query<{
  identity_base: string | null;
  personality: string;
  tone: string;
  guardrails: unknown;
  advanced_override: string | null;
  audio_input_enabled: boolean;
  kb_enabled: boolean;
  terminology: unknown;
  suggestions_enabled: boolean;
}>(
  `SELECT identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, terminology, suggestions_enabled
   FROM nex_settings WHERE id = 'global' LIMIT 1`,
);
if (r.rowCount === 0) {
  return {
    identityBase: null,
    personality: "",
    tone: "",
    guardrails: [],
    advancedOverride: null,
    audioInputEnabled: false,
    kbEnabled: true,
    terminology: {},
    suggestionsEnabled: false,
  };
}
const row = r.rows[0];
return {
  identityBase: row.identity_base,
  personality: row.personality ?? "",
  tone: row.tone ?? "",
  guardrails: asStrArray(row.guardrails),
  advancedOverride: row.advanced_override,
  audioInputEnabled: !!row.audio_input_enabled,
  kbEnabled: !!row.kb_enabled,
  terminology: asStringMap(row.terminology),
  suggestionsEnabled: !!row.suggestions_enabled,
};
```

Onde `asStringMap`:
```typescript
function asStringMap(v: unknown): Record<string, string> {
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}
```

`saveNexPromptConfig` INSERT/UPDATE com 10 placeholders:
```typescript
await pgPool.query(
  `INSERT INTO nex_settings (id, identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, terminology, suggestions_enabled, updated_at, updated_by_id)
   VALUES ('global', $1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, NOW(), $10)
   ON CONFLICT (id) DO UPDATE SET
     identity_base = EXCLUDED.identity_base,
     personality = EXCLUDED.personality,
     tone = EXCLUDED.tone,
     guardrails = EXCLUDED.guardrails,
     advanced_override = EXCLUDED.advanced_override,
     audio_input_enabled = EXCLUDED.audio_input_enabled,
     kb_enabled = EXCLUDED.kb_enabled,
     terminology = EXCLUDED.terminology,
     suggestions_enabled = EXCLUDED.suggestions_enabled,
     updated_at = NOW(),
     updated_by_id = EXCLUDED.updated_by_id`,
  [
    cfg.identityBase ?? null,
    cfg.personality,
    cfg.tone,
    JSON.stringify(cfg.guardrails),
    cfg.advancedOverride ?? null,
    cfg.audioInputEnabled,
    cfg.kbEnabled,
    JSON.stringify(cfg.terminology ?? {}),
    cfg.suggestionsEnabled,
    updatedById ?? null,
  ],
);
```

- [ ] **Step 5: Edit nex-prompt.ts** — adicionar Server Actions ao final:

```typescript
const MAX_TERMINOLOGY_KEYS = 50;
const MAX_TERM_LEN = 100;

export async function saveTerminologyAction(
  terminology: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão" };
  }
  const entries = Object.entries(terminology ?? {});
  if (entries.length > MAX_TERMINOLOGY_KEYS) {
    return { ok: false, error: `Máximo ${MAX_TERMINOLOGY_KEYS} termos` };
  }
  for (const [k, v] of entries) {
    if (typeof k !== "string" || typeof v !== "string") {
      return { ok: false, error: "Termos devem ser strings" };
    }
    if (k.length === 0 || k.length > MAX_TERM_LEN) {
      return { ok: false, error: `Chave inválida (1-${MAX_TERM_LEN} chars)` };
    }
    if (v.length === 0 || v.length > MAX_TERM_LEN) {
      return { ok: false, error: `Valor inválido (1-${MAX_TERM_LEN} chars)` };
    }
  }
  const current = await getNexPromptConfig();
  await saveNexPromptConfig({ ...current, terminology }, user.id);
  return { ok: true };
}

export async function setSuggestionsEnabledAction(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão" };
  }
  const current = await getNexPromptConfig();
  await saveNexPromptConfig({ ...current, suggestionsEnabled: enabled }, user.id);
  return { ok: true };
}
```

Importar `getCurrentUser`, `getNexPromptConfig`, `saveNexPromptConfig` no topo se não estiverem.

- [ ] **Step 6: Atualizar mocks** — busca:

```bash
grep -rln "advancedOverride: null" src/ 2>/dev/null
```

Pra cada arquivo com objeto NexPromptConfig sem `terminology` ou `suggestionsEnabled`, adicionar antes/depois de `audioInputEnabled`:
```typescript
terminology: {},
suggestionsEnabled: false,
```

Lista esperada (8-10 files): `prompt-compose.test.ts`, `prompt.test.ts` (mocks), `playground-sheet.test.tsx`, `prompt-config-form.test.tsx`, `prompt-preview-card.test.tsx`, `nex-prompt.test.ts`, `run-nex.test.ts`, `identity-base-editor.test.tsx`. Verificar manualmente.

- [ ] **Step 7: GREEN** — `npm test -- nex-prompt prompt-compose prompt-config-form playground-sheet prompt-preview-card run-nex identity-base-editor` (todos PASS).

- [ ] **Step 8: Typecheck** — `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "terminology|suggestionsEnabled" || echo "OK"`.

- [ ] **Step 9: Commit:**

```bash
git add src/lib/nex/prompt.ts src/lib/actions/nex-prompt.ts src/lib/actions/__tests__/nex-prompt.test.ts
# + arquivos de mocks atualizados
git commit -m "feat(agente-nex): T-C2 v0.31 — prompt.ts persiste terminology + suggestions_enabled + saveTerminologyAction/setSuggestionsEnabledAction (super_admin gate) + atualiza mocks NexPromptConfig"
```

---

### Task C3: PromptPreviewCard remove frase + KB rename "documento" → "conhecimento"

**Files:**
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`
- Modify: `src/components/agente-nex/kb-section.tsx`
- Modify: `src/components/agente-nex/kb-upload-dialog.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar consistência terminológica "Adicionar conhecimento" em ambos arquivos.

- [ ] **Step 2: Edit prompt-preview-card.tsx** — remover esse `<p>` italic:

```tsx
<p className="text-xs italic text-muted-foreground">
  Preview somente leitura.{" "}
  {isSuperAdmin
    ? "Use Editar para alterar o prompt do agente. Personalidade, Tom e Guardrails ficam na seção Comportamento abaixo."
    : "Apenas super_admins podem editar."}
</p>
```

(Pra não-superadmin, manter um pequeno `<p>` "Apenas super_admins podem editar." no lugar, sem o "Preview somente leitura...".)

Substituir por:
```tsx
{!isSuperAdmin ? (
  <p className="text-xs italic text-muted-foreground">
    Apenas super_admins podem editar.
  </p>
) : null}
```

- [ ] **Step 3: Edit kb-section.tsx (linha 335):**

```tsx
{/* ANTES: */}
Adicionar documento

{/* DEPOIS: */}
Adicionar conhecimento
```

E o comentário do JSDoc/header (linha 16):
```tsx
{/* ANTES: */}
- Botão "Adicionar documento" → abre `<KbUploadDialog>` (suporta abas File e

{/* DEPOIS: */}
- Botão "Adicionar conhecimento" → abre `<KbUploadDialog>` (suporta abas File e
```

E o comentário JSX (linha 326):
```tsx
{/* Adicionar documento */} → {/* Adicionar conhecimento */}
```

- [ ] **Step 4: Edit kb-upload-dialog.tsx (linha 162):**

```tsx
<DialogTitle>Adicionar conhecimento</DialogTitle>
```

- [ ] **Step 5: Test atualizado** — se houver assertion de "Adicionar documento" em `kb-section.test.tsx` ou `kb-upload-dialog.test.tsx`, atualizar.

```bash
grep -rn "Adicionar documento" src/ 2>/dev/null
```

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/components/agente-nex/prompt-preview-card.tsx src/components/agente-nex/kb-section.tsx src/components/agente-nex/kb-upload-dialog.tsx
# + tests atualizados se houver
git commit -m "feat(agente-nex): T-C3 v0.31 — remove frase 'Preview somente leitura' (super_admin) + KB 'Adicionar documento' → 'Adicionar conhecimento'"
```

---

### Task C4: PromptConfigForm — section Nomenclaturas + toggle Sugestões

**Files:**
- Modify: `src/components/agente-nex/prompt-config-form.tsx`
- Modify: `src/components/agente-nex/__tests__/prompt-config-form.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Section "Nomenclaturas e termos" entre **Tom** e **Guardrails**. Lista de pares chave→valor (Input + Input + remove ícone). Botão "Adicionar termo" outline. Help text explicando o uso.
  - Toggle "Sugestões em botões" entre Nomenclaturas e Guardrails. Igual em layout ao "Modo prompt manual" mas sem warning destrutivo. Help text "Quando ativo, o Agente Nex oferece ações em botões clicáveis no fim de respostas que admitam continuidade".
  - Cap 50 termos (toast quando atingir).

- [ ] **Step 2: Write failing tests:**

```typescript
describe("PromptConfigForm — Nomenclaturas (v0.31)", () => {
  it("renderiza section 'Nomenclaturas e termos' entre Tom e Guardrails", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    const headings = screen.getAllByRole("heading");
    // (tests devem confirmar ordem e presença)
    expect(screen.getByText(/Nomenclaturas e termos/i)).toBeInTheDocument();
  });

  it("Adicionar termo cria nova linha vazia", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar termo/i }));
    expect(screen.getByPlaceholderText(/Termo/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Significa/i)).toBeInTheDocument();
  });

  it("max 50 termos: bloqueia + toast", () => {
    const filled: Record<string, string> = {};
    for (let i = 0; i < 50; i++) filled[`k${i}`] = "v";
    render(<PromptConfigForm initial={{ ...baseInitial, terminology: filled }} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar termo/i }));
    expect(mockToast).toHaveBeenCalledWith("error", expect.stringMatching(/50/));
  });
});

describe("PromptConfigForm — Sugestões em botões (v0.31)", () => {
  it("renderiza toggle 'Sugestões em botões'", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(screen.getByLabelText(/Sugestões em botões/i)).toBeInTheDocument();
  });

  it("toggle reflete initial.suggestionsEnabled", () => {
    render(<PromptConfigForm initial={{ ...baseInitial, suggestionsEnabled: true }} />);
    const toggle = screen.getByRole("switch", { name: /Sugestões em botões/i });
    expect(toggle).toBeChecked();
  });
});
```

(`baseInitial` deve incluir `terminology: {}, suggestionsEnabled: false`.)

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit prompt-config-form.tsx:**

(a) Adicionar state:
```typescript
const [terminology, setTerminology] = useState<Array<{ key: string; value: string }>>(
  () =>
    Object.entries(initial.terminology ?? {}).map(([key, value]) => ({ key, value })),
);
const [suggestionsEnabled, setSuggestionsEnabled] = useState<boolean>(
  initial.suggestionsEnabled,
);
```

(b) Atualizar `currentConfig` `useMemo` pra incluir esses 2 fields:
```typescript
const currentConfig: NexPromptConfig = useMemo(
  () => ({
    identityBase: initial.identityBase,
    personality,
    tone,
    guardrails: guardrails.map((g) => g.trim()).filter((g) => g.length > 0),
    advancedOverride: overrideOn ? override : null,
    audioInputEnabled: initial.audioInputEnabled,
    kbEnabled: initial.kbEnabled,
    terminology: Object.fromEntries(
      terminology
        .filter((t) => t.key.trim() && t.value.trim())
        .map((t) => [t.key.trim(), t.value.trim()]),
    ),
    suggestionsEnabled,
  }),
  [
    personality, tone, guardrails, overrideOn, override,
    initial.identityBase, initial.audioInputEnabled, initial.kbEnabled,
    terminology, suggestionsEnabled,
  ],
);
```

(c) Adicionar handlers:
```typescript
const MAX_TERMINOLOGY = 50;

function handleAddTerm() {
  if (terminology.length >= MAX_TERMINOLOGY) {
    toast.error(`Limite de ${MAX_TERMINOLOGY} termos atingido`);
    return;
  }
  setTerminology((prev) => [...prev, { key: "", value: "" }]);
}

function handleTermKeyChange(idx: number, k: string) {
  setTerminology((prev) => {
    const copy = [...prev];
    copy[idx] = { ...copy[idx], key: k };
    return copy;
  });
}

function handleTermValueChange(idx: number, v: string) {
  setTerminology((prev) => {
    const copy = [...prev];
    copy[idx] = { ...copy[idx], value: v };
    return copy;
  });
}

function handleRemoveTerm(idx: number) {
  setTerminology((prev) => prev.filter((_, i) => i !== idx));
}
```

(d) JSX — adicionar 2 sections novas. ENTRE o Tom e o Guardrails (i.e. após o block "Tom" antes do block "Guardrails"):

```tsx
{/* v0.31.0 — Nomenclaturas e termos (section nova) */}
<div className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <Label className="gap-2">
      <BookText className="h-3.5 w-3.5 text-muted-foreground" />
      Nomenclaturas e termos ({terminology.length}/{MAX_TERMINOLOGY})
    </Label>
  </div>
  <p className="text-xs text-muted-foreground">
    Mapeia termos custom usados pelo seu time → significados oficiais. Ex.: o usuário pergunta sobre "estados" e o agente entende como "inboxes".
  </p>

  {terminology.length === 0 ? (
    <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
      Nenhum termo configurado. Clique em "Adicionar termo" para começar.
    </div>
  ) : (
    <ul className="space-y-2">
      {terminology.map((t, idx) => (
        <li key={idx} className="flex items-start gap-2">
          <Input
            aria-label={`Termo ${idx + 1}`}
            value={t.key}
            onChange={(e) => handleTermKeyChange(idx, e.currentTarget.value)}
            placeholder="Termo (ex: estados)"
            disabled={fieldsDisabled}
            className="flex-1 min-h-[40px]"
            maxLength={100}
          />
          <span className="self-center text-xs text-muted-foreground">→</span>
          <Input
            aria-label={`Significa ${idx + 1}`}
            value={t.value}
            onChange={(e) => handleTermValueChange(idx, e.currentTarget.value)}
            placeholder="Significa (ex: inboxes)"
            disabled={fieldsDisabled}
            className="flex-1 min-h-[40px]"
            maxLength={100}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemoveTerm(idx)}
            disabled={fieldsDisabled}
            aria-label={`Remover termo ${idx + 1}`}
            className="cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  )}

  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={handleAddTerm}
    disabled={terminology.length >= MAX_TERMINOLOGY || fieldsDisabled}
    className="cursor-pointer"
  >
    <Plus className="mr-1.5 h-3.5 w-3.5" />
    Adicionar termo
  </Button>
</div>

{/* v0.31.0 — Sugestões em botões (toggle novo) */}
<div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="nex-suggestions-toggle" className="cursor-pointer text-sm font-medium text-foreground">
          Sugestões em botões
        </Label>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Quando ativo, o agente oferece 2-4 ações de follow-up no fim das respostas como botões clicáveis. Útil quando o usuário tem perguntas naturais de continuidade (ex.: "ver as resolvidas também?").
      </p>
    </div>
    <Switch
      id="nex-suggestions-toggle"
      checked={suggestionsEnabled}
      onCheckedChange={setSuggestionsEnabled}
      disabled={busy}
      aria-label={suggestionsEnabled ? "Desativar sugestões em botões" : "Ativar sugestões em botões"}
    />
  </div>
</div>
```

Importar `BookText`, `Plus`, `Trash2` se ainda não importados.

- [ ] **Step 5: GREEN** — `npm test -- prompt-config-form`.

- [ ] **Step 6: Commit:**

```bash
git add src/components/agente-nex/prompt-config-form.tsx src/components/agente-nex/__tests__/prompt-config-form.test.tsx
git commit -m "feat(agente-nex): T-C4 v0.31 — PromptConfigForm sections novas (Nomenclaturas e termos + toggle Sugestões em botões) entre Tom e Guardrails"
```

---

### Task D1: runNex extrai [[suggestions]] sufixo

**Files:**
- Modify: `src/lib/llm/agent/run-nex.ts`
- Modify: `src/lib/llm/agent/__tests__/run-nex.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
import { extractSuggestions } from "../run-nex";

describe("extractSuggestions (v0.31)", () => {
  it("texto sem sufixo: retorna message intacta + array vazio", () => {
    const r = extractSuggestions("Resposta normal sem sugestões.");
    expect(r.message).toBe("Resposta normal sem sugestões.");
    expect(r.suggestions).toEqual([]);
  });

  it("extrai sufixo no final: 3 sugestões", () => {
    const r = extractSuggestions(
      "Houve 12 conversas resolvidas hoje.\n[[suggestions]]:Ver as abertas|Ver por agente|Ver por inbox",
    );
    expect(r.message).toBe("Houve 12 conversas resolvidas hoje.");
    expect(r.suggestions).toEqual(["Ver as abertas", "Ver por agente", "Ver por inbox"]);
  });

  it("cap 4 sugestões — descarta excesso", () => {
    const r = extractSuggestions("ok\n[[suggestions]]:a|b|c|d|e|f");
    expect(r.suggestions).toEqual(["a", "b", "c", "d"]);
  });

  it("descarta sugestões > 80 chars", () => {
    const tooLong = "a".repeat(81);
    const r = extractSuggestions(`ok\n[[suggestions]]:short|${tooLong}|other`);
    expect(r.suggestions).toEqual(["short", "other"]);
  });
});

describe("runNex — logUsage com is_playground (v0.31)", () => {
  it("isPlayground=true AINDA chama logUsage com is_playground=true", async () => {
    // ... setup completo similar ao test existente
    await runNexAgent({ ...args, isPlayground: true });
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: true }),
    );
  });

  it("isPlayground=false (default) chama logUsage com is_playground=false", async () => {
    await runNexAgent({ ...args, isPlayground: false });
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: false }),
    );
  });
});
```

(Atualizar/substituir o test antigo "não chama logUsage quando isPlayground=true" — a expectativa mudou.)

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit run-nex.ts:**

(a) Exportar `extractSuggestions`:
```typescript
const SUGGESTIONS_RE = /\n?\[\[suggestions\]\]:(.+?)(?:\n|$)/i;
const MAX_SUGGESTIONS = 4;
const MAX_SUGGESTION_LEN = 80;

export function extractSuggestions(text: string): { message: string; suggestions: string[] } {
  const match = text.match(SUGGESTIONS_RE);
  if (!match) return { message: text, suggestions: [] };
  const raw = match[1].trim();
  const suggestions = raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= MAX_SUGGESTION_LEN)
    .slice(0, MAX_SUGGESTIONS);
  const message = text.replace(match[0], "").trimEnd();
  return { message, suggestions };
}
```

(b) Atualizar `RunNexResult` interface — adicionar `suggestions?: string[]`:
```typescript
export type RunNexResult =
  | { ok: true; message: string; suggestions: string[] }
  | { ok: false; error: string };
```

(c) Em `runNexAgent`, depois de extrair `rawMessage` da resposta do LLM, chamar parser:
```typescript
const { message, suggestions } = extractSuggestions(rawMessage);
// ... eventualmente:
return { ok: true, message, suggestions };
```

(d) **Remover o skip de log** (linha ~147):
```typescript
// ANTES:
if (!args.isPlayground) {
  await logUsage({ ... });
}

// DEPOIS (sempre loga, com flag):
await logUsage({
  ...
  isPlayground: args.isPlayground ?? false,
});
```

- [ ] **Step 5: GREEN.**

- [ ] **Step 6: Commit:**

```bash
git add src/lib/llm/agent/run-nex.ts src/lib/llm/agent/__tests__/run-nex.test.ts
git commit -m "feat(agente-nex): T-D1 v0.31 — runNex extractSuggestions parser + logUsage SEMPRE chamado com is_playground flag (não pula mais quando isPlayground=true)"
```

---

### Task D2: usage-logger aceita isPlayground

**Files:**
- Modify: `src/lib/llm/agent/usage-logger.ts`
- Modify: `src/lib/llm/agent/__tests__/usage-logger.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing test:**

```typescript
describe("logUsage — is_playground (v0.31)", () => {
  it("INSERT inclui is_playground quando passado", async () => {
    await logUsage({
      provider: "openai",
      model: "gpt-5",
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      promptChars: 50,
      responseChars: 100,
      isPlayground: true,
    });
    const insertCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO llm_usage"),
    );
    expect(insertCall).toBeDefined();
    const sql = String(insertCall![0]);
    expect(sql).toMatch(/is_playground/i);
    // valor true passado como param
    const params = insertCall![1] as unknown[];
    expect(params).toContain(true);
  });

  it("isPlayground default = false quando omitido", async () => {
    await logUsage({
      provider: "openai",
      model: "gpt-5",
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      promptChars: 50,
      responseChars: 100,
    });
    const insertCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO llm_usage"),
    );
    const params = insertCall![1] as unknown[];
    expect(params).toContain(false);
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit usage-logger.ts:**

```typescript
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
  isPlayground?: boolean; // v0.31.0
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
         error_message, is_playground, created_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
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
        args.isPlayground ?? false,
      ],
    );
  } catch (err) {
    console.warn("[nex] Falha ao registrar uso em llm_usage:", err);
  }
}
```

- [ ] **Step 5: GREEN + commit:**

```bash
git add src/lib/llm/agent/usage-logger.ts src/lib/llm/agent/__tests__/usage-logger.test.ts
git commit -m "feat(agente-nex): T-D2 v0.31 — logUsage aceita isPlayground param + INSERT inclui is_playground"
```

---

### Task D3: sendNexMessage propaga isPlayground + suggestions retornadas

**Files:**
- Modify: `src/lib/actions/nex-chat.ts`
- Modify: `src/lib/actions/__tests__/nex-chat.test.ts` (criar se não existir)

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("sendNexMessage (v0.31)", () => {
  it("retorna suggestions array", async () => {
    (runNexAgent as jest.Mock).mockResolvedValue({
      ok: true,
      message: "ok",
      suggestions: ["A", "B"],
    });
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result).toEqual({ ok: true, message: "ok", suggestions: ["A", "B"] });
  });

  it("propaga isPlayground=true via options", async () => {
    (runNexAgent as jest.Mock).mockResolvedValue({ ok: true, message: "ok", suggestions: [] });
    await sendNexMessage([{ role: "user", content: "x" }], { isPlayground: true });
    expect(runNexAgent).toHaveBeenCalledWith(expect.objectContaining({ isPlayground: true }));
  });

  it("default isPlayground=false quando options omitido", async () => {
    (runNexAgent as jest.Mock).mockResolvedValue({ ok: true, message: "ok", suggestions: [] });
    await sendNexMessage([{ role: "user", content: "x" }]);
    expect(runNexAgent).toHaveBeenCalledWith(expect.objectContaining({ isPlayground: false }));
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit nex-chat.ts:**

```typescript
export type SendNexMessageResult =
  | { ok: true; message: string; suggestions: string[] }
  | { ok: false; error: string };

export async function sendNexMessage(
  messages: ChatMessage[],
  options?: { isPlayground?: boolean },
): Promise<SendNexMessageResult> {
  // ... auth + accountId existing ...
  const result = await runNexAgent({
    messages: filtered,
    accountId,
    userId,
    userName: authUser.name ?? null,
    platformRole,
    isPlayground: options?.isPlayground ?? false,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: result.message, suggestions: result.suggestions ?? [] };
}
```

(Manter `testNexPromptAction` como está — não usado mais pelo Playground em v0.28 mas ainda presente.)

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/actions/nex-chat.ts src/lib/actions/__tests__/nex-chat.test.ts
git commit -m "feat(agente-nex): T-D3 v0.31 — sendNexMessage retorna suggestions + propaga isPlayground via options"
```

---

### Task D4: nex-chat-panel renderiza sugestões em botões clicáveis

**Files:**
- Modify: `src/components/nex/nex-chat-panel.tsx`
- Modify (test): `src/components/nex/__tests__/nex-chat-panel.test.tsx` (criar se não existir)

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Botões aparecem ABAIXO da última assistant message (não dentro do balão).
  - Estilo: chip violet outline (border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/15), text-xs, px-3 py-1.5, rounded-full.
  - Click → fecha (consome) sugestões da última message + envia o texto como nova msg do user via handleSend.
  - Stagger animação leve (motion fade-in 30ms entre botões).

- [ ] **Step 2: Write failing test:**

```typescript
describe("nex-chat-panel — Sugestões clicáveis (v0.31)", () => {
  // Setup mock sendNexMessage retornando suggestions
  it("renderiza botões abaixo da assistant message quando suggestions != []", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["Ver as abertas", "Ver por agente"],
    });
    render(<NexChatPanel open onClose={jest.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "quantas resolvidas" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByText(/12 resolvidas/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Ver as abertas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver por agente/i })).toBeInTheDocument();
  });

  it("click numa sugestão envia como nova msg + consome botões", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["Ver as abertas"],
    });
    render(<NexChatPanel open onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => screen.getByRole("button", { name: /Ver as abertas/i }));

    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true,
      message: "5 abertas",
      suggestions: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /Ver as abertas/i }));
    await waitFor(() => expect(sendNexMessage).toHaveBeenCalledTimes(2));
    expect((sendNexMessage as jest.Mock).mock.calls[1][0]).toEqual(
      expect.arrayContaining([{ role: "user", content: "Ver as abertas" }]),
    );
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit nex-chat-panel.tsx:**

(a) Atualizar `UiMessage` interface:
```typescript
interface UiMessage {
  id: string;
  role: NexMessageRole;
  content: string;
  toolName?: string;
  kind?: "text" | "audio";
  audioBlobUrl?: string | null;
  durationSeconds?: number;
  hasStoredAudio?: boolean;
  /** v0.31.0: sugestões emitidas pelo agent — render botões clicáveis abaixo da msg. */
  suggestions?: string[];
}
```

(b) `handleSend` agora extrai suggestions de `res` e atribui ao `assistant` UiMessage:
```typescript
const res = await sendNexMessage(history);
if (res.ok) {
  setMessages((prev) => [
    ...prev,
    {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: res.message,
      suggestions: res.suggestions,
    },
  ]);
}
```

(c) Render dos botões — depois do `<NexMessage>` quando `m.role === "assistant" && m.suggestions?.length`:
```tsx
{messages.map((m, idx) => {
  const isLastAssistant =
    m.role === "assistant" &&
    idx === messages.length - 1 &&
    !pending;
  return (
    <React.Fragment key={m.id}>
      <NexMessage role={m.role} content={m.content} {...} />
      {m.role === "assistant" && m.suggestions && m.suggestions.length > 0 && isLastAssistant ? (
        <SuggestionsBar
          suggestions={m.suggestions}
          onPick={(s) => handlePickSuggestion(m.id, s)}
        />
      ) : null}
    </React.Fragment>
  );
})}
```

(Sugestões só aparecem na ÚLTIMA assistant message — UX simples; após nova interação, somem.)

(d) `SuggestionsBar` componente local:
```tsx
function SuggestionsBar({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Sugestões clicáveis"
      className="flex flex-wrap gap-2 px-1 pt-1"
    >
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={cn(
            "cursor-pointer rounded-full border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-700 transition-colors",
            "hover:border-violet-500/60 hover:bg-violet-500/15",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
            "dark:text-violet-300",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
```

(e) `handlePickSuggestion`:
```typescript
const handlePickSuggestion = React.useCallback(
  (msgId: string, suggestion: string) => {
    // Consome (limpa) suggestions da msg.
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, suggestions: undefined } : m)),
    );
    // Envia a sugestão como nova msg do user.
    void handleSend(suggestion);
  },
  [handleSend],
);
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/nex/nex-chat-panel.tsx src/components/nex/__tests__/nex-chat-panel.test.tsx
git commit -m "feat(bubble): T-D4 v0.31 — nex-chat-panel renderiza sugestões em botões clicáveis abaixo da última assistant message (consume após click)"
```

---

### Task D5: PlaygroundSheet propaga isPlayground=true + suggestions

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`
- Modify: `src/components/agente-nex/__tests__/playground-sheet.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar mesma render de SuggestionsBar quando assistant retorna suggestions.

- [ ] **Step 2: Write failing test:**

```typescript
describe("PlaygroundSheet — isPlayground=true (v0.31)", () => {
  it("envia isPlayground=true via sendNexMessage options", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true, message: "ok", suggestions: [],
    });
    render(<PlaygroundSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(sendNexMessage).toHaveBeenCalled());
    expect((sendNexMessage as jest.Mock).mock.calls[0][1]).toEqual({ isPlayground: true });
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit playground-sheet.tsx:**

No `submitMessage`:
```typescript
const r = await sendNexMessage(history, { isPlayground: true });
```

E expor `r.suggestions` na ChatItem do assistant (similar ao nex-chat-panel — adicionar campo `suggestions?: string[]` ao `ChatItem` interface). Renderizar `SuggestionsBar` na última assistant message do Sheet (replicar o componente local OU reusar via export do nex-chat-panel).

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/agente-nex/playground-sheet.tsx src/components/agente-nex/__tests__/playground-sheet.test.tsx
git commit -m "feat(agente-nex): T-D5 v0.31 — PlaygroundSheet propaga isPlayground=true + renderiza SuggestionsBar"
```

---

### Task E1: DonutWithCenter — espessura mais fina + tooltip fixo top-right

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`
- Modify: `src/components/charts/__tests__/donut-with-center.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - innerR=75 outerR=110 (espessura 35px — fino mas legível, ratio 0.68).
  - tooltipPosition undeprecated, default "top-right" fixo (não follow-mouse).
  - Texto central permanece com `px-6` + `max-w-[60%]`.

- [ ] **Step 2: Write failing test:**

```typescript
describe("DonutWithCenter — defaults v0.31", () => {
  it("usa innerRadius=75, outerRadius=110, height=360 por default", () => {
    const { container } = render(
      <DonutWithCenter
        data={[{ name: "A", value: 50 }]}
        centerLabel="Total"
        centerValue="50"
      />,
    );
    const wrapper = container.querySelector("[role='img']") as HTMLElement;
    expect(wrapper.style.height).toBe("360px");
    // (innerRadius/outerRadius testáveis via prop default value se exportado;
    //  alternativa: snapshot ou inspeção)
  });

  it("tooltipPosition é prop ATIVA (não-deprecated) com default 'top-right'", () => {
    // implementação: se tooltipPosition for default 'top-right', wrapperStyle do Tooltip vai pra top: 8 right: 8
    const ws = donutTooltipWrapperStyle("top-right");
    expect(ws).toMatchObject({ position: "absolute", top: 8, right: 8 });
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit donut-with-center.tsx:**

(a) Defaults:
```typescript
export function DonutWithCenter({
  data,
  centerLabel,
  centerValue,
  height = 360,
  innerRadius = 75,
  outerRadius = 110,
  // ...
  tooltipPosition = "top-right",
}: DonutWithCenterProps) {
```

(b) **Undeprecate** `tooltipPosition` — remover comentário `@deprecated`. Usar `wrapperStyle={donutTooltipWrapperStyle(tooltipPosition)}` no `<Tooltip>`. Remover `cursor={false}`/`offset={12}`/`allowEscapeViewBox` se forçam follow-mouse. Tooltip agora fica fixo no canto.

```typescript
<Tooltip
  cursor={false}
  wrapperStyle={donutTooltipWrapperStyle(tooltipPosition)}
  content={(props) => (
    <DonutTooltipStacked
      active={props.active}
      payload={props.payload as ChartTooltipPayloadItem[] | undefined}
      formatValue={formatTooltipValue}
    />
  )}
/>
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/charts/donut-with-center.tsx src/components/charts/__tests__/donut-with-center.test.tsx
git commit -m "feat(charts): T-E1 v0.31 — DonutWithCenter espessura mais fina (innerR=75 outerR=110) + tooltip fixo top-right (não follow-mouse)"
```

---

### Task E2: usage-stats byHour query + ConsumoContent renderiza hourly em "hoje"

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts`
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts`
- Modify: `src/components/llm/consumo-content.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Quando pill="hoje", AreaChart por hora (24 buckets fixos 00:00..23:00).
  - Tick X: "00:00", "06:00", "12:00", "18:00", "23:00" (subset pra não poluir).
  - Buckets vazios mostram zero (não pula horas).

- [ ] **Step 2: Write failing tests** (em usage-stats.test.ts):

```typescript
describe("getUsageStats — byHour (v0.31)", () => {
  it("retorna byHour quando range <= 24h", async () => {
    const start = new Date("2026-05-03T00:00:00-03:00");
    const end = new Date("2026-05-04T00:00:00-03:00");
    // mock pgPool.query pra hour 10 cost 0.5 calls 3
    mockedPgPool.query.mockImplementation((sql: string) => {
      if (String(sql).includes("EXTRACT(HOUR")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ hour: 10, cost: 0.5, cost_brl: 2.75, calls: 3 }],
        });
      }
      // ...other queries return zeros
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    const stats = await getUsageStats({ start, end });
    expect(stats.byHour).toBeDefined();
    expect(stats.byHour).toHaveLength(24);
    expect(stats.byHour![10]).toMatchObject({ hour: 10, calls: 3 });
    expect(stats.byHour!.filter((h) => h.calls === 0)).toHaveLength(23); // outros 23 buckets vazios
  });

  it("byHour omitido quando range > 24h", async () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-05-04");
    // ... mocks ...
    const stats = await getUsageStats({ start, end });
    expect(stats.byHour).toBeUndefined();
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit usage-stats.ts:**

(a) Atualizar `UsageSummary`:
```typescript
export interface UsageSummary {
  // ...existing...
  /** v0.31.0: 24 buckets quando range <= 24h. Undefined caso contrário. */
  byHour?: Array<{ hour: number; cost: number; costBrl: number; calls: number }>;
}
```

(b) Em `getUsageStats`, calcular se range é "≤24h":
```typescript
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const hourlyMode = (end.getTime() - start.getTime()) <= ONE_DAY_MS + 1; // tolerância

let byHour: UsageSummary["byHour"];
if (hourlyMode) {
  const hourRes = await pgPool.query<{
    hour: number | string;
    cost: string | number | null;
    cost_brl: string | number | null;
    calls: string | number | null;
  }>(
    `SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE $3))::int AS hour,
            COALESCE(SUM(cost_usd), 0) AS cost,
            COALESCE(SUM(cost_brl), 0) AS cost_brl,
            COUNT(*) AS calls
       FROM llm_usage
      WHERE created_at >= $1 AND created_at < $2
        AND ($4::text IS NULL OR provider = $4)
      GROUP BY hour
      ORDER BY hour ASC`,
    [start, end, TZ, provider],
  );
  // Inicializa 24 buckets zerados, popula os retornados.
  byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    cost: 0,
    costBrl: 0,
    calls: 0,
  }));
  for (const r of hourRes.rows) {
    const h = Number(r.hour);
    if (h >= 0 && h <= 23) {
      byHour[h] = {
        hour: h,
        cost: toNumber(r.cost),
        costBrl: toNumber(r.cost_brl),
        calls: toNumber(r.calls),
      };
    }
  }
}

return {
  // ...existing...
  byHour,
};
```

- [ ] **Step 5: Edit consumo-content.tsx — renderizar hourly chart em "hoje":**

```typescript
const isHourly = pill === "hoje" && stats?.byHour;

const areaData = useMemo<AreaChartData[]>(() => {
  if (!stats) return [];
  if (isHourly && stats.byHour) {
    return stats.byHour.map((h) => ({
      name: `${String(h.hour).padStart(2, "0")}:00`,
      Custo: Number(h.costBrl.toFixed(6)),
    }));
  }
  return stats.byDay.map((d) => ({
    name: dayLabelFmt.format(isoLocalToDate(d.day)).replace(".", ""),
    Custo: Number(d.costBrl.toFixed(6)),
  }));
}, [stats, isHourly]);
```

(Title do Card pode mudar — "Custo por hora" quando isHourly, "Custo por dia" senão. Optional small UX win.)

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/lib/llm/queries/usage-stats.ts src/lib/llm/queries/__tests__/usage-stats.test.ts src/components/llm/consumo-content.tsx
git commit -m "feat(agente-nex): T-E2 v0.31 — Consumo período Hoje vira gráfico hourly (byHour 24 buckets); ConsumoContent troca dynamic"
```

---

### Task E3: Consumo coluna Origem + filtro Ambiente

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts` (UsageDetailRow.isPlayground + getUsageDetails accept isPlayground filter)
- Modify: `src/lib/actions/llm-usage.ts` (fetchUsageDetails param isPlayground)
- Modify: `src/components/llm/consumo-content.tsx` (coluna "Origem" + filtro Ambiente)
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Coluna "Origem" entre "Data/hora" e "Provider". Valor: badge pill ("Agente Nex" violet bg, "Playground" amber bg). Width fixa.
  - Filtro novo `<CustomSelect>` "Ambiente" ao lado do Provider global. Options: Todos / Agente Nex / Playground.

- [ ] **Step 2: Write failing tests** (em usage-stats.test.ts):

```typescript
describe("getUsageDetails — isPlayground filter (v0.31)", () => {
  it("filtra rows is_playground=true quando arg = 'playground'", async () => {
    await getUsageDetails({
      start: new Date(),
      end: new Date(),
      isPlayground: true,
    });
    const lastSql = String(mockedPgPool.query.mock.calls.at(-1)![0]);
    expect(lastSql).toMatch(/is_playground/i);
    const params = mockedPgPool.query.mock.calls.at(-1)![1] as unknown[];
    expect(params).toContain(true);
  });

  it("UsageDetailRow inclui isPlayground", async () => {
    mockedPgPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "x", provider: "openai", model: "gpt-5",
          tokens_input: 0, tokens_output: 0, cost_usd: 0, cost_brl: null,
          usd_to_brl_rate: null, duration_ms: null, created_at: new Date(),
          prompt_chars: null, response_chars: null, user_id: null,
          error_message: null, is_playground: true,
        },
      ],
    });
    // ... rest of mocks ...
    const result = await getUsageDetails({ start: new Date(), end: new Date() });
    expect(result.rows[0].isPlayground).toBe(true);
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit usage-stats.ts:**

(a) `UsageDetailRow` ganha `isPlayground: boolean`:
```typescript
export interface UsageDetailRow {
  // ...existing...
  /** v0.31.0: true = chamada do Playground; false = Bubble. */
  isPlayground: boolean;
}
```

(b) `getUsageDetails` aceita `isPlayground?: boolean | null`:
```typescript
export async function getUsageDetails(args: {
  start: Date;
  end: Date;
  limit?: number;
  offset?: number;
  provider?: string | null;
  model?: string | null;
  isPlayground?: boolean | null; // v0.31
}): Promise<UsageDetailsResult> {
  // ...
  const isPlayground =
    typeof args.isPlayground === "boolean" ? args.isPlayground : null;
  const whereClause = `created_at >= $1 AND created_at < $2
    AND ($3::text IS NULL OR provider = $3)
    AND ($4::text IS NULL OR model = $4)
    AND ($5::boolean IS NULL OR is_playground = $5)`;
  // SELECT ganha is_playground; mapper:
  // isPlayground: !!r.is_playground
  // params: [start, end, provider, model, isPlayground, limit, offset]
}
```

- [ ] **Step 5: Edit llm-usage.ts (action):** propaga `isPlayground` filter.

- [ ] **Step 6: Edit consumo-content.tsx:**

(a) State + URL sync:
```typescript
const [ambiente, setAmbiente] = useState<"all" | "bubble" | "playground">(() => {
  if (typeof window === "undefined") return "all";
  const v = new URLSearchParams(window.location.search).get("env");
  return v === "playground" || v === "bubble" ? v : "all";
});

// No fetch, mapear:
const isPlaygroundFilter =
  ambiente === "all" ? null : ambiente === "playground";

// Passar pro fetchUsageDetails: isPlayground: isPlaygroundFilter.
```

(b) JSX — adicionar filtro ao lado do Provider:
```tsx
<CustomSelect
  value={ambiente}
  onChange={(v) => setAmbiente(v as "all" | "bubble" | "playground")}
  options={[
    { value: "all", label: "Todos os ambientes" },
    { value: "bubble", label: "Agente Nex" },
    { value: "playground", label: "Playground" },
  ]}
  triggerClassName="min-h-[36px] h-9 w-[180px]"
  aria-label="Filtrar por ambiente"
/>
```

(c) Tabela — coluna nova "Origem" entre "Data/hora" e "Provider":
```tsx
<TableHead>Origem</TableHead>
// no body:
<TableCell>
  <span className={cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
    row.isPlayground
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  )}>
    {row.isPlayground ? "Playground" : "Agente Nex"}
  </span>
</TableCell>
```

E na linha de Total (sticky), ajustar `colSpan` se necessário.

- [ ] **Step 7: GREEN + Commit:**

```bash
git add src/lib/llm/queries/usage-stats.ts src/lib/actions/llm-usage.ts src/components/llm/consumo-content.tsx src/lib/llm/queries/__tests__/usage-stats.test.ts
git commit -m "feat(agente-nex): T-E3 v0.31 — Consumo coluna Origem (Bubble/Playground badge) + filtro Ambiente (Todos/Bubble/Playground) + isPlayground filter no getUsageDetails"
```

---

### Task R1: bump 0.30 → 0.31 + CHANGELOG + STATUS

(passos padrão; sync remote, edit package.json, escrever entries longas no CHANGELOG/STATUS, commit `chore(release): v0.31.0 — Suite Agente Nex Polish v5`).

### Task R2: typecheck + tests + build

`npx tsc --noEmit -p tsconfig.json | tail -5` · `npm test 2>&1 | tail -20` (esperar ~1414+ PASS, 20 falhas pré-existentes integrations-power-bi) · `npm run build 2>&1 | tail -10`.

### Task R3: push + portainer-fix

`gh run list --limit 5` · `git push origin main` · `gh run watch <id>` · `gh workflow run "Portainer fix..." -f app_version=v0.31.0` · `until curl /api/health | grep v0.31.0; do sleep 8; done`.

### Task R4: HISTORY append + cleanup

Append entry · `rm docs/agents/active/claude-agente-nex-polish-v031.md` · memory update.

---

## Self-Review v1

### Spec coverage
- [x] Schema: A1 (terminology + suggestions_enabled em nex_settings) + A2 (is_playground em llm_usage)
- [x] Configuração: B1 (hardcode spread fix bug) + B2 (remove Spread/Ticker/CriarAPI + redesign toggle)
- [x] Prompt features: C1 (compose), C2 (read/write + Server Actions + mocks), C3 (frase remove + KB rename), C4 (UI sections)
- [x] Bubble: D1 (parser + always log), D2 (logger arg), D3 (sendNexMessage signature), D4 (botões clicáveis), D5 (PlaygroundSheet flag)
- [x] Consumo: E1 (donut), E2 (hourly), E3 (Origem + Ambiente)
- [x] Release: R1, R2, R3, R4

### Placeholders
- Nenhum TODO/TBD.
- Tasks têm código completo.

### Type consistency check
- `NexPromptConfig.terminology: Record<string,string>` + `suggestionsEnabled: boolean` — consistente em compose/prompt/Server Actions/form.
- `RunNexResult.suggestions: string[]` (T-D1) → `SendNexMessageResult.suggestions: string[]` (T-D3) → `UiMessage.suggestions?: string[]` (T-D4).
- `UsageDetailRow.isPlayground: boolean` (T-E3) ↔ `is_playground BOOLEAN` em llm_usage (T-A2) ↔ `logUsage args.isPlayground?: boolean` (T-D2) ↔ `runNex args.isPlayground?: boolean` (existente, propaga em T-D1).
- `getUsageDetails args.isPlayground?: boolean | null` consistente em action layer.
