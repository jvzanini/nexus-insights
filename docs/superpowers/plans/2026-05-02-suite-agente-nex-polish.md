# Plan — Suite Agente Nex · Polish (v0.20.0)

> **For agentic workers:** REQUIRED SUB-SKILL — `superpowers:subagent-driven-development`. Cada task de UI invoca obrigatoriamente `Skill ui-ux-pro-max:ui-ux-pro-max` ANTES de codar (regra absoluta CLAUDE.md).

**Spec:** `docs/superpowers/specs/2026-05-02-suite-agente-nex-polish-design.md` (v3 final, 49 achados).

**Goal:** polish dirigido por feedback super_admin (Whisper tokens reais via gpt-4o-mini-transcribe, linha total destaque, Y-axis sub-cent, donut sutil, prompt read-only com Editar, IDENTITY enxuta, defaults Personality/Tom, KB Chatwoot atalho removido, Maximize=Dialog, Chaves botão limpo + condicional + logos SVG, filtro global Provider em Consumo, tag de provider abaixo dos modelos no Bar chart, pageSize CustomSelect).

**Tech Stack:** TypeScript + React + Recharts + base-ui Dialog + node-html-parser (já instalado) + Lobe Icons / Simple Icons (SVG inline).

---

## Tasks (consolidado pós-pente-finos)

### T0a · Auditar `prompt.test.ts` e callers de `getUsageStats`

**Files:**
- Read: `src/lib/nex/__tests__/prompt.test.ts`, `src/lib/nex/prompt-compose.ts`.
- Grep: `getUsageStats|fetchUsageStats` em `src/`.

- [ ] Step 1: `Read prompt.test.ts` e listar asserções que dependem de IDENTITY_BASE específico.
- [ ] Step 2: `grep -rn "getUsageStats\|fetchUsageStats" src/` e listar callers.
- [ ] Step 3: anotar achados em comentário no plan ou na sessão.

---

### T1a · `pricing.ts` adiciona `gpt-4o-mini-transcribe`

**Files:**
- Modify: `src/lib/llm/pricing.ts`.
- Test: `src/lib/llm/__tests__/pricing.test.ts`.

- [ ] Step 1: Test first:
```ts
it("calculateCost gpt-4o-mini-transcribe usa token-based ($3/M input + $5/M output)", () => {
  expect(calculateCost("gpt-4o-mini-transcribe", 1_000_000, 100_000, {})).toBeCloseTo(1.0 * 3.0 + 0.1 * 5.0, 4);
});
it("whisper-1 continua perMinuteUsd 0.006", () => {
  expect(calculateCost("whisper-1", 0, 0, { durationMs: 60000 })).toBeCloseTo(0.006, 6);
});
```
- [ ] Step 2: Run jest → FAIL.
- [ ] Step 3: Add em `MODEL_PRICING`:
```ts
"gpt-4o-mini-transcribe": {
  inputPerMillion: 3.0,
  outputPerMillion: 5.0,
},
```
- [ ] Step 4: Run jest → PASS.
- [ ] Step 5: Commit `feat(pricing): gpt-4o-mini-transcribe ($3/M input + $5/M output) — T1a v0.20.0`.

---

### T1b · `transcribe.ts` migra para `gpt-4o-mini-transcribe` + fallback

**Files:**
- Modify: `src/lib/nex/transcribe.ts`.
- Test: criar/estender `src/lib/nex/__tests__/transcribe.test.ts`.

- [ ] Step 1: Test first cobre 4 cenários (mock fetch global):
  - Sucesso gpt-4o-mini-transcribe → retorna { text, durationSeconds, inputTokens, outputTokens, modelUsed: "gpt-4o-mini-transcribe" }.
  - 4xx → fallback whisper-1 verbose_json sucesso → modelUsed: "whisper-1", inputTokens: 0, outputTokens: 0.
  - Ambos falham → propaga erro original.
  - Audio > 25MB → erro imediato.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar:
