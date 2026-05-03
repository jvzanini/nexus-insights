# Suite Agente Nex Polish v5 (v0.31.0) — Plano v3 final consolidado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Implementar feature grande (nomenclaturas custom + sugestões em botões clicáveis) + 6 polish cirúrgicos + bug fix da cotação USD/BRL inflada (>R$6/USD por bug de spread setado pra 1.40+).

**Architecture:**
- 4 schema additives em `nex_settings`: `terminology JSONB`, `suggestions_enabled BOOLEAN`, `seeded_v3_at TIMESTAMPTZ` (flag de pre-seed idempotente).
- 1 schema additive em `llm_usage`: `is_playground BOOLEAN`.
- Spread USD/BRL **hardcoded em 1.10** no código (ignora DB) — UI removida.
- PromptCompose injeta seções condicionais "## Terminologia" e "## Sugestões clicáveis".
- Agent emite sufixo `[[suggestions]]:item1|item2` em linha própria; backend parsea via regex ancorada em início-de-linha; retorna `{ message, suggestions }`.
- `SuggestionsBar` componente compartilhado (Bubble + PlaygroundSheet).
- `runNex` SEMPRE loga (remove skip de v0.16) com flag `is_playground` propagada.
- Consumo: byHour query (24 buckets) quando range ≤ 24h; coluna Origem; filtro Ambiente.

**Tech Stack:** Next.js 16 · TS · base-ui · Recharts · Tailwind v4 · NextAuth v5 · PostgreSQL · Lucide React · Jest + jest-mock-extended.

---

## Histórico de pentes finos

### Pente fino #1 (v1 → v2): 28 achados, dos quais 5 críticos
1. Regex `extractSuggestions` ambíguo → ancoragem em início-de-linha.
2. Test antigo "isPlayground=true não loga" precisa ser SUBSTITUÍDO (não adicionado caso novo).
3. `setCardSpread` no-op quebra test existente — atualizar.
4. Mocks `NexPromptConfig` lista canônica de 8 arquivos pra atualizar.
5. `SuggestionsBar` duplicação — extrair pra arquivo próprio.

### Pente fino #2 (v2 → v3): 22 achados adicionais, 3 críticos
1. **Pre-seed terminology precisa flag `seeded_v3_at`** — senão re-aplica quando user limpa. **Re-arquitetura schema A1**.
2. **`RunNexResult.suggestions` deve ser não-opcional** (`string[]`, default `[]`) — força mocks consistentes.
3. **id toggle padronizado** `"nex-bubble-toggle"` em todo plan (era misto v1).

Outros 19 menores documentados.

---

## Convenções

- **Antes de qualquer task UI:** subagente invoca `ui-ux-pro-max:ui-ux-pro-max` via Skill. Não negociável.
- **TDD obrigatório:** RED → GREEN → COMMIT.
- **Commits granulares:** 1 task = 1 commit. Padrão `feat(agente-nex): T-<N> v0.31 — <subject>` ou `fix(...)`.
- **Coordenação:** outro agente paralelo bumpou v0.27/v0.30 em /relatorios/conversas — escopo distinto, sem overlap em código fonte. Release files (package.json, CHANGELOG, STATUS) só toco no R1 com `git fetch` antes.

---

## Mapa de arquivos (consolidado)

### Group A — Schema additive (foundation)
- **Modify:** `src/lib/nex/ensure-tables.ts` — `terminology JSONB`, `suggestions_enabled BOOLEAN`, `seeded_v3_at TIMESTAMPTZ`. Pre-seed terminology Matrix idempotente via `WHERE seeded_v3_at IS NULL`.
- **Modify:** `src/lib/llm/ensure-tables.ts` — `is_playground BOOLEAN DEFAULT false` em `llm_usage`.
- **Test:** ambos test files com asserts.

### Group B — Configuração polish
- **Modify:** `src/lib/llm/exchange-rate.ts` — hardcode `FIXED_SPREAD = 1.10`; `setCardSpread()` no-op + console.warn.
- **Modify:** `src/components/agente-nex/llm-config-form.tsx` — remove Spread cartão Card violet, remove UsdRateTicker section, redesign toggle Nex linha única (id="nex-bubble-toggle"), remove botão "Criar API key" inline (mantém "Adicionar crédito").
- **Modify:** `src/app/(protected)/agente-nex/configuracao/page.tsx` — remove props extras + `getUsdBrlRate()` da Promise.all.
- **Test:** `src/lib/llm/__tests__/exchange-rate.test.ts` — atualiza testes pra setCardSpread no-op + spread hardcoded ignora DB.
- **Test:** `src/components/agente-nex/__tests__/llm-config-form.test.tsx` — remove asserts de Spread/Ticker, adiciona asserts de toggle linha única + sem Card aninhado.

### Group C — Prompt features (Nomenclaturas + Sugestões + polish)
- **Modify:** `src/lib/nex/prompt-compose.ts` — `NexPromptConfig.terminology + suggestionsEnabled` (não-opcional); composeSystemPrompt injeta seções condicionais.
- **Modify:** `src/lib/nex/prompt.ts` — getNexPromptConfig SELECT inclui terminology + suggestions_enabled; saveNexPromptConfig INSERT/UPDATE com 10 placeholders. Helper `asStringMap`.
- **Modify:** `src/lib/actions/nex-prompt.ts` — `saveTerminologyAction(map)` + `setSuggestionsEnabledAction(enabled)` (super_admin gate; cap 50 termos × 100 chars).
- **Modify:** `src/components/agente-nex/prompt-config-form.tsx` — section "Nomenclaturas e termos" entre Tom e Guardrails; toggle "Sugestões em botões" entre Nomenclaturas e Guardrails.
- **Modify:** `src/components/agente-nex/prompt-preview-card.tsx` — remove `<p>Preview somente leitura...</p>`. Para não-superadmin, manter apenas microcopy "Apenas super_admins podem editar."
- **Modify:** `src/components/agente-nex/kb-section.tsx` — botão "Adicionar conhecimento" (era "Adicionar documento").
- **Modify:** `src/components/agente-nex/kb-upload-dialog.tsx` — DialogTitle "Adicionar conhecimento".
- **Test:** `src/lib/nex/__tests__/prompt-compose.test.ts` (4 testes novos).
- **Test:** `src/lib/actions/__tests__/nex-prompt.test.ts` (4+ testes novos).
- **Mocks** atualizados em **8 arquivos canônicos**:
  - `src/lib/nex/__tests__/prompt-compose.test.ts`
  - `src/lib/nex/__tests__/prompt.test.ts`
  - `src/lib/actions/__tests__/nex-prompt.test.ts`
  - `src/lib/llm/agent/__tests__/run-nex.test.ts`
  - `src/components/agente-nex/__tests__/playground-sheet.test.tsx`
  - `src/components/agente-nex/__tests__/prompt-config-form.test.tsx`
  - `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx`
  - `src/components/agente-nex/__tests__/identity-base-editor.test.tsx`

