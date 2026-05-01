# Spec — Suite Agente Nex · Refinamento (v0.16.0) — v3 final

**Versão:** v3 (consolidada após 2 pente-finos rigorosos — 22 achados na v1, 29 achados na v2).
**Predecessores:** `…-design-v1.md`, `…-design-v2.md`.
**Data:** 2026-05-01.
**Release-alvo:** v0.16.0.
**Status:** pronta para aprovação do usuário e geração do plan.

---

## 1. Contexto

A Suite Agente Nex foi entregue em v0.15.0–v0.15.4. Em uso real (super_admin, conta Matrix), evidenciou-se:

- **Visual fragmentado:** as 4 sub-páginas não seguem o padrão das telas de Relatórios; pop-ups nativos do navegador na exclusão; cards desalinhados.
- **Prompt frágil:** identidade do agente não é blindada (menciona "ChatGPT"), prompt atual invisível, override pouco claro, playground inline pouco útil.
- **KB limitada:** apenas PDF/TXT.
- **Gaps de configuração:** sem mapeamento de URL pública por conta Chatwoot — agente não consegue gerar deep-links corretos.
- **Consumo cru:** KPIs com 6 casas decimais, gráficos sem `R$`, fontes pequenas, tabela sem filtro/total/drill-down, calendário começando no domingo, dias overflow selecionáveis.
- **Catálogo incompleto:** ~40 modelos OpenRouter; faltam DeepSeek/Qwen/Llama 4/Grok 4/Liquid/Sonar e tier "premium" para distinguir modelos muito caros.

Esta release consolida 24+ alvos em um pacote único v0.16.0 com workflow rigoroso (spec/plan double-check, subagent-driven-development com TDD por task, ui-ux-pro-max em qualquer toque de UI, deploy assistido).

---

## 2. Escopo

| § | Bloco | Resumo |
|---|-------|--------|
| 3.A | Chaves de API | Header de provedor padronizado, AlertDialog em vez de window.confirm, atalho "Criar API key", layout coeso (mantém narrow) |
| 3.B | Configuração | Mais respiro, modelo customizado **inline** (SearchableSelect com `customMode`), 4º tier `premium` (azul/amarelo/laranja/vermelho), catálogo expandido (118 modelos) |
| 3.C | Prompt | Preview client-side em card sempre visível, "Modo prompt manual" renomeado, playground em `<Sheet>` lateral, IDENTITY_BASE atualizado, guardrails default seedados via flag `seeded_defaults_at`, KB com aba URL + SSRF guard, atalho API Chatwoot |
| 3.D | Consumo | PeriodPills do componente compartilhado, KPIs uniformes 4 casas com `min-h-[128px]`, ícone Activity, gráficos com `R$`/`$` + 2 casas + fonte 13px, tooltip do donut em `position={{x:8,y:8}}`, tabela "Histórico de chamadas" com filtros server-side cascateados + totals server-side + drill-down em `<Sheet>` (cotação/spread auditados), USD/BRL bruto |
| 3.E | Calendar global | `weekStartsOn=1` + `showOutsideDays=false` em todos os usages |
| 3.F | URLs públicas Chatwoot | Card em /configuracoes lendo accounts via `listKnownAccountIds`, salvando em `ChatwootAccountUrl`, audit logado; Agente Nex injeta na seção `## URLs públicas` |
| 3.G | Doc/memory/deploy | Bump 0.15.4 → 0.16.0; CHANGELOG/STATUS/runbooks/memória; migration aditiva (kind/sourceUrl/ChatwootAccountUrl/seeded_defaults_at); deploy via gh run watch |

---

## 3. Requisitos detalhados

### 3.A — `/agente-nex/chaves`

**Layout:** mantém `PageShell variant="narrow"`. Reorganização interna:
- Cada card de provedor ocupa toda a largura do container narrow.
- Header do card: `flex items-center justify-between`, esquerda = ícone (círculo `h-9 w-9 bg-violet-600/10 text-violet-500`) + label, direita = atalho "Criar API key" (`<a target="_blank">` com ExternalLink icon) + botão "+ Nova" (`variant="default"`, gradient violet, `min-h-10`).
- Lista de credenciais: indicador status (verde se ativa) + label + last4 + ações Renomear/Trocar/Excluir.

**Exclusão:** trocar `window.confirm` por `<AlertDialog>` (componente existente em `src/components/ui/alert-dialog.tsx` — confirmar API exata na primeira task do plan). Padrão:

```tsx
<AlertDialog open={openId === doc.id} onOpenChange={(o) => !o && setOpenId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Excluir "{name}"?</AlertDialogTitle>
      <AlertDialogDescription>
        Essa ação remove permanentemente {entidade} e não pode ser desfeita.
        {context-specific extra}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete} variant="destructive" disabled={isDeleting}>
        {isDeleting ? <Loader2 className="..." /> : null} Excluir
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Aplicado em `LlmCredentialsManager` e `KbSection`.

**Card vazio (provedor sem credenciais):** ícone KeyRound esmaecido, texto "Nenhuma chave cadastrada para {Provider}", 2 CTAs (atalho externo + Nova).

---

### 3.B — `/agente-nex/configuracao`

**Respiro:** `space-y-6` → `space-y-8` no container; padding interno do card root revisado pelo subagent UI/UX no momento da implementação. Sections separadas por `border-t border-border/50 pt-6`.

**Modelo customizado inline:** estender `<SearchableSelect>` com prop `customMode: { value: string; sentinel: string; onCustomChange: (v: string) => void; placeholder?: string; }`. Comportamento:

| Estado | Render do trigger | Comportamento ao… |
|--------|-------------------|-------------------|
| Item normal selecionado | label do item | abrir dropdown via clique em qualquer área |
| `__custom__` selecionado | `<input value={customModel} onChange={…} placeholder="ex: gpt-5.5-2026-04-15">` com botão `X` no canto direito | abrir dropdown apenas via clique no chevron; X limpa input e volta para placeholder |
| customMode + input vazio | placeholder visível | submit bloqueado, validação client `Informe o ID do modelo customizado` |

**4 tiers** (`CostTier = "low" | "medium" | "high" | "premium"`):

| Tier | Faixa output USD/M | Cor (light) | Cor (dark) | Rótulo |
|------|--------------------|-------------|------------|--------|
| low | < $1 | blue-500/15 + blue-600 | blue-500/15 + blue-400 | `$` |
| medium | $1–$10 | amber-500/15 + amber-600 | amber-500/15 + amber-400 | `$$` |
| high | $10–$30 | orange-500/15 + orange-600 | orange-500/15 + orange-400 | `$$$` |
| premium | > $30 | red-500/15 + red-600 | red-500/15 + red-500 | `$$$$` |

`<TierBadge>` ganha 4 variantes. Modelos `:free` no OpenRouter mantêm tier `low` mas com nota `free` no badge (override apenas do label, não da cor).

**Catálogo expandido (~118 modelos)** será aplicado em `src/lib/llm/catalog.ts` (lista canônica completa no Apêndice A do plan). Reclassificação dos demais providers:

- **OpenAI:** `gpt-5.5`, `gpt-5.4` permanecem `high` ($5/$30 e $2.5/$15 — output ≤ $30); `gpt-5.5-pro`, `gpt-5.4-pro`, `o1-pro`, `o3-pro` → `premium` ($30/$180 etc).
- **Anthropic:** `claude-opus-4-7` mantém `high` ($5/$25 — abaixo de $30); `claude-3-opus-20240229` (legado, $15/$75) → `premium`.
- **Google:** sem reclassificação (nenhum modelo > $30/M output em maio/2026).
- **OpenRouter:** entradas conforme expansion (16 free, 14 OpenAI, 8 Anthropic, 8 Google, 8 DeepSeek, 17 Qwen, 6 Llama, 7 Mistral, 6 Cohere, 7 Grok, 4 Microsoft, 3 Nous, ~12 outros). IDs validados via curl smoke test em top-10 novos antes do commit.

**Whisper:** permanece em `src/lib/llm/pricing.ts → MODEL_PRICING["whisper-1"]`. Não aparece no select de modelo (é endpoint interno usado apenas pela bolha em `/api/nex/transcribe`).

---

### 3.C — `/agente-nex/prompt`

#### C1. Card "Prompt completo (preview)" no topo

Posicionamento acima de "Comportamento". Mostra `composeSystemPrompt(currentConfig, kbDocs, accountUrls)` em `<pre>` somente-leitura.

**Atualização client-side:** porta-se `composeSystemPrompt` para módulo isomorphic em `src/lib/nex/prompt.ts` (já é função pura — confirmar primeiro). Preview recalculado on-input com `useMemo` sem debounce (computação local rápida).

**Inputs do preview** (carregados server-side na page):
- `kbDocs`: `getKbDocsForPrompt()` (lista com `extractedText`, ordenada `createdAt ASC`).
- `accountUrls`: `listChatwootAccountUrls()` (lista de `{ accountId, publicUrl, label }`).

Snapshot inicial — mudanças subsequentes em KB ou URLs exigem `router.refresh()` para re-carregar.

**Ações:**
- Botão "Copiar" (clipboard).
- Botão "Maximizar" → abre `<Sheet side="right" className="w-full sm:w-[640px]">` com mesmo `<pre>` em ScrollArea ampla.
- Bloco colapsável "Mostrar identidade fixa" (default closed) revela IDENTITY_BASE separado.

#### C2. "Modo prompt manual" (renomeado)

- Label: "Modo prompt manual" (era "Modo override avançado").
- Tooltip `(?)` ao lado do label:
  > Substitui completamente o prompt composto (identidade + personalidade + tom + guardrails + base de conhecimento + URLs públicas) por um texto livre. Use só se quiser controle total e entende o impacto.
- Quando ativo:
  - Badge laranja "MODO MANUAL ATIVO" no card "Comportamento".
  - Personality/Tone/Guardrails ficam disabled com texto auxiliar laranja `Desativado pelo Modo manual ativo. Desligue acima para editar.`.
  - Salvar bloqueado se `override.trim()` vazio. Toast: "Modo manual ativo precisa de texto não-vazio."
  - Server action revalida e retorna 400 com mesmo erro.
- Ativar override exibe AlertDialog de confirmação: "O Modo manual desativa identidade fixa, personalidade, tom, guardrails, base de conhecimento e URLs públicas configuradas em /configuracoes. Continuar?"

#### C3. Playground em `<Sheet>` lateral

- Card "Playground" do body é removido.
- `<PageHeader actions>` ganha botão `<Button variant="outline" size="sm">` com ícone `MessageSquare` e label "Abrir playground".
- Click abre `<Sheet side="right" className="w-full sm:w-[480px]">`:
  - Header: "Playground · {Provider} · {model}" + close (X) + 2 botões secundários: "Limpar histórico" + "Ver prompt usado".
  - Body: `<NexMessage>` lista (cap 20 mensagens, FIFO).
  - Footer sticky: `<Textarea>` + botão "Enviar".
- `testNexPromptAction(message, currentConfig)` com `isPlayground=true` (não loga em `llm_usage`).
- Não persiste em localStorage (efêmero).

#### C4. IDENTITY_BASE atualizado

Substitui texto atual em `src/lib/nex/prompt.ts → IDENTITY_BASE` pelo bloco canônico definido na v2 §3.C C4 (mencionando exclusivamente "Nexus Insights" e "Nexus Chat", proibindo menções a "ChatGPT/GPT/Claude/Gemini/OpenAI/Anthropic/Google" como identidade, declarando deep-links via mapeamento `{publicUrl}/app/accounts/{accountId}/conversations/{conversationId}` e fallback "URL pública não configurada — avise o usuário em vez de inventar"). Texto integral preservado no plan (Apêndice B).

#### C5. Guardrails default seedados (idempotente)

**Migration:**
- Adicionar coluna `seeded_defaults_at TIMESTAMPTZ NULL` em `nex_settings`.
- Backfill condicional:
  ```sql
  UPDATE nex_settings
  SET guardrails = '[ … 5 guardrails … ]'::jsonb,
      seeded_defaults_at = now()
  WHERE id = 'global'
    AND seeded_defaults_at IS NULL
    AND (guardrails IS NULL OR guardrails = '[]'::jsonb);
  ```

**Lógica:** seed roda **uma única vez**. Se super_admin posteriormente apaga todos os guardrails (array vazio), backfill não ressuscita (porque `seeded_defaults_at IS NOT NULL`).

**5 guardrails default** (texto integral em v2 §3.C C5).

#### C7. KB aceita URL

**Schema:**
- `enum NexKbKind { PDF TXT URL }`.
- `NexKbDocument`:
  - `kind: NexKbKind @default(PDF)` (com backfill `kind='PDF'` para registros existentes).
  - `sourceUrl: String?` (max 2048 chars).

**Server Actions:**
- `addKbUrlAction({ name, url })` em `src/lib/actions/nex-prompt.ts`:
  - Validação: HTTPS-only, URL parse válida, max 2048 chars; nome 1–200 chars.
  - **SSRF guard** (`assertPublicUrl(url)` em `src/lib/nex/kb-url.ts`): após DNS resolve da hostname, bloqueia IPs em ranges privados/loopback/link-local e hostnames literais (`localhost`, `0.0.0.0`, `metadata.google.internal`, `169.254.169.254`).
  - Fetch: `AbortController` timeout 10s, body cap 5MB, headers `User-Agent: NexusInsights-KB/1.0` + `Accept: text/html, text/plain, application/json, application/xml`. Aceita só status 2xx.
  - Conversion HTML→texto via `node-html-parser`: extrai `<main>` ou `<article>`, fallback `<body>` minus `<script>/<style>/<nav>/<footer>/<aside>/<form>`.
  - Trunca em `MAX_DOC_CHARS=100_000`.
  - INSERT com `kind="URL"`, `sourceUrl=url`, `mimeType=response.content-type`.
  - Audit `setting_updated`.

- `refreshKbUrlAction(docId)`: re-fetch atualizando `extractedText`/`charCount`. Em caso de erro, **não sobrescreve** `extractedText` antigo; UI mostra toast e badge "Atualização falhou em {data}" no card.

**Mapping de erros UX:**

| Erro | Mensagem (toast) |
|------|------------------|
| URL inválida ou não-HTTPS | "URL inválida — use HTTPS." |
| Hostname privado (SSRF guard) | "URL aponta para endereço privado/local — não permitida." |
| Timeout 10s | "A página demorou demais para responder. Tente outra fonte ou tente mais tarde." |
| 401/403 | "Página exige autenticação. Use uma URL pública ou faça download e suba como TXT." |
| 4xx (outros) | "Página inacessível ({status}). Confirme se a URL está correta e pública." |
| 5xx | "O servidor da página retornou erro ({status}). Tente novamente mais tarde." |
| Mime não permitido | "Conteúdo não é HTML/TXT. Tente outra fonte." |
| Body > 5MB | "Página muito grande (>5MB). Use uma versão simplificada ou link específico." |
| HTML sem texto extraível | "Não foi possível extrair texto da página. Verifique se aponta para um artigo/documento." |

**UI:**
- `KbUploadDialog` ganha tabs `<TabsList>` ("Arquivo" / "URL"). Cada tab tem fluxo próprio.
- `KbSection` lista: ícone `<Link>` para `kind="URL"`, `<FileText>` para PDF/TXT. URL clicável (`<a target="_blank">`) com tooltip do domínio. Para URLs: ação extra "Atualizar conteúdo" (refetch).

#### C8. Atalho "Adicionar API Chatwoot (sugerida)"

Botão em `KbSection` (entre o trigger do dialog e a lista) com ícone Plus + label. Click abre `KbUploadDialog` na aba "URL" pré-preenchida com:
- Nome: "Chatwoot API Reference".
- URL: `https://www.chatwoot.com/developers/api/`.

