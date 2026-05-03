# Suite Agente Nex Polish v5 (v0.31.0) — Plano v2 (deltas do pente fino #1)

> Este v2 lista APENAS os deltas/correções vs v1. Tudo que não está aqui permanece como descrito em `2026-05-03-agente-nex-polish-v031-v1.md`.

---

## Achados pente fino #1 (28 itens, classificados)

### Críticos / quebra de runtime ou test

| # | Achado | Fix v1 → v2 |
|---|--------|-------------|
| 1 | **T-D1 regex extractSuggestions é ambíguo** — `\n?\[\[suggestions\]\]:(.+?)(?:\n|$)` casa "blah [[suggestions]]:a|b mid more text" com captura "a|b mid more text". Não há ancoragem em início de linha. | Regex novo: `(?:^|\n)\[\[suggestions\]\]:([^\n]+?)(?:\n|$)` — exige início de string OU newline antes. Garante que `[[suggestions]]` está em sua própria linha. |
| 2 | **T-B1 setCardSpread no-op quebra tests existentes** — `src/lib/llm/__tests__/exchange-rate.test.ts` provavelmente tem `it("setCardSpread persiste valor no DB")`. Após no-op, esse test falha. | Atualizar test pra verificar no-op + console.warn (não persiste). Se houver outro test em `src/lib/actions/__tests__/exchange-rate.test.ts` (Server Action setCardSpreadAction), também atualiza. |
| 3 | **T-D1 logUsage SEMPRE chamado quebra T8 v0.16 expectativa** — test `run-nex.test.ts:174` "não chama logUsage quando isPlayground=true" precisa ser **substituído** (não apenas adicionar caso novo). Se mantido, falha. | Substituir pelo test "chama logUsage com is_playground=true quando args.isPlayground=true". Adicionar test "is_playground=false quando isPlayground omitido (default)". |
| 4 | **T-C2 mocks update — TS error transitório** se algum mock NexPromptConfig esquecer `terminology` ou `suggestionsEnabled`. | Step novo: rodar `npx tsc --noEmit \| grep "Property 'terminology' is missing"` após edit pra detectar mocks faltantes. Lista canônica de arquivos no plan: `src/lib/nex/__tests__/{prompt-compose,prompt}.test.ts`, `src/lib/actions/__tests__/nex-prompt.test.ts`, `src/lib/llm/agent/__tests__/run-nex.test.ts`, `src/components/agente-nex/__tests__/{playground-sheet,prompt-config-form,prompt-preview-card,identity-base-editor}.test.tsx`. |
| 5 | **T-D5 SuggestionsBar duplicação** — render lógica em nex-chat-panel E playground-sheet duplica. Drift risk. | Extrair `SuggestionsBar` pra arquivo novo `src/components/nex/suggestions-bar.tsx` (export default). Both consumers importam do mesmo arquivo. |

### Médios / cobertura

| # | Achado | Fix v1 → v2 |
|---|--------|-------------|
| 6 | **T-A2 ordem migrations em ensure-tables.ts (llm)** — ALTER TABLE add column é após CREATE TABLE existente. Confirmar ordem do plan. | Plan já está OK, mas adicionar verificação explícita: read da função `createTables` (em llm/ensure-tables.ts) antes do edit pra confirmar que CREATE TABLE llm_usage existe acima do ponto de inserção. |
| 7 | **T-B2 imports não-usados (Coins)** — após remover Spread cartão, `Coins` icon import vira dead. Outros imports podem similar. | Step adicional: `grep -n "import.*from.*lucide" src/components/agente-nex/llm-config-form.tsx` após edit + remover icons não-usados. |
| 8 | **T-D3 sendNexMessage propaga isPlayground via runNexAgent**: o atual runNexAgent já aceita `isPlayground`. Plan está OK; só explicitar que sendNexMessage deve propagar. | OK no plan, mas adicionar no test `expect(runNexAgent).toHaveBeenCalledWith(expect.objectContaining({ isPlayground: ... }))`. |
| 9 | **T-D4 click suggestion durante pending**: handleSend já tem `if (!trimmed || pending) return;`. OK — clicks durante pending são silenciosos (toast + rejeição). | OK; adicionar test "click numa sugestão durante pending é no-op". |
| 10 | **T-E2 Card title switch dynamic**: plan dizia "optional". Mandatório agora — quando isHourly, title "Custo por hora"; senão "Custo por dia". | Step explicit no T-E2: `<CardTitle>{isHourly ? "Custo por hora" : "Custo por dia"}</CardTitle>`. |
| 11 | **T-E3 colSpan da linha Total** muda de 3 → 4 (coluna Origem nova). | Step explícito no T-E3: na linha sticky de Total, atualizar `colSpan={3}` pra `colSpan={4}` (Data + Origem + Provider + Modelo agrupados antes dos numbers). |
| 12 | **T-E3 backfill rows pre-v0.31**: rows com `is_playground=false` default = todas Bubble. Calls reais do Playground feitas em v0.28-v0.30 aparecem incorretamente como Bubble. | Trade-off DOCUMENTADO no plan: histórico pre-v0.31 todo marcado como Bubble (DEFAULT false). Não fazer migration retroativa — sem como reconstruir. User vê separação correta apenas em chamadas pós-deploy v0.31. |
| 13 | **T-D1 extractSuggestions: trim individual + filter empty**: já no plan. OK. |
| 14 | **T-C4 cap 50 termos UI vs Server Action cap**: mesmo limite (50). Consistente. ✅ |
| 15 | **T-A1 pre-seed terminology JSONB literal multiline**: PG aceita string literal com `\n` interno em '...' single quotes? **SIM** — strings PG single-quoted aceitam newline. ✅ Mas safer: usar `format()` ou string concat. Vou manter literal por brevidade do plan; risco baixo. |