### Group D — Bubble: sugestões clicáveis + isPlayground propagação
- **Modify:** `src/lib/llm/agent/run-nex.ts` — `extractSuggestions(text)` com regex ancorada início-de-linha. `RunNexResult.suggestions: string[]` (não-opcional). SEMPRE chama logUsage com flag is_playground.
- **Modify:** `src/lib/llm/agent/usage-logger.ts` — aceita `isPlayground?: boolean`; INSERT inclui column.
- **Modify:** `src/lib/actions/nex-chat.ts` — `sendNexMessage(messages, options?: { isPlayground?: boolean })`; retorna `{ ok, message, suggestions: string[] }`.
- **Create:** `src/components/nex/suggestions-bar.tsx` — `<SuggestionsBar suggestions onPick>` componente compartilhado (Bubble + PlaygroundSheet).
- **Modify:** `src/components/nex/nex-chat-panel.tsx` — `UiMessage.suggestions?: string[]`; render `SuggestionsBar` na ÚLTIMA assistant message; click consume + handleSend.
- **Modify:** `src/components/agente-nex/playground-sheet.tsx` — `submitMessage` chama `sendNexMessage(history, { isPlayground: true })`. Render `SuggestionsBar` da mesma forma.
- **Test:** `src/lib/llm/agent/__tests__/run-nex.test.ts` — SUBSTITUI test antigo "isPlayground=true não loga" por "loga com is_playground=true". Adiciona testes do parser.
- **Test:** `src/lib/llm/agent/__tests__/usage-logger.test.ts` — INSERT inclui is_playground.
- **Test:** `src/lib/actions/__tests__/nex-chat.test.ts` — sendNexMessage retorna suggestions + propaga isPlayground.
- **Test:** `src/components/nex/__tests__/nex-chat-panel.test.tsx` — render botões + click consome.
- **Test:** `src/components/nex/__tests__/suggestions-bar.test.tsx` — testes unitários do componente.
- **Test:** `src/components/agente-nex/__tests__/playground-sheet.test.tsx` — verifica isPlayground=true passado no options.

### Group E — Consumo: Hoje hourly + Origem coluna + Ambiente filtro + Donut polish
- **Modify:** `src/components/charts/donut-with-center.tsx` — defaults `innerRadius=75, outerRadius=110, height=360`; `tooltipPosition` UNDEPRECATED, default `"top-right"` (fixo, não follow-mouse).
- **Modify:** `src/lib/llm/queries/usage-stats.ts` — `UsageSummary.byHour?: Array<{hour, cost, costBrl, calls}>` quando range ≤ 24h. `UsageDetailRow.isPlayground: boolean`. `getUsageDetails` aceita `isPlayground?: boolean | null` filter.
- **Modify:** `src/lib/actions/llm-usage.ts` — `fetchUsageDetails` propaga isPlayground.
- **Modify:** `src/components/llm/consumo-content.tsx` — when `pill === "hoje"`, AreaChart hourly + Card title "Custo por hora"; coluna nova "Origem" entre Data/hora e Provider; filtro `<CustomSelect>` "Ambiente" ao lado do Provider; state `ambiente: "all" | "bubble" | "playground"`; colSpan da linha Total = 4.
- **Test:** `src/components/charts/__tests__/donut-with-center.test.tsx` — defaults novos.
- **Test:** `src/lib/llm/queries/__tests__/usage-stats.test.ts` — byHour + isPlayground filter.
- **Test:** `src/components/llm/__tests__/consumo-content.test.tsx` — hourly + coluna Origem + filtro Ambiente.

### Group R — Release
- `package.json` (0.30 → 0.31), `CHANGELOG.md`, `docs/STATUS.md`, `docs/agents/HISTORY.md`, `docs/agents/active/claude-agente-nex-polish-v031.md` (delete).

---

## Tasks

### Task A1: Schema — terminology + suggestions_enabled + seeded_v3_at em nex_settings + pre-seed Matrix idempotente

**Files:**
- Modify: `src/lib/nex/ensure-tables.ts`
- Modify: `src/lib/nex/__tests__/ensure-tables.test.ts`

