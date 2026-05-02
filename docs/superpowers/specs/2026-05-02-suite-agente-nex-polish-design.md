# Spec — Suite Agente Nex · Polish (v0.20.0) — v3 final

**Versão:** v3 (44 achados de pente-fino aplicados).
**Predecessores:** `…-v1.md`, `…-v2.md`.
**Release-alvo:** v0.20.0.
**Status:** pronta para plan + execução.

## 1. Contexto

Após v0.16.0 LIVE, super_admin reportou (com prints) feedback dirigido a 3 áreas: Consumo, Prompt, Chaves. O Agente ficou prolixo (cita `Dashboard summary`, `query_messages`), botões duplicados nas chaves, layout quebra com "Idioma" pra fora do `<pre>`, KB com link da Chatwoot API extraiu só 5.877 chars (página SPA — limitação do crawler atual). Esta release polish entrega correções dirigidas por feedback real.

## 2. Escopo

| § | Bloco | Resumo |
|---|-------|--------|
| 3.A | Consumo | A1 migrar áudio para `gpt-4o-mini-transcribe` (50% mais barato, retorna usage) · A2 linha total destaque visual · A3 Y-axis "menor que zero" mode · A4 donut +10% raio / -10% fonte central |
| 3.B | Prompt | B1 banner read-only + botão "Editar" · B2 IDENTITY_BASE enxuta (~14 linhas) anti-prolixidade · B3 deletar atalho "API Chatwoot" · B4 Personality/Tom default seedados · B5 renomear+explicar "Mostrar identidade fixa" · B6 fix layout overflow `<pre>` · B7 Maximizar = Dialog centralizado (não Sheet) · B8 runbook KB URL |
| 3.C | Chaves | C1 botão sem gradient · C2 condicional 0/≥1 chaves · C3 logos SVG dos 4 providers |
| 3.D | Doc/release | Bump 0.18.0 → 0.20.0 (pula 0.19 ocupado) · CHANGELOG · STATUS · runbook · memory |

## 3. Requisitos

### 3.A — Consumo

**A1. Migrar áudio para `gpt-4o-mini-transcribe`**

`src/lib/nex/transcribe.ts`:
- Trocar `model=whisper-1` → `model=gpt-4o-mini-transcribe`. `response_format=json`.
- Parse novo:
  ```ts
  interface TranscribeUsage {
    type?: "tokens";
    input_tokens?: number;
    input_token_details?: { text_tokens?: number; audio_tokens?: number };
    output_tokens?: number;
    total_tokens?: number;
  }
  interface GptTranscribeJsonResponse {
    text?: string;
    usage?: TranscribeUsage;
  }
  ```
- Retorno:
  ```ts
  interface TranscribeResult {
    text: string;
    durationSeconds: number;       // (Date.now() - start)/1000 server-side
    inputTokens: number;            // input_token_details.audio_tokens + .text_tokens (fallback usage.input_tokens)
    outputTokens: number;           // usage.output_tokens (pode vir 0 — bug conhecido, OK)
    modelUsed: "gpt-4o-mini-transcribe" | "whisper-1";
  }
  ```
- Fallback: try `gpt-4o-mini-transcribe` → catch → log warn → retry 1× com `whisper-1` (response_format=verbose_json, modo legado). Se whisper falha tb → propaga erro original. `modelUsed` reflete qual foi usado.
- `whisper-1` retorno: `inputTokens=0, outputTokens=0` (mantém comportamento atual; tokens não disponíveis).

`src/app/api/nex/transcribe/route.ts`:
- Passa `r.inputTokens`, `r.outputTokens`, `r.modelUsed` para `logUsage`.
- `calculateCost(r.modelUsed, r.inputTokens, r.outputTokens, { durationMs: r.durationSeconds * 1000 })`.

`src/lib/llm/pricing.ts`:
- Adiciona:
  ```ts
  "gpt-4o-mini-transcribe": {
    inputPerMillion: 3.0,    // input audio tokens (média; texto $1.25 mas dominante é audio)
    outputPerMillion: 5.0,
  },
  ```