```ts
interface TranscribeUsage {
  type?: string;
  input_tokens?: number;
  input_token_details?: { text_tokens?: number; audio_tokens?: number };
  output_tokens?: number;
  total_tokens?: number;
}
interface GptTranscribeResponse {
  text?: string;
  usage?: TranscribeUsage;
}
interface WhisperVerboseResponse {
  text?: string;
  duration?: number;
}

export interface TranscribeResult {
  text: string;
  durationSeconds: number;
  inputTokens: number;
  outputTokens: number;
  modelUsed: "gpt-4o-mini-transcribe" | "whisper-1";
}

export async function transcribeAudio(audio: Blob, language = "pt"): Promise<TranscribeResult> {
  if (audio.size > MAX_AUDIO_BYTES) throw new Error(`Áudio acima do limite de 25 MB...`);
  const config = await getActiveLlmConfig();
  if (!config || config.provider !== "openai") throw new Error("Whisper requer credencial OpenAI ativa...");

  const start = Date.now();

  // Tenta gpt-4o-mini-transcribe primeiro
  try {
    const form = new FormData();
    form.append("file", audio, "audio.webm");
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("response_format", "json");
    form.append("language", language);
    const response = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
    if (response.ok) {
      const data = (await response.json()) as GptTranscribeResponse;
      const usage = data.usage;
      const audioTokens = usage?.input_token_details?.audio_tokens ?? 0;
      const textTokens = usage?.input_token_details?.text_tokens ?? 0;
      const fallbackInput = usage?.input_tokens ?? 0;
      return {
        text: data.text ?? "",
        durationSeconds: (Date.now() - start) / 1000,
        inputTokens: audioTokens + textTokens || fallbackInput,
        outputTokens: usage?.output_tokens ?? 0,
        modelUsed: "gpt-4o-mini-transcribe",
      };
    }
    console.warn(`[transcribe] gpt-4o-mini-transcribe ${response.status} — fallback whisper-1`);
  } catch (err) {
    console.warn(`[transcribe] gpt-4o-mini-transcribe falhou — fallback whisper-1`, err);
  }

  // Fallback whisper-1
  const formW = new FormData();
  formW.append("file", audio, "audio.webm");
  formW.append("model", "whisper-1");
  formW.append("response_format", "verbose_json");
  formW.append("language", language);
  const responseW = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formW,
  });
  if (!responseW.ok) {
    let errorBody = "";
    try { errorBody = await responseW.text(); } catch { /* ignore */ }
    throw new Error(`Whisper ${responseW.status}: ${errorBody || responseW.statusText}`);
  }
  const dataW = (await responseW.json()) as WhisperVerboseResponse;
  return {
    text: dataW.text ?? "",
    durationSeconds: typeof dataW.duration === "number" ? dataW.duration : (Date.now() - start) / 1000,
    inputTokens: 0,
    outputTokens: 0,
    modelUsed: "whisper-1",
  };
}
```
- [ ] Step 4: Run tests → PASS.
- [ ] Step 5: Commit `feat(transcribe): gpt-4o-mini-transcribe + fallback whisper-1 + tokens reais — T1b v0.20.0`.

---

### T1c · `/api/nex/transcribe` passa tokens reais

**Files:**
- Modify: `src/app/api/nex/transcribe/route.ts`.

- [ ] Step 1: Atualizar handler:
```ts
const r = await transcribeAudio(audio, language);
const cost = calculateCost(r.modelUsed, r.inputTokens, r.outputTokens, {
  durationMs: r.durationSeconds * 1000,
});
void logUsage({
  provider: "openai",
  model: r.modelUsed,
  tokensInput: r.inputTokens,
  tokensOutput: r.outputTokens,
  costUsd: cost,
  promptChars: 0,
  responseChars: r.text.length,
  userId: user.id,
  durationMs: Date.now() - start,
});
return Response.json({ ok: true, text: r.text, durationSeconds: r.durationSeconds }, { status: 200 });
```
- [ ] Step 2: typecheck → 0 erros.
- [ ] Step 3: Commit `feat(api): /api/nex/transcribe passa modelo + tokens reais — T1c v0.20.0`.