- [ ] **Step 1:** Skill ui-ux-pro-max — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("ensure-tables — terminology + suggestions_enabled + seeded_v3_at (v0.31)", () => {
  it("ALTER TABLE adiciona terminology JSONB DEFAULT '{}'", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?terminology/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/JSONB/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+'\{\}'::jsonb/i);
  });

  it("ALTER TABLE adiciona suggestions_enabled BOOLEAN DEFAULT false", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?suggestions_enabled/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/BOOLEAN/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+false/i);
  });

  it("ALTER TABLE adiciona seeded_v3_at TIMESTAMPTZ NULL (flag de pre-seed idempotente)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?seeded_v3_at/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/TIMESTAMPTZ/i);
  });

  it("UPDATE pre-seed terminology Matrix gated por seeded_v3_at IS NULL (idempotente)", async () => {
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
    expect(sql).toMatch(/seeded_v3_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/"seeded_v3_at"\s*=\s*now\(\)/i);
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

// v0.31.0: seeded_v3_at — flag pra pre-seed idempotente. Sem isso, próximo
// ensureNexTables re-aplica defaults Matrix sobrescrevendo customizações vazias.
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "seeded_v3_at" TIMESTAMPTZ NULL;
`);

// v0.31.0: pre-seed terminology padrão Matrix — IDEMPOTENTE via seeded_v3_at.
// Só roda 1 vez por install; user pode limpar terminology depois sem re-seed.
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
  }'::jsonb,
  "seeded_v3_at" = now()
  WHERE "id" = 'global'
    AND "seeded_v3_at" IS NULL;
`);
```

- [ ] **Step 5: GREEN** — `npm test -- ensure-tables` (todos PASS).

- [ ] **Step 6: Commit:**

```bash
git add src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts
git commit -m "feat(agente-nex): T-A1 v0.31 — schema terminology JSONB + suggestions_enabled BOOLEAN + seeded_v3_at flag em nex_settings + pre-seed Matrix idempotente (estados/equipe/departamento)"
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
  it("ALTER TABLE adiciona is_playground BOOLEAN DEFAULT false (idempotente)", async () => {
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

- [ ] **Step 4: Edit `src/lib/llm/ensure-tables.ts`** — adicionar após ALTERs existentes:

```typescript
// v0.31.0: is_playground — distingue chamadas do Bubble (false) vs Playground (true).
// Trade-off: rows pre-v0.31 todas com false default (sem como reconstruir histórico).
await pgPool.query(`
  ALTER TABLE "llm_usage"
    ADD COLUMN IF NOT EXISTS "is_playground" BOOLEAN NOT NULL DEFAULT false;
`);
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/llm/ensure-tables.ts src/lib/llm/__tests__/ensure-tables.test.ts
git commit -m "feat(agente-nex): T-A2 v0.31 — schema is_playground BOOLEAN em llm_usage (distingue Bubble vs Playground; rows pre-v0.31 todas false)"
```

---

### Task B1: exchange-rate hardcode spread=1.10 (fix bug cotação inflada)

**Files:**
- Modify: `src/lib/llm/exchange-rate.ts`
- Modify: `src/lib/llm/__tests__/exchange-rate.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("getUsdBrlRate — spread fixo (v0.31)", () => {
  it("usa spread=1.10 hardcoded ignorando SPREAD_KEY do DB", async () => {
    __resetUsdBrlCache();
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
    expect(result.rate).toBeCloseTo(5.5); // 5.0 × 1.10
  });
});

describe("setCardSpread — no-op (v0.31)", () => {
  it("vira no-op + console.warn; NÃO persiste no DB", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    await setCardSpread(1.5);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/setCardSpread.*no-op desde v0\.31/i),
    );
    expect(mockedPgPool.query).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

(REMOVER test antigo "setCardSpread persiste valor no DB" se houver.)

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit src/lib/llm/exchange-rate.ts:**

Adicionar constante:
```typescript
/**
 * v0.31.0: spread fixo (≈ IOF 3.5% + 6.5% spread real do cartão).
 * User removeu controle UI; antes era configurável e estava setado em 1.40+
 * causando cost_brl >R$6/USD. Hardcode garante consistência.
 */
const FIXED_SPREAD = 1.10;
```

Em `getUsdBrlRate()`, substituir:
```typescript
// ANTES (v0.20+):
const spreadRaw = await readSetting<number>(SPREAD_KEY);
const spread = clampSpread(spreadRaw ?? DEFAULT_CARD_SPREAD);

// DEPOIS (v0.31):
// Hardcode — ignora SPREAD_KEY do DB.
const spread = FIXED_SPREAD;
```

E `setCardSpread()`:
```typescript
export async function setCardSpread(_spread: number): Promise<void> {
  console.warn(
    "[exchange-rate] setCardSpread é no-op desde v0.31 — spread hardcoded em 1.10. UI removida em T-B2.",
  );
}
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/llm/exchange-rate.ts src/lib/llm/__tests__/exchange-rate.test.ts
git commit -m "fix(agente-nex): T-B1 v0.31 — exchange-rate hardcode spread=1.10 (ignora DB) — fix cotação inflada >R$6/USD; setCardSpread no-op + console.warn"
```

---

### Task B2: Configuração — remove Spread/Ticker UI + redesign toggle Nex linha única + remove "Criar API key" inline

**Files:**
- Modify: `src/components/agente-nex/llm-config-form.tsx`
- Modify: `src/app/(protected)/agente-nex/configuracao/page.tsx`
- Modify: `src/components/agente-nex/__tests__/llm-config-form.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Toggle Nex ativo: linha única (border + bg-muted/30 + 1 row), id="nex-bubble-toggle". Sem Card aninhado nem `role="group"` interno.
  - Sem Spread input. Sem UsdRateTicker.
  - Sem botão "Criar API key" inline (mantém só "Adicionar crédito" com `topUpUrl`).
  - Touch target Switch ≥44pt.

- [ ] **Step 2: Write failing tests:**

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

  it("Toggle Nex ativo tem id='nex-bubble-toggle' e SEM role='group' aninhado", () => {
    renderForm();
    const toggle = screen.getByRole("switch", { name: /Ativar Agente|Desativar Agente/i });
    expect(toggle).toHaveAttribute("id", "nex-bubble-toggle");
    const parent = toggle.closest("div[class*='rounded-xl']");
    expect(parent).not.toBeNull();
    // v0.31: estrutura linha única — não deve haver role="group" interno
    expect(parent?.querySelector("[role='group']")).toBeNull();
  });

  it("Mantém botão 'Adicionar crédito' (topUpUrl) quando catalog tem topUpUrl", () => {
    renderForm({ /* mock catalog com topUpUrl */ });
    expect(screen.getByRole("link", { name: /Adicionar crédito/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: RED** — `npm test -- llm-config-form`.

- [ ] **Step 4: Edit `src/components/agente-nex/llm-config-form.tsx`:**

(a) Remover imports não-usados após edição: `UsdRateTicker`, tipo `UsdBrlRate`, `Coins` (se não usado em outro lugar).

(b) Remover state + handlers do Spread:
- state: `currentSpreadValue`, `setCurrentSpreadValue`, `spreadInput`, `setSpreadInput`, `lastSavedSpreadRef`, `spreadDebounceRef`, `isSavingSpread`, `setIsSavingSpread`
- handlers: `commitSpread`, `handleSpreadChange`, `handleSpreadBlur`
- import `setCardSpreadAction`.

(c) Remover props da interface + destructuring: `initialSpread`, `initialCommercialRate`, `initialRateSource`, `initialFetchedAt`.

(d) **Toggle Nex ativo — linha única.** Substituir o block existente:

```tsx
{/* Toggle Agente Nex ativo — v0.31: linha única, sem Card aninhado nem role=group interno */}
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

(e) **Remover botão "Criar API key" inline** — apagar o `<a data-testid="llm-shortcut-api-key">`. Manter o `<a data-testid="llm-shortcut-top-up">` quando `catalog.topUpUrl`.

(f) **Remover Section 3 (UsdRateTicker)** e **Section 4 (Spread destacado violet card)** completamente.

(g) Após edit, rodar `grep -n "import.*from.*lucide" src/components/agente-nex/llm-config-form.tsx` e remover icons não-usados (`Coins` provavelmente).

- [ ] **Step 5: Edit `src/app/(protected)/agente-nex/configuracao/page.tsx`:**

```tsx
// REMOVE:
// getUsdBrlRate().catch(() => null) da Promise.all
// initialSpread, initialCommercialRate, initialRateSource, initialFetchedAt da call do LlmConfigForm

// Resultado: Promise.all com 3 promises (não 4); LlmConfigForm recebe só initial, initialNexEnabled, initialCredentials.
```

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/components/agente-nex/llm-config-form.tsx src/app/\(protected\)/agente-nex/configuracao/page.tsx src/components/agente-nex/__tests__/llm-config-form.test.tsx
git commit -m "feat(agente-nex): T-B2 v0.31 — Configuração polish (remove Spread/Ticker UI + redesign toggle Nex linha única id='nex-bubble-toggle' + remove 'Criar API key' inline)"
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
        identityBase: null, personality: "", tone: "", guardrails: [],
        advancedOverride: null, audioInputEnabled: false, kbEnabled: false,
        terminology: { estados: "inboxes", "minha equipe": "agentes" },
        suggestionsEnabled: false,
      },
      [], [],
    );
    expect(out).toMatch(/## Terminologia/);
    expect(out).toMatch(/"estados".*→.*inboxes/);
    expect(out).toMatch(/"minha equipe".*→.*agentes/);
  });

  it("NÃO injeta seção quando terminology está vazio", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null, personality: "", tone: "", guardrails: [],
        advancedOverride: null, audioInputEnabled: false, kbEnabled: false,
        terminology: {}, suggestionsEnabled: false,
      },
      [], [],
    );
    expect(out).not.toMatch(/## Terminologia/);
  });
});

describe("composeSystemPrompt — suggestions_enabled (v0.31)", () => {
  it("injeta instrução [[suggestions]] quando suggestionsEnabled=true", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null, personality: "", tone: "", guardrails: [],
        advancedOverride: null, audioInputEnabled: false, kbEnabled: false,
        terminology: {}, suggestionsEnabled: true,
      },
      [], [],
    );
    expect(out).toMatch(/## Sugestões clicáveis/);
    expect(out).toMatch(/\[\[suggestions\]\]:/);
    expect(out).toMatch(/máximo 4 sugestões/i);
  });

  it("NÃO injeta instrução quando suggestionsEnabled=false", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null, personality: "", tone: "", guardrails: [],
        advancedOverride: null, audioInputEnabled: false, kbEnabled: false,
        terminology: {}, suggestionsEnabled: false,
      },
      [], [],
    );
    expect(out).not.toMatch(/## Sugestões clicáveis/);
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/lib/nex/prompt-compose.ts`:**

Atualizar interface (campos não-opcionais):
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

Em `composeSystemPrompt`, ANTES do return final, adicionar:

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

// v0.31.0: Sugestões clicáveis (parser-friendly sufixo em linha própria).
if (cfg.suggestionsEnabled) {
  parts.push(
    `\n\n## Sugestões clicáveis\nQuando você identificar 2-4 ações de follow-up úteis e o usuário se beneficiaria de continuar a conversa nessas direções, **inclua exatamente uma linha ao FINAL da sua resposta** no formato:\n\`[[suggestions]]:Sugestão 1|Sugestão 2|Sugestão 3\`\nCada sugestão deve ser uma pergunta curta e clicável (≤ 60 chars). Use no máximo 4 sugestões. NÃO use \`|\` dentro do texto da sugestão (caractere reservado para separador). NÃO use esse formato em todas as respostas — apenas quando fizer sentido oferecer continuidade lógica.`,
  );
}
```

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/nex/prompt-compose.ts src/lib/nex/__tests__/prompt-compose.test.ts
git commit -m "feat(agente-nex): T-C1 v0.31 — composeSystemPrompt suporta terminology + suggestions_enabled (seções condicionais; pipe reservado pra separador)"
```

---

### Task C2: prompt.ts persiste + Server Actions + atualiza 8 arquivos de mocks

**Files:**
- Modify: `src/lib/nex/prompt.ts`
- Modify: `src/lib/actions/nex-prompt.ts`
- Modify: `src/lib/actions/__tests__/nex-prompt.test.ts`
- Modify (mocks): 8 arquivos canônicos.

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests** (em nex-prompt.test.ts):

```typescript
const baseCfg = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
  terminology: {},
  suggestionsEnabled: false,
};

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

  it("chave/valor > 100 chars: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin", id: "u1" });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({ ...baseCfg });
    const result = await saveTerminologyAction({ ["a".repeat(101)]: "b" });
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

  it("não-superadmin: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "viewer" });
    const result = await setSuggestionsEnabledAction(true);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/lib/nex/prompt.ts`** — `getNexPromptConfig`:

```typescript
function asStringMap(v: unknown): Record<string, string> {
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k === "string" && typeof val === "string") out[k] = val;
  }
  return out;
}

export async function getNexPromptConfig(): Promise<NexPromptConfig> {
  await ensureNexTables();
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
}
```

E `saveNexPromptConfig` INSERT/UPDATE com 10 placeholders:

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

- [ ] **Step 5: Edit `src/lib/actions/nex-prompt.ts`** — adicionar Server Actions ao final:

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

(Importar `getCurrentUser`, `getNexPromptConfig`, `saveNexPromptConfig` se ainda não estiverem.)

- [ ] **Step 6: Atualizar 8 arquivos canônicos de mocks:**

```bash
# Arquivos:
- src/lib/nex/__tests__/prompt-compose.test.ts
- src/lib/nex/__tests__/prompt.test.ts
- src/lib/actions/__tests__/nex-prompt.test.ts
- src/lib/llm/agent/__tests__/run-nex.test.ts
- src/components/agente-nex/__tests__/playground-sheet.test.tsx
- src/components/agente-nex/__tests__/prompt-config-form.test.tsx
- src/components/agente-nex/__tests__/prompt-preview-card.test.tsx
- src/components/agente-nex/__tests__/identity-base-editor.test.tsx
```

Em cada um, encontrar objetos `NexPromptConfig` e adicionar:
```typescript
terminology: {},
suggestionsEnabled: false,
```

- [ ] **Step 7: Typecheck pra detectar mocks faltantes:**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "Property 'terminology'|Property 'suggestionsEnabled'" | head -10
```

Output esperado: vazio (todos atualizados).

- [ ] **Step 8: GREEN** — todos tests do escopo:

```bash
npm test -- nex-prompt prompt-compose prompt-config-form playground-sheet prompt-preview-card run-nex identity-base-editor
```

- [ ] **Step 9: Commit:**

```bash
git add src/lib/nex/prompt.ts src/lib/actions/nex-prompt.ts src/lib/actions/__tests__/nex-prompt.test.ts
# + 8 arquivos de mocks
git commit -m "feat(agente-nex): T-C2 v0.31 — prompt.ts persiste terminology + suggestions_enabled + saveTerminologyAction/setSuggestionsEnabledAction (super_admin gate, cap 50 termos × 100 chars) + atualiza mocks NexPromptConfig em 8 arquivos canônicos"
```

---

### Task C3: PromptPreviewCard remove frase + KB rename

**Files:**
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`
- Modify: `src/components/agente-nex/kb-section.tsx`
- Modify: `src/components/agente-nex/kb-upload-dialog.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar consistência terminológica "Adicionar conhecimento" em ambos arquivos KB.

- [ ] **Step 2: Edit prompt-preview-card.tsx** — substituir o `<p>` italic existente:

ANTES:
```tsx
<p className="text-xs italic text-muted-foreground">
  Preview somente leitura.{" "}
  {isSuperAdmin
    ? "Use Editar para alterar o prompt do agente. Personalidade, Tom e Guardrails ficam na seção Comportamento abaixo."
    : "Apenas super_admins podem editar."}
</p>
```

DEPOIS:
```tsx
{!isSuperAdmin ? (
  <p className="text-xs italic text-muted-foreground">
    Apenas super_admins podem editar.
  </p>
) : null}
```

- [ ] **Step 3: Edit `src/components/agente-nex/kb-section.tsx`:**

Trocar 3 ocorrências (linhas ~16, ~326, ~335) de "Adicionar documento" → "Adicionar conhecimento". Preservar contexto JSDoc/comment.

- [ ] **Step 4: Edit `src/components/agente-nex/kb-upload-dialog.tsx` (linha ~162):**

```tsx
<DialogTitle>Adicionar conhecimento</DialogTitle>
```

- [ ] **Step 5: Verificar tests existentes:**

```bash
grep -rn "Adicionar documento" src/ 2>/dev/null
```

Atualizar qualquer test que faça assertion contra "Adicionar documento" pra "Adicionar conhecimento".

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/components/agente-nex/prompt-preview-card.tsx src/components/agente-nex/kb-section.tsx src/components/agente-nex/kb-upload-dialog.tsx
# + tests atualizados se houver
git commit -m "feat(agente-nex): T-C3 v0.31 — remove frase 'Preview somente leitura' (super_admin) + KB 'Adicionar documento' → 'Adicionar conhecimento' em 3 arquivos"
```

---

### Task C4: PromptConfigForm — section Nomenclaturas + toggle Sugestões

**Files:**
- Modify: `src/components/agente-nex/prompt-config-form.tsx`
- Modify: `src/components/agente-nex/__tests__/prompt-config-form.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Section "Nomenclaturas e termos" entre **Tom** e **Guardrails**. Lista de pares chave→valor (Input + Input + remove ícone). Botão "Adicionar termo" outline. Help text persistente.
  - Toggle "Sugestões em botões" entre Nomenclaturas e Guardrails. Layout similar ao "Modo prompt manual" mas sem warning destrutivo. Help text "Quando ativo, o Agente Nex oferece ações em botões clicáveis no fim de respostas que admitam continuidade".
  - Cap 50 termos (toast quando atingir).

- [ ] **Step 2: Write failing tests:**

```typescript
const baseInitial = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
  terminology: {},
  suggestionsEnabled: false,
};

describe("PromptConfigForm — Nomenclaturas (v0.31)", () => {
  it("renderiza section 'Nomenclaturas e termos'", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(screen.getByText(/Nomenclaturas e termos/i)).toBeInTheDocument();
  });

  it("Adicionar termo cria nova linha com inputs vazios", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar termo/i }));
    expect(screen.getByPlaceholderText(/Termo \(ex/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Significa \(ex/i)).toBeInTheDocument();
  });

  it("max 50 termos: bloqueia + toast", () => {
    const filled: Record<string, string> = {};
    for (let i = 0; i < 50; i++) filled[`k${i}`] = "v";
    render(<PromptConfigForm initial={{ ...baseInitial, terminology: filled }} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar termo/i }));
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/50/));
  });

  it("renderiza terminology inicial como linhas pré-populadas", () => {
    render(
      <PromptConfigForm
        initial={{ ...baseInitial, terminology: { estados: "inboxes" } }}
      />,
    );
    expect(screen.getByDisplayValue("estados")).toBeInTheDocument();
    expect(screen.getByDisplayValue("inboxes")).toBeInTheDocument();
  });
});