- `whisper-1` permanece (cobrança por minuto + tokens 0).

`src/lib/llm/__tests__/pricing.test.ts`:
- Caso novo: `calculateCost('gpt-4o-mini-transcribe', 1000000, 100000, {})` → `1.0 * 3.0 + 0.1 * 5.0 = 3.5` USD.

`src/components/llm/usage-detail-sheet.tsx`:
- Nota condicional:
  - `model === "whisper-1"` → "Whisper é cobrado por minuto. Tokens não se aplicam a chamadas de áudio (legado)."
  - `model === "gpt-4o-mini-transcribe"` → sem nota (tokens reais).

Documentar em CHANGELOG: economia ~50% por minuto + tokens reais no dashboard.

**A2. Linha total destaque**

Tabela "Histórico de chamadas" (em `consumo-content.tsx`):
- Linha total (sticky no topo) ganha:
  - `bg-violet-500/15 dark:bg-violet-500/10`
  - `border-y-2 border-violet-500/40 dark:border-violet-500/30`
  - `text-violet-700 dark:text-violet-300`
  - `font-bold tracking-wide`
- Estrutura (8 colunas): `<td colSpan={3} class="...">⊕ Total no filtro</td>` (Sigma icon + label uppercase) + 5 cells com `totals.tokensInput`, `totals.tokensOutput`, `formatDuration(totals.durationMsTotal)`, `formatUsd(totals.costUsd)`, `formatBrl(totals.costBrl)`.
- Validar via ui-ux-pro-max (tons + espaçamento + responsivo).

**A3. Y-axis "menor que zero" mode**

`src/components/charts/area-chart.tsx` e `bar-chart.tsx`:

```tsx
// dentro do componente, ANTES do return:
const maxValue = Math.max(
  0,
  ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)),
);
const isSubCent =
  yAxisCurrency !== undefined && maxValue > 0 && maxValue < 0.01;

// no <YAxis>:
<YAxis
  domain={isSubCent ? [0, 0.01] : undefined}
  ticks={isSubCent ? [0, 0.01] : undefined}
  tickFormatter={
    isSubCent
      ? (v) => {
          if (v === 0) return yAxisCurrency === "BRL" ? "R$ 0,00" : "$0.00";
          return yAxisCurrency === "BRL" ? "< R$ 0,01" : "< $0.01";
        }
      : yTickFormatter
  }
  fontSize={13}
  // ...
/>
```

Tooltip mantém `formatBrl4`/`formatUsd4` com valor real (preserva precisão).

**A4. Donut tamanho/fonte**

`src/components/charts/donut-with-center.tsx`:
- `outerRadius`: 80 → **88** (~10% maior).
- Centro do donut: `text-2xl` → **`text-xl`** + `font-semibold` mantido.

Validar via ui-ux-pro-max no viewport 375 / 768 / 1280 px.

### 3.B — Prompt

**B1. Banner read-only + botão "Editar"**

`src/components/agente-nex/prompt-preview-card.tsx`:
- Banner antes da ScrollArea:
  ```tsx
  <p className="text-xs italic text-muted-foreground">
    Preview somente leitura. Para editar, use os campos abaixo (Personalidade · Tom · Guardrails · Modo manual).
  </p>
  ```
- Botão novo no header (ao lado de Copiar/Maximizar):
  ```tsx
  <Button
    variant="ghost"
    size="sm"
    onClick={handleEditScroll}
    className="cursor-pointer"
    aria-label="Ir para os campos de edição"
  >
    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
  </Button>
  ```
- Handler: `document.getElementById("prompt-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" })`.
- `<pre>` ganha `cursor-text` + `aria-readonly="true"`.

`src/app/(protected)/agente-nex/prompt/page.tsx`:
- Wrappa Card "Comportamento" em `<div id="prompt-edit-form" className="scroll-mt-4 space-y-6">`.

**B2. IDENTITY_BASE radicalmente enxuta**