Usuário ainda confirma o upload manualmente.

#### C9. URLs públicas Chatwoot por conta

**Schema:**

```prisma
model ChatwootAccountUrl {
  accountId   Int       @id @map("account_id")
  publicUrl   String    @map("public_url")
  label       String?
  updatedAt   DateTime  @updatedAt @map("updated_at")
  updatedById String?   @db.Uuid @map("updated_by_id")
  @@map("chatwoot_account_urls")
}
```

**Card "URLs Públicas Chatwoot" em `/configuracoes`** (super_admin only):
- Fonte de accounts: `src/lib/chatwoot/accounts.ts → listKnownAccountIds()` com `SELECT DISTINCT account_id FROM chatwoot_facts_daily_by_account ORDER BY account_id`. Se helper já existir em `src/lib/reports/active-account.ts`, reutilizar.
- Renderiza linha por account: `account_id` + label opcional + input `publicUrl` editável.
- Validação: HTTPS only, URL parse válida, max 512 chars, trim trailing slash.
- Actions:
  - `setChatwootAccountUrlAction({ accountId, publicUrl, label? })`: SELECT antes do UPSERT para capturar `previous`; depois UPSERT; depois `logAudit({ action: "setting_updated", target_type: "ChatwootAccountUrl", target_id: String(accountId), details: { previous, next } })`.
  - URL vazia → DELETE row se existia.