### Menores / estilo / microcopy

| # | Achado | Fix v1 → v2 |
|---|--------|-------------|
| 16 | T-C4 microcopy "Mapeia termos custom..." | OK; manter. |
| 17 | T-D4 SuggestionsBar dark mode contrast violet-300 sobre violet-500/15 | Validar com WCAG contrast checker no dev. Aceitável (4.5:1+). |
| 18 | T-C3 quando isSuperAdmin=true, sem texto adicional (só preview limpo) | OK. |
| 19 | T-A1 pre-seed terminology — case-sensitivity das chaves | Lowercase no seed: ✅ ("estados", "colaboradores", etc). Match case-insensitive no LLM (LLM é robusto a case por natureza). |
| 20 | T-E2 buckets vazios `calls: 0`: gráfico mostra zero — visualmente OK (linha plana com pico onde houve calls). |
| 21 | T-C4 "Sugestões em botões" microcopy: explicar comportamento "no fim de respostas que admitam continuidade". | OK no plan. |
| 22 | T-B2 toggle Nex linha única: cursor-pointer no Label htmlFor. | OK no plan. |

### Riscos identificados (não-bloqueantes mas vale documentar)

| # | Risco | Mitigação |
|---|-------|-----------|
| 23 | **testNexPromptAction dead code potential**: após T-D5 + v0.28, ninguém usa. Mantido por back-compat. | OK; deletar futuro se sem consumers. |
| 24 | **fetchUsageDetails nova prop isPlayground**: outro caller não-consumo-content chama? | Step adicional T-E3: `grep -rn "fetchUsageDetails" src/` antes de mudar — confirmar único caller é consumo-content. Se outro existir, atualizar. |
| 25 | **DB performance index**: nova column `is_playground` sem index. Filtros podem ficar lentos quando volume crescer. | Aceitável: cardinality baixa (boolean), full scan rápido em < 100k rows. Adicionar partial index `WHERE is_playground = true` se virar issue. **NÃO** adicionar agora (YAGNI). |
| 26 | **Pre-seed terminology overrides futuras**: user pode editar terminology e remover algumas chaves. Próximo `ensureNexTables()` re-aplica seed? | NÃO — `WHERE terminology = '{}'` no UPDATE garante idempotência. Se user limpou pra `{}`, re-seed. Se removeu CHAVES e ficou com `{custom}`, NÃO re-seed (terminology != '{}'). ✅ correto. |
| 27 | **runNex.ts mudou comportamento de logUsage** — algum teste em outro arquivo pode esperar "Playground não loga". | Step adicional: `grep -rn "isPlayground.*log\|log.*isPlayground" src/` antes de mudar. |
| 28 | **Recharts `<Tooltip wrapperStyle>` em DonutWithCenter**: voltar pro pattern v0.20 em vez do `coordinate.outside` da v0.24. Verificar visual em dev. | Smoke test obrigatório no Step 5 do T-E1. |

---

## Tasks impactadas (pelos achados)

### T-D1 (regex novo)

```typescript
// v2: regex com ancoragem em início-de-linha (line anchor) pra evitar match
// no meio da resposta. Aceita:
//   "[[suggestions]]:a|b" no início da string
//   "ok\n[[suggestions]]:a|b" no meio (após newline)
// Recusa:
//   "blah [[suggestions]]:a|b mid" (não está em linha própria)
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
  // Remove a linha completa do match (incluindo possível \n inicial).
  const message = text.replace(match[0], "").trimEnd();
  return { message, suggestions };
}
```

Adicionar test extra:
```typescript
it("não casa quando [[suggestions]] está NO MEIO de uma linha (ancoragem início-de-linha)", () => {
  const r = extractSuggestions("texto com [[suggestions]]:bla mais texto");
  expect(r.suggestions).toEqual([]);
  expect(r.message).toBe("texto com [[suggestions]]:bla mais texto");
});
```

