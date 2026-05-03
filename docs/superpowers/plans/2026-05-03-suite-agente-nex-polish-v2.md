# Plan — Suite Agente Nex · Polish (v0.24.0)

> **For agentic workers:** REQUIRED SUB-SKILL — `superpowers:subagent-driven-development`. Cada task de UI invoca obrigatoriamente `Skill ui-ux-pro-max:ui-ux-pro-max` ANTES de codar (regra absoluta CLAUDE.md).

**Spec:** `docs/superpowers/specs/2026-05-03-suite-agente-nex-polish-v2-design.md` (v3, 25 achados de pente-fino).

**Goal:** polish dirigido por feedback super_admin pós v0.20.0 — remover empty state, donut espessura+gap+tooltip near-mouse, bar Badge SVG sem cor, linha total sutil + setinha hover + cotação explicada + Whisper refinada, input bar layout estável, AudioPlayer speed margem.

**Tech Stack:** TypeScript + React + Recharts + base-ui Dialog + Tooltip da plataforma.

---

## Tasks

### T1 — Remover EmptyConsumoState (3.A)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`
- Modify: `src/components/llm/__tests__/consumo-content.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` para validar dashboard zerado é compreensível.

- [ ] Step 1: Test first — `<ConsumoContent>` com mock `fetchUsageStats` retornando totalCalls=0 → renderiza KPIs zerados, NÃO renderiza texto "Nenhuma chamada ao Agente Nex registrada ainda" nem botão "Ir para Configurações".
- [ ] Step 2: Run jest → FAIL (atual renderiza EmptyConsumoState).
- [ ] Step 3: Implementar:
  - Linha ~362: deletar `const showEmpty = !!stats && stats.totalCalls === 0 && page === 0 && !isPending;`
  - Linha ~413: deletar `if (showEmpty) return <EmptyConsumoState />;`
  - Linhas ~846-871: deletar `function EmptyConsumoState() { ... }`.
  - Limpar imports não usados (verificar via tsc):
    - `import Link from "next/link"` (provavelmente só usado pelo empty)
    - `Sparkles` de lucide (verificar)
    - `buttonVariants` (verificar).
- [ ] Step 4: typecheck → 0 erros nos imports limpos. jest → PASS.
- [ ] Step 5: Commit:
```
feat(consumo): remove EmptyConsumoState — sempre renderiza dashboard zerado — T1 v0.24.0

Quando totalCalls=0, mostra KPIs com "0", gráficos com EmptyChartState
existente e tabela com "Nenhuma chamada no período." — não esconde mais
o dashboard inteiro com tela "Ir para Configurações".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T2 — Donut espessura + gap + tooltip near-mouse (3.B)

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`
- Modify: `src/components/charts/__tests__/donut-with-center.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` validar:
> - Espessura visualmente similar a antes da v0.20.
> - Textos centrais com respiro (não encostados).
> - Tooltip near-mouse, nunca cobrindo gráfico.

- [ ] Step 1: Test first:
  - `outerRadius` default = 80 (era 88).
  - `innerRadius` default = 60 (era 70).
  - Centro do donut tem padding interno (px-6 ou similar).
  - Tooltip não é mais position fixed — segue mouse default Recharts.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar:
  - Linha 147: `innerRadius = 70` → `innerRadius = 60`.
  - Linha 148: `outerRadius = 88` → `outerRadius = 80`.
  - No `<Tooltip>` (linhas 198-210):
    - REMOVER `position={{ x: 0, y: 0 }}`.
    - REMOVER `wrapperStyle={donutTooltipWrapperStyle(tooltipPosition)}`.
    - Adicionar `offset={12}`.
    - Manter `cursor={false}` + `allowEscapeViewBox={{x:true,y:true}}` + `content`.
  - No `<div data-slot="donut-center">` (linhas 254-264): adicionar `px-6` no className para respiro horizontal.
  - Marcar `tooltipPosition` como `@deprecated` no JSDoc + manter prop pra back-compat (no-op).
