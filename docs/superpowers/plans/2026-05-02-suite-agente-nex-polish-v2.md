# Plan v2 — Suite Agente Nex · Polish (v0.20.0)

**Status:** rascunho intermediário com 8 achados v1 aplicados. Pente-fino #2 abaixo.

## Tasks (ordem ajustada)

**T0 — Audit (2)**
- T0a: ler prompt.test.ts.
- T0b: grep callers de `getUsageStats` + `fetchUsageStats` (T1f impact check).

**T1 — Backend (6)**
- T1a pricing.ts + test.
- T1b transcribe.ts (1 retry max; fallback transparente).
- T1c /api/nex/transcribe.
- T1d prompt-compose.ts IDENTITY enxuta + asserções `toContain` em prompt.test + nova asserção `length < 1500`.
- T1e ensure-tables.ts seed Personality/Tom (condição: seeded_defaults_at IS NOT NULL E personality='' E tone='').
- T1f getUsageStats aceita `provider?:string` (não-breaking para callers — opt-in).

**T2 — UI (8 reordenadas)**
- T2-ICONS: criar ProviderIcons (T2h da v1) — vem ANTES de T2-CREDS pra estar disponível.
- T2-PROMPT: PromptPreviewCard (B1+B5+B6+B7+wrap form id).
- T2-KB: KbSection remove atalho.
- T2-DONUT: DonutWithCenter radius/font.
- T2-CHART: AreaChart + BarChart (subcent mode A3 + bar custom tick provider tag 3.E).
- T2-DETAIL: UsageDetailSheet nota condicional.
- T2-CREDS: LlmCredentialsManager (C1+C2+C3) — usa ProviderIcons.
- T2-CONSUMO: ConsumoContent integration (linha total A2 + filtro global Provider 3.F + pageSize CustomSelect 3.G + providersByModel pra bar chart).

**T3 — Doc/release (1)**
- T3a versão+CHANGELOG+STATUS+runbook+memory.

**T4 — Verify/Deploy (1)**
- T4a verify + push + watch + portainer-fix + health + history.

**Total: 19 tasks** (T0×2 + T1×6 + T2×8 + T3×1 + T4×1 = 18; uma tem audit). Aprox.

## Pente-fino #2

1. **T2-CONSUMO ainda gigante:** linha total + filtro global + pageSize + providersByModel — 4 mudanças num arquivo já complexo. v3: subagent recebe lista detalhada e itera. Aceitar.
2. **T2-CHART também gigante (2 charts + 2 features):** subcent mode em ambos + custom tick provider tag em bar. v3: 1 subagent com escopo claro.
3. **T1f filter sync:** `fetchUsageStats` em llm-usage.ts precisa repassar `provider`. T1f estende AMBOS. v3 cravar.
4. **T2-CREDS dependência:** depende de T2-ICONS (precisa do componente). Ordem estrita.
5. **T1d update tests prompt:** podem haver outros arquivos de teste tocados (smoke test em prompt.ts). v3: grep + atualizar todos.
6. **T2-PROMPT scrollIntoView:** ID `prompt-edit-form` deve existir no JSX antes do user clicar. v3: T2-PROMPT inclui edit no `prompt/page.tsx` para wrappar form.
7. **A1 default model em config:** se super_admin escolheu `whisper-1` como modelo do Agente, quem ganha? Resposta: transcribe.ts ignora config — usa SEMPRE gpt-4o-mini-transcribe primeiro. config llm provider só importa porque precisa ser openai (apiKey). v3: cravar.
8. **A2 colspan na linha de total:** tabela tem 8 colunas — colspan=3 na primeira cell, 5 cells com totals. v3 detalha.
9. **3.E custom tick height:** XAxis padrão height 30px; com 2 linhas precisa 50px. v3 cravar.
10. **3.F default Provider:** quando user seleciona "Todos", URL state remove `?provider=`. v3 cravar.

10 achados v2. v3 incorpora.

**Total cumulativo: 18 achados** (8 v1 + 10 v2).