- Card explica: "Usado pelo Agente Nex para gerar links clicáveis das conversas em respostas."

**Agente Nex:**
- `composeSystemPrompt(cfg, kbDocs, accountUrls)` injeta seção `## URLs públicas das contas` com 1 bullet por account (apenas quando override desativado e há ao menos 1 account com URL).
- Override ativo: NÃO injeta. Documentado.

#### Audit log universal

Todas as mutações em prompt config, KB doc (upload/url/refresh/delete) e ChatwootAccountUrl ganham `logAudit({...})` com `action="setting_updated"` e `details={ previous, next }`.

---

### 3.D — `/agente-nex/consumo`

#### D1. PeriodPills compartilhado

Refatorar para usar `<PeriodPills>` de `src/components/reports/period-pills.tsx`. Adapter local trata "tudo" via `getMinReportDate(/* opcional */)` que retorna `minDate` (já vem como prop hoje). Demais pills (Hoje/7d/30d/90d/Personalizado) mapeiam 1:1.

Botões secundários (refresh, exportar) seguem `size` da Conversas (provavelmente `default` 40px). Decisão visual final pelo subagent UI/UX.

#### D2/D3/E. Calendar global

`src/components/ui/calendar.tsx`:
- Defaults novos:
  - `weekStartsOn: 1` (segunda-feira).
  - `showOutsideDays: false`.
- Aceita override via props (back-compat: telas que querem comportamento antigo passam explicitamente).
- Plan inclui task de validação: `react-day-picker` aceita `weekStartsOn` direto na prop OU via `locale.options.weekStartsOn` — investigar primeiro.

**Test:** snapshot de mês maio/2026 com `selected={{from: 2026-05-01, to: 2026-05-31}}` confirma que abril/2026 não exibe dias 1-2 maio nem dias 28-30 abril aparecem em maio.

#### D4. KPI cards uniformes

`<KpiCard>` ganha prop `subtitle?: ReactNode` (slot da 2ª linha). Container: `min-h-[128px]` para todos os 4 cards (justificativa: container responsivo precisa altura previsível para evitar layout shift entre 0 e 100k tokens). Grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4`.

| Card | Ícone | Subtitle |
|------|-------|----------|
| Total de chamadas | `Activity` (era `PhoneCall`) | "no período" |
| Tokens entrada | `Hash` | "no período" |
| Tokens saída | `Zap` | "no período" |
| Custo total | `DollarSign` | `≈ {USD} USD` |

#### D6. KPIs custo: 4 casas (round half-up)

Helpers `formatBrl4`/`formatUsd4` em `src/lib/llm/format.ts`. Aplicação: KPI Custo total + centro do donut.

#### D7. Gráfico "Custo por dia"

`<InteractiveAreaChart>` ganha props:
- `yAxisCurrency?: "USD" | "BRL"` (default undefined). Quando setado → eixo Y formata com prefixo `R$`/`$`, 2 casas decimais.
- `xAxisFontSize?: number` default 13 (era 12).
- `xAxisPadding?: number` default 12 (era 8).

Eixo X format: helper `formatXAxisDate(date)` → `30/ABR` (uppercase month-short pt-BR, sem ponto). Tooltip mantém estrutura `dd de mes · Custo (R$) R$ X,XXXX` com 4 casas.

#### D8. Gráfico "Custo por modelo"

`<InteractiveBarChart>` recebe mesma `yAxisCurrency` + `xAxisFontSize` + `xAxisPadding`. Labels de modelo truncados em 24 chars com `…` se necessário.

#### D9. PieChart tooltip lateral

`<DonutWithCenter>` ganha `tooltipPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right"` (default `top-right`). Implementação: `<Tooltip wrapperStyle={{ position: 'absolute', top: 8, right: 8, zIndex: 50 }} cursor={false} />`.