describe("PromptConfigForm — Sugestões em botões (v0.31)", () => {
  it("renderiza toggle 'Sugestões em botões'", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(
      screen.getByRole("switch", { name: /Sugestões em botões|Ativar sugestões|Desativar sugestões/i }),
    ).toBeInTheDocument();
  });

  it("toggle reflete initial.suggestionsEnabled=true", () => {
    render(<PromptConfigForm initial={{ ...baseInitial, suggestionsEnabled: true }} />);
    const toggle = screen.getByRole("switch", {
      name: /Sugestões em botões|Desativar sugestões/i,
    });
    expect(toggle).toBeChecked();
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/components/agente-nex/prompt-config-form.tsx`:**

(a) Adicionar imports: `BookText`, `Plus`, `Trash2` (se não estiverem).

(b) Constante:
```typescript
const MAX_TERMINOLOGY = 50;
const MAX_TERM_LEN = 100;
```

(c) State:
```typescript
const [terminology, setTerminology] = useState<Array<{ key: string; value: string }>>(
  () =>
    Object.entries(initial.terminology ?? {}).map(([key, value]) => ({ key, value })),
);
const [suggestionsEnabled, setSuggestionsEnabled] = useState<boolean>(
  initial.suggestionsEnabled,
);
```

(d) Atualizar `currentConfig` useMemo pra incluir terminology + suggestionsEnabled:
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

(e) Handlers:
```typescript
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

(f) JSX — entre o block "Tom" e o block "Guardrails", adicionar 2 sections novas:

```tsx
{/* v0.31.0 — Nomenclaturas e termos */}
<div className="space-y-2">
  <Label className="gap-2">
    <BookText className="h-3.5 w-3.5 text-muted-foreground" />
    Nomenclaturas e termos ({terminology.length}/{MAX_TERMINOLOGY})
  </Label>
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
            maxLength={MAX_TERM_LEN}
          />
          <span className="self-center text-xs text-muted-foreground">→</span>
          <Input
            aria-label={`Significa ${idx + 1}`}
            value={t.value}
            onChange={(e) => handleTermValueChange(idx, e.currentTarget.value)}
            placeholder="Significa (ex: inboxes)"
            disabled={fieldsDisabled}
            className="flex-1 min-h-[40px]"
            maxLength={MAX_TERM_LEN}
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

{/* v0.31.0 — Sugestões em botões */}
<div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0 flex-1">
      <Label htmlFor="nex-suggestions-toggle" className="cursor-pointer text-sm font-medium text-foreground">
        Sugestões em botões
      </Label>
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

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/agente-nex/prompt-config-form.tsx src/components/agente-nex/__tests__/prompt-config-form.test.tsx
git commit -m "feat(agente-nex): T-C4 v0.31 — PromptConfigForm sections novas (Nomenclaturas e termos cap 50 + toggle Sugestões em botões) entre Tom e Guardrails"
```

---

### Task D1: runNex extractSuggestions parser + always-log com is_playground flag

**Files:**
- Modify: `src/lib/llm/agent/run-nex.ts`
- Modify: `src/lib/llm/agent/__tests__/run-nex.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Pre-edit grep — confirma único skip de log:**

```bash
grep -rn "isPlayground.*log\|log.*isPlayground" src/ 2>/dev/null
# Esperado: apenas o block atual em run-nex.ts (linha ~147)
```

- [ ] **Step 3: Write failing tests:**

```typescript
import { extractSuggestions, runNexAgent } from "../run-nex";

describe("extractSuggestions (v0.31)", () => {
  it("texto sem sufixo: retorna message intacta + array vazio", () => {
    const r = extractSuggestions("Resposta normal sem sugestões.");
    expect(r.message).toBe("Resposta normal sem sugestões.");
    expect(r.suggestions).toEqual([]);
  });

  it("extrai sufixo no final da resposta: 3 sugestões", () => {
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

  it("não casa quando [[suggestions]] está NO MEIO de uma linha (ancoragem início-de-linha)", () => {
    const r = extractSuggestions("texto com [[suggestions]]:bla mais texto");
    expect(r.suggestions).toEqual([]);
    expect(r.message).toBe("texto com [[suggestions]]:bla mais texto");
  });

  it("casa quando [[suggestions]] é a primeira linha (sem texto antes)", () => {
    const r = extractSuggestions("[[suggestions]]:a|b");
    expect(r.message).toBe("");
    expect(r.suggestions).toEqual(["a", "b"]);
  });
});

describe("runNex — logUsage SEMPRE chamado com is_playground (v0.31)", () => {
  // SUBSTITUI o test antigo "não chama logUsage quando isPlayground=true"
  it("isPlayground=true: chama logUsage com is_playground=true (não pula mais)", async () => {
    // ... setup completo do mock runNexAgent ...
    await runNexAgent({ ...args, isPlayground: true });
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: true }),
    );
  });

  it("isPlayground=false (default): chama logUsage com is_playground=false", async () => {
    await runNexAgent({ ...args, isPlayground: false });
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: false }),
    );
  });

  it("isPlayground omitido: usa default false", async () => {
    await runNexAgent({ ...args });
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: false }),
    );
  });
});