---

### T1d · `prompt-compose.ts` IDENTITY_BASE enxuta + tests

**Files:**
- Modify: `src/lib/nex/prompt-compose.ts`.
- Modify: `src/lib/nex/__tests__/prompt.test.ts`.

> Ler T0a primeiro para saber asserções afetadas.

- [ ] Step 1: Test first — atualizar/criar:
  - `IDENTITY_BASE.length < 1500` (anti-regressão prolixa).
  - `IDENTITY_BASE` contém: "Nexus Insights", "ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google" (lista proibição).
  - `IDENTITY_BASE` NÃO contém "dashboard summary" (case-insensitive).
- [ ] Step 2: Run → FAIL (length atual ~3000+, asserções novas falham).
- [ ] Step 3: Substituir `IDENTITY_BASE` pelo texto canônico (Apêndice B da spec v3 — bloco de ~14 linhas).
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(nex): IDENTITY_BASE enxuta anti-prolixidade — T1d v0.20.0`.

---

### T1e · `ensure-tables.ts` seed Personality/Tom

**Files:**
- Modify: `src/lib/nex/ensure-tables.ts`.

- [ ] Step 1: Após o backfill de guardrails, adicionar:
```ts
await pgPool.query(`
  UPDATE "nex_settings"
  SET "personality" = 'Direto, prático, prefere bullets curtos quando há listas. Evita rodeios e textão. Não se apresenta a cada turno.',
      "tone" = 'Profissional e objetivo, em pt-BR. Usa "você". Sem se desculpar; sem repetir o nome do agente.'
  WHERE "id" = 'global'
    AND "seeded_defaults_at" IS NOT NULL
    AND "personality" = '' AND "tone" = '';
`);
```
- [ ] Step 2: Smoke test manual: rodar `npx prisma db push` ou apenas garantir que typecheck passa (queries SQL puras, sem schema mudança).
- [ ] Step 3: Commit `feat(ensure-tables): seed Personality/Tom default (idempotente) — T1e v0.20.0`.

---

### T1f · `getUsageStats` aceita filtro `provider?: string`

**Files:**
- Modify: `src/lib/llm/queries/usage-stats.ts`.
- Modify: `src/lib/llm/queries/__tests__/usage-stats.test.ts`.
- Modify: `src/lib/actions/llm-usage.ts` (passar provider para getUsageStats).

- [ ] Step 1: Test first — getUsageStats com provider="openai" filtra summary/byDay/byModel/byProvider.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar — adicionar `provider?: string` no args + WHERE clause em todas as 4 queries internas (analogo a `getUsageDetails` em T4c v0.16):
```sql
WHERE created_at BETWEEN $1 AND $2
  AND ($3::text IS NULL OR provider = $3)
```
- [ ] Step 4: `fetchUsageStats(args)` propaga `provider`.
- [ ] Step 5: Run jest → PASS. typecheck → 0 erros.
- [ ] Step 6: Commit `feat(usage-stats): getUsageStats aceita filtro provider — T1f v0.20.0`.

---

### T2-ICONS · ProviderIcons SVG (4 componentes + index)

**Files:**
- Create: `src/components/icons/providers/openai-icon.tsx`.
- Create: `src/components/icons/providers/anthropic-icon.tsx`.
- Create: `src/components/icons/providers/gemini-icon.tsx`.
- Create: `src/components/icons/providers/openrouter-icon.tsx`.
- Create: `src/components/icons/providers/index.ts`.
- Test: `src/components/icons/providers/__tests__/index.test.tsx`.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` para validar peso visual + currentColor + viewBox.