Tooltip content: nome do provedor em uma linha, `R$ X,XXXX (XX,X%)` em outra, `max-w-[180px]`.

Centro do donut: 4 casas (`formatBrl4`).

Múltiplos providers: legenda abaixo do donut (cor + label + percentual ordenados desc, z-index 0).

#### D11. "Histórico de chamadas"

Renomear "Chamadas detalhadas". Header: ícone `History` (lucide) + título.

#### D12. Paginação

Footer sticky com 3 zonas:
- Esquerda: "Mostrando {from}-{to} de {total}".
- Centro: input numérico "Página {n} de {total}" + ChevronLeft/Right.
- Direita: dropdown "{n} por página" (25 / 50 / 100, default 25).

Loading: tabela mantém altura mínima; overlay com Loader2.

#### D13. Drill-down `<UsageDetailSheet>`

Click em linha → abre `<Sheet side="right" className="w-full sm:w-[520px]">` com:

| Seção | Conteúdo |
|-------|----------|
| Identificação | ID, data/hora (BRT, dd/mm/aaaa hh:mm:ss), userId (label se tem), provider, model |
| Tokens | Entrada / saída / prompt chars / response chars |
| Duração | `formatDuration(ms)` (200ms → "200 ms"; 90s → "1 min 30 s"; 7200s → "2 h") |
| Custo bruto USD | `cost_usd` da row sem round (Decimal 10,6) |
| Cotação USD→BRL aplicada | `usdToBrlRate` (Decimal 10,4) ou "Cotação não armazenada (chamada anterior à v0.10)" |
| Spread cartão considerado | **A definir após auditoria** (task 1 do plan: ler `src/lib/llm/agent/usage-logger.ts` e `src/lib/llm/exchange-rate.ts` para confirmar se `usdToBrlRate` já tem spread embutido OU se é taxa base separada) |
| Custo final BRL | `cost_brl` (Decimal 12,6) sem round |
| Erro (condicional) | Alert vermelho com `errorMessage` |
| Ação | "Copiar JSON da chamada" |

**Comportamento:**
- Se row tem `errorMessage`, drill-down mostra alert + tokens/duração ainda exibidos (podem ser 0).
- Mudar de página com Sheet aberto → Sheet fecha automaticamente.

#### D14. Whisper sem tokens

UI:
- Linhas com `model="whisper-1"`: render "—" em colunas Tokens entrada/saída.
- Tooltip nos headers `<th>` Tokens: "Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam a chamadas de áudio."

Investigação backend (task no plan):
- Hipótese 1: painel OpenAI conta tokens emitidos pelo modelo subsequente que processou a transcrição.
- Hipótese 2: `usage-logger` tem bug em `tokensInput`/`tokensOutput` para Whisper.
- SQL diagnóstico: `SELECT DATE(created_at) AS dia, COUNT(*) chamadas, SUM(tokens_input) ti, SUM(tokens_output) tout, SUM(duration_ms) dur_ms FROM llm_usage WHERE model='whisper-1' AND created_at > '2026-04-01' GROUP BY DATE(created_at) ORDER BY 1`. Comparar com painel OpenAI.
- Resultado afeta apenas display + nota nesta release (a menos que seja bug claro de logger).

#### D15. Renomear colunas

| Atual | Novo |
|-------|------|
| Tokens in | Tokens de entrada |
| Tokens out | Tokens de saída |

`aria-label` corresponde.

#### D16. Filtros tabela (cascade)

2 selects acima da tabela, alinhados à direita:
- Provider: "Todos" + lista de providers distintos no período (server-side via `getDistinctProvidersInRange(start, end)`).
- Modelo: "Todos" + modelos distintos no período. **Cascade**: se Provider != "Todos", Modelo lista apenas modelos desse provider.

URL state: `?provider=openai&model=gpt-5.5`. Trocar provider reseta `model=undefined` (server invalida automaticamente se não pertence).

#### D17. Linha de total

`getUsageDetails` retorna `{ rows, total, totals: { costUsd, costBrl, tokensInput, tokensOutput, durationMsTotal, count } }` calculados via window functions ou subselect na mesma query (filtros aplicados uma vez):