describe("runNex — RunNexResult.suggestions (v0.31)", () => {
  it("retorna suggestions array (vazio quando não há sufixo)", async () => {
    // mock LLM retorna "ok"
    const r = await runNexAgent({ ...args });
    if (r.ok) expect(r.suggestions).toEqual([]);
  });

  it("retorna suggestions parseadas quando LLM emite [[suggestions]]", async () => {
    // mock LLM retorna "12 resolvidas\n[[suggestions]]:A|B"
    const r = await runNexAgent({ ...args });
    if (r.ok) {
      expect(r.message).toBe("12 resolvidas");
      expect(r.suggestions).toEqual(["A", "B"]);
    }
  });
});
```

(REMOVER test antigo `it("não chama logUsage quando isPlayground=true", ...)` — agora INVÁLIDO.)

- [ ] **Step 4: RED.**

- [ ] **Step 5: Edit `src/lib/llm/agent/run-nex.ts`:**

(a) Helper exportado:

```typescript
// v0.31.0: regex ANCORADA em início-de-linha — exige que [[suggestions]] esteja
// em sua própria linha (não em meio de texto). Aceita início de string OU \n antes.
const SUGGESTIONS_RE = /(?:^|\n)\[\[suggestions\]\]:([^\n]+?)(?:\n|$)/;
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

(b) Atualizar `RunNexResult` — `suggestions: string[]` não-opcional:

```typescript
export type RunNexResult =
  | { ok: true; message: string; suggestions: string[] }
  | { ok: false; error: string };
```

(c) Em `runNexAgent`, depois de extrair `rawMessage` da resposta LLM:

```typescript
const { message, suggestions } = extractSuggestions(rawMessage);
// ... eventualmente:
return { ok: true, message, suggestions };
```

(d) **Remover skip de logUsage** (linha ~147):