`src/lib/nex/prompt-compose.ts → IDENTITY_BASE`. Texto novo (~14 linhas, mantendo lista de proibição completa):

```
Você é o Agente Nex — assistente da plataforma Nexus Insights, que reúne relatórios e analytics do atendimento (Nexus Chat / Chatwoot).

## Postura
- Respostas curtas e diretas.
- Sem se apresentar a cada turno (apresente-se só no primeiro contato da sessão).
- Sem citar nomes técnicos internos (tools, queries, campos, "dashboard summary", "snapshot", etc.). Fale como um analista, não como um console.
- Pergunta objetiva → resposta objetiva. Sem rodeios.

## Identidade
- Você é o Agente Nex. Não mencione modelos comerciais ("ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google") como sua identidade.
- Quando perguntarem sobre seus parâmetros técnicos: "Sou um assistente configurado pela Nexus Insights. Os parâmetros são gerenciados pela equipe da plataforma."

## Operação
- Idioma: pt-BR. Fuso: America/Sao_Paulo. Datas: dd/mm/aaaa. Números: pt-BR (1.234,56).
- Não invente dados. Quando precisar de número, use as ferramentas disponíveis.
- Tópicos fora do escopo (clima, política, programação, etc.): "Esse tópico está fora do escopo do Agente Nex."
- Para deep-links de conversa: use o mapeamento de URL pública configurado (se disponível); senão, avise o usuário em vez de inventar.
```

Atualizar `src/lib/nex/__tests__/prompt.test.ts` (e/ou `prompt-compose.test.ts`):
- Asserções tipo "contém X" (`toContain`) preservadas: "Nexus Insights", "ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google".
- Nova asserção opcional: `IDENTITY_BASE.length < 1500` (anti-regressão prolixa).

**B3. Remover atalho "Adicionar API Chatwoot (sugerida)"**

`src/components/agente-nex/kb-section.tsx`:
- Deletar:
  - Constantes `CHATWOOT_SUGGESTED_NAME`, `CHATWOOT_SUGGESTED_URL`.
  - Função `openAddChatwootSuggestion`.
  - Botão `<Sparkles> Adicionar API Chatwoot (sugerida)` (linhas ~352-361).
- Simplificar state `UploadDialogState` para apenas `{ open: boolean }` (sem tab/url pré-preenchidos).
- `<KbUploadDialog>` chamada simplificada (sem `initialTab`/`initialUrlName`/`initialUrlValue`).

`src/components/agente-nex/kb-upload-dialog.tsx`:
- Manter props `initialTab`/`initialUrlName`/`initialUrlValue` como opcionais (back-compat) mas valores default são undefined/"file" (já estão).

**B4. Personality/Tom defaults seedados (idempotente)**

`src/lib/nex/ensure-tables.ts`:
- Após backfill de guardrails default (já existe), adicionar UPDATE condicional:
  ```sql
  UPDATE "nex_settings"
  SET "personality" = 'Direto, prático, prefere bullets curtos quando há listas. Evita rodeios e textão. Não se apresenta a cada turno.',
      "tone" = 'Profissional e objetivo, em pt-BR. Usa "você". Sem se desculpar; sem repetir o nome do agente.'
  WHERE "id" = 'global'
    AND "seeded_defaults_at" IS NOT NULL
    AND "personality" = '' AND "tone" = '';
  ```
- Lógica: aplica APENAS se já houve seed de guardrails (flag) E ambos campos estão vazios. Não sobrescreve customizações do super_admin.

**B5. Renomear "Mostrar identidade fixa" + explicação**

`src/components/agente-nex/prompt-preview-card.tsx`:
- Botão: label muda para "Ver identidade fixa do agente (somente leitura)".
- Quando aberto, ANTES do `<pre>` IDENTITY_BASE, adicionar:
  ```tsx
  <p className="text-xs text-muted-foreground">
    Texto-base imutável que blinda a identidade do Agente Nex. Personalidade e Tom (campos abaixo) são camadas adicionais que VOCÊ controla.
  </p>
  ```