```sql
WITH filtered AS (
  SELECT * FROM llm_usage
  WHERE created_at BETWEEN $1 AND $2
    AND ($3::text IS NULL OR provider = $3)
    AND ($4::text IS NULL OR model = $4)
)
SELECT (SELECT COUNT(*) FROM filtered) AS total,
       (SELECT SUM(cost_usd) FROM filtered) AS sum_cost_usd,
       (SELECT SUM(cost_brl) FROM filtered) AS sum_cost_brl,
       (SELECT SUM(tokens_input) FROM filtered) AS sum_tokens_input,
       (SELECT SUM(tokens_output) FROM filtered) AS sum_tokens_output,
       (SELECT SUM(duration_ms) FROM filtered) AS sum_duration_ms,
       row.* FROM filtered row
ORDER BY row.created_at DESC LIMIT $5 OFFSET $6;
```

Renderização: row sticky no topo da tabela com `bg-muted/40 font-semibold`. Label primeira coluna: "Total no filtro". Colunas sem totais (provider/modelo/data) exibem "—".

#### D18. USD/BRL bruto na tabela

`Intl.NumberFormat({minimumFractionDigits:2, maximumFractionDigits:6})` (padrão atual mantido). Linha de totais também bruto.

---

### 3.E — Calendar global → coberto em D2/D3.

### 3.F — URLs públicas → coberto em C9.

### 3.G — Doc / memory / deploy

- `package.json`: 0.15.4 → 0.16.0.
- `CHANGELOG.md`: entrada nova com 7 sections (A-G). Formato confirmado lendo CHANGELOG existente na primeira task do plan.
- `docs/STATUS.md`: release notes v0.16.0 + atualização de release anteriores resumidas.
- `design-system/nexus-insights/MASTER.md` (se existir): atualizar TierBadge variants, KpiCard subtitle, Calendar defaults.
- `docs/runbooks/` (path confirmado na primeira task do plan):
  - `agente-nex-prompt-v0.16.md`: prompt baseline, override, playground, KB URL, atalho Chatwoot API.
  - `consumo-drill-down-v0.16.md`: como interpretar cotação/spread; Whisper.
  - `chatwoot-account-urls.md`: como configurar URLs públicas e como o agente usa.
- Memory global: `project_v0.16_release.md` + atualização de `MEMORY.md`.
- Migration: `prisma/migrations/20260501_v0_16_kb_url_chatwoot_urls_audit/migration.sql` aplicada manualmente via runbook em produção:
  - `ALTER TABLE nex_kb_documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'PDF';`
  - `ALTER TABLE nex_kb_documents ADD COLUMN source_url TEXT NULL;`
  - `CREATE TABLE chatwoot_account_urls (...);`
  - `ALTER TABLE nex_settings ADD COLUMN seeded_defaults_at TIMESTAMPTZ NULL;`
  - Backfill condicional de guardrails.
- Deploy: `git push origin main` → CI build → Portainer redeploy → `gh run watch <id>` → smoke `/api/health` retorna `version=v0.16.0`, `status=ok`. Migration deploy manual antes do build se schema novo.

---

## 4. Arquitetura técnica

### 4.1 Componentes novos
- `src/components/agente-nex/prompt-preview-card.tsx` (C1).
- `src/components/agente-nex/playground-sheet.tsx` (C3, substitui `playground.tsx`).
- `src/components/agente-nex/kb-url-form.tsx` (C7).
- `src/components/llm/usage-detail-sheet.tsx` (D13).
- `src/components/llm/usage-table-filters.tsx` (D16).
- `src/components/settings/chatwoot-urls-card.tsx` (C9).
- `src/lib/format/date.ts` (`formatXAxisDate`, `formatDuration` se ainda inline).
- `src/lib/llm/format.ts` (`formatBrl4`, `formatUsd4`).
- `src/lib/nex/kb-url.ts` (URL fetcher + html-to-text + `assertPublicUrl`).
- `src/lib/chatwoot/accounts.ts → listKnownAccountIds()` (se ainda não existir).

### 4.2 Componentes alterados
- `src/components/ui/calendar.tsx` (E1, E2 — defaults).
- `src/components/ui/searchable-select.tsx` (B2 — `customMode`).
- `src/components/llm/tier-badge.tsx` (B3 — 4 variantes).
- `src/components/charts/area-chart.tsx`, `bar-chart.tsx`, `donut-with-center.tsx` (D7-D10).
- `src/components/agente-nex/llm-config-form.tsx` (B1, B2, B3).
- `src/components/agente-nex/prompt-config-form.tsx` (C2 — rename + AlertDialog ativação).
- `src/components/agente-nex/kb-section.tsx` (C7 tabs/atualizar, C8 atalho, A3 AlertDialog).
- `src/components/agente-nex/kb-upload-dialog.tsx` (C7 tabs).
- `src/components/llm/consumo-content.tsx` (D1, D11, D12, D13, D15, D16, D17, D18 — refator amplo).
- `src/components/reports/kpi-card.tsx` (D4 `subtitle`).
- `src/app/(protected)/agente-nex/chaves/page.tsx` (A1).
- `src/app/(protected)/agente-nex/configuracao/page.tsx` (B1).
- `src/app/(protected)/agente-nex/prompt/page.tsx` (C1, C3, C9 — actions header + listChatwootAccountUrls).
- `src/app/(protected)/configuracoes/page.tsx` (C9 card novo).
- `src/components/settings/llm-credentials-manager.tsx` (A2, A3, A4).
- `src/lib/nex/prompt.ts` (C1 isomórfico, C4 IDENTITY_BASE, C9 accountUrls 3º arg).
- `src/lib/llm/catalog.ts` (B3, B4).
- `src/lib/llm/queries/usage-stats.ts` (D16, D17).