- [ ] Step 4: jest → PASS. typecheck → 0 erros.
- [ ] Step 5: Commit:
```
feat(donut): voltar espessura padrão (innerRadius 60 + outerRadius 80) + textos centrais com px-6 + tooltip near-mouse — T2 v0.24.0

Reverte v0.20 changes (outerRadius 80→88) que deixaram o anel fino + textos
centrais sem respiro. Tooltip agora segue o mouse (default Recharts) com
offset 12 — não fica mais fixo no canto top-right longe do cursor.
allowEscapeViewBox preserva tooltip dentro da tela.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T3 — Bar tag estilo Badge sem cor (3.C)

**Files:**
- Modify: `src/components/charts/bar-chart.tsx`
- Modify: `src/components/charts/__tests__/bar-chart.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` validar Badge SVG inline (uppercase + border sutil + sem cor).

- [ ] Step 1: Test first:
  - Quando `providersByModel={"gpt-5.4-nano":"openai"}`, custom tick renderiza `<rect>` (border do badge) E `<text>` com label "OPENAI" uppercase (não "(OpenAI)" parênteses).
  - Tick height = 50 (já existente, mantém pra acomodar 2 linhas).
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar — substituir o segundo `<text>` (que renderizava `(Provider)`) por bloco SVG Badge:
```tsx
function makeCustomBarTick(providersByModel?: Record<string, string>) {
  return function CustomBarTick(tickProps: any) {
    const { x, y, payload } = tickProps;
    const value = String(payload?.value ?? "");
    const truncated = value.length > 24 ? `${value.slice(0, 21)}…` : value;
    const provider = providersByModel?.[value];
    const providerLabel = provider ? (PROVIDER_LABELS[provider] ?? provider) : "";
    const badgeText = providerLabel.toUpperCase();
    // Heurística: cada char ≈ 5.5px em uppercase + 12px padding total.
    const badgeWidth = badgeText.length * 5.5 + 12;
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fontSize={13} fill="currentColor">
          {truncated}
        </text>
        {badgeText ? (
          <g transform="translate(0, 26)">
            <rect
              x={-badgeWidth / 2}
              y={0}
              width={badgeWidth}
              height={14}
              rx={3}
              fill="transparent"
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            <text
              x={0}
              y={10}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              opacity={0.6}
              letterSpacing={0.5}
            >
              {badgeText}
            </text>
          </g>
        ) : null}
      </g>
    );
  };
}
```
- [ ] Step 4: jest → PASS. typecheck → 0 erros.
- [ ] Step 5: Commit:
```
feat(bar-chart): substitui "(Provider)" entre parênteses por Badge SVG sem cor — T3 v0.24.0

Custom tick agora renderiza nome do modelo + tag estilo Badge abaixo (rect
border sutil + text uppercase + opacity 0.6). Largura do Badge calculada
dinamicamente (label.length * 5.5 + 12). Sem cor de background — alinhado
com pedido do super_admin de visual mais polido.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T4 — Linha total sutil + setinha hover (3.D parte 1)

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`
- Modify: `src/components/llm/__tests__/consumo-content.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first:
  - Linha total tem class `bg-muted/30` E `border-b border-border/40` (NÃO mais `bg-violet-500/15`).
  - Linha total NÃO contém ícone Sigma (queryByTestId("sigma-icon") null).
  - Label da linha total é "Total no filtro" (sem `(N)`).
  - Linhas clicáveis (não a total) têm class `group` E primeira cell tem `<ChevronRight>` com `opacity-0 group-hover:opacity-60`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar em `consumo-content.tsx`:
  - Substituir linha 680 (TableRow da total):
    ```tsx
    <TableRow className="sticky top-0 z-[1] bg-muted/30 border-b border-border/40 text-foreground font-semibold text-xs uppercase tracking-wide">
      <TableCell colSpan={3} className="whitespace-nowrap">
        <span>Total no filtro</span>
      </TableCell>
      ...
    </TableRow>
    ```
  - Remover import `Sigma` de lucide (ou manter se usado em outro lugar — verificar via grep).
  - Linha 720 (TableRow das linhas clicáveis): adicionar `group` no className E `relative` na primeira TableCell. Adicionar `<ChevronRight>` no início:
    ```tsx
    <TableCell className="relative whitespace-nowrap tabular-nums pl-7">
      <ChevronRight
        className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60"
        aria-hidden
      />
      {dateTimeFmt.format(new Date(row.createdAt))}
    </TableCell>
    ```
