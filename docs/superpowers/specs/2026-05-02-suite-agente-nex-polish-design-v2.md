# Spec — Suite Agente Nex · Polish (v0.20.0) — v2

**Versão:** v2 (incorpora 20 achados do pente-fino #1 + pesquisa Whisper/SVG).
**Predecessor:** `…-v1.md`.
**Release-alvo:** v0.20.0.

## 1. Contexto
Mantém v1 §1 + decisões da pesquisa: migrar áudio para `gpt-4o-mini-transcribe` (50% mais barato que whisper-1, melhor precisão PT-BR, retorna `usage.input_token_details.audio_tokens` + `output_tokens` no response). Logos SVG: 4 inline em `src/components/icons/providers/` (OpenAI via Lobe Icons; Anthropic/Gemini/OpenRouter via simple-icons).

## 2. Escopo (consolidado)

### 3.A — Consumo

- **A1. Migrar áudio para `gpt-4o-mini-transcribe`.**
  - `src/lib/nex/transcribe.ts`: trocar `model=whisper-1` por `model=gpt-4o-mini-transcribe`. `response_format=json`. Retornar `text`, `durationSeconds` (estimado via `response.headers.get("openai-processing-ms")` ou cálculo de fallback do tamanho do blob), `inputTokens`, `outputTokens` (de `usage.input_token_details.audio_tokens` + `usage.input_token_details.text_tokens` para input; `usage.output_tokens` para output, com fallback 0 se bug 0).
  - **Fallback automático:** se `gpt-4o-mini-transcribe` retornar 4xx/5xx, retry com `whisper-1` (response_format=verbose_json). Log warning. UI fica transparente.
  - `src/app/api/nex/transcribe/route.ts`: passa `tokensInput`/`tokensOutput` reais. Modelo gravado em `llm_usage.model` é `gpt-4o-mini-transcribe` ou `whisper-1` conforme caminho.
  - `src/lib/llm/pricing.ts`: nova entrada `gpt-4o-mini-transcribe`:
    ```ts
    "gpt-4o-mini-transcribe": {
      inputPerMillion: 3.0,    // audio_tokens (texto seria 1.25 mas dominante é audio em transcribe)
      outputPerMillion: 5.0,
    },
    ```
    `whisper-1` permanece (chamadas legadas + fallback). `calculateCost` para `gpt-4o-mini-transcribe` usa fórmula token-based padrão (não `perMinuteUsd`).
  - `src/components/llm/usage-detail-sheet.tsx`: nota condicional. Para `whisper-1`: mantém "Whisper é cobrado por minuto. Tokens não se aplicam." Para `gpt-4o-mini-transcribe`: nada (tokens reais).
  - Tabela de Histórico de Chamadas: para `whisper-1` continua "—" em tokens; para `gpt-4o-mini-transcribe` mostra valores normais.
  - **Custo:** `gpt-4o-mini-transcribe` ≈ $0.003/min vs `whisper-1` ≈ $0.006/min — economia ~50%. Documentar em runbook.
- **A2. Linha total destaque.** Container do `<tr>` total ganha:
  - `bg-violet-500/15 dark:bg-violet-500/10`
  - `border-y-2 border-violet-500/40 dark:border-violet-500/30`
  - `font-bold tracking-wide`
  - Cor texto: `text-violet-700 dark:text-violet-300`
  - Primeira célula: ícone `<Sigma className="h-4 w-4" />` + label "Total no filtro" (uppercase tracking-wide).
  - Validar via `ui-ux-pro-max` skill antes de codar.
- **A3. Y-axis modo "menor que zero".**
  - Helper novo em `area-chart.tsx` e `bar-chart.tsx`: detecta `maxValue = Math.max(...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)))`. Se `maxValue < 0.01` E `yAxisCurrency` definido → modo compacto: `ticks=[0, 0.01]` com tickFormatter:
    - 0 → `"R$ 0,00"` (BRL) ou `"$0.00"` (USD).
    - 0.01 → `"< R$ 0,01"` ou `"< $0.01"` (literal).
  - Tooltip mantém valor real (formatBrl4/formatUsd4).
  - Caso contrário, comportamento atual (5 ticks default Recharts).
- **A4. Donut tamanho/fonte.**
  - `outerRadius`: 80 → 88 (~10% maior).
  - Centro do donut: `text-2xl` → `text-xl` (~10% menor).
  - Ajustes finais validados via ui-ux-pro-max.

### 3.B — Prompt

- **B1. Card preview claramente READ-ONLY + atalho "Editar".**
  - `<pre>` ganha `cursor-text` e `aria-readonly="true"`.
  - Banner sutil acima do `<pre>` (dentro do CardContent, antes da ScrollArea): `<p className="text-xs text-muted-foreground italic">Preview somente leitura. Para editar, use os campos abaixo (Personalidade · Tom · Guardrails · Modo manual).</p>`
  - Novo botão `<Button variant="ghost" size="sm">` ao lado de "Copiar"/"Maximizar": label "Editar", ícone `<Pencil>`, handler scroll suave para `#prompt-edit-form`.
  - Card "Comportamento" (PromptConfigForm) ganha `id="prompt-edit-form"`.
- **B2. IDENTITY_BASE radicalmente enxuta.**
  - Substituir em `src/lib/nex/prompt-compose.ts`. Texto novo (~14 linhas):
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
  - Mantém palavras-chave que existem nos testes: `Nexus Insights`, `ChatGPT`, `GPT`, `Claude`, `Gemini`, `OpenAI`, `Anthropic`, `Google` (lista de proibição preservada).
  - Atualizar testes em `src/lib/nex/__tests__/prompt.test.ts` que assertem texto específico — usar `toContain` para frases-chave.
- **B3. Remover atalho "Adicionar API Chatwoot (sugerida)".**
  - `kb-section.tsx`: deletar botão `openAddChatwootSuggestion`, função `openAddChatwootSuggestion`, constantes `CHATWOOT_SUGGESTED_*`, e estado `tab/urlName/urlValue` deixar como `tab="file"` default.
  - `kb-upload-dialog.tsx`: simplificar interface (`initialUrlName`/`initialUrlValue` ainda OK pra futuro, mas sem caller). Não remover totalmente — props opcionais.
- **B4. Defaults Personality/Tom seedados.**
  - Migration aditiva (em `src/lib/nex/ensure-tables.ts`):
    ```sql
    UPDATE nex_settings
    SET personality = 'Direto, prático, prefere bullets curtos quando há listas. Evita rodeios e textão. Não se apresenta a cada turno.',
        tone = 'Profissional e objetivo, em pt-BR. Usa "você". Sem se desculpar; sem repetir o nome do agente.'
    WHERE id = 'global'
      AND seeded_defaults_at IS NOT NULL
      AND personality = '' AND tone = '';
    ```
  - Roda no startup junto com seed de guardrails.
  - **Comportamento:** se super_admin já tocou (campos não-vazios), respeita; só preenche se ambos vazios E flag presente.
- **B5. Renomear "Mostrar identidade fixa" + explicação.**
  - Botão: "Ver identidade fixa do agente (somente leitura)".
  - Quando aberto, acima do `<pre>` IDENTITY_BASE, texto: `<p className="text-xs text-muted-foreground">Texto-base imutável que blinda a identidade do Agente Nex. Personalidade e Tom (campos abaixo) são camadas adicionais que VOCÊ controla.</p>`
- **B6. Bug layout "Idioma" fora do `<pre>`.** Causa provável: `<pre>` herda `max-w` mas conteúdo longo overflowa. Fix:
  - Wrapper `<ScrollArea>` ganha `w-full overflow-x-hidden`.
  - `<pre>` interno: `min-w-0 overflow-x-auto whitespace-pre-wrap break-words`.
  - Se ainda houver overflow (palavra muito longa), adicionar `word-break: break-all` em fallback.
- **B7. Maximizar = Dialog centro.** Trocar `<Sheet>` por `<Dialog>`:
  - `<DialogContent className="max-w-[min(900px,92vw)] max-h-[85vh] flex flex-col gap-3 p-6">`.
  - Header: título "Prompt completo do Agente Nex" + 2 botões: "Copiar", "Editar prompt" (fecha dialog + scroll para form).
  - Body: `<ScrollArea className="flex-1 ...">` com mesmo `<pre>` (ou textarea read-only com `wrap=soft` em alternativa).
  - Backdrop: já tem blur via base-ui Dialog default.
- **B8. KB URL — runbook com investigação detalhada.**
  - Como funciona: `assertPublicUrl` valida HTTPS + DNS resolve + bloqueio ranges privados → `fetchKbUrl(url)` com AbortController 10s + cap 5MB body + `node-html-parser` extrai `main`/`article` ou `body` minus script/style/nav/footer/aside/form → trunca em 100k chars no DB → `composeSystemPrompt` injeta limitado a 30k total.
  - Para `developers.chatwoot.com`, 5.877 chars representa o conteúdo extraído da landing page (não o conteúdo TODO da API ref — a página é SPA com routes nested e o crawler extrai só DOM inicial). Para conteúdo profundo: usar arquivo TXT manual ou aguardar v0.21+ com sitemap crawl.

### 3.C — Chaves

- **C1. Botão sem gradient.**
  - `bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-sm hover:from-violet-700 hover:to-violet-600 dark:from-violet-500 dark:to-violet-400` → REMOVER classNames extras, usar `<Button variant="default" size="sm">` puro.
- **C2. Lógica condicional.**
  ```tsx
  <header>
    <ProviderInfo />
    <div className="flex items-center gap-2">
      <ExternalLinkApiKey />
      {list.length > 0 ? <NewKeyButton /> : null}  {/* ESCONDE no header se vazio */}
    </div>
  </header>
  {list.length === 0 ? <EmptyState /> : <ListaCredenciais />}
  ```
  Empty state mantém os 2 CTAs (link externo + Nova chave).
- **C3. Logos SVG inline.**
  - Criar `src/components/icons/providers/openai-icon.tsx`, `anthropic-icon.tsx`, `gemini-icon.tsx`, `openrouter-icon.tsx` — cada um exporta componente React puro com SVG inline (path fill="currentColor").
  - Sources: OpenAI de Lobe Icons (mono), Anthropic/Gemini/OpenRouter de simple-icons.
  - Em `llm-credentials-manager.tsx`, substituir `<span>{initial}</span>` por `<ProviderIcon />` correspondente. Container mantém `bg-violet-600/10 text-violet-500 dark:text-violet-400` (cor do ícone segue currentColor).

### 3.D — Doc / release

- Bump `package.json` 0.18.0 → **0.20.0** (pula 0.19 ocupado por outro agente).
- CHANGELOG entrada nova com 3 sections.
- STATUS.md atualizado.
- Runbook `docs/runbooks/agente-nex-audio-tokens.md` (B8 + A1).
- Memory `project_v0.20_polish.md`.

## 3. Riscos (consolidado)

| Risco | Mitigation |
|-------|------------|
| `gpt-4o-mini-transcribe` retorna `output_tokens=0` (bug conhecido) | Usar `input_token_details.audio_tokens` como fonte primária; output 0 é OK pois transcribe é input-dominante |
| Fallback whisper-1 inflar logs com 2 chamadas | Só faz fallback em erro, não na primeira tentativa OK |
| Reduzir IDENTITY_BASE — agente perde blindagem ChatGPT/Claude/etc | Manter palavras-chave de proibição na lista; testes asseguram via `toContain` |
| SVG OpenAI de Lobe Icons pode ter restrição | Lobe Icons publish MIT/CC0; uso interno OK |
| Bumps colidirem com outro agente | Sempre `git fetch` antes; v0.20 pula v0.19 ocupado |
| Linha total visual carrega demais | ui-ux-pro-max valida; ajustar tons se necessário |
| Y-axis "< R$ 0,01" confuso para leigos | Tooltip preserva valor real; usuário hover vê |
| Migrar para gpt-4o-mini-transcribe muda contagem em prod | Documentar em CHANGELOG; legacy whisper-1 entries seguem como antes |

## 4. Critérios de aceite

- [ ] Whisper bubble usa `gpt-4o-mini-transcribe` por default; fallback whisper-1 em erro.
- [ ] Tokens de input/output reais aparecem no Consumo para chamadas novas.
- [ ] Linha total visualmente destacada (violet bg + bold + ícone Sigma).
- [ ] Gráficos com max < R$ 0,01 mostram só "R$ 0,00" e "< R$ 0,01".
- [ ] Donut levemente maior + fonte central menor.
- [ ] Card preview com banner read-only + botão "Editar" funcional.
- [ ] Agente Nex responde curto: "127" não "Eu sou o Agente Nex. ...".
- [ ] Botão "Adicionar API Chatwoot (sugerida)" deletado.
- [ ] Personality e Tom default seedados.
- [ ] Bug "Idioma" fora do `<pre>` corrigido.
- [ ] Maximizar = Dialog centralizado scrolável (não Sheet lateral).
- [ ] Botão "Nova chave" sem gradient.
- [ ] 0 chaves: botão só dentro do empty state.
- [ ] Logos SVG dos 4 providers.
- [ ] /api/health version=v0.20.0 status=ok.

**Fim da v2.** Pronta para pente-fino #2 (mais profundo).

---

## Pente-fino #2 — achados (v2)

1. **A1 `usage` shape exato.** Pesquisa confirmou: `usage.input_token_details.audio_tokens` (primário) + `usage.input_token_details.text_tokens` (somar) + `usage.output_tokens`. v3: parse explícito + tipo TS.
2. **A1 `durationSeconds`:** `gpt-4o-mini-transcribe` com `response_format=json` NÃO retorna `duration`. v3: `durationSeconds = (Date.now() - start) / 1000` server-side (já temos).
3. **A2 colspan da linha total:** tabela tem 8 colunas (Data/Hora · Provider · Modelo · Tokens entrada · Tokens saída · Duração · Custo USD · Custo BRL). v3 cravar:
   - Cell 1 (colspan=3): ícone Sigma + "Total no filtro".
   - Cell 2: totals.tokensInput.
   - Cell 3: totals.tokensOutput.
   - Cell 4: formatDuration(totals.durationMsTotal).
   - Cell 5: formatUsd(totals.costUsd).
   - Cell 6: formatBrl(totals.costBrl).
4. **A3 Recharts ticks fixos:** quando `maxValue < 0.01`, setar:
   ```tsx
   <YAxis
     domain={[0, 0.01]}
     ticks={[0, 0.01]}
     tickFormatter={(v) => v === 0 ? "R$ 0,00" : "< R$ 0,01"}
     allowDataOverflow
   />
   ```
5. **A4 ResponsiveContainer + outerRadius:** Recharts respeita outerRadius mesmo em mobile. v3: validar visual via ui-ux-pro-max em viewport 375px.
6. **B1 ID estável:** Card "Comportamento" envolto em `<div id="prompt-edit-form" className="scroll-mt-4">`. `scroll-mt-4` evita ficar embaixo de header sticky.
7. **B2 testes prompt.test.ts:** plan task primeira = ler `src/lib/nex/__tests__/prompt.test.ts` e ajustar asserções específicas. Casos esperados: `IDENTITY_BASE.includes("Nexus Insights")` ✅, `IDENTITY_BASE.includes("ChatGPT")` ✅ (continua na lista de proibição), `IDENTITY_BASE.length < 1500` (pode ser nova asserção pra evitar regressão prolixa).
8. **B5 layout cramped:** `<pre>` IDENTITY_BASE com max-h-200px + texto explicativo p `text-xs muted` 2-3 linhas. ✅ cabe.
9. **B6 reprodução do bug:** plan task explícita: rodar `npm run dev` + abrir /agente-nex/prompt em viewport 1280×800 e 375×667 e verificar overflow horizontal do `<pre>` no card. Se reproduzir, aplicar fix CSS. Se não reproduzir → pode ser apenas o screenshot mostrado no zoom OS, ainda assim aplicar `min-w-0` defensivo.
10. **B7 ordem do handler "Editar prompt":**
    ```ts
    function handleEditFromMaximized() {
      setMaximized(false);
      // setTimeout pra Dialog fechar antes do scroll
      setTimeout(() => {
        document.getElementById("prompt-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
    ```
11. **B2 + override:** confirmado no `composeSystemPrompt` — se `advancedOverride.trim().length > 0`, retorna SOMENTE override (IDENTITY_BASE ignorada). v3: comportamento mantido.
12. **C3 SVGs monocromáticos com currentColor:** todos os 4 SVGs DEVEM usar `fill="currentColor"` (não cor explícita). Container `text-violet-500 dark:text-violet-400` define a cor. Para Lobe Icons OpenAI: usar versão mono (não colored) — Lobe tem ambas.
13. **D bump v0.20.0:** confirmar via `git log --oneline -20 origin/main` que outro agente não pulou pra 0.21+ enquanto trabalho aqui. Plan: bump no FINAL (T7), depois de tudo verificado.
14. **A1 modelo no llm_usage:** registros novos com `model='gpt-4o-mini-transcribe'` aparecem na tabela "Histórico de chamadas". Filtro/cascade já funciona (T4c v0.16). ✅
15. **A1 catálogo:** `gpt-4o-mini-transcribe` precisa estar em `src/lib/llm/catalog.ts` se queremos que apareça no select de modelo? **NÃO** — não é modelo de chat, é modelo interno usado apenas pelo /api/nex/transcribe. Não aparece no catálogo (assim como `whisper-1` não aparece). ✅
16. **A1 calculateCost teste:** atualizar `src/lib/llm/__tests__/pricing.test.ts` com case para gpt-4o-mini-transcribe (token-based, sem perMinuteUsd).
17. **B5 texto explicativo:** validar via ui-ux-pro-max para garantir que não vira jargão.
18. **C1 + C2 — botões mudaram:** podem quebrar testes existentes em `llm-credentials-manager.test.tsx`. v3: ajustar testes (esperar `variant="default"` puro + ausência de gradient classes; condicional render).
19. **C3 — testes:** adicionar test que `<OpenAIIcon>` renderiza SVG (mock) + `<LlmCredentialsManager>` renderiza ícone certo por provider.
20. **A1 fallback infinite-loop:** se whisper-1 também falhar, retornar erro original. v3: try-catch com 1 retry só.
21. **B7 Dialog footer:** botão "Editar" no header É header do Dialog. Footer do Dialog vazio ou com "Fechar". v3: header com botões inline (Copiar, Editar, Close X).
22. **B6 — z-index Sheet vs Dialog na maximize:** se trocar Sheet por Dialog, base-ui Dialog z-1900 mantém ✅.
23. **A3 modo "menor que zero" — quando empty data:** se data=[] ou maxValue=0 (nenhum custo registrado), comportamento atual (Recharts auto). v3: `if (maxValue > 0 && maxValue < 0.01)` modo ativo; `if (maxValue === 0)` modo padrão.
24. **D — runbook A1 + B8 num único arquivo:** `agente-nex-audio-e-kb-url.md` cobre ambos (transcribe + KB URL).

**Total cumulativo: 44 achados** (20 v1 + 24 v2). v3 final consolida.