### 4.3 Schema Prisma
- `enum NexKbKind { PDF TXT URL }`.
- `model NexKbDocument` ganha `kind`, `sourceUrl`.
- `model NexSettings` ganha `seededDefaultsAt`.
- `model ChatwootAccountUrl` (novo).
- Migration `20260501_v0_16_kb_url_chatwoot_urls_audit`.

### 4.4 Server Actions novas
- `addKbUrlAction({ name, url })` em `src/lib/actions/nex-prompt.ts`.
- `refreshKbUrlAction(docId)` em `src/lib/actions/nex-prompt.ts`.
- `setChatwootAccountUrlAction({ accountId, publicUrl, label? })` em `src/lib/actions/settings.ts`.
- `listChatwootAccountUrlsAction()` em `src/lib/actions/settings.ts`.

### 4.5 Funções backend
- `src/lib/nex/kb-url.ts` (fetcher + html-to-text + SSRF guard).
- `src/lib/nex/prompt.ts` aceita 3º arg `accountUrls`.
- `src/lib/chatwoot/accounts.ts → listKnownAccountIds()`.
- `src/lib/llm/queries/usage-stats.ts` aceita filtros + retorna totals.

### 4.6 Catálogo (B4)

Lista canônica completa em `docs/superpowers/plans/2026-05-01-suite-agente-nex-refinement.md` (Apêndice A) — gerada via WebFetch openrouter.ai/api/v1/models em 2026-05-01 + complementos do conhecimento marcados `notes: "estimado"`.

---

## 5. Requisitos não-funcionais

### 5.1 Acessibilidade
- Sheet drill-down + Sheet playground + AlertDialog: focus trap (já garantido por @base-ui).
- Esc fecha qualquer Sheet/Dialog/AlertDialog.
- Tab/Shift+Tab navega filtros, paginação, drill-down.
- Aria-labels em todos os componentes interativos novos.
- AlertDialog de ativação do Modo manual lê o aviso completo.

### 5.2 Tema
- Tudo respeita tokens light/dark do design-system.
- Smoke visual em ambos os temas antes de deploy. Padrão de cores premium (red-500) revisado pelo subagent UI/UX.

### 5.3 Performance
- Catálogo 118 modelos: SearchableSelect já tem busca client-side por substring; filtragem ≤ 50ms; render virtualizado se necessário (avaliar com top-50 entries visíveis).
- Preview client-side de prompt: composição completa < 50ms até 30k chars KB.
- KB URL fetch: timeout 10s + body cap 5MB + AbortController.

### 5.4 Auditoria
- Toda mutação ganha `logAudit({ action: "setting_updated", target_type, target_id, details: { previous, next } })`.
- Pattern: action faz SELECT antes do UPSERT/UPDATE para capturar `previous`.

### 5.5 Segurança
- KB URL fetch: SSRF guard via `assertPublicUrl(url)` bloqueia IPs privados/loopback/link-local e hostnames de cloud metadata.
- AlertDialog de exclusão impede ações destrutivas via duplo click acidental.
- Migrations aditivas (sem DROP) — rollback seguro.

---

## 6. Riscos e mitigations

| Risco | Mitigation |
|-------|------------|
| Migration falha em produção | Aditiva (NULL allowed em sourceUrl, default PDF em kind, seeded_defaults_at NULL); seed manual confirmado em runbook |
| Catálogo expansion com IDs inválidos | Plan task de smoke curl em top-10 modelos novos antes de commit |
| Tooltip do PieChart corta em viewport pequeno | Test em 375 / 768 / 1280 px |
| KB URL fetch pesado/SSRF | Cap 5MB, timeout 10s, AbortController, assertPublicUrl |
| Whisper discrepância | Investigação documentada (SQL + comparação OpenAI), sem refactor de logger nesta release |
| Reclassificação de tier muda UX | Documentar em CHANGELOG; ui-ux-pro-max valida visual |
| Override vs URL pública: comportamento confuso | Documentado em runbook + AlertDialog de ativação |
| Prompt preview client-side com KB grande | Cap KB total 30k chars (mantém); render `<pre>` em ScrollArea |
| Backfill guardrails ressuscita | Coluna `seeded_defaults_at` nova + condição `IS NULL` |
| Cascade de filtros invalida URL | Handler reseta `model` ao trocar `provider` |

---

## 7. Out of scope

- Multi-tenant: URLs ainda globais.
- KB com sitemap crawl.
- Histórico do playground persistente.
- A/B testing de prompts.
- Catálogo dinâmico (live OpenRouter API em runtime).
- Refactor do Whisper logger.
- i18n.

---

## 8. Critérios de aceite