```typescript
// ANTES (v0.16):
if (!args.isPlayground) {
  await logUsage({ ... });
}

// DEPOIS (v0.31): SEMPRE loga, com flag.
await logUsage({
  provider: ...,
  model: ...,
  // ...outros campos...
  isPlayground: args.isPlayground ?? false,
});
```

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/lib/llm/agent/run-nex.ts src/lib/llm/agent/__tests__/run-nex.test.ts
git commit -m "feat(agente-nex): T-D1 v0.31 — runNex extractSuggestions parser (regex ancorada em início-de-linha) + RunNexResult.suggestions: string[] não-opcional + logUsage SEMPRE chamado com is_playground flag"
```

---

### Task D2: usage-logger aceita isPlayground

**Files:**
- Modify: `src/lib/llm/agent/usage-logger.ts`
- Modify: `src/lib/llm/agent/__tests__/usage-logger.test.ts`

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("logUsage — is_playground (v0.31)", () => {
  it("INSERT inclui is_playground quando isPlayground=true", async () => {
    await logUsage({
      provider: "openai", model: "gpt-5",
      tokensInput: 10, tokensOutput: 20, costUsd: 0.001,
      promptChars: 50, responseChars: 100,
      isPlayground: true,
    });
    const insertCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO llm_usage"),
    );
    expect(insertCall).toBeDefined();
    const sql = String(insertCall![0]);
    expect(sql).toMatch(/is_playground/i);
    const params = insertCall![1] as unknown[];
    expect(params).toContain(true);
  });

  it("isPlayground default=false quando omitido", async () => {
    await logUsage({
      provider: "openai", model: "gpt-5",
      tokensInput: 10, tokensOutput: 20, costUsd: 0.001,
      promptChars: 50, responseChars: 100,
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

- [ ] **Step 4: Edit `src/lib/llm/agent/usage-logger.ts`** — atualizar args + INSERT:

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

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/llm/agent/usage-logger.ts src/lib/llm/agent/__tests__/usage-logger.test.ts
git commit -m "feat(agente-nex): T-D2 v0.31 — logUsage aceita isPlayground param + INSERT inclui column is_playground"
```

---

### Task D3: sendNexMessage propaga isPlayground + retorna suggestions