- [ ] Step 4: jest → PASS. typecheck → 0 erros.
- [ ] Step 5: Commit:
```
feat(consumo): linha total mais sutil + setinha hover indica clicável — T4 v0.24.0

Linha total: bg-muted/30 + border-b sutil + text-xs uppercase
font-semibold (era violet/15 + border-y-2 violet + bold + Sigma + (N)).
Linhas clicáveis: <TableRow className="group"> + <ChevronRight class="opacity-0
group-hover:opacity-60"> absolute na first cell — indica visualmente que é clicável.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T5 — Cotação tooltip + Whisper nota refinada (3.D parte 2)

**Files:**
- Modify: `src/components/llm/usage-detail-sheet.tsx`
- Modify: `src/components/llm/__tests__/usage-detail-sheet.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first:
  - "Cotação USD→BRL aplicada" tem tooltip explicativo on hover (assert via aria-describedby OR title atributo).
  - row.model="whisper-1": nota inclui "(legado)" + menciona "gpt-4o-mini-transcribe" + cita runbook.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar:
  - Procurar componente Tooltip da plataforma. Se existir `src/components/ui/tooltip.tsx` (Radix-style), usar. Se não, usar `title` HTML nativo:
    ```tsx
    <span
      className="cursor-help underline-offset-2 underline decoration-dotted decoration-muted-foreground/40"
      title="Cotação USD/BRL gravada no momento da chamada via AwesomeAPI (cache 4h, fallback 5.50). Spread cartão atual aplicado."
    >
      Cotação USD→BRL aplicada
    </span>
    ```
  - Substituir nota Whisper atual por:
    ```tsx
    {row.model === "whisper-1" ? (
      <p className="text-xs text-muted-foreground italic">
        O modelo whisper-1 (legado) é cobrado por minuto de áudio, não por tokens.
        Versões a partir de v0.20+ usam gpt-4o-mini-transcribe que retorna tokens
        reais (input_token_details.audio_tokens). Veja runbook agente-nex-audio-e-kb-url.md.
      </p>
    ) : null}
    ```
- [ ] Step 4: jest → PASS. typecheck → 0 erros.
- [ ] Step 5: Commit:
```
feat(usage-detail): tooltip explicativo cotação + Whisper nota refinada (legado) — T5 v0.24.0

Cotação USD→BRL aplicada: ganha tooltip explicando AwesomeAPI cache 4h +
spread cartão. Whisper-1 nota: cita "(legado)" + redireciona para
gpt-4o-mini-transcribe (v0.20+) + aponta runbook agente-nex-audio-e-kb-url.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T6 — Bubble input bar layout estável (3.E)

**Files:**
- Modify: `src/components/nex/nex-chat-panel.tsx`
- Modify: `src/components/nex/__tests__/nex-chat-panel.test.tsx` (se existe)

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max`.

- [ ] Step 1: Test first:
  - Render com `isRecording=false`: hint "Enter envia · Shift+Enter quebra linha" visível.
  - Mudar para `isRecording=true`: hint NÃO visível (`invisible` class) MAS container preserva altura (não é null/removed).
  - `getByText` "Enter envia" sempre presente no DOM (mesmo invisible).
- [ ] Step 2: Run → FAIL (atual renderiza condicional `!isRecording ? null : ...` ou similar — remove do DOM).
- [ ] Step 3: Implementar — substituir bloco do hint:
  ```tsx
  // ANTES (linha ~734):
  {!isRecording ? (
    <p className="...">Enter envia · Shift+Enter quebra linha</p>
  ) : null}

  // DEPOIS:
  <p
    className={cn(
      "px-1 text-xs text-muted-foreground transition-opacity",
      isRecording ? "invisible" : "visible"
    )}
  >
    Enter envia · Shift+Enter quebra linha
  </p>
  ```