**B6. Fix layout overflow `<pre>`**

`src/components/agente-nex/prompt-preview-card.tsx`:
- ScrollArea: `className="max-h-[400px] w-full overflow-x-hidden"`.
- `<pre>` interno: classe atual + `min-w-0` (importante pra flex children honrarem `max-w` do pai) + manter `whitespace-pre-wrap break-words`.
- Plan inclui task de repro visual (rodar dev server + viewport 375 e 1280px, verificar se "Idioma" stays inside).

**B7. Maximizar = Dialog centralizado**

Substituir Sheet por Dialog em `prompt-preview-card.tsx`:
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
      <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground min-w-0">
        {prompt}
      </pre>
    </ScrollArea>
  </DialogContent>
</Dialog>
```

`handleEditFromMaximized`:
```ts
function handleEditFromMaximized() {
  setMaximized(false);
  setTimeout(() => {
    document.getElementById("prompt-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}
```

**B8. KB URL — runbook investigação**

Criar `docs/runbooks/agente-nex-audio-e-kb-url.md` cobrindo:
- A1: como funciona transcribe (modelo gpt-4o-mini-transcribe + fallback whisper).
- B8: como funciona KB URL (assertPublicUrl SSRF guard + fetchKbUrl 10s/5MB/node-html-parser → `<main>`/`<article>` → trunca 100k). Para `developers.chatwoot.com` extrair só 5.877 chars é esperado: SPA com routes nested, crawler extrai DOM inicial. Para conteúdo profundo de API: TXT manual ou aguardar v0.21+ com sitemap crawl.

### 3.C — Chaves

**C1. Botão "Nova chave" sem gradient**

`src/components/settings/llm-credentials-manager.tsx`:
- 2 ocorrências do botão "Nova chave" (header + empty state). Em ambos:
  - Remover `className="bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-sm hover:from-violet-700 hover:to-violet-600 dark:from-violet-500 dark:to-violet-400"`.
  - Manter `<Button size="sm" variant="default">` puro (estilo padrão do design system).

**C2. Lógica condicional botão duplicado**

```tsx
<header className="flex items-center justify-between gap-3">
  {/* Esquerda: ícone + label */}
  <div className="flex min-w-0 items-center gap-3">
    <ProviderIcon provider={p} />
    <h3 className="...">{catalog.label}</h3>
  </div>
  {/* Direita: link externo + botão (condicional) */}
  <div className="flex shrink-0 items-center gap-2">
    <a href={...}>Criar API key</a>
    {list.length > 0 ? (
      <Button size="sm" variant="default" onClick={...}>
        <Plus className="mr-1 h-4 w-4" /> Nova chave
      </Button>
    ) : null}
  </div>
</header>
{list.length === 0 ? <EmptyState /> : <ListaCredenciais />}
```

Empty state mantém os 2 CTAs (link + botão Nova chave centralizados).

**C3. Logos SVG dos 4 providers**

Criar:
- `src/components/icons/providers/openai-icon.tsx` (Lobe Icons mono).
- `src/components/icons/providers/anthropic-icon.tsx` (simple-icons).
- `src/components/icons/providers/gemini-icon.tsx` (simple-icons "googlegemini").
- `src/components/icons/providers/openrouter-icon.tsx` (simple-icons).
- `src/components/icons/providers/index.ts` exporta `getProviderIcon(provider: LlmProvider)` retornando o componente.

Cada componente: SVG inline com `fill="currentColor"`, viewBox preservado, props passadas via spread (`...props`):

```tsx
export function OpenAIIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="..." />
    </svg>
  );
}
```

Em `llm-credentials-manager.tsx`:
- Substituir `<span aria-hidden ...>{initial}</span>` por `<ProviderIcon provider={p} className="h-5 w-5" aria-hidden="true" />` dentro do mesmo container `bg-violet-600/10 text-violet-500 dark:text-violet-400`.

### 3.D — Doc / release

- `package.json` 0.18.0 → 0.20.0 (verificar via `git log origin/main` antes; se outro agente já bumpou, ajustar).
- CHANGELOG.md entrada nova com 3 sections (A/B/C) + bullets descritivos.
- STATUS.md atualizado.
- Runbook `docs/runbooks/agente-nex-audio-e-kb-url.md`.
- Memory `~/.claude/projects/.../memory/project_v0.20_polish.md` + atualizar MEMORY.md (linha após v0.16).

## 4. Arquitetura técnica

### 4.1 Componentes/módulos novos
- `src/components/icons/providers/{openai,anthropic,gemini,openrouter}-icon.tsx` + `index.ts`.

### 4.2 Modificados
- `src/lib/nex/transcribe.ts` (A1 — modelo + fallback + tokens).
- `src/app/api/nex/transcribe/route.ts` (A1 — passa tokens).
- `src/lib/llm/pricing.ts` (A1 — entry gpt-4o-mini-transcribe).
- `src/lib/llm/__tests__/pricing.test.ts` (A1 — case novo).
- `src/components/llm/consumo-content.tsx` (A2 — linha total destaque).
- `src/components/llm/usage-detail-sheet.tsx` (A1 — nota condicional).
- `src/components/charts/area-chart.tsx`, `bar-chart.tsx` (A3 — modo sub-cent).
- `src/components/charts/donut-with-center.tsx` (A4 — radius/font).
- `src/components/agente-nex/prompt-preview-card.tsx` (B1 + B5 + B6 + B7).
- `src/lib/nex/prompt-compose.ts` (B2 — IDENTITY_BASE).
- `src/lib/nex/__tests__/prompt.test.ts` (B2 — asserções).
- `src/components/agente-nex/kb-section.tsx` (B3 — remover atalho).
- `src/lib/nex/ensure-tables.ts` (B4 — seed Personality/Tom).
- `src/app/(protected)/agente-nex/prompt/page.tsx` (B1 — id wrapper).
- `src/components/settings/llm-credentials-manager.tsx` (C1 + C2 + C3).

### 4.3 Schema Prisma
Sem mudanças — apenas seed adicional em `ensure-tables.ts` runtime.

### 4.4 Catálogo
`gpt-4o-mini-transcribe` NÃO entra no `catalog.ts` (não é modelo de chat — uso interno apenas).

## 5. Riscos e mitigations

| Risco | Mitigation |
|-------|------------|
| `gpt-4o-mini-transcribe` retorna `output_tokens=0` (bug confirmado) | Spec aceita; primário é `input_token_details.audio_tokens` |
| Fallback whisper-1 inflar logs com 2 chamadas | Try-catch com 1 retry; log warn no fallback |
| Reduzir IDENTITY_BASE quebra blindagem | Lista de proibição preservada; testes via `toContain` |
| SVG OpenAI Lobe Icons restrição | Lobe MIT/CC0; uso interno OK |
| Bumps colidirem com outros agentes | git fetch antes; v0.20 pula 0.19 |
| Linha total visual carrega demais | ui-ux-pro-max valida tons |
| Y-axis "< R$ 0,01" confundir | Tooltip preserva valor real |
| Bug "Idioma" não reproduzir local | Plan tem task de repro explícita |
| Migration de Personality/Tom afetar usuários antigos | Condição `seeded_defaults_at IS NOT NULL AND personality='' AND tone=''` evita overwrite |

## 6. Out of scope
- Editar IDENTITY_BASE pela UI (continua imutável).
- Crawl de KB URL com sitemap.
- Multi-tenant.
- Migrar para `gpt-4o-transcribe` (full, não mini): caro demais sem ganho proporcional.

## 7. Critérios de aceite

- [ ] Whisper bubble usa `gpt-4o-mini-transcribe` por default; fallback whisper-1 silencioso em erro.
- [ ] Tokens reais aparecem no Consumo para chamadas com `gpt-4o-mini-transcribe`.
- [ ] `whisper-1` (legado) ainda mostra "—" + nota.
- [ ] Linha total visualmente destacada (violet bg + bold + Sigma icon).
- [ ] Gráficos com max < R$ 0,01: 2 ticks ("R$ 0,00" e "< R$ 0,01"); tooltip preserva valor real.
- [ ] Donut outerRadius=88 + fonte central text-xl.
- [ ] Card preview com banner read-only italic + botão Editar funcional.
- [ ] Agente Nex responde curto (smoke real: "Quantas conversas hoje?" → resposta sem se apresentar).
- [ ] Botão "Adicionar API Chatwoot (sugerida)" deletado.
- [ ] Personality e Tom default seedados.
- [ ] Bug "Idioma" fora do `<pre>` corrigido (smoke visual em viewport 375 + 1280).
- [ ] Maximizar abre Dialog centralizado (não Sheet).
- [ ] Botão "Nova chave" sem gradient.
- [ ] 0 chaves: botão só dentro do empty state.
- [ ] Logos SVG renderizam para os 4 providers (currentColor).
- [ ] /api/health version=v0.20.0 status=ok.
- [ ] Suite de testes: ≥ 110 suites, ≥ 1100 tests PASS; typecheck 0 erros.

## 8. Workflow do plan

Após aprovação:
1. Plan v1 → v2 → v3 (double-check).
2. ~25 tasks granulares TDD agrupadas por bloco.
3. Subagent-driven-development (1 subagent fresh por task com `ui-ux-pro-max:ui-ux-pro-max` em UI).
4. Verification → CHANGELOG/STATUS/runbook → push → gh run watch → portainer-fix → /api/health.

## 9. Histórico de revisões

- **v1**: rascunho. 20 achados pente-fino #1.
- **v2**: incorpora 20 achados v1 + pesquisa Whisper/SVG. 24 achados pente-fino #2.
- **v3**: consolida 44 achados. **Pronta para plan.**

---

## Apêndice — Adendo (segunda rodada de feedback)

3 itens adicionais reportados via screenshots após v3 inicial. Incorporados aqui como adendo aprovado:

### 3.E — Bar Chart "Custo por modelo": tag de provider abaixo do modelo

**Problema:** hoje o eixo X mostra apenas o ID do modelo (ex.: `gpt-5.4-nano`). Usuário quer indicação visual do provider abaixo do modelo, em formato "tag" sutil sem cor (estilo `<Badge variant="outline">`).

**Solução:** custom tick em `<XAxis tick={CustomXAxisTick}>` em `<InteractiveBarChart>`, renderizando 2 linhas:
- Linha 1: nome do modelo (truncate em 24 chars).
- Linha 2: `(Provider)` em fonte menor (text-[10px]) + cor `text-muted-foreground`.

Implementação:

```tsx
function CustomXAxisTick({ x, y, payload, ...props }: any) {
  // payload.value === modelId
  // recebemos providersByModel via Recharts custom prop OU via dataset
  const provider = providersByModel?.[payload.value] ?? "";
  const label = formatModelLabel(payload.value, 24); // truncate
  const providerLabel = provider ? `(${PROVIDER_LABELS[provider]})` : "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fontSize={13} fill="currentColor">
        {label}
      </text>
      {providerLabel ? (
        <text x={0} y={0} dy={32} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
          {providerLabel}
        </text>
      ) : null}
    </g>
  );
}
```

Bar chart precisa receber novo prop `providersByModel?: Record<string, string>` (modelId → provider) — passar em `consumo-content.tsx` a partir de `summary.byModel`.

Ajustar `<XAxis height>` de default Recharts (~30) para 50 (cabe 2 linhas + padding) e `<BarChart margin={{ bottom: 20 }}>` para evitar overflow do label.

Validar visual via ui-ux-pro-max em viewport 375 / 1280 px.

### 3.F — Filtro global de Provider (KPI + gráficos + tabela)

**Problema:** hoje filtros existem só na tabela "Histórico de chamadas". Usuário quer filtro global de provider que afete:
- 4 KPI cards (Total chamadas, Tokens entrada, Tokens saída, Custo total).
- 3 gráficos (Custo por dia, Custo por modelo, Distribuição por provider).
- Filtro inicial da tabela (mas usuário pode mudar manualmente).

**Solução:**
- Adicionar `<CustomSelect>` (não SearchableSelect — menor) ao lado direito do PeriodPills com label "Provider":
  - "Todos os providers" (default).
  - Lista de providers com chamadas no período (lazy via `fetchDistinctProvidersInRange`).
- State `globalProvider: string | undefined` em `consumo-content.tsx`.
- Persistido em URL (`?provider=openai`).
- Passa para:
  - `fetchUsageStats({ ..., provider: globalProvider })` — backend `getUsageStats` aceita filter.
  - `<UsageTableFilters>` recebe `globalProvider` como `defaultProvider`. Quando muda global, sincroniza tabela. Mas tabela ainda permite mudar manualmente (cascade respeitado, sem travar).
- Backend (`src/lib/llm/queries/usage-stats.ts → getUsageStats`): aceita novo filtro `provider?: string` aplicado em todas as 4 queries (summary, byDay, byModel, byProvider). Quando filtro definido, `byProvider` retorna só esse provider (e Donut mostra 100% no único provedor).

### 3.G — PageSize dropdown no padrão da plataforma

**Problema:** dropdown "{n} por página" usa `<select>` HTML nativo (visual Chrome).

**Solução:** trocar por `<CustomSelect>` (já em uso na plataforma — `src/components/ui/custom-select.tsx`):
```tsx
<CustomSelect
  value={String(pageSize)}
  onChange={(v) => setPageSize(Number(v))}
  options={[
    { value: "25", label: "25 por página" },
    { value: "50", label: "50 por página" },
    { value: "100", label: "100 por página" },
  ]}
  triggerClassName="w-[140px] min-h-[34px] text-xs"
/>
```

Validar consistência visual via ui-ux-pro-max.

### Atualizações nos arquivos

Adicionar à seção 4.2 (Modificados):
- `src/lib/llm/queries/usage-stats.ts` (3.F — filtro global em getUsageStats).
- `src/lib/actions/llm-usage.ts` (3.F — passar provider em fetchUsageStats).
- `src/components/charts/bar-chart.tsx` (3.E — CustomXAxisTick + providersByModel prop).
- `src/components/llm/consumo-content.tsx` (3.E + 3.F + 3.G).

### Atualizações nos critérios de aceite

- [ ] Bar Chart "Custo por modelo": cada modelo mostra `(Provider)` abaixo, fonte menor, sem cor.
- [ ] Filtro global de Provider no topo + sincroniza tabela.
- [ ] Mudar global filtra KPIs + 3 gráficos + tabela (mas tabela continua editável manualmente).
- [ ] Dropdown "{n} por página" usa CustomSelect (visual consistente).

### Pente-fino do adendo

1. **3.E performance:** custom tick render por bar pode ser pesado se >12 modelos. Já temos truncate em 12 (T6d v0.16). ✅
2. **3.F sync com tabela:** quando user muda global, tabela atualiza para esse provider. Mas se user já mudou tabela manualmente, override? Solução: globalProvider serve apenas como `defaultProvider` ao montar `<UsageTableFilters>`. Mudança no global atualiza tabela via `useEffect`. User pode então alterar de novo. v3 esclarece.
3. **3.G CustomSelect existe?** Sim, em `src/components/ui/custom-select.tsx` (já usado em llm-config-form). ✅
4. **3.E PROVIDER_LABELS:** importar de `src/lib/llm/pricing.ts`. ✅
5. **3.F backend `getUsageStats` mudança quebra callers?** Há outros callers? Provavelmente só `fetchUsageStats`. Plan task: grep usage. ✅

Total cumulativo: 49 achados (44 + 5 do adendo). Spec final pronta.

---

**Fim da spec v3 final.**