**Files:**
- Modify: `src/lib/actions/nex-chat.ts`
- Modify: `src/lib/actions/__tests__/nex-chat.test.ts` (criar se não existir)

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("sendNexMessage (v0.31)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("retorna suggestions array do RunNexResult", async () => {
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

  it("erro do agent retorna { ok: false, error }", async () => {
    (runNexAgent as jest.Mock).mockResolvedValue({ ok: false, error: "boom" });
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/lib/actions/nex-chat.ts`:**

```typescript
export type SendNexMessageResult =
  | { ok: true; message: string; suggestions: string[] }
  | { ok: false; error: string };

export async function sendNexMessage(
  messages: ChatMessage[],
  options?: { isPlayground?: boolean },
): Promise<SendNexMessageResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Não autenticado" };
  }
  const filtered = (messages ?? []).filter((m) => m.role !== "system");
  if (filtered.length === 0) {
    return { ok: false, error: "Nenhuma mensagem para enviar" };
  }
  const authUser = await getCurrentUser();
  if (!authUser) return { ok: false, error: "Não autenticado" };
  let accountId: number;
  try {
    accountId = await getActiveAccountId(authUser as AuthUser);
  } catch (err) {
    if (err instanceof NoAccessibleAccountError) {
      return { ok: false, error: "Sem acesso a nenhuma conta" };
    }
    throw err;
  }
  const userId = authUser.id;
  const platformRole = authUser.platformRole;

  const result = await runNexAgent({
    messages: filtered,
    accountId,
    userId,
    userName: authUser.name ?? null,
    platformRole,
    isPlayground: options?.isPlayground ?? false, // v0.31.0
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: result.message, suggestions: result.suggestions };
}
```

(Manter `testNexPromptAction` como está — dead code potential mas não-breaking.)

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/lib/actions/nex-chat.ts src/lib/actions/__tests__/nex-chat.test.ts
git commit -m "feat(agente-nex): T-D3 v0.31 — sendNexMessage retorna suggestions + propaga isPlayground via options (backward-compat)"
```

---

### Task D4: SuggestionsBar componente compartilhado

**Files:**
- Create: `src/components/nex/suggestions-bar.tsx`
- Create: `src/components/nex/__tests__/suggestions-bar.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - chip violet outline (border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/15).
  - text-xs, px-3 py-1.5, rounded-full.
  - aria-label "Sugestões clicáveis" no group.
  - focus-visible ring violet.
  - Dark mode contrast OK (violet-300 sobre violet-500/15 = 4.5:1+).

- [ ] **Step 2: Write failing tests:**

```typescript
describe("SuggestionsBar (v0.31)", () => {
  it("renderiza nada quando suggestions=[]", () => {
    const { container } = render(<SuggestionsBar suggestions={[]} onPick={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza um botão por sugestão", () => {
    render(<SuggestionsBar suggestions={["A", "B", "C"]} onPick={jest.fn()} />);
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C" })).toBeInTheDocument();
  });

  it("click chama onPick com a sugestão", () => {
    const onPick = jest.fn();
    render(<SuggestionsBar suggestions={["A"]} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(onPick).toHaveBeenCalledWith("A");
  });

  it("group tem aria-label 'Sugestões clicáveis'", () => {
    render(<SuggestionsBar suggestions={["A"]} onPick={jest.fn()} />);
    expect(screen.getByRole("group", { name: /Sugestões clicáveis/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Create `src/components/nex/suggestions-bar.tsx`:**

```tsx
"use client";

import { cn } from "@/lib/utils";

export interface SuggestionsBarProps {
  suggestions: string[];
  onPick: (s: string) => void;
}

/**
 * SuggestionsBar — chips violet outline com sugestões clicáveis emitidas pelo agente Nex.
 * Renderizado abaixo da última assistant message no Bubble e Playground.
 *
 * v0.31.0: componente compartilhado entre nex-chat-panel e playground-sheet.
 */
export function SuggestionsBar({ suggestions, onPick }: SuggestionsBarProps) {
  if (suggestions.length === 0) return null;
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

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/nex/suggestions-bar.tsx src/components/nex/__tests__/suggestions-bar.test.tsx
git commit -m "feat(bubble): T-D4 v0.31 — SuggestionsBar componente compartilhado (chips violet outline + onPick callback)"
```

---

### Task D5: nex-chat-panel renderiza SuggestionsBar na última assistant message

**Files:**
- Modify: `src/components/nex/nex-chat-panel.tsx`
- Modify: `src/components/nex/__tests__/nex-chat-panel.test.tsx` (criar se não existir)

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Sugestões aparecem ABAIXO da última `assistant` message (não dentro do balão).
  - Click consume (limpa) suggestions da msg + chama handleSend.
  - Não renderiza durante `pending` (flicker).

- [ ] **Step 2: Write failing tests:**

```typescript
describe("nex-chat-panel — SuggestionsBar (v0.31)", () => {
  it("renderiza SuggestionsBar na última assistant message quando suggestions != []", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["Ver as abertas", "Ver por agente"],
    });
    render(<NexChatPanel open onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(screen.getByText(/12 resolvidas/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Ver as abertas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver por agente/i })).toBeInTheDocument();
  });

  it("click numa sugestão envia como nova msg + consome botões", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true, message: "12 resolvidas", suggestions: ["Ver as abertas"],
    });
    render(<NexChatPanel open onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => screen.getByRole("button", { name: /Ver as abertas/i }));

    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true, message: "5 abertas", suggestions: [],
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

- [ ] **Step 4: Edit `src/components/nex/nex-chat-panel.tsx`:**

(a) Atualizar `UiMessage`:
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
  /** v0.31.0: sugestões emitidas pelo agent. */
  suggestions?: string[];
}
```

(b) Importar:
```typescript
import { SuggestionsBar } from "@/components/nex/suggestions-bar";
```

(c) `handleSend` salva `suggestions` no UiMessage do assistant:
```typescript
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

(d) `handlePickSuggestion` callback:
```typescript
const handlePickSuggestion = React.useCallback(
  (msgId: string, suggestion: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, suggestions: undefined } : m)),
    );
    void handleSend(suggestion);
  },
  [handleSend],
);
```

(e) Render — após cada `<NexMessage>` da última assistant message com suggestions:
```tsx
{messages.map((m, idx) => {
  const isLastAssistant =
    m.role === "assistant" && idx === messages.length - 1 && !pending;
  return (
    <React.Fragment key={m.id}>
      <NexMessage
        role={m.role}
        content={m.content}
        toolName={m.toolName}
        kind={m.kind}
        audioBlobUrl={m.audioBlobUrl}
        durationSeconds={m.durationSeconds}
        hasStoredAudio={m.hasStoredAudio}
      />
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

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/nex/nex-chat-panel.tsx src/components/nex/__tests__/nex-chat-panel.test.tsx
git commit -m "feat(bubble): T-D5 v0.31 — nex-chat-panel renderiza SuggestionsBar na última assistant message (consume após click)"
```

---

### Task D6: PlaygroundSheet propaga isPlayground=true + renderiza SuggestionsBar

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`
- Modify: `src/components/agente-nex/__tests__/playground-sheet.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Mesma validação do D5 + isPlayground=true passado.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("PlaygroundSheet — isPlayground=true + SuggestionsBar (v0.31)", () => {
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

  it("renderiza SuggestionsBar quando assistant retorna suggestions", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true, message: "12 resolvidas", suggestions: ["A", "B"],
    });
    render(<PlaygroundSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => screen.getByText(/12 resolvidas/i));
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/components/agente-nex/playground-sheet.tsx`:**

(a) `submitMessage` chama com options:
```typescript
const r = await sendNexMessage(history, { isPlayground: true });
```

(b) Atualizar `ChatItem` interface pra incluir `suggestions?: string[]`:
```typescript
interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[]; // v0.31.0
}
```

(c) Quando assistant retorna OK, salva suggestions:
```typescript
appendItems([{
  id: genId(),
  role: "assistant",
  content: r.message,
  suggestions: r.suggestions,
}]);
```

(d) Render `SuggestionsBar` na última assistant message — mesma lógica do nex-chat-panel.

(e) `handlePickSuggestion` similar.

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/agente-nex/playground-sheet.tsx src/components/agente-nex/__tests__/playground-sheet.test.tsx
git commit -m "feat(agente-nex): T-D6 v0.31 — PlaygroundSheet propaga isPlayground=true + renderiza SuggestionsBar (compartilhado com bubble)"
```

---

### Task E1: DonutWithCenter — espessura mais fina + tooltip fixo top-right

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`
- Modify: `src/components/charts/__tests__/donut-with-center.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR.

- [ ] **Step 2: Write failing test:**

```typescript
describe("DonutWithCenter — defaults v0.31", () => {
  it("usa innerRadius=75 outerRadius=110 height=360 por default", () => {
    const { container } = render(
      <DonutWithCenter
        data={[{ name: "A", value: 50 }]}
        centerLabel="Total"
        centerValue="50"
      />,
    );
    const wrapper = container.querySelector("[role='img']") as HTMLElement;
    expect(wrapper.style.height).toBe("360px");
  });

  it("tooltipPosition é prop ATIVA não-deprecated com default 'top-right'", () => {
    expect(donutTooltipWrapperStyle("top-right")).toMatchObject({
      position: "absolute", top: 8, right: 8,
    });
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/components/charts/donut-with-center.tsx`:**

(a) Defaults:
```typescript
export function DonutWithCenter({
  data,
  centerLabel,
  centerValue,
  height = 360,
  innerRadius = 75,
  outerRadius = 110,
  emptyMessage,
  emptyHint,
  formatValue,
  showPercentInTooltip = true,
  className,
  ariaLabel = "Donut chart",
  onSliceClick,
  tooltipPosition = "top-right",
}: DonutWithCenterProps) {
```

(b) **Undeprecate** `tooltipPosition` — remover `@deprecated` + `_tooltipPositionDeprecated` underscore. Usar:

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

(Remove `offset={12}` e `allowEscapeViewBox` que faziam follow-mouse.)

- [ ] **Step 5: GREEN + Commit:**

```bash
git add src/components/charts/donut-with-center.tsx src/components/charts/__tests__/donut-with-center.test.tsx
git commit -m "feat(charts): T-E1 v0.31 — DonutWithCenter espessura mais fina (innerR=75 outerR=110, era 80/120) + tooltip fixo top-right (não follow-mouse, undeprecate prop)"
```

---

### Task E2: usage-stats byHour query + ConsumoContent renderiza hourly em "hoje"

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts`
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts`
- Modify: `src/components/llm/consumo-content.tsx`
- Modify: `src/components/llm/__tests__/consumo-content.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("getUsageStats — byHour (v0.31)", () => {
  it("retorna byHour com 24 buckets quando range <= 24h", async () => {
    const start = new Date("2026-05-03T00:00:00-03:00");
    const end = new Date("2026-05-04T00:00:00-03:00");
    mockedPgPool.query.mockImplementation((sql: string) => {
      if (String(sql).includes("EXTRACT(HOUR")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ hour: 10, cost: 0.5, cost_brl: 2.75, calls: 3 }],
        });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    const stats = await getUsageStats({ start, end });
    expect(stats.byHour).toBeDefined();
    expect(stats.byHour).toHaveLength(24);
    expect(stats.byHour![10]).toMatchObject({ hour: 10, calls: 3 });
    const empties = stats.byHour!.filter((h) => h.calls === 0);
    expect(empties).toHaveLength(23);
  });

  it("byHour é undefined quando range > 24h", async () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-05-04");
    const stats = await getUsageStats({ start, end });
    expect(stats.byHour).toBeUndefined();
  });
});
```

```typescript
describe("ConsumoContent — Hoje hourly (v0.31)", () => {
  it("Card title 'Custo por hora' quando pill='hoje' e byHour disponível", async () => {
    // mock fetchUsageStats retorna byHour
    render(<ConsumoContent minDate="..." />);
    // pill default ou click hoje
    await waitFor(() => expect(screen.getByText(/Custo por hora/i)).toBeInTheDocument());
  });

  it("Card title 'Custo por dia' quando pill != 'hoje'", async () => {
    // ...
    await waitFor(() => expect(screen.getByText(/Custo por dia/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: RED.**

- [ ] **Step 4: Edit `src/lib/llm/queries/usage-stats.ts`:**

(a) Atualizar `UsageSummary`:
```typescript
export interface UsageSummary {
  // ...existing...
  /** v0.31.0: 24 buckets (hour 0..23) quando range <= 24h. Undefined caso contrário. */
  byHour?: Array<{ hour: number; cost: number; costBrl: number; calls: number }>;
}
```

(b) Em `getUsageStats`, calcular hourly mode:
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
  // Inicializa 24 buckets zerados.
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

- [ ] **Step 5: Edit `src/components/llm/consumo-content.tsx`:**

(a) Detectar hourly mode + dynamic title:
```typescript
const isHourly = pill === "hoje" && stats?.byHour !== undefined;

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

(b) Title dynamic no Card:
```tsx
<CardTitle className="flex items-center gap-2">
  <Coins className="h-4 w-4 text-violet-500" />
  {isHourly ? "Custo por hora" : "Custo por dia"}
</CardTitle>
```

- [ ] **Step 6: GREEN + Commit:**

```bash
git add src/lib/llm/queries/usage-stats.ts src/lib/llm/queries/__tests__/usage-stats.test.ts src/components/llm/consumo-content.tsx src/components/llm/__tests__/consumo-content.test.tsx
git commit -m "feat(agente-nex): T-E2 v0.31 — Consumo período Hoje vira gráfico hourly (byHour 24 buckets); Card title dinâmico 'Custo por hora' vs 'Custo por dia'"
```

---

### Task E3: Consumo coluna Origem + filtro Ambiente

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts`
- Modify: `src/lib/actions/llm-usage.ts`
- Modify: `src/components/llm/consumo-content.tsx`
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts`
- Modify: `src/components/llm/__tests__/consumo-content.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Coluna "Origem" entre "Data/hora" e "Provider". Badge pill: "Agente Nex" violet bg, "Playground" amber bg.
  - Filtro `<CustomSelect>` "Ambiente" ao lado do Provider global. Options: Todos os ambientes / Agente Nex / Playground.
  - colSpan da linha Total = 4.

- [ ] **Step 2: Pre-edit grep — confirma único caller de fetchUsageDetails:**

```bash
grep -rn "fetchUsageDetails" src/ 2>/dev/null
# Esperado: apenas src/components/llm/consumo-content.tsx + tests
```

- [ ] **Step 3: Write failing tests:**

```typescript
describe("getUsageDetails — isPlayground filter (v0.31)", () => {
  it("filtra is_playground=true quando arg=true", async () => {
    await getUsageDetails({
      start: new Date(), end: new Date(),
      isPlayground: true,
    });
    const lastSql = String(mockedPgPool.query.mock.calls.at(-1)![0]);
    expect(lastSql).toMatch(/is_playground/i);
    const params = mockedPgPool.query.mock.calls.at(-1)![1] as unknown[];
    expect(params).toContain(true);
  });

  it("UsageDetailRow inclui isPlayground (mapper snake→camel)", async () => {
    mockedPgPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "x", provider: "openai", model: "gpt-5",
        tokens_input: 0, tokens_output: 0, cost_usd: 0, cost_brl: null,
        usd_to_brl_rate: null, duration_ms: null, created_at: new Date(),
        prompt_chars: null, response_chars: null, user_id: null,
        error_message: null, is_playground: true,
      }],
    });
    // ... mocks pra count + totals ...
    const result = await getUsageDetails({ start: new Date(), end: new Date() });
    expect(result.rows[0].isPlayground).toBe(true);
  });
});
```

- [ ] **Step 4: RED.**

- [ ] **Step 5: Edit usage-stats.ts:**

(a) `UsageDetailRow.isPlayground: boolean`:
```typescript
export interface UsageDetailRow {
  // ...existing...
  /** v0.31.0: true = chamada do Playground; false = Bubble. */
  isPlayground: boolean;
}
```

(b) `getUsageDetails` aceita `isPlayground`:
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
  // SELECT ganha is_playground; mapper retorna isPlayground: !!r.is_playground
  // params shift: [start, end, provider, model, isPlayground, limit, offset]
}
```

- [ ] **Step 6: Edit `src/lib/actions/llm-usage.ts`** — propaga `isPlayground` filter no `fetchUsageDetails`.

- [ ] **Step 7: Edit consumo-content.tsx:**

(a) State:
```typescript
const [ambiente, setAmbiente] = useState<"all" | "bubble" | "playground">(() => {
  if (typeof window === "undefined") return "all";
  const v = new URLSearchParams(window.location.search).get("env");
  return v === "playground" || v === "bubble" ? v : "all";
});

// Map pra filter:
const isPlaygroundFilter =
  ambiente === "all" ? null : ambiente === "playground";
```

(b) URL sync (similar ao globalProvider).

(c) JSX — filtro novo:
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

(d) Tabela — coluna nova entre Data/hora e Provider:
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

(e) Linha Total sticky — colSpan 3 → 4 (Data/hora + Origem + Provider + Modelo):
```tsx
<TableCell colSpan={4} className="whitespace-nowrap">
  <span>Total no filtro</span>
</TableCell>
```

(f) `fetchUsageDetails` chama com isPlayground prop.

- [ ] **Step 8: GREEN + Commit:**

```bash
git add src/lib/llm/queries/usage-stats.ts src/lib/actions/llm-usage.ts src/components/llm/consumo-content.tsx src/lib/llm/queries/__tests__/usage-stats.test.ts src/components/llm/__tests__/consumo-content.test.tsx
git commit -m "feat(agente-nex): T-E3 v0.31 — Consumo coluna Origem (Bubble/Playground badge violet/amber) + filtro Ambiente (Todos/Agente Nex/Playground) + isPlayground filter no getUsageDetails + colSpan Total = 4"
```

---

### Task R1: bump 0.30 → 0.31 + CHANGELOG + STATUS

(passos padrão; sync remote, edit package.json, escrever entries longas, commit `chore(release): v0.31.0 — Suite Agente Nex Polish v5`).

### Task R2: typecheck + tests + build

`npx tsc --noEmit -p tsconfig.json | tail -5` · `npm test 2>&1 | tail -20` · `npm run build 2>&1 | tail -10`.

### Task R3: push + portainer-fix

`gh run list --limit 5` · `git push origin main` · `gh run watch <id>` · `gh workflow run "Portainer fix..." -f app_version=v0.31.0` · `until curl /api/health | grep v0.31.0; do sleep 8; done`.

### Task R4: HISTORY append + cleanup

Append entry · `rm docs/agents/active/claude-agente-nex-polish-v031.md` · memory update.

---

## Self-Review v3 final

### Spec coverage (vs feedback do user nesta thread)
- [x] **Configuração:** B1 (hardcode spread fix bug) + B2 (remove Spread/Ticker UI + redesign toggle Nex linha única + remove Criar API key inline)
- [x] **Chaves API:** já existe `topUpUrl` no catalog (T-B2 mantém o atalho "Adicionar crédito")
- [x] **Prompt — Nomenclaturas:** A1 (schema + pre-seed Matrix), C1 (compose), C2 (read/write + Server Actions + 8 mocks), C4 (UI section)
- [x] **Prompt — Sugestões em botões toggle:** A1 (schema), C1 (compose), C2 (Server Action), C4 (UI toggle)
- [x] **Prompt — remove frase preview + KB rename:** C3
- [x] **Bubble — sugestões clicáveis:** D1 (parser), D2 (logger), D3 (action), D4 (componente), D5 (bubble), D6 (playground)
- [x] **Consumo:** E1 (donut), E2 (hourly), E3 (Origem + Ambiente)
- [x] **Schema additives:** A1 (3 columns + pre-seed) + A2 (1 column)

### Placeholders — sem TODOs.

### Type consistency (verificada cross-task)
- `NexPromptConfig.terminology: Record<string,string>` + `suggestionsEnabled: boolean` — não-opcional, consistente em compose, prompt, Server Actions, form, mocks.
- `RunNexResult.suggestions: string[]` — não-opcional, consistente em runNex/sendNexMessage/UiMessage/ChatItem.
- `UsageDetailRow.isPlayground: boolean` ↔ `is_playground BOOLEAN` ↔ `logUsage.isPlayground?: boolean` ↔ `runNex.isPlayground?: boolean` ↔ `sendNexMessage.options.isPlayground?: boolean`.
- `id="nex-bubble-toggle"` padronizado.

### Trade-offs documentados
- **Histórico pre-v0.31 marcado como Bubble** — sem migration retroativa.
- **Spread hardcoded** — ignora customização DB existente (user pediu).
- **Parser `[[suggestions]]:`** simples (frágil mas suficiente — `|` reservado documentado no prompt).
- **`testNexPromptAction` dead code potential** — mantido por back-compat.
- **DB index em is_playground** — YAGNI (cardinality baixa).

### Riscos identificados (não-bloqueantes)
- Race condition em saveTerminologyAction (last-write-wins; aceitável dado cardinality).
- Dark mode contrast SuggestionsBar — validar manualmente (esperado 4.5:1+).
- Sufixo `[[suggestions]]:` consome ~30-50 tokens extras por response.