- [ ] Step 4: jest → PASS. typecheck → 0 erros.
- [ ] Step 5: Commit:
```
feat(nex-chat-panel): hint "Enter envia" usa invisible em vez de null — T6 v0.24.0

Quando inicia gravação, hint some VISUALMENTE mas elemento permanece no DOM
com `invisible` class — preserva altura e evita reflow do container (componente
não treme mais para baixo/cima na transição idle ↔ gravando).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T7 — AudioPlayer speed button respeita margem (3.F)

**Files:**
- Modify: `src/components/nex/audio-player.tsx`
- Modify: `src/components/nex/__tests__/audio-player.test.tsx`

> ANTES: `Skill ui-ux-pro-max:ui-ux-pro-max` validar largura uniforme e respeito de margem em viewport mobile (375px).

- [ ] Step 1: Test first:
  - Botão speed tem class `min-w-[44px]`.
  - Container player tem `pr-3` ou similar para garantir margem visual à direita.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implementar em `audio-player.tsx`:
  - Botão speed (linha 161-175): adicionar `min-w-[44px]` no className:
    ```tsx
    "flex h-6 min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-violet-500/30 bg-transparent px-1.5 font-mono text-[11px] font-medium tabular-nums text-violet-700 dark:text-violet-300",
    ```
  - Container player (linha 105-111): se `px-3` no atual (verificar), aumentar `pr-3` se necessário OR já está OK por causa do gap-2.
- [ ] Step 4: jest → PASS. typecheck → 0 erros.
- [ ] Step 5: Commit:
```
feat(audio-player): speed button min-w-[44px] respeita margem do container — T7 v0.24.0

Botão de velocidade tinha largura variável conforme label (1× → 1.75× cresce).
min-w-[44px] acomoda todos os labels sem stretch e mantém o botão dentro da
margem visual do container violet — não vaza mais pra fora.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### T8 — Doc + release v0.24.0

**Files:**
- Modify: `package.json` (bump 0.22 → 0.24)
- Modify: `CHANGELOG.md` (entry nova)
- Modify: `docs/STATUS.md`
- Memory: `~/.claude/projects/.../memory/project_v0.24_polish.md` + atualizar MEMORY.md

- [ ] Step 1: `git fetch origin main && git status` (clean).
- [ ] Step 2: Bump 0.22.0 → 0.24.0 (verificar se outro agente passou pra 0.25+; ajustar se sim).
- [ ] Step 3: CHANGELOG entry nova "## [v0.24.0] 2026-05-03 — Suite Agente Nex Polish v2" com 6 sections (A-F) + bullets.
- [ ] Step 4: STATUS.md atualizado.
- [ ] Step 5: Memory file novo + linha em MEMORY.md no topo do bloco releases.
- [ ] Step 6: Commit `docs(release): v0.24.0 — Suite Agente Nex Polish v2 — T8`.

---

### T9 — Verify + Deploy

- [ ] Step 1: `npm run typecheck` → 0 erros.
- [ ] Step 2: `npx jest --silent` → todos PASS (excluindo pré-existentes não relacionados).
- [ ] Step 3: `npm run build` → success.
- [ ] Step 4: `git fetch origin main && git status` (clean) + `git push origin main`.
- [ ] Step 5: `gh run list --limit 1` → pega ID + `gh run watch <id>` → success.
- [ ] Step 6: `gh workflow run portainer-fix.yml -f app_version=v0.24.0` → watch → success.
- [ ] Step 7: poll `/api/health` até `version=v0.24.0` `status=ok`.
- [ ] Step 8: HISTORY.md entry + deletar active file + commit + push.

---

## Self-review

- **Cobertura spec:** A/B/C/D/E/F/G todos cobertos por T1-T8. ✅
- **Placeholder scan:** sem TBD. Tasks T1-T7 têm steps concretos com código. ✅
- **Type consistency:** mantém prop names (innerRadius, outerRadius, providersByModel), classes consistentes (group/group-hover, opacity-X, invisible). ✅

## Histórico

- **v1**: 14 achados.
- **v2**: 11 achados.
- **v3**: consolidado, **pronto para execução**.