- [ ] `/agente-nex/chaves` mantém narrow, header de provedor padronizado, AlertDialog em "Excluir", atalho "Criar API key" no card vazio.
- [ ] `/agente-nex/configuracao` com 4 tiers visuais (low/medium/high/premium → azul/amarelo/laranja/vermelho), modelo customizado inline (SearchableSelect customMode com X para limpar), catálogo expandido (≥118 modelos OpenRouter).
- [ ] `/agente-nex/prompt`:
  - Card "Prompt completo (preview)" no topo, atualização client-side, botões Copiar/Maximizar/Mostrar identidade fixa.
  - "Modo prompt manual" renomeado, tooltip claro, AlertDialog de ativação, validação não-vazio.
  - Playground em `<Sheet>` lateral acionado pelo header da página, max 20 mensagens FIFO, não persiste.
  - IDENTITY_BASE atualizado mencionando exclusivamente Nexus Chat / Insights, proibindo identidade de modelos comerciais.
  - Guardrails default seedados via `seeded_defaults_at` (one-shot).
  - KB com aba URL + SSRF guard + erros enumerados + atalho API Chatwoot.
- [ ] `/agente-nex/consumo`:
  - PeriodPills idêntica a Conversas.
  - KPIs uniformes 4 casas + `min-h-[128px]`.
  - Ícone Activity no card "Total de chamadas".
  - Gráficos com `R$`/`$` + 2 casas + fonte 13px + espaçamento 12px no eixo X.
  - Donut tooltip em `position={{x:8,y:8}}` top-right, centro 4 casas.
  - Tabela "Histórico de chamadas":
    - Filtros server-side cascateados (provider→modelo).
    - Totals server-side via subselect/window function.
    - Drill-down em Sheet com cotação/spread auditados.
    - Colunas "Tokens de entrada/saída".
    - USD/BRL bruto.
- [ ] `/configuracoes` com card "URLs Públicas Chatwoot" (lista accounts via `listKnownAccountIds`, salva via UPSERT, audit logado, URL vazia = DELETE).
- [ ] Calendar global: `weekStartsOn=1` e `showOutsideDays=false` em todos os usages; test snapshot maio/2026 confirma comportamento.
- [ ] Migration aplicada em produção (kind/sourceUrl/ChatwootAccountUrl/seeded_defaults_at/backfill guardrails).
- [ ] Audit log: cada mutação de prompt/KB/ChatwootAccountUrl loga `setting_updated` com `previous`/`next`.
- [ ] CHANGELOG/STATUS/runbooks/memory atualizados.
- [ ] /api/health: `version=v0.16.0`, `status=ok`.
- [ ] Suite de testes: ≥ 90 suites, ≥ 800 testes PASS; typecheck 0 erros.
- [ ] Catálogo: testes existentes (`pricing.test.ts`, `catalog.test.ts`) atualizados e PASS.
- [ ] Smoke real: super_admin (1) cadastra chave → (2) ativa Agente → (3) testa playground → (4) configura URL pública Chatwoot → (5) adiciona URL KB → (6) faz pergunta na bolha → (7) vê drill-down de chamada com cotação/spread.

---

## 9. Workflow do plan e implementação

Após aprovação desta spec:

1. **Plan v1 → v2 → v3** em `docs/superpowers/plans/2026-05-01-suite-agente-nex-refinement.md` com double-check.
2. Plan terá ~30-40 tasks granulares (TDD), agrupadas por bloco (A-G).
3. Tasks compartilhadas críticas (que tocam `package.json`, `CHANGELOG.md`, `prisma/schema.prisma`) são as últimas — minimizar risco de conflito multi-agente.
4. Implementação via **subagent-driven-development** — 1 subagent fresh por task, review entre tasks. Cada task de UI inclui `ui-ux-pro-max:ui-ux-pro-max` no prompt do subagent.
5. **First plan tasks (auditoria preliminar):**
   - **T0a**: ler `src/components/ui/alert-dialog.tsx` para confirmar API exata.
   - **T0b**: ler `src/lib/llm/agent/usage-logger.ts` + `src/lib/llm/exchange-rate.ts` para auditar como spread é aplicado hoje.
   - **T0c**: ler `CHANGELOG.md` (head) e `ls docs/runbooks/` para confirmar formato.
   - **T0d**: validar OpenRouter API com top-10 IDs novos via curl.
   - **T0e**: investigar Whisper tokens (SQL diagnóstico vs painel OpenAI).
6. Tasks de UI invocam `ui-ux-pro-max` no prompt do subagent obrigatoriamente.
7. Verification → audit → CHANGELOG/STATUS/runbook → memory → migration → push → gh run watch → /api/health.

---

## 10. Histórico de revisões

- **v1** (2026-05-01): rascunho inicial. 22 achados no pente-fino #1.
- **v2** (2026-05-01): incorporou os 22 achados. 29 achados no pente-fino #2 (mais profundo: SSRF, seeded_defaults_at, totals query, cascade, account_id source, etc).
- **v3** (2026-05-01): consolida os 51 achados. **Pronta para aprovação do usuário.**

---

**Fim da spec v3 final.**