### T-B1 (test setCardSpread no-op)

Step novo:
```typescript
it("setCardSpread vira no-op + console.warn em v0.31 (não persiste)", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation();
  await setCardSpread(1.5);
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringMatching(/setCardSpread.*no-op desde v0\.31/i),
  );
  // Verifica que NÃO chamou pgPool.query (não persistiu).
  expect(mockedPgPool.query).not.toHaveBeenCalled();
  warnSpy.mockRestore();
});
```

E remover (ou alterar) test antigo "setCardSpread persiste valor no DB".

### T-D1 (substituir test antigo de logUsage skip)

```typescript
// REMOVER: it("não chama logUsage quando isPlayground=true", ...)

// SUBSTITUIR POR:
describe("runNex — logUsage com is_playground (v0.31)", () => {
  it("isPlayground=true: chama logUsage com is_playground=true (não pula mais)", async () => {
    // ... setup completo ...
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
    await runNexAgent({ ...args }); // sem isPlayground
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: false }),
    );
  });
});
```

### T-C2 (lista canônica de arquivos com mocks)

Step explícito:
```bash
# v2: arquivos canônicos com NexPromptConfig sem terminology/suggestionsEnabled
# (lista derivada de grep + verificação manual):
- src/lib/nex/__tests__/prompt-compose.test.ts
- src/lib/nex/__tests__/prompt.test.ts (mocks de getNexPromptConfig.mockResolvedValue)
- src/lib/actions/__tests__/nex-prompt.test.ts
- src/lib/llm/agent/__tests__/run-nex.test.ts
- src/components/agente-nex/__tests__/playground-sheet.test.tsx
- src/components/agente-nex/__tests__/prompt-config-form.test.tsx
- src/components/agente-nex/__tests__/prompt-preview-card.test.tsx
- src/components/agente-nex/__tests__/identity-base-editor.test.tsx
```

E verificação automática:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "Property 'terminology'|Property 'suggestionsEnabled'" | head -5
```

Output esperado: vazio (todos atualizados).

### T-D5 (extrair SuggestionsBar)

Novo arquivo:
```tsx
// src/components/nex/suggestions-bar.tsx
"use client";

import { cn } from "@/lib/utils";

interface SuggestionsBarProps {
  suggestions: string[];
  onPick: (s: string) => void;
}

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

Both nex-chat-panel E playground-sheet importam:
```typescript
import { SuggestionsBar } from "@/components/nex/suggestions-bar";
```

Tasks T-D4 e T-D5 atualizados pra usar o componente compartilhado.

### T-E2 (Card title dinâmico)

Step explícito no T-E2:
```tsx
<CardTitle className="flex items-center gap-2">
  <Coins className="h-4 w-4 text-violet-500" />
  {isHourly ? "Custo por hora" : "Custo por dia"}
</CardTitle>
```

### T-E3 (colSpan + grep fetchUsageDetails)

Step explícito:
```bash
# Antes de mudar fetchUsageDetails — confirma único caller:
grep -rn "fetchUsageDetails" src/ 2>/dev/null
# Esperado: apenas src/components/llm/consumo-content.tsx + tests
```

E na linha de Total sticky:
```tsx
<TableCell colSpan={4} className="whitespace-nowrap">
  <span>Total no filtro</span>
</TableCell>
```

(Era 3, agora 4 — Data/hora + Origem + Provider + Modelo).

### T-D1 (grep isPlayground.*log)

Step adicional pre-edit:
```bash
grep -rn "isPlayground.*log\|log.*isPlayground" src/ 2>/dev/null
# Esperado: apenas o block atual em run-nex.ts (linha ~147)
```

---

## Risco trade-offs documentados

| Trade-off | Decisão |
|-----------|---------|
| **Histórico pre-v0.31 marcado como Bubble**: rows existentes com `is_playground=false` default. Calls reais do Playground em v0.28-v0.30 aparecem como Bubble. | Sem migration retroativa — não há como reconstruir. User vê separação correta apenas em chamadas pós-deploy v0.31. |
| **DB index em is_playground**: nova column boolean sem index. | YAGNI — cardinality baixa, full scan ok em < 100k rows. Adicionar partial index futuro se virar issue. |
| **testNexPromptAction dead code**: nenhum consumer em v0.31. | Manter por back-compat. Deletar futuro se sem uso. |

---

## Self-Review v2

### Spec coverage — sem regressão.

### Achados v1 → v2 incorporados
- 28 issues mapeados; 5 críticos resolvidos (regex novo, setCardSpread no-op test, logUsage substitui test antigo, mocks lista canônica, SuggestionsBar extracted).
- Médios resolvidos (Card title dynamic, colSpan, grep verification steps, docs trade-offs).

### Type consistency — mantida do v1.