- [ ] Step 1: WebFetch SVG paths:
  - OpenAI: https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg (mono) — ou Bootstrap Icons.
  - Anthropic: https://cdn.simpleicons.org/anthropic.
  - Gemini: https://cdn.simpleicons.org/googlegemini.
  - OpenRouter: https://cdn.simpleicons.org/openrouter.
- [ ] Step 2: Test first — render 4 componentes + `getProviderIcon('openai') === OpenAIIcon`.
- [ ] Step 3: Implementar cada como `function OpenAIIcon(props: SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="..."/></svg> }`.
- [ ] Step 4: `index.ts` exporta `getProviderIcon(provider: LlmProvider): ComponentType<SVGProps>`.
- [ ] Step 5: Run jest → PASS.
- [ ] Step 6: Commit `feat(icons): ProviderIcons SVG (OpenAI/Anthropic/Gemini/OpenRouter) — T2-ICONS v0.20.0`.

---

### T2-PROMPT · `<PromptPreviewCard>` refactor (B1+B5+B6+B7) + page wrapper

**Files:**
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`.
- Modify: `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx`.
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx` (wrap form com `id="prompt-edit-form"`).

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — 6 cenários novos:
  - Banner italic "Preview somente leitura..." renderizado.
  - Botão "Editar" presente.
  - Click "Editar" chama scrollIntoView mock no elemento `#prompt-edit-form`.
  - Botão "Mostrar identidade fixa" renomeado para "Ver identidade fixa do agente (somente leitura)".
  - Quando aberto: parágrafo explicativo presente.
  - Click "Maximizar" abre Dialog (não Sheet).
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar:
  - Adicionar `<p>` banner italic.
  - Adicionar `<Button variant="ghost" size="sm" onClick={handleEditScroll}><Pencil/> Editar</Button>` no header.
  - Renomear label do toggle.
  - Adicionar parágrafo explicativo dentro do block when `showIdentity`.
  - Trocar `<Sheet>` por `<Dialog>` (importar `Dialog`, `DialogContent`, `DialogTitle` de `@/components/ui/dialog`):
```tsx
<Dialog open={maximized} onOpenChange={setMaximized}>
  <DialogContent className="max-w-[min(900px,92vw)] max-h-[85vh] flex flex-col gap-3 p-6">
    <div className="flex items-start justify-between gap-2">
      <DialogTitle>Prompt completo do Agente Nex</DialogTitle>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
        </Button>
        <Button variant="default" size="sm" onClick={handleEditFromMaximized}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar prompt
        </Button>
      </div>
    </div>
    <ScrollArea className="flex-1 min-h-0 rounded-lg border border-border bg-muted/40">
      <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground min-w-0">{prompt}</pre>
    </ScrollArea>
  </DialogContent>
</Dialog>
```
  - `<pre>` do card: ganha `cursor-text`, `aria-readonly="true"`, `min-w-0`.
  - `<ScrollArea>` ganha `overflow-x-hidden w-full`.
- [ ] Step 4: `prompt/page.tsx` wrappa Card "Comportamento" em `<div id="prompt-edit-form" className="scroll-mt-4 space-y-6">`.
- [ ] Step 5: typecheck + jest → 0 erros, PASS.
- [ ] Step 6: Commit `feat(prompt-preview): banner read-only + Editar + Maximize=Dialog + layout fix — T2-PROMPT v0.20.0`.

---

### T2-KB · `<KbSection>` remove atalho Chatwoot

**Files:**
- Modify: `src/components/agente-nex/kb-section.tsx`.
- Modify: `src/components/agente-nex/__tests__/kb-section.test.tsx`.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — assert que NÃO há mais botão `Adicionar API Chatwoot`.
- [ ] Step 2: Run → FAIL (atual tem o botão).
- [ ] Step 3: Deletar:
  - `CHATWOOT_SUGGESTED_NAME`, `CHATWOOT_SUGGESTED_URL`.
  - `function openAddChatwootSuggestion`.
  - JSX do botão `<Sparkles> Adicionar API Chatwoot (sugerida)`.
  - Tipo `UploadDialogState` simplifica para `{ open: boolean }` (sem tab/url props).
  - `<KbUploadDialog>` chamada simplificada.
- [ ] Step 4: Run jest + typecheck → PASS / 0 erros.
- [ ] Step 5: Commit `chore(kb-section): remove atalho 'Adicionar API Chatwoot' — T2-KB v0.20.0`.

---

### T2-DONUT · `<DonutWithCenter>` outerRadius/font

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — outerRadius=88 e centro com class text-xl.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Mudar `outerRadius={80}` → `outerRadius={88}` no `<Pie>`. Mudar class do valor central de `text-2xl` para `text-xl`.
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(donut): outerRadius 88 + center text-xl — T2-DONUT v0.20.0`.

---

### T2-CHART · `<InteractiveAreaChart>` + `<InteractiveBarChart>` (subcent + provider tag)

**Files:**
- Modify: `src/components/charts/area-chart.tsx`.
- Modify: `src/components/charts/bar-chart.tsx`.
- Modify: `src/components/charts/__tests__/area-chart.test.tsx`.
- Modify: `src/components/charts/__tests__/bar-chart.test.tsx`.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` (sub-cent ticks + custom XAxis tick com 2 linhas).

- [ ] Step 1: Test first cobre:
  - AreaChart com `data=[{name:"01",cost:0.005}]` e `yAxisCurrency="BRL"` → tickFormatter retorna "R$ 0,00" e "< R$ 0,01".
  - BarChart com `providersByModel={{"gpt-5.4-nano":"openai"}}` renderiza `(OpenAI)` no tick.
  - BarChart sem providersByModel mantém comportamento atual.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar `area-chart.tsx`:
```ts
const maxValue = Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
const isSubCent = yAxisCurrency !== undefined && maxValue > 0 && maxValue < 0.01;
```
Passar para `<YAxis domain={isSubCent ? [0, 0.01] : undefined} ticks={isSubCent ? [0, 0.01] : undefined} tickFormatter={isSubCent ? (v) => v === 0 ? "R$ 0,00" : "< R$ 0,01" : yTickFormatter} />`.

(Mesmo em bar-chart.tsx, e adicionalmente:)

```tsx
interface InteractiveBarChartProps {
  // ... existentes
  providersByModel?: Record<string, string>;
}

function CustomBarTick({ x, y, payload, providersByModel }: any) {
  const provider = providersByModel?.[payload.value];
  const providerLabel = provider ? `(${PROVIDER_LABELS[provider] ?? provider})` : "";
  const truncated = (payload.value as string).length > 24 ? `${(payload.value as string).slice(0, 21)}…` : payload.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fontSize={13} fill="currentColor">{truncated}</text>
      {providerLabel ? (
        <text x={0} y={0} dy={32} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>{providerLabel}</text>
      ) : null}
    </g>
  );
}
```

`<XAxis tick={(props) => <CustomBarTick {...props} providersByModel={providersByModel} />} height={providersByModel ? 50 : 30} ... />`.

`<BarChart margin={providersByModel ? { bottom: 20 } : undefined}>`.

- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(charts): subcent mode (Y < R$0,01) + bar custom tick com provider tag — T2-CHART v0.20.0`.

---

### T2-DETAIL · `<UsageDetailSheet>` nota condicional

**Files:**
- Modify: `src/components/llm/usage-detail-sheet.tsx`.
- Modify: `src/components/llm/__tests__/usage-detail-sheet.test.tsx`.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first — row com `model="whisper-1"` mostra nota; `model="gpt-4o-mini-transcribe"` NÃO mostra nota.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Substituir nota fixa por:
```tsx
{row.model === "whisper-1" ? (
  <p className="text-xs text-muted-foreground">Whisper é cobrado por minuto. Tokens não se aplicam a chamadas de áudio (legado).</p>
) : null}
```
(remover o text fixed atual, deixar só pra whisper-1).
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `feat(usage-detail): nota whisper-1 condicional (gpt-4o-mini-transcribe sem nota) — T2-DETAIL v0.20.0`.

---

### T2-CREDS · `<LlmCredentialsManager>` (C1+C2+C3)

**Files:**
- Modify: `src/components/settings/llm-credentials-manager.tsx`.
- Modify: `src/components/settings/__tests__/llm-credentials-manager.test.tsx`.

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first cobre:
  - Botão "Nova chave" SEM classes `from-violet-600` (gradient removido).
  - Provider sem credenciais: NÃO renderiza `<Button>` no header (só link ExternalLink + botão dentro do empty state).
  - Provider com credenciais: renderiza botão no header.
  - Ícone do provider é SVG (testar via testid `provider-icon-{p}`).
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar:
  - Remover `className="bg-gradient-to-br from-violet-600 ..."` em ambas ocorrências do botão.
  - Header: `{list.length > 0 ? <NewKeyButton/> : null}` (escondido quando vazio).
  - Importar `getProviderIcon` de `@/components/icons/providers` e substituir `<span>{initial}</span>` por `<ProviderIcon className="h-5 w-5" aria-hidden="true" />` mantendo container `bg-violet-600/10 text-violet-500 dark:text-violet-400 rounded-lg flex h-9 w-9 items-center justify-center`.
- [ ] Step 4: PASS.
- [ ] Step 5: Commit `refactor(creds): botão sem gradient + condicional 0/≥1 + logos SVG — T2-CREDS v0.20.0`.

---

### T2-CONSUMO · `<ConsumoContent>` integration (A2 + 3.E + 3.F + 3.G)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`.
- Modify: `src/components/llm/__tests__/consumo-content.test.tsx` (existente).

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` (linha total + filtro global + pageSize select + providersByModel pra bar chart).

- [ ] Step 1: Test first cobre:
  - Linha total tem classe `bg-violet-500/15` E `font-bold` E ícone Sigma.
  - Filtro global de Provider visível ao lado do PeriodPills.
  - Mudar global Provider chama fetchUsageStats com novo provider + sincroniza tabela.
  - Voltar global para "Todos" remove filter.
  - PageSize dropdown usa CustomSelect (não `<select>`).
  - Bar chart "Custo por modelo" recebe providersByModel derivado de byModel.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar:
  - Linha de total — substituir classes atuais por: `bg-violet-500/15 dark:bg-violet-500/10 border-y-2 border-violet-500/40 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 font-bold tracking-wide`. Primeira cell colspan=3 com `<Sigma className="mr-1 inline h-4 w-4" /> TOTAL NO FILTRO`.
  - Adicionar `<CustomSelect>` global de Provider ao lado direito do PeriodPills:
    - `value={globalProvider ?? "__all__"}`, options `["Todos os providers", ...providers]`.
    - onChange: `setGlobalProvider(v === "__all__" ? undefined : v)`.
  - State `globalProvider` persistido em URL (`?provider=`).
  - `fetchUsageStats({ ..., provider: globalProvider })` quando definido.
  - Passar `globalProvider` como prop `defaultProvider` para `<UsageTableFilters>` (que usa esse default no mount + sync via useEffect quando muda).
  - PageSize: substituir `<select>` por `<CustomSelect>`:
```tsx
<CustomSelect value={String(pageSize)} onChange={(v)=>setPageSize(Number(v))} options={[
  { value: "25", label: "25 por página" },
  { value: "50", label: "50 por página" },
  { value: "100", label: "100 por página" },
]} triggerClassName="w-[140px] min-h-[34px] text-xs" />
```
  - Para `<InteractiveBarChart>` da seção "Custo por modelo": passar `providersByModel={Object.fromEntries(summary.byModel.map(m => [m.model, m.provider]))}`.
- [ ] Step 4: typecheck + jest → 0 erros, PASS.
- [ ] Step 5: Commit `refactor(consumo): linha total destaque + filtro global Provider + pageSize CustomSelect + providersByModel pro bar chart — T2-CONSUMO v0.20.0`.

---

### T3a · Bump versão + CHANGELOG + STATUS + runbook + memory

**Files:**
- Modify: `package.json`.
- Modify: `CHANGELOG.md`.
- Modify: `docs/STATUS.md`.
- Create: `docs/runbooks/agente-nex-audio-e-kb-url.md`.
- Create memory: `~/.claude/projects/.../memory/project_v0.20_polish.md` + atualizar MEMORY.md.

- [ ] Step 1: `git fetch origin main && git status` (clean).
- [ ] Step 2: Bump 0.18.0 → 0.20.0 (verificar se outro agente passou pra 0.21+; se sim, ajustar).
- [ ] Step 3: CHANGELOG nova entry "## [v0.20.0] 2026-05-02 — Suite Agente Nex Polish" com 3 sections (A consumo / B prompt / C chaves) + bullets descritivos.
- [ ] Step 4: STATUS.md atualizado com release v0.20.0.
- [ ] Step 5: Criar runbook `docs/runbooks/agente-nex-audio-e-kb-url.md`:
  - **A1:** Fluxo de transcrição (gpt-4o-mini-transcribe → fallback whisper-1). Custo: $0.003/min (50% economia vs whisper-1). Tokens reais via `usage.input_token_details.audio_tokens`.
  - **B8 KB URL:** assertPublicUrl SSRF guard + fetchKbUrl 10s/5MB/node-html-parser → extrai `<main>`/`<article>` ou `<body>` minus script/style/nav/footer/aside/form → trunca 100k chars → injeta no system prompt limitado a 30k total. Para SPAs (e.g., developers.chatwoot.com) extrai apenas DOM inicial (limitação atual; v0.21+ pode adicionar sitemap crawl).
- [ ] Step 6: Memory file (não-versionada): resumo 1 página da release. Adicionar linha em MEMORY.md no topo do bloco releases.
- [ ] Step 7: Commit `docs(release): v0.20.0 — Suite Agente Nex Polish — T3a`.

---

### T4a · Verify + Deploy

**Files:** —

- [ ] Step 1: `npm run typecheck` → 0 erros.
- [ ] Step 2: `npx jest --silent` → todos PASS.
- [ ] Step 3: `npm run build` → success.
- [ ] Step 4: `git fetch origin main && git status` (clean) + `git push origin main`.
- [ ] Step 5: `gh run list --limit 1` → pega ID + `gh run watch <id>` → success.
- [ ] Step 6: `gh workflow run portainer-fix.yml -f app_version=v0.20.0` → watch → success.
- [ ] Step 7: poll `/api/health` até retornar `version=v0.20.0` `status=ok`.
- [ ] Step 8: Append entry em `docs/agents/HISTORY.md` com release v0.20.0 LIVE.
- [ ] Step 9: Deletar `docs/agents/active/claude-nex-suite-polish-v020.md`.
- [ ] Step 10: Commit + push `docs(agents): registra v0.20.0 LIVE + encerra sessão`.

---

## Self-review

- **Cobertura spec:** A1-A4 / B1-B8 / C1-C3 / 3.E / 3.F / 3.G todos cobertos. ✅
- **Placeholder scan:** sem TBD. Todas as tasks têm steps concretos com código. ✅
- **Type consistency:** `TranscribeResult.modelUsed` consistente entre transcribe.ts e route.ts. `providersByModel: Record<string,string>` consistente entre bar-chart e consumo-content. `globalProvider: string|undefined` consistente. ✅

## Histórico

- **v1**: 19 tasks · 8 achados.
- **v2**: 19 tasks reordenadas · 10 achados.
- **v3**: consolidado, **pronto para execução**.
