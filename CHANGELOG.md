# Changelog

## [v0.15.1] 2026-05-01 — Hotfix microfone bloqueado por Permissions-Policy

> Super_admin reportou: ao clicar no mic da bolha aparece "Acesso ao microfone negado" mesmo permitindo no browser.

### Causa

`next.config.ts` definia o header `Permissions-Policy: camera=(), microphone=(), geolocation=()` em **todas as rotas**. A diretiva `microphone=()` (lista de origens vazia) instrui o navegador a bloquear `getUserMedia` para microfone **independentemente da permissão do usuário**. Quando o `AudioRecorder` chamava `navigator.mediaDevices.getUserMedia({ audio: true })`, o browser disparava `NotAllowedError` antes mesmo de mostrar o prompt — daí o toast genérico "Acesso ao microfone negado".

### Fix

`Permissions-Policy: camera=(), microphone=(self), geolocation=()` — `(self)` libera o `getUserMedia` para microfone na própria origem (`insights.nexusai360.com`). Camera e geolocation seguem bloqueados.

### Notas

- Não toca no fluxo do AudioRecorder; apenas remove o bloqueio do navegador.
- Após deploy: hard refresh (Cmd/Ctrl+Shift+R) garante que o header novo seja recebido.

---

## [v0.15.0] 2026-05-01 — Suite Agente Nex (sidebar dedicado + áudio + prompt config)

### Adicionado

- **Menu lateral "Agente Nex"** com 4 sub-páginas (`/agente-nex/configuracao`, `/agente-nex/chaves`, `/agente-nex/prompt`, `/agente-nex/consumo`). Item antigo "Consumo IA" standalone removido.
- **Gravação de áudio na bolha** (record/pause/cancel/send) com cap de 5 min — Whisper API transcreve, IA responde texto. AbortController cancela uploads em flight.
- **Player de áudio** customizado no balão do user com 5 níveis de velocidade (1×/1.25×/1.5×/1.75×/2×) + seek.
- **Copy button universal** em mensagens do user E assistant (antes só nas da IA).
- **System prompt configurável** — personalidade + tom + guardrails (até 20 × 300 chars) + override avançado (até 50k chars), persistidos em `nex_settings` (singleton).
- **Base de conhecimento (KB)** — upload de PDFs/TXT (≤ 5 MB), extração via `pdf-parse`, sanitize NUL bytes, cap 30k chars no prompt total, lista visual com warnings de cap.
- **Playground inline** — testa prompt sem persistir; resposta no mesmo card; link "ver prompt usado".
- **Toggles** (audio + KB) no card "Recursos" com gating dinâmico de provider (mic só com OpenAI ativo).

### Mudado

- Tela "Consumo IA" migrou para `/agente-nex/consumo`. URL antiga `/configuracoes/consumo` mantém-se com **redirect 308**.
- `/configuracoes` perde os cards Nex (movidos para `/agente-nex`).
- `runNexAgent` lê system prompt **dinâmico** de `nex_settings` (não mais constante hardcoded). Suporta `promptOverride` + `isPlayground` (skip de logUsage).

### Schema (runtime via `ensureNexTables`)

- Nova tabela `nex_settings` (singleton id="global") com personalidade, tom, guardrails JSONB, advanced_override, audio_input_enabled, kb_enabled.
- Nova tabela `nex_kb_documents` (id, name, mime_type, file_size, char_count, extracted_text, ...) + index `created_at DESC`.
- `MODEL_PRICING` ganha `whisper-1` (per-minute, $0.006/min). Função `calculateCost` ganha 4º arg opcional `extras: { durationMs }`.
- Enum `AuditAction` ganha mais um targetType: `nex_prompt`, `nex_kb_document` (textuais — não afetam enum DB).

### Notas

- Whisper requer chave OpenAI ativa. Toggle audio com provider != openai persiste mas é desativado em runtime via `effectiveAudioEnabled = audio_input_enabled && provider==="openai"`.
- Áudio: `URL.createObjectURL` no client; após reload `audioBlobUrl` se perde — UI mostra fallback "(áudio expirado)" + transcrição preservada no localStorage.
- KB: cap por doc 100k chars; cap total 30k chars no prompt (último doc truncado com `[...truncado...]`).
- Workflow: spec v1→v2→v3 (22+26 achados de pente fino), plan v1→v2→v3 (25+29 achados). Subagent-driven-development com 28 tasks granulares. UI/UX Pro Max em todas as tasks UI.
- 89 suites / 760 tests PASS · typecheck 0 erros.

---

## [v0.14.3] 2026-05-01 — Hotfix dashboard: noResponse filtra activity msgs + ordem chart-noresponse + nav compacto + cache bump

### Fix

- **`noResponse` (card "Conversas sem resposta") mostrava "Tudo respondido" mesmo com conversa real do contato sem resposta**: a CTE `last_msg` pegava a "última mensagem" sem filtrar tipo. Como o Chatwoot grava mensagens de **activity** (atribuição, reabertura, etc.) e **template** na mesma tabela `messages` com `message_type` 2 e 3, a "última msg" frequentemente era um evento de sistema, fazendo o filtro `lm.message_type=0` (incoming) falhar. Agora a CTE filtra `WHERE m.message_type IN (0, 1)` (apenas incoming/outgoing reais), e a "última" passa a ser de fato a do contato ou do agente.
- **Cache key bump v7→v8** — descarta possíveis stale do v0.14.2 enquanto investigamos o bug de Semana/Mês mostrar 0 em 01/05 (provavelmente cache, mas defensivo).

### Mudou

- **Ordem dos componentes**: chart "Conversas por hora/dia" sobe para **acima** de "Conversas sem resposta" + "Atendentes mais rápidos" (era abaixo). Pedido do João.
- **`<PeriodNavigator>` ainda mais compacto**: ícones h-5 w-5 (era h-6 w-6), texto `text-[11px]` (era text-xs/sm), padding interno menor. Borda violeta `border-violet-500/50` com shadow violeta sutil. Hover intensifica para `border-violet-500` + shadow maior. Texto branco-violeta puro para destaque.

### Verificação

- 674 testes / 77 suites PASS · typecheck 0 erros · build verde local.

---

## [v0.14.2] 2026-05-01 — Coorte por atividade (open/pending) + chart Dia full-width + nav compacto

> Bug crítico reportado pelo João: conversa criada em 30/04 e **reaberta** em 01/05 às 5h15 não aparecia em "Abertas (no período)" nem no gráfico do dia 01/05 — tudo zerado. Causa: SQL filtrava por `created_at ∈ período` (decisão da v0.10 "mesma coorte"), perdendo conversas reabertas. Corrigido para usar `last_activity_at` nas séries que falam de **atividade** (open/pending/no-response).

### Mudou

- **`dashboard-data.ts` chart query**: `received`/`resolved` continuam por `created_at` (coerência com KPIs); `open`/`pending` passam a usar `last_activity_at` no bucket. Implementado via `FULL OUTER JOIN` de duas CTEs (`created_buckets` + `activity_buckets`).
- **KPI "Abertas (no período)"**: filtra `status=0 AND last_activity_at ∈ período` (era `created_at`).
- **`byTeam`/`topInboxes`**: filtram por `last_activity_at` (open=0, pending=2, snoozed=3 com atividade no período).
- **`byStatus`**: status 0/2/3 por `last_activity_at`; status 1 (resolved) mantém `created_at`.
- **`noResponse`** (card hero + drill-down): filtra `last_activity_at ∈ período + status=0 + última msg é do contato`. Captura conversas reabertas com mensagem aguardando resposta.
- **Cache key bump**: `dashboard-data-v6` → `v7`.
- **Chart "Dia" full-width**: removido scroll horizontal de 24 buckets. Agora todos os modos (Dia/Semana/Mês) usam `<ResponsiveContainer width="100%" height={350}>`. Eixo X com `interval="preserveStartEnd"` + `minTickGap={20}` para auto-deduplicar labels apertados.
- **`<PeriodNavigator>` compacto**: padding menor (h-6 w-6 ícones), borda violeta sutil (`border-violet-500/40`), hover violeta (`hover:border-violet-500/70 hover:bg-violet-500/5`), focus ring violeta. Largura auto-ajustável conforme label.

### Verificação

- 674 testes / 77 suites PASS · typecheck 0 erros · build verde local.

---

## [v0.14.1] 2026-05-01 — Hotfix Agente Nex × Matrix IA: cast PG + role explícito

> Dois bugs descobertos pelo super_admin testando o Nex em todas as configurações de visibility do Matrix IA:
>
> 1. **`could not determine data type of parameter $2`** quando visibility = "Todos". A tautologia que eu introduzi no v0.13.9 (`($2 IS NOT NULL)`) não passa no planner do Postgres sem cast — o param só aparecia em `IS NOT NULL`, sem comparação que dê pista de tipo, e o pg falhava no prepare statement.
> 2. **Visibility `super_admin_only` excluía Matrix IA mesmo logado como super_admin.** `auth()` chamada **dentro** de outra Server Action (Nex action → `runNexAgent` → `shouldExcludeMatrixIA`) podia retornar `null` no Next.js 16, levando a função a tratar como "sem role" e excluir por segurança.

### Fix 1: cast `::integer` na tautologia

`src/lib/llm/tools/executor.ts → matrixIAClause()`:
```ts
return excludeMatrixIA
  ? `c.inbox_id <> $${paramIdx}::integer`
  : `($${paramIdx}::integer IS NOT NULL)`;
```
Cast explícito força o tipo do parâmetro durante o `prepare`, antes do planner tentar inferir do contexto. Resolve o erro tanto no caminho exclude quanto no não-exclude.

### Fix 2: role explícito em vez de `auth()` reentrante

- Nova função `shouldExcludeMatrixIAForRole(role)` em `src/lib/reports/exclude-matrix-ia.ts` que aceita o role como parâmetro (não consulta `auth()`).
- `runNexAgent` ganha campo opcional `platformRole` em `RunNexInput`.
- `sendNexMessage` (action) extrai `platformRole` da session que **já resolveu** e passa direto pro `runNexAgent`. Mesma fonte de verdade, sem reentrância.
- `shouldExcludeMatrixIA()` (assinatura sem argumentos) continua existindo como wrapper para chamadores que não têm role à mão (queries de relatórios).

### Resultado esperado

- visibility = `Todos` → Nex inclui Matrix IA, conta funciona sem erro de PG.
- visibility = `super_admin_only` + super_admin logado → Nex inclui Matrix IA.
- visibility = `super_admin_only` + viewer/manager → Nex exclui Matrix IA.
- visibility = `Ninguém` → Nex exclui para todos.

### Outras notas

- 77 suites / 674 tests PASS · typecheck 0 erros.

---

## [v0.14.0] 2026-05-01 — Dashboard chart polish: navegação por período + eixo cheio + sem dots/legenda

### Mudou

- **Pill "Hoje" → "Dia"** no `DashboardFilters` (tipo `DashboardPeriod = "dia" | "semana" | "mes"`).
- **Backend `getDashboardPeriod` aceita `referenceDate?: Date`** — permite navegar entre períodos. `dashboardData` aceita `forcedGranularity` para garantir que "Mês" use granularity=day mesmo quando window é só 1 dia (mês atual com referenceDate=hoje).
- **Range cobre período inteiro**: "Semana" vai segunda → domingo (ou dia configurado), "Mês" vai dia 1 → último dia do mês — mesmo dias futuros entram (vazios, como o user pediu). Era `endOfDay(now)`, agora `endOfWeek/endOfMonth(refInTz, ...)`.
- **`actions/dashboard.ts`** retorna `nextAvailable` (false quando range.end >= now) para o frontend habilitar/desabilitar setinha forward.
- **Cache key bump**: `dashboard-data-v5` → `v6` (por adição de `forcedGranularity`).

### Adicionado

- **`<PeriodNavigator>`** novo componente (`src/components/dashboard/period-navigator.tsx`):
  - Setinha ← / texto / setinha → no canto superior direito do chart.
  - Label adaptativo: "01/05" para Dia, "27/04 — 03/05" para Semana, "MAI/26" para Mês (3 letras + ano abreviado).
  - Navegação livre para o passado (sem trava — vai até primeiro dia de dados de fato; backend retorna 0/0 se data sem dado). Setinha forward desabilitada quando range.end já cobre `agora`.
- **State `referenceDate`** no `dashboard-content.tsx`. Reset para `null` quando period muda.

### Polish

- **Chart sem `<Legend>`** recharts (a legenda ficava redundante com os checkboxes).
- **Chart sem `dot={true}`** nos pontos (`dot={false}` mantido).
- **Chart full-width** quando `granularity="day"` (Semana/Mês) — `<ResponsiveContainer width="100%" height={350}>` direto sem wrapper de width fixo.
- **Chart com scroll horizontal** apenas quando `granularity="hour"` (Dia) — 24 buckets centralizando na hora atual ou no meio do dia para datas passadas.
- **Eixo X completo** via `fillBuckets(data, granularity, tz, range)` — preenche TODOS os dias/horas do range com 0/0 quando não há dado.

### Fix

- **`formatWaiting` em "Conversas sem resposta"** centralizado em `formatDuration` (`@/lib/utils/format-time`) — agora usa "1 dia"/"3 dias" depois de >= 24h em vez de "82h 40min". Aplicado no `NoResponseCard` e no `NoResponseDrillDownContent`.

### Verificação

- 674 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.9] 2026-05-01 — Agente Nex respeita visibility do Matrix IA

> O Agente Nex hardcodava `inbox_id <> 31` em **todas** as queries de tools — independentemente da configuração de visibility. Agora ele respeita a regra 3-níveis igual ao resto do app: `all` (vê), `super_admin_only` (super_admin vê, demais não) e `none` (ninguém vê).

### Causa

`src/lib/llm/tools/executor.ts` (executor das tools do Nex) tinha 7 funções com `c.inbox_id <> $2` cravado direto no SQL. Foi escrito assim no v0.7 quando o Matrix IA era sempre excluído por design. Quando v0.11.0 introduziu a regra 3-níveis (e v0.12.1 corrigiu o bug do "Ninguém"), o Nex ficou desalinhado — continuou ignorando a inbox 31 mesmo quando a config dizia "Todos".

### Fix

- **`executor.ts`** ganhou helper `matrixIAClause(excludeMatrixIA, paramIdx)` que devolve `c.inbox_id <> $N` quando deve excluir, ou `($N IS NOT NULL)` (tautologia, sempre `TRUE`) quando não. A tautologia preserva o índice de parâmetros — zero refactor nos `++p`/`$3`/`$4`/etc subsequentes.
- **`executeTool(name, args, accountId, excludeMatrixIA)`** propaga o flag para todas as 7 funções afetadas (`queryConversations`, `queryMessages`, `aggregateConversations`, `getTopAgents`, `getDashboardSummary`, mais 2 no path agg secundário).
- **`runNexAgent`** chama `shouldExcludeMatrixIA()` UMA vez no início da conversa e passa para cada `executeTool`. Mesma fonte da verdade que `/dashboard`, `/relatorios/conversas`, etc.

### Resultado

- Visibility = `all` (Todos): Nex vê e responde sobre conversas da inbox 31 (Matrix IA).
- Visibility = `super_admin_only`: super_admin vê, viewer/manager não.
- Visibility = `none`: Nex não vê para ninguém (inclusive super_admin).

### Outras notas

- 77 suites / 672 tests PASS · typecheck 0 erros.
- Mock de `shouldExcludeMatrixIA` adicionado em `run-nex.test.ts` (NextAuth não roda em ambiente Jest).

---

## [v0.13.8] 2026-05-01 — Hotfix RSC error: simplifica dashboard-settings

> O v0.13.7 trazia o pipeline `getDashboardPeriod + getDashboardSettings` de volta, mas o dashboard mostrou "An error occurred in the Server Components render. The specific message is omitted in production builds...". A combinação `import "server-only"` + `let cache` module-level + import via Server Action files (`actions/dashboard.ts` e `actions/dashboard-drill-down.ts`) parece causar bundling/RSC issue no Next.js 16.

### Mudou

- **`src/lib/dashboard-settings.ts` simplificado**:
  - Removido `import "server-only"` (a função continua server-only de fato — `pgPool` é server-only).
  - Removido `let cache` module-level. Lê DB toda vez (chamada raríssima — settings change manual via super_admin).
  - `invalidateDashboardSettings()` virou no-op (mantido por compat).
  - SQL muda de `WHERE key = ANY($1::text[])` para `WHERE key IN ('...', '...', '...')` (sem parâmetros, mais resiliente).
  - `WeekStartsOn` e `DashboardMode` re-exportados daqui (centralização).
  - `DASHBOARD_DEFAULTS` exportado para uso pelos Server Actions.

- **`src/lib/actions/dashboard.ts` e `dashboard-drill-down.ts` simplificados**:
  - Imports cleaner — só o que é usado em runtime.
  - Try/catch defensivo individual em volta de cada `await getPlatformTz()` e `await getDashboardSettings()`.
  - Uso direto de `DASHBOARD_DEFAULTS` em vez de declarar `FALLBACK_SETTINGS` local.

### Verificação

- `npm test` 668 testes / 76 suites PASS (1 suite alheia falha pré-existente sem relação) · typecheck 0 erros · build verde.

---

## [v0.13.7] 2026-05-01 — Dashboard chart redesenhado: 4 séries multi-cor + checkboxes + eixo cheio respeitando configs

> Resolve 4 problemas reportados pelo João após o v0.13.3:
> 1. Tempo de resposta mostrava "1d", "3d" — usuário queria "1 dia", "3 dias".
> 2. Filtro "Semana" mostrava rolling 7d (esquerda do hoje) em vez de **semana atual** configurada (segunda → domingo).
> 3. Filtro "Mês" idem — mostrava rolling 30d em vez de **mês atual** (dia 1 → fim).
> 4. Gráfico tinha apenas 2 séries (Recebidas, Resolvidas), fontes pequenas e sem opção de selecionar séries.

### Mudou

- **`formatDuration` em `src/lib/utils/format-time.ts`** passa a usar `"1 dia"` / `"3 dias"` em vez de `"1d"` / `"3d"`. Mantém formatos de horas/minutos/segundos.
- **`actions/dashboard.ts` e `actions/dashboard-drill-down.ts` voltam a usar `getDashboardPeriod` + `getDashboardSettings`** (rolledback indevidamente no v0.13.3). Agora com **try/catch defensivo** em volta de cada read de settings — se algo falha, usa `FALLBACK_SETTINGS` (segunda + atual + atual) e o dashboard continua abrindo.
- **`getDashboardData` retorna `settings`, `tz` e `range`** no payload — frontend usa para preencher o eixo X corretamente.

### Adicionado

- **`ConversationsLineChart` redesenhado**:
  - **4 séries** com cores conforme feedback: Recebidas → verde (`#22c55e`), Abertas → amarelo (`#f59e0b`), Resolvidas → azul (`#3b82f6`), Pendentes → roxo (`#8b5cf6`).
  - **Checkboxes** para mostrar/ocultar séries (preferência persistida em `localStorage`).
  - **Eixo X cobre todo o período configurado**: 24 horas em "Hoje" (com rolagem horizontal centrando na hora atual), todos os dias da semana atual em "Semana", todos os dias do mês em "Mês". Buckets vazios renderizam como 0 — antes só apareciam dias com dados.
  - **Fontes maiores**: eixo X 13px (era 11px), eixo Y 13px (era 11px), `tickMargin=14` (era 12).
  - Tooltip enriquecido com bullet colorido + tabular-nums.
  - Cache key bumped → `dashboard-data-v5` (chart agora retorna 4 séries).

### Cuidado tomado para evitar repetir o crash do v0.13.0

- Componente usa `<ResponsiveContainer width="100%" height="100%">` dentro de `<div style={{ width: <number>, height: 350 }}>` — pai com **dimensões fixas explícitas**, não dinâmicas.
- `useEffect` para centrar scroll com guards (`!scrollRef.current` retorna early).
- Sem `expandFullDay` recursivo nem cálculo de offset com TZ do navegador.

### Verificação

- `npm test` 671 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.6] 2026-05-01 — Mensagens dos providers em PT-BR + probe com orçamento de tokens compatível com reasoning

> Dois ajustes em cima do v0.13.5: (1) probe de Testar conexão batia em "max_tokens or model output limit was reached" em modelos reasoning (gastam tokens internos no thinking) — `max_completion_tokens` subiu de 1 para 256. Aproveitamos para tratar essa mensagem específica como **conexão OK**. (2) Toda mensagem em inglês vinda dos providers (OpenAI/Anthropic/Gemini/OpenRouter) agora passa por um tradutor que cobre os padrões mais comuns.

### Probe ajustado

- `deepTestOpenAI` reasoning: `max_completion_tokens: 256` (era 1) — cobre thinking + resposta curta com folga. Custo do teste em `gpt-5.4-mini`: ~$0,000512.
- `deepTestOpenAI` non-reasoning: `max_tokens: 16` (era 1) — margem maior para qualquer modelo conservador.
- `400 "max_tokens or model output limit was reached"` agora é tratado como `reachable: true` (a chave e o modelo funcionam, só faltou orçamento no probe).

### Tradutor de mensagens (PT-BR)

Novo helper `translateProviderMessage(raw, model)` que mapeia padrões em inglês para PT-BR. Cobre:

- `"only supported in v1/responses"` → "Este modelo (X) só funciona via API 'Responses' da OpenAI. O Agente Nex ainda não suporta — escolha outro modelo (gpt-5-mini, gpt-5.4-mini, gpt-4.1-mini ou similar)."
- `"does not exist or you do not have access"` → "Modelo X indisponível nesta chave (acesso restrito ou ID inválido)."
- `"do not have access"` → "Sua chave não tem acesso a este modelo. Verifique o tier da sua conta na OpenAI."
- `"max_tokens or model output limit was reached"` → "O modelo não conseguiu completar a resposta no orçamento de tokens do teste — mas a chave e o modelo funcionam." (note: hoje já viramos `reachable: true` antes de chegar aqui).
- `"context length exceeded"`, `"insufficient_quota"`, `"rate_limit"`, `"invalid api key"` — todos com mensagens equivalentes em PT-BR.
- Sem padrão conhecido → retorna a mensagem original (melhor inglês que perder informação).

Aplicado em **todos os caminhos de erro** de `deepTestOpenAI`, `deepTestAnthropic`, `deepTestGemini` e `deepTestOpenRouter`. O prefixo "OpenAI:" / "Anthropic:" / etc. saiu — agora a mensagem fica direta.

### Outras notas

- 77 suites / 671 tests PASS · typecheck 0 erros.
- API "Responses" da OpenAI (necessária para `gpt-5.1`, `gpt-5.5` em alguns casos) fica como follow-up futuro — por ora a mensagem orienta o super_admin a escolher um modelo compatível.

---

## [v0.13.5] 2026-05-01 — Catálogo LLM com IDs reais da OpenAI (remove modelos inventados)

> **DEFINITIVO** para o problema "Modelo gpt-5.1-mini não encontrado neste provedor". A causa **real** estava no `PROVIDER_CATALOG` do nosso app, que listava modelos como `gpt-5.1-mini`, `gpt-5.1-nano`, `gpt-5.2`, `gpt-4.1-nano`, `o4-mini`, `o3-mini` — IDs que **não existem na OpenAI**. Foram inventados pelo agente que atualizou o catálogo no v0.11.0 (commit `fae51ae`). A OpenAI sempre retornou 404, e nossa UI mostrava "Modelo X não encontrado" — o que era literalmente verdade, porque o ID não existia em lugar nenhum.

### Como descobri

Validei a lista canônica da OpenAI em [`developers.openai.com/api/docs/models/all`](https://developers.openai.com/api/docs/models/all) (cutoff May/2026). A família GPT-5 que existe oficialmente é: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1` (sem mini/nano), `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5-codex`, `gpt-5.3-codex`, `gpt-5.1-codex-mini`. Variantes não citadas (especificamente "gpt-5.1-mini" puro) não existem.

### O que mudou

- **`PROVIDER_CATALOG.openai.models`** reescrito com os 19 IDs reais da OpenAI. Removidos: `gpt-5.1-mini`, `gpt-5.1-nano`, `gpt-5.2`, `gpt-5.2-mini`, `gpt-4.1-nano`, `o1-mini`, `o3-mini`, `o4-mini`. Adicionados: `gpt-5.5-pro`, `gpt-5.4-pro`, `gpt-5.4-nano`, `gpt-5-nano`, `gpt-5-codex`, `gpt-5.3-codex`, `gpt-5.1-codex-mini`, `o3-pro`, `gpt-4`.
- **`MODEL_PRICING`** alinhado: removidas as entradas de IDs inventados, adicionadas as dos IDs reais.
- **`PROVIDER_CATALOG.openrouter.models`**: removido `openai/gpt-5.1-mini`; adicionado `openai/gpt-5-mini` e mantido `openai/gpt-5.4-mini`.
- **Mensagem de erro** (já v0.13.4) agora mostra body literal da OpenAI **+ sugestão de modelos compatíveis** que a chave do super_admin tem acesso (vindos de `GET /v1/models`). Ex.: tenta `gpt-5.1-mini` → toast diz `OpenAI: The model 'gpt-5.1-mini' does not exist. Sua chave tem acesso a snapshot(s) compatível(is): gpt-5-mini, gpt-5.4-mini`.
- Tests `pricing.test.ts` e `catalog.test.ts` atualizados — incluem assertion que IDs inventados (`gpt-5.1-mini`, `gpt-4.1-nano`, `o4-mini`) **não estão** no catálogo.

### Para o super_admin

A partir desta release o select de Modelo no card "Agente Nex" só mostra IDs que a OpenAI realmente reconhece. **O modelo equivalente ao "GPT-5.1 mini" que você queria é `gpt-5-mini`** (sem o ".1") — esse existe e funciona.

### Outras notas

- Ainda existe `allowCustomModel: true` no catálogo: a opção "Outro (digitar manualmente)" continua disponível pra colar IDs novos da OpenAI quando lançarem.
- 77 suites / 670 tests PASS · typecheck 0 erros.

---

## [v0.13.4] 2026-05-01 — Mensagem real do provider quando o modelo é rejeitado

> Quando o super_admin tenta usar um modelo que a chave da OpenAI não tem acesso (típico em GPT-5.x para contas Tier 1-3), a UI mostrava genericamente "Modelo X não encontrado neste provedor" — sem dizer **se** era nome errado, falta de acesso ou problema na chave. Esta release captura o body literal da resposta da OpenAI e mostra exatamente o que ela disse.

### O que mudou

- **`deepTestOpenAI`** agora trata 404 **e 400** com extração do body. Quando a OpenAI retorna `{ "error": { "message": "The model 'gpt-5.1-mini' does not exist or you do not have access to it" } }`, o toast no card "Agente Nex" passa a mostrar exatamente essa frase (em vez da mensagem genérica do nosso código).
- **`describeErrorKind`** preserva o `fallback` (mensagem do provider) quando `errorKind === "model_not_found"` em vez de sobrescrever pela mensagem padrão.
- O super_admin consegue distinguir três cenários:
  - `you do not have access to it` → conta precisa subir de tier ou pedir acesso ao modelo na OpenAI.
  - `does not exist` → nome do modelo está incorreto.
  - HTTP 400 com outra mensagem → problema no payload (ex.: `temperature` em modelo reasoning) — devolvemos o erro literal pra debug.

### Outras notas

- 77 suites / 670 tests PASS · typecheck 0 erros.

---

## [v0.13.3] 2026-05-01 — Hotfix dashboard ainda quebrado: rollback de getDashboardPeriod/getDashboardSettings

> Após o v0.13.2 (que simplificou o `ConversationsLineChart`), João reportou que o dashboard **continua mostrando "Erro de conexão com o servidor"** — significa que a Server Action `getDashboardData` está lançando exception, não retornando `{success: false, error: ...}`. A causa NÃO era o ConversationsLineChart (já simplificado em v0.13.2). A causa real está em algum dos novos pipelines do v0.13.0: `getDashboardPeriod` + `getDashboardSettings` + `pgPool.query` em tabela `app_settings` JSONB.

### O que mudou no v0.13.3

- **`actions/dashboard.ts` voltou para a lógica simples pré-v0.13.0**: `periodRanges()` interno calcula rolling 24h/7d/30d direto (sem `getDashboardPeriod`, sem `getDashboardSettings`). Tipo `DashboardPeriod` mantido (`"hoje" | "semana" | "mes"`) — o front já usa.
- **`actions/dashboard-drill-down.ts` idem**: `resolvePeriodRanges()` interna sem `getDashboardPeriod` / `getDashboardSettings`.
- **Frontend mostra mensagem de erro REAL** (não mais "Erro de conexão com o servidor" genérico) — `err.message` exposto.

### Implicações funcionais

- **"Semana" volta a ser rolling 7 dias**, não "segunda → hoje". Configuração em `/configuracoes` deixa de ter efeito sobre os filtros (o card UI continua existindo mas é cosmético até o re-fix).
- **"Mês" volta a ser rolling 30 dias**, não "dia 1 → hoje".
- **`comparison.open` continua sendo computado** (mudança em `dashboardData` query continua intacta).
- **Tudo o mais do v0.13.0 continua intacto**: paginação 50/pg, drill-down genérico de status, formatRelativeShort, KpiClickableCard sem overlap, DashboardSettingsCard UI (apesar de cosmético).

### Roadmap

- A causa raiz de `getDashboardPeriod` ou `getDashboardSettings` lançar precisa investigação com **logs do container Portainer** (acesso direto, não via gh API). Será reaplicado em release futura com **smoke test em produção antes do redirect 100% do tráfego**.

### Verificação

- `npm test` 670 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.2] 2026-05-01 — Hotfix dashboard quebrado: ConversationsLineChart simplificado

> Imediatamente após o deploy do v0.13.0, João reportou que o dashboard `/dashboard` não abria — "tem uma mensagem de erro e não aparece nada". A causa foi a reescrita agressiva do `ConversationsLineChart` no v0.13.0 (Pacote H/T11) que combinou: scroll horizontal com largura dinâmica calculada por JS + `<ResponsiveContainer>` aninhado num `<div style={{ width: number }}>` + função `expandFullDay` chamando `Intl.DateTimeFormat` em loop com locale-aware parsing — interação frágil entre recharts ResizeObserver, container scrollable e Tailwind, gerando layout instável ou crash de hidratação dependendo do browser/cache.

### Correção

- **`ConversationsLineChart` voltou a uma versão minimalista**: `<ResponsiveContainer width="100%" height={320}>` em pai sem largura dinâmica, sem scroll horizontal, sem `expandFullDay`, sem `fromZonedTime` no client. Mantém:
  - Sem toggle linha/barra (mantida a remoção do v0.13.0).
  - `tickMargin={12}` no eixo X (mantido o respiro do v0.13.0).
  - Ícone violeta no header (mantido).
- **TZ explícita no SQL bucket continua aplicada** (essa fix do v0.13.0 era segura — só queries server-side).
- **Tudo o resto do v0.13.0 continua intacto**: configurações de dashboard (semana/mês configuráveis), comparison.open, variação relativa em rate, paginação 50/pg, drill-down de status genérico, formatRelativeShort, etc.

### Roadmap

- O scroll horizontal centralizado na hora atual + eixo cheio 0–24h continua sendo um nice-to-have — vamos reaplicar em release futura **com testes visuais reais antes do deploy**, em vez de combinar 4 mudanças complexas no mesmo componente.

### Verificação

- `npm test` 670 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.1] 2026-04-30 — Backfill BRL no relatório de Consumo do Agente Nex

> Estende o backfill do v0.12.3 para também popular `cost_brl` e `usd_to_brl_rate` em chamadas antigas que estavam com BRL = NULL. Antes desta release, todas as chamadas anteriores ao v0.12.0 mostravam "—" na coluna Custo BRL e contribuíam com R$ 0 nos totais — porque a tabela `llm_usage` não tinha as colunas BRL na época. Agora todos os relatórios de Consumo (KPIs, charts e tabela detalhada) mostram valores em reais para todas as chamadas registradas.

### O que mudou

- **`backfillUsageCosts()` ganhou uma segunda etapa** que aplica `cost_brl = cost_usd × rate_atual` e `usd_to_brl_rate = rate_atual` em todas as rows com `cost_brl IS NULL AND cost_usd > 0`. Idempotente — segunda execução não toca nada porque o filtro `IS NULL` deixa de matchear. Roda automaticamente em `ensureLlmTables()` no primeiro request após o deploy.
- Como **perdemos a cotação histórica de cada chamada** (não foi gravada na época), o backfill aplica a **cotação atual** (commercial × spread cartão, AwesomeAPI cache 4h) — é uma aproximação. Chamadas registradas a partir do v0.12.0 continuam tendo a cotação real do dia da chamada. Apenas as **antigas** ganham essa aproximação retroativa.
- O log do container registra: `[backfill-usage-costs] cost_brl populado em N rows com taxa X.XXXX (live|cache|fallback)`.

### Comportamento da UI após o deploy

- KPI "Custo total": valor BRL agora reflete o total real (USD primário continuou correto desde o v0.12.3).
- Gráficos "Custo por dia / por modelo / Distribuição por provider": rendem em BRL com valores reais.
- Tabela "Chamadas detalhadas": coluna **Custo BRL** mostra `R$ 0,00XXXX` (mín. 3, máx. 6 casas decimais) em todas as chamadas; cotação aplicada disponível no campo `usd_to_brl_rate` (não exibido, mas auditável).

### Outras coisas

- 77 suites / 670 tests PASS · typecheck 0 erros.

---

## [v0.13.0] 2026-04-30 — Dashboard polish: variação relativa, semana/mês inteligentes, drill-downs completos

> Resolve 11 problemas reportados pelo super_admin via screenshots no dashboard `/dashboard` e nos drill-downs dos KPIs, mais 5 melhorias incidentais no `ConversationsLineChart`. A spec passou por dois pente-finos reais (12+5 achados corrigidos) antes da implementação. Implementação via subagent-driven-development com TDD nos helpers puros.

### Novidades

- **Configurações de Dashboard** em `/configuracoes` (super_admin):
  - Início da semana — qualquer dia 0–6 (default: segunda-feira).
  - Modo da semana: **Semana atual** (do dia configurado até hoje) ou **Últimos 7 dias** (rolling).
  - Modo do mês: **Mês atual** (do dia 1 até hoje) ou **Últimos 30 dias** (rolling).
  - Defaults respeitam mês/semana atual — alinhado com a expectativa de "ver o mês que estou vivendo, não 30 dias atrás".
- **Drill-down de status completo** para Resolvido / Pendente / Adiado (antes só "Aberto" tinha drill detalhado; demais mostravam mensagem "será adicionado em uma versão futura").
- **Paginação server-side** (50/pg, cap 200) na lista de conversas dos drill-downs **Recebidas** e **Resolvidas** (era limitada a 20).
- **`comparison.open`** em `dashboardData` — KPI "Abertas" passa a mostrar `±%` vs período anterior, eliminando o badge "Novo".
- **Eixo X cheio 0–24h** no gráfico "Conversas por hora" quando o filtro é "Hoje" — preenche horas vazias com 0/0; scroll horizontal centralizado na hora atual (12h visíveis em desktop, 6h em mobile).

### Mudado

- **Pills de período renomeadas**: `7 dias` → `Semana`, `30 dias` → `Mês`. Tipo `DashboardPeriod` agora é `"hoje" | "semana" | "mes"`.
- **Card "Taxa de resolução"**: indicador troca `pp` por **variação relativa em `%`** (`±X.X%`).
- **`KpiClickableCard`**: hint "Ver detalhes" sai de cima do sparkline (vai para abaixo do trend, alinhado à direita, fade-in em hover/focus). Sem fallback "Novo" — quando não há trend, canto fica vazio.
- **Tabelas dos drill-downs**: tempo relativo curto (`há 2h`, `há 3d`, `há 2m`, `há 2a`) em vez de `há cerca de 2 horas` (corrige aparência de fora-de-ordem do `formatDistanceToNow`).
- **`getOpenDrillDown`** virou **`getStatusDrillDown`** parametrizado por `status: 0|1|2|3`. Wrapper de compat mantém callers antigos com `status=0`.
- **`diffPp` deprecated** em `getResolutionRateDrillDown` — adicionado `diffPct` (variação relativa em `%`). Subtitle do drill-down passa a mostrar valores absolutos atual/anterior + variação.
- **Tooltip do gráfico por hora** (no drill-down "Recebidas" e "Resolvidas"): nome do bucket passa de `14h` para `14:00 – 14:59` (deixa explícita a janela coberta).
- **`ConversationsLineChart`** removeu o toggle linha/barra (mantém só linhas) e passa a usar `tickMargin=12` no eixo X (era colado).

### Corrigido

- **Filtro "7 dias"** agora respeita `dashboard.week_mode` (default = semana atual a partir de segunda-feira; antes era rolling 7 dias fixo).
- **Filtro "30 dias"** agora respeita `dashboard.month_mode` (default = mês atual desde dia 1; antes era rolling 30 dias fixo).
- **TZ ambígua no SQL bucket**: `date_trunc(...)::timestamp` foi trocado por `(date_trunc(...) AT TIME ZONE $tz)` em queries de chart de dashboard/drill-down. Elimina dependência da TZ do processo Node — antes funcionava por sorte (container default UTC).
- **`expandFullDay`** usa `fromZonedTime` (date-fns-tz) — antes seria hack com `getTimezoneOffset()` do navegador.

### Arquivos novos

- `src/lib/dashboard-period.ts` — helper puro `getDashboardPeriod({period, mode, weekStartsOn, tz})` → `{current, prev}`. 9 testes PASS.
- `src/lib/dashboard-settings.ts` — server-only, lê 3 chaves de `app_settings` com cache 60s. 5 testes PASS.
- `src/lib/format/relative-time.ts` — `formatRelativeShort()`. 6 testes PASS.
- `src/components/dashboard/drill-down-pagination.tsx` — paginador reusável.
- `src/components/settings/dashboard-settings-card.tsx` — card de config (super_admin only).
- `src/lib/utils/__tests__/format-bucket.test.ts` — guard test para TZ correctness.

### Compatibilidade

- Cache keys bumped: `dashboard-data-v4`, `dashboard-drill-status-v3`, `dashboard-drill-received-v3`, `dashboard-drill-resolved-v3`, `dashboard-drill-resolution-v3`. Caches anteriores expiram naturalmente em 30s.
- `diffPp` mantido no payload por uma versão (deprecated) — remover em v0.14.0.
- `recent` no drill-down de Recebidas/Resolvidas mantido como alias de `items`.
- `OpenDrillDownData` mantido como alias de `StatusDrillDownData` por uma versão.

### Auditoria

- 670 testes PASS (77 suites). Typecheck 0 erros. Build verde.
- Audit log: `setting_updated` (enum AuditAction existente) com `details.section: "dashboard"`.
- 11 problemas reportados (P1–P11) + 5 do Pacote H (P12–P16) endereçados.

---

## [v0.12.3] 2026-04-30 — Hotfix integração: modelo "não encontrado" + custo zerado + chamadas faltando

> Corrige três bugs reportados pelo super_admin após validar o v0.12.2 em produção: (1) modelos novos como `gpt-5.1-mini` apareciam como "não encontrado neste provedor" mesmo existindo, (2) chamadas antigas mostravam custo `$0.000` no relatório, (3) o painel de Consumo contava menos chamadas do que o dashboard oficial da OpenAI.

### Bug fixes

- **"Modelo gpt-5.1-mini não encontrado neste provedor".** `deepTestOpenAI` rejeitava o modelo no pré-check `GET /v1/models` porque a OpenAI lista **snapshots datados** (`gpt-5.1-mini-2025-12-01`) e não aliases curtos (`gpt-5.1-mini`). O alias é válido no `POST /v1/chat/completions`, mas o pré-check fazia `ids.includes(model)` e rejeitava. **Fix:** `GET /v1/models` agora valida apenas a chave (401 = inválida); a validação do modelo fica para o `POST /v1/chat/completions`, que retorna 404 se o modelo realmente não existe — único caminho confiável de validação.
- **Custos `$0,000` em chamadas antigas no relatório de Consumo.** Antes do v0.12.1, `MODEL_PRICING` não tinha entradas para `gpt-4.1-mini`, `gpt-5.x`, `claude-4.7`, etc., então `calculateCost` retornava 0 e zero foi gravado no banco. **Fix:** nova função `backfillUsageCosts()` chamada automaticamente em `ensureLlmTables()` recalcula `cost_usd` (idempotente: só atualiza rows com `cost_usd = 0` cujos modelos agora têm pricing). `cost_brl` das chamadas antigas continua `NULL` (não dá pra recuperar a cotação histórica) — UI mostra "—".
- **Discrepância "5 chamadas" no nosso painel vs "7 chamadas" no dashboard da OpenAI.** `runNexAgent` agregava todas as iterações de tool-calling de uma conversa em **uma única row** em `llm_usage`, enquanto a OpenAI conta **cada `POST /v1/chat/completions` separadamente**. Conversa com 3 tool calls = 3 linhas no dashboard deles, 1 linha no nosso. **Fix:** agora registramos `logUsage` **por iteração**, alinhando exatamente com a contagem do provider.

### Como medimos tokens e custo (resposta documentada)

1. **Tokens** vêm do campo `usage` retornado pela API do provider em cada `POST /v1/chat/completions` (OpenAI), `POST /v1/messages` (Anthropic), etc. Não há cálculo local — usamos exatamente o que o provider mediu (mesma fonte que o dashboard deles).
2. **Custo USD** é calculado localmente: `cost_usd = (tokens_input × input_price + tokens_output × output_price) / 1.000.000`. Os preços vêm da tabela `MODEL_PRICING` em `src/lib/llm/pricing.ts` (atualizada em v0.12.1 para abril/2026 com OpenAI GPT-4.1.x/5.x/o3/o4, Anthropic Claude 4.5/4.7, Gemini 2.5). Os providers **não retornam o custo em dólar diretamente** — cada um expõe só os tokens; o custo é responsabilidade do consumidor.
3. **Precisão** é `DECIMAL(10, 6)` no banco — 6 casas decimais. Chamadas sub-centavo (ex.: `$0,000838`) preservam todos os dígitos. UI exibe com mínimo 3 e máximo 6 casas.
4. **Custo BRL** é `cost_usd × usd_to_brl_rate`, onde `usd_to_brl_rate` é a cotação cartão de crédito capturada **no momento da chamada** (commercial × spread, AwesomeAPI cache 4h).
5. **Por que não usar o endpoint `/v1/organization/usage` da OpenAI?** Ele exige uma chave admin separada (não a project key), tem delay de horas/dias e só funciona pra OpenAI — não pra Anthropic/Gemini/OpenRouter. Capturar `usage` no response da chamada é o padrão de mercado e o único método que cobre todos os providers de forma uniforme e em tempo real.

### Outras coisas

- `npm test` 77 suites / 671 tests PASS, typecheck 0 erros.

---

## [v0.12.2] 2026-04-30 — Hotfix crítico: "use server" file só pode exportar funções async

> Causa raiz finalmente identificada do crash "This page couldn't load — A server error occurred" reportado pelo super_admin ao trocar modelo, renomear chave, criar nova chave, ou qualquer mutação de credencial. O sintoma era global e persistia mesmo após o hotfix v0.12.1 (que tratou GPT-5.x params, mas não mexia neste vetor).

### Causa raiz (Next.js 16)

O Next.js 16 valida em runtime que **todo arquivo com diretiva `"use server"` exporte APENAS funções async**. Qualquer outro export (constante, número, objeto, re-export de variável) faz o Next.js abortar a renderização com:

```
⨯ Error: A "use server" file can only export async functions, found number.
  digest: '4181178278@E352'
```

Logo, **qualquer Server Action invocada** (não importa qual arquivo `"use server"`, pois o erro é no carregamento do módulo da action) explode com a tela full-screen "This page couldn't load" + logout.

O culpado: `src/lib/actions/exchange-rate.ts:93` tinha `export { DEFAULT_CARD_SPREAD };` (constante numérica `1.1`), introduzido no T8 da v0.12.0 como conveniência para o consumer. Embora o build TypeScript passasse normalmente (e os testes Jest também), o runtime do Next.js rejeitava o módulo no momento da invocação.

### Fix

- Removido o `export { DEFAULT_CARD_SPREAD }` do arquivo `"use server"`.
- Os consumers (apenas `src/app/(protected)/configuracoes/page.tsx`) já importam `DEFAULT_CARD_SPREAD` direto de `@/lib/llm/exchange-rate` (módulo regular, não `"use server"`) — nenhuma mudança necessária no consumer.
- Comentário inline no arquivo da action documenta a regra para evitar reincidência.

### Detecção

Logs do container em produção (via `gh workflow run portainer-debug.yml -f action=logs-app`) mostravam o stack trace literal — investigação feita após dois relatos consecutivos do mesmo sintoma.

### Aviso ao próximo agente

**REGRA**: arquivos `"use server"` (`src/lib/actions/**/*.ts`) devem exportar **somente** funções `async` (Server Actions) e/ou tipos/interfaces TypeScript (que são apagados no build). **Nunca** re-exporte constantes, objetos, classes ou funções síncronas a partir desses arquivos — Next.js 16 rejeita em runtime mesmo passando no build/typecheck/jest.

### Outras coisas desta release

- Inalterado todo o resto da v0.12.1 (abas Agente Nex, GPT-5.x params, MODEL_PRICING, visibility, overscroll). Tests 74 suites / 650 PASS.

---

## [v0.12.1] 2026-04-30 — Hotfix Agente Nex + UX cleanup + visibility/overscroll bugs

> Hotfix imediato sobre v0.12.0. Corrige crash crítico ao trocar para modelos GPT-5.x, atualiza tabela de preços abril/2026 (custos paravam zerados), unifica os cards "Agente Nex" e "Chaves de API" em abas internas, libera o spread cartão (sem limite superior), corrige bug de visibilidade Matrix IA "Ninguém" sendo ignorada para super_admin, remove toggles duplicados do card Visibilidade e elimina a "tarja preta" de overscroll que aparecia em toda a plataforma.

### Bug fixes (críticos)

- **Crash "This page couldn't load" ao trocar modelo (P1).** Modelos da família GPT-5.x e o-series (`o1`, `o3`, `o4`) rejeitam `max_tokens` e `temperature: 0`. `deepTestOpenAI` e `OpenAIClient.chat` agora detectam reasoning models e usam `max_completion_tokens` sem `temperature`. Sintoma do usuário: ao trocar de `gpt-4.1-mini` para `gpt-5.1-mini` e clicar Testar/Salvar → tela de erro full-screen + logout.
- **Custos zerados no Consumo do Agente Nex (P2).** `MODEL_PRICING` ganhou GPT-4.1.x, GPT-5.x, o3/o4-mini, Claude 4.5/4.7 (Sonnet/Opus/Haiku), Gemini 2.5 (Pro/Flash/Flash-Lite), Gemini 2.0 Pro e aliases OpenRouter. Modelos novos não mapeados continuam retornando 0 (sem regressão), mas todos os modelos do `PROVIDER_CATALOG` 2026 agora têm preço.
- **Bug visibility "Ninguém" não respeitada (P7).** `shouldExcludeMatrixIA()` ignorava `reports.matrix_ia_visibility = 'none'` para super_admin (sempre incluía). Reescrito para respeitar os 3 níveis: `none` exclui para todos (inclusive super_admin), `super_admin_only` exclui exceto super_admin, `all` inclui para todos.
- **Tarja preta no overscroll (P8).** Em qualquer rota, ao rolar até o fim e continuar puxando, aparecia uma área preta (#000) além do conteúdo. Causa: `<html>` sem `bg-background` deixava o user-agent pintar a área de elastic-bounce com preto puro do `colorScheme: dark`. Aplicado: `bg-background` no `<html>`, `overscroll-contain` no `<main>` do layout protegido e `overscroll-behavior-y: none` global.

### Mudado

- **Card "Agente Nex" com abas internas Configuração/Chaves (P3).** O card "Chaves de API" foi removido da página `/configuracoes` e seu conteúdo virou uma aba dentro do próprio card "Agente Nex". Segmented control no topo alterna entre a aba "Configuração" (toggle bolha, status, provider/model/chave, spread) e "Chaves de API" (CRUD por provedor). Ao clicar "+ Nova chave" no select, a aba muda automaticamente.
- **Spread cartão sem limite superior (P4).** Removido o range `[1.00, 1.30]`. Agora aceita qualquer valor positivo (`> 0`). Help text atualizado: "Sem limite superior — escolha o valor real do seu cartão."
- **Custos exibidos com 3 casas decimais mínimas (P5).** `usdFmt`/`brlFmt` agora têm `minimumFractionDigits: 3` (era 4). `maximumFractionDigits: 6` mantido — valores sub-centavo ainda aparecem com mais casas para não virar zero. Visualmente menos poluído nos KPIs e charts.
- **Card "Visibilidade" sem toggles Matrix IA duplicados (P6).** Removidos os 2 switches "Matrix IA visível somente para super admin" e "Excluir Matrix IA das métricas globais" — a regra granular já vive no card "Incluir Matrix IA nos relatórios" com select 3-níveis (`all` / `super_admin_only` / `none`). O card "Visibilidade" agora tem apenas CSAT e SLA. Backward-compat: as chaves antigas (`feature_flags.matrix_ia_*`) continuam no banco e `getMatrixIAVisibility()` ainda as lê como fallback.

### Resilência (defensive)

- **Server Actions LLM não vazam mais exceção pro client.** Wrapper `safeAction` em todas as 9 actions de `llm-config.ts` e `llm-credentials.ts`. Qualquer exceção inesperada vira `{ ok: false, error: "Erro inesperado: …" }`, evitando que o Next.js mostre "This page couldn't load" full-screen + deslogue o usuário.
- **`ALTER TYPE "AuditAction" ADD VALUE` em try/catch isolado.** Se algum ambiente bloquear o ALTER por idiosincrasia (lock, transação implícita), só loga warning e segue — não quebra `ensureLlmTables`.

### Removido

- `src/lib/reports/matrix-ia-setting.ts` — sem consumers após o refactor de `shouldExcludeMatrixIA`.
- `src/components/settings/llm-credentials-card.tsx` — substituído por `llm-credentials-manager.tsx` (sem wrapper Card; usado dentro do `LlmConfigCard` na aba "Chaves").

---

## [v0.12.0] 2026-04-30 — Agente Nex: credenciais gerenciáveis + custo BRL com cotação cartão

> Reformulação completa da configuração e do consumo do Agente Nex. Adiciona credenciais (API keys) como recurso de primeira classe com CRUD por provedor, captura cotação USD→BRL cartão de crédito em cada chamada, e padroniza a nomenclatura para "Agente Nex" em todos os call-sites. Trocar modelo ou provedor não exige mais re-digitar a chave.

### Adicionado

- **Card "Chaves de API"** em `/configuracoes` (super_admin). 4 seções (uma por provedor: OpenAI, Anthropic, Gemini, OpenRouter). Cada chave aparece com label, "••••XXXX" e ações inline: Renomear, Trocar (rotação preserva ID e label), Deletar. Ponto verde marca a chave em uso pelo Agente Nex. Botão "+ Nova" abre dialog reutilizável com label opcional (autogera "Chave 1", "Chave 2", …) e PasswordInput. Tem opção de testar conexão antes de salvar.
- **Custo BRL no Consumo do Agente Nex.** Card "Custo total" mostra agora R$ como valor primário com USD em fonte menor (≈ $X.XXXX USD). Charts (Custo por dia, Custo por modelo, Distribuição por provider) e tabela de chamadas detalhadas usam BRL primário. Tabela ganhou coluna "Custo BRL" ao lado de "Custo USD".
- **Cotação USD→BRL cartão de crédito** capturada no momento de cada chamada do Agente Nex (`llm_usage.usd_to_brl_rate`). Fonte: AwesomeAPI (`https://economia.awesomeapi.com.br/last/USD-BRL`) com cache de 4h em `app_settings.llm.usd_brl.rate_cache`. Spread cartão configurável (`app_settings.llm.usd_brl.card_spread`, default `1.10`, range `[1.00, 1.30]`). Fallback 5.50 quando AwesomeAPI indisponível e sem cache.
- **Campo "Spread cartão"** no card "Agente Nex" (input numérico, debounce 500ms, valida range). Tooltip explica "Multiplicador aplicado sobre a cotação comercial USD/BRL (default 1.10 ≈ IOF + spread Visa/Master)".
- **Runbook** `docs/runbooks/credenciais-llm.md` — passo-a-passo para criar/rotacionar/deletar credenciais e ajustar spread cartão.
- **Auditoria** ganha actions `credential_created`, `credential_updated`, `credential_deleted`, `credential_tested`.

### Mudado

- **"Agente IA" → "Agente Nex"** em todos os call-sites (card título, página `/configuracoes/consumo`, mensagens de erro do agente, empty-states). `grep -rn "Agente IA" src/` agora retorna vazio.
- **Card "Agente Nex"** (`/configuracoes`) não exige mais re-digitar API key para trocar modelo ou provedor. Campo "API key" foi substituído por um `select` de credenciais salvas para aquele provedor (mais opção "+ Nova chave"). Trocar provedor pré-seleciona automaticamente a credencial mais recente do novo provedor; se não houver, força criação. Botões "Testar conexão" e "Salvar configuração" usam `credentialId` em vez de chave inline.
- **Custos exibidos com mínimo 4 casas decimais** em todas as visualizações (KPI, charts, tabela). Dropei o formatador `usdFmtCompact` (2-4 casas) que escondia valores sub-centavo, agora padronizado em `usdFmt`/`brlFmt` com 4-6 casas.
- **`KpiCard.value`** aceita `ReactNode` (era `string | number`) — habilita layouts com 2 linhas (BRL primário + USD secundário no card "Custo total").

### Schema (runtime via `ensureLlmTables`, idempotente)

- **NOVA tabela** `llm_credentials (id UUID PK, provider TEXT, label TEXT, encrypted_api_key TEXT, last4 TEXT, created_at, updated_at, created_by_id UUID NULL)`. Índices: `UNIQUE(provider, label)` e `(provider, updated_at DESC)`. Chave cifrada com AES-256 (`@/lib/encryption`).
- **`llm_configs.credential_id UUID NULL`** — FK lógica para `llm_credentials.id`.
- **`llm_configs.encrypted_api_key`** virou `NULLABLE` (era NOT NULL). Mantida em rows existentes para permitir rollback para v0.11.x; em v0.13.0 será dropada.
- **`llm_usage.cost_brl DECIMAL(12,6) NULL`** e **`llm_usage.usd_to_brl_rate DECIMAL(10,4) NULL`**.
- **Enum `AuditAction`** ganha `credential_created`, `credential_updated`, `credential_deleted`, `credential_tested` (via `ALTER TYPE … ADD VALUE IF NOT EXISTS`).

### Migração de dados

- Idempotente, dentro de `ensureLlmTables()` na primeira request após o deploy. Para cada `llm_configs` com `credential_id IS NULL AND encrypted_api_key IS NOT NULL`: cria entrada em `llm_credentials` com label "Chave principal" (ou "Chave principal 2" se já existir) e popula `credential_id`. Em caso de `decrypt` falhar numa row corrompida, loga warning e segue (super_admin re-cadastra manualmente).

### Compatibilidade & rollback

- Deploy zero-downtime: pod novo aplica migração na primeira request; pod antigo continua lendo `encrypted_api_key` direto até o cutover. `getActiveLlmConfig` faz fallback para `encrypted_api_key` quando `credential_id` é NULL.
- Rollback para v0.11.x: backend antigo ignora colunas/tabela novas. Chaves antigas continuam em `llm_configs.encrypted_api_key`.

---

## [v0.11.1] 2026-04-30 — Hotfix: página de configurações e relatórios não carregavam

> "This page couldn't load — A server error occurred" em todas as páginas internas (`/configuracoes`, todos os `/relatorios/*`, perfil, etc).

### Causa raiz

O commit `0a3bfab` (`fix(conversas): page-header mede altura + toolbar fluid (v0.10.4 prep)` — agente `claude-conversas-v0.10.4-fix`) marcou `src/components/page-header.tsx` como `"use client"` para usar `useLayoutEffect`. Mas o componente recebe `icon: LucideIcon` (função/forwardRef), e funções **não podem ser passadas** de Server Component para Client Component (regra do Next.js RSC). Resultado: toda página interna que renderizava `<PageHeader icon={Settings} ... />` quebrava no SSR com `Error: Functions cannot be passed directly to Client Components`.

### Fix

Refatoração interna sem mudar a API pública:

- **`src/components/page-header.tsx`** — volta a ser Server Component, **mantém os mesmos props** (`icon: LucideIcon`, `title`, `subtitle`, `actions`). O ícone é renderizado no servidor e o JSX resultante é entregue como `children` para o filho client.
- **`src/components/page-header-height-probe.tsx`** (novo) — Client Component pequeno (`"use client"`) que recebe `children` já renderizado e ata o `useLayoutEffect + ResizeObserver` que mede a altura e exporta a CSS var `--page-header-h`. Recebe ReactNode (não funções), atravessa a fronteira sem problema.

13 call-sites continuam usando exatamente a mesma API. Sem mudanças nas páginas.

### Lições / processo

- O agente que fez `0a3bfab` deveria ter testado uma página com PageHeader antes de pushar — `npm run build` teria capturado o erro.
- O protocolo de coordenação multi-agente já tem checklist "antes de push: gh run list + curl /api/health". Não capturou esse caso porque `/api/health` continuava verde (Server Component só falha quando renderiza). Adicionar ao checklist: **abrir uma página interna logada antes de declarar deploy bem-sucedido**.

---

## [v0.11.0] 2026-04-30 — Visibilidade granular + catálogo LLM atualizado

> Substitui os toggles boolean dos relatórios e do Matrix IA por dropdowns de **3 níveis** (Todos / Somente super admin / Ninguém) com aplicação **global** em sidebar, páginas, queries, filtros e dropdowns. Inclui também o catálogo LLM atualizado (cutoff abril/2026) com famílias GPT-5.x, Claude 4.7, Gemini 2.5 e OpenRouter expandido. Corrige 2 bugs no card Agente Nex.

### Visibilidade granular

- **Tipo `Visibility`** em `src/lib/reports/visibility.ts` (`"all" | "super_admin_only" | "none"`) com helpers servidor-side: `resolveVisibility`, `getReportVisibility`, `getMatrixIAVisibility`, `isReportVisibleForUser`, `isMatrixIAVisibleForUser`, `getVisibleReportKeys`. Cache TTL 30s.
- **Backward-compat** transparente para deployments existentes: lê `platform.enabled_reports` e `reports.include_matrix_ia` quando as chaves novas não existem.
- **Persistência:** chaves novas em `app_settings` (sem migration de schema):
  - `reports.visibility.<report-key>` (7 chaves: visao-geral, performance, equipe, distribuicao, origem-ia, conversas, mensagens-nao-respondidas).
  - `reports.matrix_ia_visibility`.
- **UI primitivo** `<VisibilitySelect>` (3 opções com ícones lucide Users/Shield/EyeOff). Usa o `<CustomSelect>` (base-ui Popover.Portal) — sem o bug de "preso em container".
- **Cards refatorados** (`enabled-reports-card`, `matrix-ia-toggle-card`): switches → VisibilitySelect; footer mostra distribuição all/super_admin/none.
- **Aplicação global**:
  - **Sidebar** filtra links por role via `getVisibleReportKeys(role)`.
  - **7 páginas `relatorios/<key>/page.tsx`** com guard `redirect("/dashboard")` quando o role não tem acesso.
  - **`getInboxesForUser`** esconde inbox 31 (Matrix IA) automaticamente quando `isMatrixIAVisibleForUser(role) === false` — afeta dropdowns de filtros, drill-downs e queries derivadas.
- **Seed** (`prisma/seed.ts`) ganha 8 entradas com defaults `"all"` (relatórios) e `"super_admin_only"` (Matrix IA).

### Catálogo LLM (cutoff abril/2026)

- **OpenAI**: 18 modelos. Família **GPT-5.5 / 5.4 / 5.4 mini / 5.2 / 5.1 / 5.1 mini / 5 / 5 mini** + reasoning (o4-mini, o3, o3-mini, o1, o1-mini) + GPT-4.1 family + GPT-4o family. Atualmente mais novo: GPT-5.5.
- **Anthropic**: 9 modelos. **Claude Opus 4.7** (atual mais novo) + **Sonnet 4.7** (novo) + Sonnet 4.6 / 4.5 / Opus 4.5 + Haiku 4.5 + 3.5 family (Sonnet/Haiku) + Opus 3.
- **Google Gemini**: 9 modelos. **2.5 Pro / Flash / Flash Lite** no topo + **2.0 Pro** (novo) + 2.0 Flash / Flash Lite + 1.5 Pro/Flash/Flash-8B.
- **OpenRouter**: 40 modelos curados, cobrindo Free (Llama 3.3 70B free, DeepSeek R1 free, Qwen 2.5 7B free, Phi-3 Mini free), Low (todos os mini do top tier), Medium (4o, 5, Sonnet 4.5/4.6/4.7, DeepSeek R1), High (o3, GPT-5.4/5.5, Opus 4.5/4.7, Gemini 2.5 Pro, Llama 3.1 405B, Mistral Large, Cohere R+).
- `allowCustomModel: true` cobre o long-tail (digitação manual de IDs).

### Bug fixes UI

- **Dropdown de Modelo no card Agente Nex** estava preso visualmente dentro do container — `<SearchableSelect>` migrado de `<div absolute>` custom para `<Popover>` da base-ui (Portal automático via `PopoverContent`).
- **Olhinho da API key descentralizado** — `<PasswordInput>` trocou `top-1/2 + translate-y(-50%) + h-6 w-6` por `inset-y-0 + flex items-center justify-center + w-10`. Centraliza em qualquer altura de input.

### Testes

- **+17 novos** testes (14 visibility helpers + 3 VisibilitySelect). Total da suite: 551/551 verdes.

### Out of scope

- Permissões mais granulares por persona (manager vs viewer) — fica para v0.12.
- Botão "redefinir defaults" no settings — YAGNI.

---

## [v0.10.4] 2026-04-30 — Conversas: scroll interno + 100/Todos infinite scroll + remove colunas WhatsApp/Atributos

> Hotfix em resposta a feedback do João sobre v0.10.3: page header + toolbar + thead realmente fixos (só linhas da tabela rolam internamente); page size simplificado pra 2 opções com infinite scroll automático no "100"; colunas WhatsApp e Atributos removidas da grade e do `<ColumnsToggle>` (continuam disponíveis no drill-down ao clicar na linha — esse comportamento NÃO mudou).

### Mudou

- **Scroll interno da tabela** — container do `<tbody>` ganhou `max-h: calc(100dvh - var(--page-header-h, 96px) - var(--toolbar-h, 200px) - 64px)` + `overflow-y-auto`. `<thead>` agora é `sticky top-0` LOCAL ao container (não mais ao viewport). Toolbar de filtros perdeu `position: sticky` — vive no fluxo natural acima da tabela. Resultado: rolar a página rola só as linhas da tabela; page header + toolbar + thead ficam estáticos.
- **`<PageHeader>` mede a própria altura** via `useLayoutEffect` + `ResizeObserver` e exporta `--page-header-h` no `<html>`. Permite o cálculo de altura da tabela respeitar headers customizados (ex.: subtítulo longo).
- **Page size simplificado** — opções reduzidas de 3 (`50/100/Todos`) para 2 (`100/Todos`). Default `100`. Usuários antigos com `"50"` em localStorage migram automaticamente para `"100"`.
- **Infinite scroll** quando `pageSize === "100"` — sentinela invisível no fim do `<tbody>` dispara `loadMore` via `IntersectionObserver` (`rootMargin: 200px`). Usuário não precisa mais clicar "Carregar mais" — rola e a tabela cresce. Botão "Carregar mais" mantido como fallback (browsers sem IntersectionObserver e/ou estado de erro).
- **Colunas removidas** — `phone` ("WhatsApp") e `custom_attributes` ("Atributos") deletadas do array `COLUMNS` em `<ConversasTable>`. Saem da grade e do `<ColumnsToggle>` (que era 15/15, agora reflete o novo total). `phone` também sai de `SORT_OPTIONS` em `<AdvancedFilters>` (não há mais coluna pra ordenar).

### Não mudou (importante)

- **Drill-down `<ConversaDrillDown>`** — continua mostrando WhatsApp formatado completo + atributos chave:valor sem reticências + botão "Abrir no Chatwoot". Click na linha continua expandindo do mesmo jeito.
- **Mobile cards** (`lg:hidden`) — continuam mostrando WhatsApp via `<Field label="WhatsApp">`. Layout mobile não muda nessa release.

### Verificação

- `npx tsc --noEmit` → exit 0
- `npx jest src/components/reports` → 44/44 passing
- `npm run build` → OK

---

## [v0.10.3] 2026-04-30 — Conversas: hotfix UI (toolbar + sticky + filtros + tour)

> Hotfix em resposta a feedback do João sobre v0.10.1: toolbar com cantos retos destoava do card da tabela, sticky thead "pulava" para baixo na carga inicial, FiltersDialog Modo Simples sem mutex inflava sem fim, Modo Avançado com label duplicada, sem scroll interno; "Limpar filtros/ordenação" só link de texto sem ícone; tour com botão "Próximo" e "1 de 11" quebrando linha.

### Mudou

- **Toolbar arredondado** — `<AdvancedFilters>` agora usa `rounded-2xl + border + shadow-sm` igual ao card da tabela. Antes era `border-b` único, sem cantos.
- **Sticky thead garantido na primeira pintura** — `useLayoutEffect` síncrono mede o toolbar e seta `--toolbar-h` antes do paint. Antes o thead "pulava" para baixo no primeiro frame porque o fallback (132px) era diferente da altura real medida só no useEffect (depois do paint).
- **FiltersDialog Modo Simples — accordion mutex** — ao abrir uma seção (Caixa de entrada, Departamento, etc), as outras fecham automaticamente. Evita o "nhocão" reclamado quando várias seções ficavam abertas e o dialog crescia sem fim.
- **FiltersDialog tamanho + scroll interno** — `max-w-[1100px]` (era 920), `max-h-[85vh]`, header e footer fixos, body com `overflow-y-auto` interno. Funciona pra Simples e Avançado.
- **Modo Avançado — label do valor sem duplicação** — `ConditionRow` passa `label="Valor"` para o `<MultiSelectCheckbox>` em vez de repetir o label do campo (que já está visível no `<select>` à esquerda). Antes mostrava "Caixa de entrada" no select e "Caixa de entrada" de novo no popover do valor.
- **Modo Avançado — separação visual de grupos** — grupos aninhados ganham `border-l-2 border-violet-500/40 + bg-violet-500/[0.02]` em vez do card cinza genérico. Cada `ConditionRow` ganha `bg-card`, `h-9` nos selects e botão remover com `hover:text-destructive`.
- **`STORAGE_COLS` cols-v2 → cols-v3** — migration agressiva remove `phone`, `document`, `labels`, `custom_attributes`, `created_at`, `last_activity_at` mesmo se o usuário tinha re-marcado pelo `<ColumnsToggle>` depois da v0.9.0. Resolve o "WhatsApp ainda aparecendo na grade" pra usuários que tinham reativado.
- **"Limpar filtros" / "Limpar ordenação"** — agora botões pill com ícone Trash2 + hover destructive. Antes eram links de texto sublinhados sem ícone.
- **Tour overlay** — popover de 360px → **440px**; footer reorganizado em 2 linhas (dots + "N de M" em cima, botões Pular/Voltar/Próximo embaixo) com `flex-wrap` e `whitespace-nowrap` nos botões. Antes "1 de 11" quebrava a linha porque concorria com 3 botões em 360px.

### Verificação

- `npx tsc --noEmit` → exit 0
- `npx jest` → 531/531 passing (63 suites)
- `npm run build` → OK

---

## [v0.10.2] 2026-04-30 — Dashboard fix de UX (drill central, status compacto, "Abrir no Chatwoot")

> Hotfix de UX do dashboard v0.10.0 a partir do feedback do João: drill-down não estava centralizando direito (parecia side-sheet quebrado), toggle bar/donut atrapalhava a leitura, donut de status ocupava bloco gigante com pouco conteúdo, faltava botão "Abrir no Chatwoot" nas tabelas, faltava afordância visual de click nas barras, e a seção "Conversas recentes" no fim não trazia valor.

### Corrigido

- **Drill-down dialog não centralizava no desktop** — `inset-x-0` mobile-first conflitava com a centralização desktop (`inset-x-0` define `left:0` e `right:0`, impedindo `left-1/2 + translate`). Reescrito posicionamento usando `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` para todas as breakpoints. Agora abre **no centro** da viewport com o tamanho correto.

### Mudou

- **Removido toggle bar/donut** dos cards de Inboxes e Departamentos — fica **bar-only** (mais legível para ranking, suporta qualquer número de categorias). João: "tem que ser um ou outro".
- **Status distribution card compactado** — antes era um bloco full-width com donut centralizado e legenda em baixo, ocupando muito espaço pra pouca informação. Agora: donut compacto à esquerda (220×220) + legenda clicável à direita com label, %, contagem e seta `→`. Cada linha da legenda dispara o drill-down.
- **Cards de distribuição (Inbox e Departamento) ganharam hint visual** — subtítulo "🖱 Clique numa barra para ver as conversas" deixa claro que a tabela é interativa.
- **Removida seção "Conversas recentes"** do dashboard — não trazia valor próximo aos demais cards. Conversas seguem disponíveis em `/relatorios/conversas` e via drill-downs (todas com botão "Abrir no Chatwoot").
- **Tour atualizado** — passo "recent" removido; "status" ganhou cópia indicando que a legenda é clicável.

### Adicionado

- **Botão "Abrir no Chatwoot"** em todas as tabelas de drill-down do dashboard (Recebidas, Resolvidas, Abertas, Sem-resposta, Por departamento) e na lista preview do `<NoResponseCard>`. Reusa `<OpenInChatwoot>` (`src/components/reports/open-in-chatwoot.tsx`).

### Verificação

- `npx tsc --noEmit` — verde nos arquivos do dashboard.
- `npx eslint src/components/dashboard src/components/ui/drill-down-dialog.tsx` — sem warnings.

---

## [v0.10.1] 2026-04-30 — Conversas: presets + atalhos rápidos + polimento

> Complementos da v0.9.0/v0.9.1 — pendências do feedback do João: filtros salvos, atalhos rápidos, migração de localStorage cols (corrige WhatsApp aparecendo na grade pra usuários antigos), polimento touch-target em mobile. (Originalmente planejado como v0.9.2 — promovido a 0.10.1 porque o release v0.10.0 do dashboard caiu antes.)

### Adicionado
- **Filtros salvos (presets)** — `<PresetsPopover>` no toolbar com CRUD: salvar atual, listar, aplicar (1 click), renomear, excluir. Cap 50 presets. Persistência em `localStorage["conversas-filter-presets"]`. Cada preset guarda `FilterState` completo + `sortStack`.
- **Atalhos rápidos** — `<QuickFiltersPopover>` (botão "Atalhos") no toolbar com 3 toggles: "Sem resposta" (filtra `waiting_seconds > 0`), "Não atribuídas" (`assignee.id IS NULL`) e "Minhas" (oculto enquanto `User.chatwoot_user_id` não estiver mapeado). Multi-toggle (combinador AND). Compõe via `mergeConditionGroups` com o conditionGroup do modo Avançado.
- **`useMigratedLocalStorageSet`** — hook genérico de migração de keys de localStorage com transformação. Usado para `conversas-table-cols-v2`.
- **`useFilterPresets`** — hook CRUD de presets com validação (nome obrigatório, único, ≤60 chars; cap 50).
- **Step novo no tour de Conversas** apontando para o botão Presets.

### Mudou
- **`STORAGE_COLS`** — `conversas-table-cols` → `conversas-table-cols-v2`. Migration one-shot remove keys que migraram para drill-down em v0.9.0 (`phone, document, labels, custom_attributes, created_at, last_activity_at`). Usuários antigos ficam com layout correto sem perder customizações legítimas.
- **Touch-target em mobile** — "Ver mais" no drill-down `h-7 → h-8`; chips com `min-h-9` e X em `h-6 w-6`.

### Verificação
- `npx tsc --noEmit` → exit 0
- `npx jest` → 531/531 passing (testes novos: `use-migrated-local-storage` 5, `quick-filters` 8, `use-filter-presets` 6, `presets-dialog` 4)

## [v0.10.0] 2026-04-30 — Dashboard Pulse

> Redesign completo da home `/dashboard`. KPIs, gráficos e drill-downs agora **falam da mesma coorte** (criadas no período), o **timezone** respeita a plataforma, o **seletor de conta deixou de ser duplicado** (vive só no sidebar) e cards de listas viraram **gráficos clicáveis** com drill-down em **modal central**. Spec/plan em `docs/superpowers/{specs,plans}/2026-04-30-dashboard-v0.10*.md`.

### Adicionado

- **Card "Conversas sem resposta agora"** (hero) — definição estrita: status=0 + última mensagem do contato (`message_type=0`). Mostra contador, "mais antiga há X" e preview de 5 com CTA "Ver todas" que abre drill-down central com agrupamento por inbox/atendente.
- **Distribuição por Departamento** clicável — bar/donut com toggle (`<ChartTypeToggle>`). Coorte: criadas no período + status ∈ {open, pending, snoozed}. Bucket "Sem departamento" sempre visível quando há conversas com `team_id IS NULL`. Click na barra/fatia abre drill-down com lista filtrada.
- **Distribuição por Inbox** clicável — bar/donut com toggle. Coorte: criadas no período + status=0.
- **Distribuição por Status** — donut com 4 fatias (Aberto/Pendente/Adiado/Resolvido), centro mostra total recebido. Click vai para drill-down do status (Open com lista completa, demais com texto explicativo enquanto o drill específico não chega em v0.11).
- **Toggle line/bar** no chart de "Conversas por hora/dia" via `<ChartLineBarToggle>`, persistido em `localStorage`.
- **`<DrillDownDialog>`** — modal centralizado de até 1280px (`max-w-6xl`) e 90dvh (mobile vira full-screen). Substitui o side-sheet (`<DrillDownSheet>`) no dashboard; outros relatórios continuam com side-sheet.
- **`<ChartTypeToggle>`** e `useChartTypeStorage` — segmented control bar/donut com persistência localStorage e bloqueio automático de donut acima de 6 categorias.
- **`<NoResponseCard>`** + drill-down `<NoResponseDrillDownContent>` (lista completa até 100, agrupável).
- **`<TeamDrillDownContent>`** — drill-down de departamento com donut por status + lista.
- **Backend**: `getNoResponseDrillDown` e `getByTeamDrillDown` em `dashboard-drill-down.ts` (com bucket "Sem departamento").
- **`formatBucketLabel(iso, granularity, tz)`** — formatter TZ-aware via `Intl.DateTimeFormat` em `src/lib/utils/format-bucket.ts` + tests (4 cenários incluindo Asia/Tokyo).
- **`onBarClick`/`onSliceClick`** opcionais em `InteractiveBarChart`, `InteractivePieChart`, `DonutWithCenter`.

### Mudou

- **KPIs amarrados ao filtro de período** (mesma coorte):
  - "Recebidas" — created_at ∈ período (já era).
  - "Resolvidas" — created_at ∈ período + status=1 (era last_activity_at; mudança para coorte única).
  - "Abertas" — created_at ∈ período + status=0 (era snapshot global; mostrava 1.475 com "Hoje" — agora respeita o filtro).
  - "Taxa de resolução" — `min(100, resolvidas/recebidas * 100)` (era >100% por coortes diferentes).
- **`getResolvedDrillDown`** e **`getOpenDrillDown`** atualizados para mesma coorte de criação no período. `getOpenDrillDownAction` agora aceita `period`.
- **Top inboxes em aberto** — passou de snapshot global para coorte do período (limite ampliado de 5 para 10).
- **Chart "Conversas por hora"** usa `Intl.DateTimeFormat` com `timeZone` da plataforma — mostra horários BRT corretos independente da TZ do navegador.
- **Cache key** das queries do dashboard bumpada para `dashboard-data-v2:*` e `dashboard-drill-open-v2:*` (invalida v1 ao subir).
- **Tour do dashboard** atualizado para o novo layout: filtros (sem seletor de conta), KPIs, sem-resposta, chart, distribuições (inbox+departamento), status, recentes.

### Removido

- **Seletor de conta do dashboard** — vivia em `<DashboardFilters>`, agora é exclusividade do sidebar (`<AccountSwitcher>`). Toda a plataforma respeita o cookie `active_account` global.
- **`topTeams`** do contrato `DashboardData` — substituído por `byTeam` (com bucket "Sem departamento") + `byStatus` (4 fatias) + `noResponse`. Tipo `DashboardTopTeam` mantido por compat temporária.
- **Lista "Departamentos com mais resolvidas"** — virou bar chart clicável com semântica nova (open+pending+snoozed). Avatares com initials de teams (que mostravam "?" para nomes vazios) deixaram de existir naturalmente.
- Uso de `<DrillDownSheet>` no dashboard — migrado para `<DrillDownDialog>`. Componente `<DrillDownSheet>` segue existindo para outras telas.

### Corrigido

- **Timezone errada no chart** — formatter usava TZ do navegador. Trocado por `Intl.DateTimeFormat({ timeZone })` lendo `app_settings.platform.timezone` (default America/Sao_Paulo).
- **Taxa > 100%** (ex.: 131,6%) — coortes diferentes para numerador (resolvidas com `last_activity_at`) e denominador (recebidas com `created_at`). Agora ambas usam a mesma coorte; clamp defensivo a 100%.
- **"Abertas" (agora) = 1.475 com filtro Hoje** — era snapshot global. Agora respeita o filtro.
- **Ícones "?" em listas top-5** — surgiam no avatar de team quando `getInitials` recebia nome vazio. Substituído por gráfico (sem avatar).
- **Seletor de conta duplicado** — sidebar + dashboard. Mantido só no sidebar.

### Verificação

- `npm run typecheck` — verde nos arquivos do dashboard.
- `npm run lint` — verde nos arquivos novos/modificados do dashboard (warnings pre-existentes em outros módulos).
- `npm test` — 510 testes passam (1 test suite com SIGSEGV ambiental, não relacionada).
- `npm run build` — produção compila com sucesso, todas as 25 rotas listadas.

---

## [v0.9.0] 2026-04-30 — Conversas Poderoso

> Redesign completo da tela `/relatorios/conversas`: query builder com **E/OU** em grupos, painel de **Ordenação** em cadeia, **drill-down inline expansível**, **sticky toolbar + header**, status no feminino com cores ajustadas, filtro por **Etiquetas**, fix de bugs críticos de UX e ordenação. Spec/plan em `docs/superpowers/{specs,plans}/2026-04-30-conversas-poderoso-*.md`.

### Adicionado

- **`<FiltersDialog>` centralizado** — substitui `<FiltersDrawer>` lateral. Modo **Simples** (paridade com drawer + Etiquetas) e **Avançado** (query builder com E/OU em grupos, 10 campos: caixa, departamento, atendente, status, prioridade, etiquetas, sem resposta há, aberta há, nome, WhatsApp). Operadores `eq/neq/gt/gte/lt/lte/contains/starts_with/in/not_in/contains_all`. Apply explícito.
- **`<SortingDialog>`** — painel de ordenação em cadeia com lista ordenável (↑↓), Asc/Desc por critério, badge de índice, Adicionar/Remover, Limpar/Aplicar. Convive com click+shift+click no header (atalho rápido) que continua funcionando.
- **Drill-down inline na tabela** — chevron na primeira coluna; click em qualquer célula expande linha mostrando WhatsApp formatado, Documento, Etiquetas full, Atributos completos sem reticências (até 30, com "Ver mais (N)") e Tempos. Botão "Abrir no Chatwoot" no rodapé do detalhe. Colunas Phone/Doc/Labels/Attrs/Created/LastActivity migram para o detalhe (ainda disponíveis via `ColumnsToggle`).
- **Sticky toolbar + sticky thead** — toolbar de filtros e cabeçalho da tabela ficam fixos durante scroll; `--toolbar-h` calculado em runtime via `ResizeObserver`; z-index disciplinado (`--z-toolbar: 30`, `--z-table-thead: 20`, `--z-modal: 100`, `--z-toast: 1000`).
- **Filtro por Etiquetas** — `getLabels(accountId)` em meta-cache (Chatwoot `labels`); novo grupo "Etiquetas" no FiltersDialog com `<MultiSelectCheckbox>` buscável; serializado em URL como `label=`.
- **Tipografia +1 step** — root html bumpado de 16px → **16.25px** (≥1280px = 16.5px); promoção `text-xs`→`text-[13px]` em valores tabulares; `text-[10px]`→`text-[11px]` em labels secundárias.
- **Skip link a11y** — "Pular para a tabela de conversas" para usuários de teclado.
- **Tour estendido** — passo `drill-down` cobrindo a chevron-cell + cópia de `sorting-chip` revisada.
- **`<ConversasPageClient>`** — client wrapper que cabeia `sortStack` entre `<AdvancedFilters>` e `<ConversasTable>` (state controlado, persistido em `localStorage`).
- **`condition-group-codec.ts`** — encode/decode base64url de `ConditionGroup` na URL (param `cg`, cap 4kB).

### Mudou

- **Status no feminino**: "Em aberto" → **Aberta** (amber, mantido); "Resolvida" mudou cor de **emerald → sky** (azul claro); "Pendente" mantido (violet); "Adiado" → **Adiada** com cor **slate** (cinza claro). Atualizado em badge, dashboards (pie chart, drill-down) e KPIs ("Abertas" plural).
- **Coluna "Labels" → "Etiquetas"** em UI, `ColumnsToggle` e mobile cards (chave interna `labels` mantida por compat).
- **`FilterState`** estendido: `labelIds: number[]`, `mode: "simple" | "advanced"`, `conditionGroup?: ConditionGroup`.
- **`<ConversasTable>`** passou a receber `sortStack` / `onSortStackChange` / `conditionGroup` controlados pelo parent. `applyConditions` é executado client-side antes do sort.
- **Operadores `in`/`not_in`** em `applyConditions` agora detectam `Array.isArray(fieldValue)` e fazem lookup por `id`/`name` em arrays de objetos (necessário para filtrar por Etiquetas no modo Avançado).

### Corrigido

- **Bug ordenação null** (R6) — `nullableNumberCompare` agora trata `null` como **valor mínimo** simétrico (asc: null primeiro; desc: null último). "Tracinho" em `waiting_seconds`/`open_seconds` significa "não está esperando" e deve aparecer antes dos valores numéricos quando ordenamos pelo menor tempo. Extraído para `src/lib/utils/null-compare.ts` com testes simétricos.
- **`<CustomSelect>` intermitente** — substituído handler `mousedown` manual por `<Popover>` da base-ui. Elimina race em que o próprio click no trigger era detectado como "click outside" antes do `setOpen(true)` propagar (causava dropdown precisar de 2 clicks).
- **`<PeriodPills>` calendário** — `key` do `<PickerPanel>` estabilizada (não remonta em cada render quando o range muda durante seleção).

### Removido

- `<FiltersDrawer>` (substituído por `<FiltersDialog>`) e respectivo teste.
- `renderTrigger` prop não usada do `<CustomSelect>`.

### Verificação

- `npx tsc --noEmit` → exit 0
- `npx jest` → **503/503 testes passando**, 58 suites
- `npm run build` → production build OK, todas as rotas geradas

🤖 Implementado em modo autônomo total — Claude Opus 4.7 (1M context).

---

## [v0.8.0] 2026-04-30 — Pré-agregação de relatórios + hotfix Bad Gateway

> Release de **infraestrutura**. Resolve o incidente recorrente de Bad Gateway em produção e move parte da carga dos relatórios para um modelo de pré-agregação assíncrona, reduzindo a pressão sobre o banco do Chatwoot e habilitando atualização "quase em tempo real" via SSE.

### Hotfix Bad Gateway (urgente — incidente 2026-04-30)

- **`docker/Dockerfile`** — `--chown=nextjs:nodejs` em todos os COPY + `mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next` antes de `USER nextjs`. Causa raiz: `EACCES` ao escrever cache do Next 16 (`next/image`, prerender) virava `unhandledRejection`, matava o processo e Swarm reiniciava — Traefik respondia 502 durante o restart.
- **`prisma/seed.ts`** — passa `adapter` ao `new PrismaClient` (Prisma 7 + adapter-pg exigem); seed deixou de quebrar com `PrismaClientInitializationError`.
- **`src/instrumentation.ts`** (novo) — handlers globais de `unhandledRejection` e `uncaughtException` que apenas logam (defense-in-depth).

### Adicionado — modelo de pré-agregação

- **6 tabelas no banco interno** (Prisma migration `20260430_pre_agregacao`):
  - `chatwoot_facts_daily_by_account` — KPIs diários consolidados.
  - `chatwoot_facts_daily_by_inbox` — recortado por inbox.
  - `chatwoot_facts_daily_by_agent` — recortado por agent (orphans excluídos).
  - `chatwoot_facts_daily_by_team` — recortado por team (sentinela `0` = "sem time").
  - `chatwoot_facts_hourly_by_account` — granularidade hora × dia.
  - `chatwoot_facts_meta` — controle por dimensão (`last_refresh_at`, `last_error`, status).
- **Camada de leitura** `src/lib/chatwoot/facts.ts` — `readFactsDaily()`, `readFactsHourly()`, `readFactsMeta()` com Zod nos args, `excludeMatrixIA` via LEFT JOIN e cálculo de `lagSeconds + status` (fresh/stale/lagging/never).
- **5 jobs BullMQ** em `src/worker/jobs/pre-agregacao/`:
  - `refresh-by-account` (template).
  - `refresh-by-inbox`, `refresh-by-agent`, `refresh-by-team`.
  - `housekeeping-old-buckets` — DELETE WHERE bucket_date < hoje − retention (lê `audit.retention_days`).
- **Schedules cron repetíveis** via `queue.upsertJobScheduler` registrados ao subir o worker:
  - `refresh-by-*` a cada 5 min (`*/5 * * * *`).
  - `housekeeping-old-buckets` diário 03:00 (`0 3 * * *`).
- **Página `/configuracoes/jobs`** (super_admin only) — lista 5 dimensões × N accounts com status colorido (fresh/stale/lagging/never), lag em minutos, `last_error` truncado, botões "Rodar agora" e "Backfill 90 dias". Auto-refresh a cada 5s. Action `triggerRefresh` + `triggerBackfill` + `getJobsStatus` em `src/lib/actions/jobs.ts` (com audit log).
- **Sidebar** — link "Jobs de pré-agregação" (super_admin only) sob Configurações.

### Adicionado — UI de freshness + tempo "quase real"

- **`<FactsFreshness accountId={...} />`** — badge no header dos relatórios com cor verde/âmbar/rosa/cinza + ícone Lucide e label "Atualizado há X min". Tooltip mostra ISO da última agregação. Auto-refresh 30s. Aplicado em: Visão Geral, Distribuição, Equipe, Origem & IA, Performance, Dashboard.
- **SSE de invalidação** — `withMetaUpdate` publica `{ type: "facts:refreshed", dimension, accountId }` no canal `nexus-insights:realtime` ao concluir um job. Frontend escuta via `useFactsRealtime` (debounce 5s) e dispara `router.refresh()` automaticamente — usuário vê o painel atualizar sem reload.
- **Server Action** `getFreshnessForAccount` em `src/lib/actions/freshness.ts`.

### Mudou — relatórios migrados para facts

- **`volumetria-heatmap`** — agora lê de `chatwoot_facts_hourly_by_account` quando filtros são compatíveis (sem inbox/team/agent específicos). Caso contrário, fallback para Chatwoot direto. Cache key inalterado.
- **`volumetria-dow`** — agora lê de `chatwoot_facts_daily_by_account` e agrega DOW em JS. Mesmo padrão de fallback.

> Os outros 9 relatórios (`home-summary`, `dashboard-data`, `dashboard-kpis`, `status-distribution`, `ranking-atendentes`, `por-departamento`, `tempos-resposta`, `leads-recebidos`, `matrix-ia`) **continuam on-demand** mas exibem o badge `<FactsFreshness />` para sinalizar que existe um pipeline de pré-agregação em paralelo. Migração desses está prevista para a v0.9 (depende de extensões de schema, ex.: snapshot live de open/pending por inbox/team).

### Documentação

- **`docs/superpowers/specs/2026-04-30-pre-agregacao-design.md`** — spec v3 (com histórico v1→v2→v3 documentado).
- **`docs/superpowers/plans/2026-04-30-pre-agregacao.md`** — plan v3 com 6 marcos (M1 schema+leitura, M2 jobs, M3 backfill, M4 migração, M5 SSE+UI, M6 encerramento).

### Testes

- **+59 testes novos** (459 → 506 total + 1 falhando em arquivo untracked alheio):
  - `facts.test.ts` (13).
  - `shared.test.ts` (8 + 3 SSE).
  - `refresh-by-{account,inbox,agent,team}.test.ts` (~30).
  - `housekeeping.test.ts` (5).
  - `jobs.test.ts` (11) — Server Actions.
  - `volumetria-{heatmap,dow}.test.ts` migradas (7).
  - `facts-freshness.test.tsx` (4).
  - `use-facts-realtime.test.tsx` (5).

### Operação / Runbook

- Após deploy, super_admin abre `/configuracoes/jobs` e clica em "Backfill 90 dias" para cada dimensão (1ª vez). Tempo esperado: 5–15 min para 2 accounts × 90 dias.
- Verificar `/api/health` (sem alteração — extensão `chatwoot_facts.{by_X}` fica para v0.9).
- Logs do worker (`docker service logs nexus-insights_worker`): `[worker.refresh-by-X] done <jobId> { accounts: N, days: 7, errors: 0 }` a cada 5 min.

### Riscos conhecidos / TODO v0.9

- `triggerBackfill` enfileira `{ days }` em `job.data` mas `processRefreshByX` ainda ignora — janela rolling fixa de 7 dias permanece. (Fácil de estender; documentado em `src/lib/actions/jobs.ts` e na nota de rodapé do painel.)
- 9 relatórios ainda on-demand (lista acima).
- Snapshot live (open_at_eod, pending_at_eod) só é gravado para "hoje" — dias passados ficam zerados.
- Statement timeout do pool Chatwoot mantém os 30s históricos do app (worker não tem isolamento próprio nessa release).

---

## [v0.7.0] 2026-04-29 — Polimento UX + Agente Nex 2.0

> Polimento amplo após release v0.6.1 — atende feedback crítico do usuário sobre sidebar, filtros, conversas, tour e configuração do Agente Nex.

### Adicionado

- **`<PageShell variant="wide" | "narrow">`** — wrapper de largura por contexto. `wide` = 1600 px (relatórios), `narrow` = 1280 px (admin). Substitui o `max-w-7xl` global do layout protegido. Resolve o problema de monitor 27" ficar com sobra inutilizada.
- **`<Sheet>` + `<CollapsibleSection>` + `<MultiSelectCheckbox>` 2.0 + `<SearchableSelect>` + `<TierBadge>`** — primitivos de UI novos para drawer lateral, seções colapsáveis, multi-select com busca e Selecionar todos/visíveis, single-select com busca, e badge de consumo (FREE / $ / $$ / $$$).
- **Filtros — toolbar compacta + drawer**: substitui o cards-de-multi-select por toolbar com Período + Busca + chip "Filtros · N" que abre drawer lateral com 5 seções colapsáveis (Caixa de entrada, Departamento, Atendente, Status, Prioridade). Cada seção tem busca interna e Selecionar todos/visíveis. Chips de filtros aplicados aparecem inline com X por grupo + "Limpar tudo".
- **Tour de Conversas estendido** de 4 → 9 etapas: período, busca, filtros, ordenação (com explicação shift+click), colunas, page size, tabela, abrir no Chatwoot, refresh.
- **Tours estendidos / criados** para Visão Geral, Performance, Equipe, Distribuição, Origem & IA e Mensagens não respondidas.
- **`getInboxesForUser()`** — helper que respeita `reports.include_matrix_ia` + role. Aplicado nas páginas de Conversas e Mensagens não respondidas, escondendo a inbox 31 dos dropdowns para não-superadmins quando flag OFF.
- **Empty state com "Limpar filtros"** na tabela de Conversas quando há filtros aplicados.
- **PROVIDER_CATALOG (LLM)** — catálogo rico de modelos (abril/2026) por provider, com tier de custo (`free/low/medium/high`), URLs de API key e top-up. OpenAI: GPT-4o, 4.1, o1/o3/o4. Anthropic: Claude 3.5/4.5/4.6/4.7. Gemini: 1.5/2.0/2.5. OpenRouter: ~17 modelos cobrindo open-source free.
- **Configuração Agente Nex 2.0**:
  - Select de modelo via `<SearchableSelect>` com busca interna e badge de tier.
  - Primeira opção sempre **"Outro (digitar manualmente)"** — habilita campo livre.
  - Atalhos abaixo do API key: "Criar API key" + "Adicionar crédito" (links nativos por provider).
  - **Teste de conexão profundo**: detecta `invalid_key`, `model_not_found`, `no_credit`, `rate_limit`, `network`. Por provider: OpenAI usa `/v1/models` antes da chat; Anthropic detecta `credit_balance_too_low`; OpenRouter consulta saldo via `/credits`.
  - **Auto-save após teste OK** (com `creditOk !== false`). Save manual = test + save.

### Mudou

- **Tagline "Relatórios e insights" → "Relatórios Inteligentes"** no login e topo do sidebar.
- **Sidebar — active state**: pílula sólida sutil (`bg-violet-500/10` + violet text). Submenu ativo: dot violet à esquerda + sem pílula full. Sem mais "borda esquerda violet arredondada".
- **Sidebar — `isActive` longest-prefix-match**: corrige bug em que clicar em "Consumo IA" marcava também "Configurações" como ativo. Folhas usam exact / sub-rota; grupos usam prefix.
- **`AdvancedFilters`** completamente refatorado para toolbar+drawer (mantém prop API pública).
- **"Equipe" → "Departamento"** no filtro (mantém key interna `teamIds`).
- **Labels da tabela Conversas**: chips neutros (sem cor por hash). Todas as labels visíveis com `flex-wrap` (sem `+N` por padrão).
- **Atributos da tabela Conversas**: agora exibe chips `chave: valor` (com tooltip completo). `defaultVisible: true`.
- **Coluna "Ações"** da tabela Conversas: refator via `buildColumns(accountId)` factory; `<OpenInChatwoot>` definido direto no `render`.
- **Tour overlay**: popover mede altura real via `ResizeObserver` (sem mais estimativa fixa de 200 px que cortava botões); largura adapta-se a viewports < 480 px.
- **Cópia do toggle Matrix IA** ampliada: deixa explícito que afeta tabelas, gráficos, KPIs e dropdowns.
- **Origem & IA**: gating Matrix IA agora usa a flag canônica `reports.include_matrix_ia` (antes usava feature flag separada — desconexa do toggle).

### Corrigido

- **`MATRIX_IA_INBOX_ID = 31`** centralizado em `src/lib/constants/matrix-ia.ts` (evita magic number).

### Testes

- 6 novos componentes UI base com cobertura TDD: `Sheet` (3), `CollapsibleSection` (4), `MultiSelectCheckbox` (6), `SearchableSelect` (4), `TierBadge` (4), `PageShell` (3).
- `getInboxesForUser` (6 cenários: super_admin, manager flag ON/OFF, viewer, admin, stale).
- `isLeafActive` longest-prefix-match (12 cenários incluindo `/configuracoes/consumo`).
- `LabelsChips` neutro sem cap (4).
- Filtros: `AppliedFiltersChips` (8) + `FiltersDrawer` (8).
- LLM 2.0: `PROVIDER_CATALOG` shape; `deepTest` por provider mocking `fetch`.

### Quebras / migrações

- O `MultiSelectFilter` interno de `mensagens-nao-respondidas-filters.tsx` foi substituído pelo `<MultiSelectCheckbox>` 2.0 (drop-in compatível).
- Páginas em `src/app/(protected)/*` agora envolvem o conteúdo em `<PageShell>` (não havia `max-w-*` direto no `page.tsx` antes — era do layout). Sem impacto funcional.

---

## [v0.6.1] 2026-04-29 — Tabela Conversas parruda + Busca global + Tour + Toggle Nex/Matrix IA

### Corrigido (crítico)
- **Erro 500 em `/relatorios/performance`, `/equipe`, `/distribuicao`, `/visao-geral`, `/origem-ia`**: Server Components passavam funções (`render`, `formatValue`) diretamente para Client Components — proibido em React 19/Next 16. Criados 4 client wrappers (tempos-resposta-bar, sla-policies-table, ranking-atendentes-table, por-estado-table) e 10 contents foram envolvidos em try/catch com `<ErrorState>` em vez de propagar exception.
- **Bug `column t.color does not exist` em /relatorios/conversas**: schema da tabela `tags` do Chatwoot tem só id/name/taggings_count. Removida referência a `t.color`. `<LabelsChips>` agora gera cor determinística via hash do nome.
- **BadgeSelect dropdown não abria** (status na tabela /usuarios + nível no dialog Editar): classes `scale-95 opacity-0 fill-mode-forwards` deixavam o popover invisível para sempre. Removidas. Z-index elevado para 1000.

### Adicionado
- **Wizard 3 etapas no Novo/Editar Usuário** voltou: Identidade → Acesso (condicional por nível) → Confirmação. Super_admin pula etapa Acesso (banner "Acesso total"); admin/viewer com multi-select de contas; gerente com contas + departamentos. Stepper visual no topo.
- **Dropdown Nível de acesso** virou combobox vertical (não pill) com ícone + label semibold + descrição + check, via portal/fixed pra não ser cortado pelo dialog.
- **Owner immutability total**: owner não pode ser editado/deletado por NINGUÉM (incluindo si mesmo via /usuarios — edita-se via /perfil). Super_admin pode editar/deletar OUTROS super_admin não-owner. 28 testes em `permissions.ts`.
- **Busca global Cmd/Ctrl+K** na sidebar:
  - Barrinha no topo da sidebar (substitui o conteúdo onde estava o account switcher)
  - Modal full-screen com portal + backdrop blur
  - Busca em Empresas (contas Chatwoot) + Usuários (super_admin/admin) + Páginas
  - Setas ↑↓ navegam, Enter abre, ESC fecha
  - Resultados agrupados com contadores
  - Atalho Cmd+K (Mac) / Ctrl+K (outros) detectado automaticamente
- **Account Switcher movido pro fundo da sidebar** (acima do user info).
- **Pill "Todos"** nos filtros de período: cobre desde o epoch (1970-01-01) até agora — pega TUDO do banco.
- **Custom range ILIMITADO**: removido cap de 90 dias. `mín = primeiro registro do banco` (busca via `getMinReportDate(accountId)`); `máx = hoje`.
- **`<RefreshButton>`** ícone giratório em todas as pages de relatório (router.refresh + useTransition).
- **`<LoadingOverlay>`** durante filter transitions com spinner + texto "Carregando relatório...". Provider compartilhado `<FilterTransitionProvider>` envolve `AdvancedFilters` + `PeriodSelectorUrl` + filters.
- **Toggle Matrix IA** em /configuracoes (super_admin only): Switch ON/OFF na key `reports.include_matrix_ia`. OFF: esconde inbox 31 dos não-super_admin. Super_admin sempre vê tudo. Helper `shouldExcludeMatrixIA()` aplicado em todas queries.
- **Tabela Conversas parruda** (refatoração 100%):
  - 16 colunas configuráveis: #, Nome, WhatsApp, **Documento** (CPF/CNPJ via detectDocument), Estado, Departamento, Atendente, Status, Prioridade, Labels, **Sem resposta há**, **Aberta há**, **Criado em**, **Última atualização**, atributos custom, Ações.
  - **Sort clicável** com cycle `null → asc → desc → null`, indicador `ChevronUp/Down`.
  - **Multi-sort hierárquico** via Shift+click (badge numerado 1, 2, 3 nos headers).
  - **Esconder colunas**: botão "Colunas" abre popover com checkboxes (persistido em localStorage chave `conversas-table-cols`). Padrão: todas selecionadas. Atalhos "Selecionar todas" / "Desmarcar todas".
  - **Selector de quantidade**: 50 / 100 / Todos (max 10000) — persistido em localStorage.
  - **Tempo sem resposta**: status=1 → "—". Aberta + última msg incoming → `now - last_incoming_at`. Caso contrário → "—".
  - **Tempo aberta**: status=1 → "—". Aberta + última msg outgoing → `now - last_outgoing_at`. Caso contrário → "—".
  - Cálculo via `EXTRACT(EPOCH FROM ...)` no Postgres com `CASE` por status.
  - Mobile vira cards com mesmas informações.
- **Tour/Tutorial passo-a-passo** com botão "?" no header dos relatórios:
  - `<TourProvider>` context montado no protected layout
  - `<TourOverlay>` com SVG-mask spotlight no target + halo violeta + popover adaptivo
  - Backdrop blur, animações Framer Motion respeitando `prefers-reduced-motion`
  - Tours definidos: dashboard, conversas, mensagens-não-respondidas
  - Esc fecha, setas navegam, "Pular tour" disponível
- **Toggle ON/OFF do Agente Nex bubble** em /configuracoes:
  - Bloco "Status do agente" no topo do `<LlmConfigCard>` com Switch + dot esmeralda glow (ON) / cinza (OFF)
  - Setting `nex.bubble_enabled` em `app_settings`. Default: ON quando há LLM config ativa, OFF caso contrário.
  - Layout protegido renderiza `<NexBubble />` condicionalmente.
  - Switch desabilitado quando não há config LLM (com tooltip).

### Mudanças de comportamento
- `PeriodKey` agora tem 5 valores canônicos: `hoje | semana_atual | mes_atual | todos | custom`.
- Custom range não é mais 90 dias máx — é todo o histórico do banco.
- Conversas table state (sort/cols/page-size) persistido por usuário em localStorage.

### Tests
- 279 testes Jest passando (241 → 279 desde v0.6.0).

---

## [v0.6.0] 2026-04-29 — Refazer fiel ao Roteador + Agente Nex IA + relatórios consolidados

### Corrigido
- **Filtros que aplicavam automaticamente** virou filtros com botão "Aplicar" via novo `<AdvancedFilters>` (estado interno draft vs URL applied).
- **Cap artificial de 90 dias** no custom range removido — agora cobre desde a primeira linha do banco.
- **Loading state ausente** virou skeleton screens em todas as pages (TableSkeleton, CardSkeleton, ChartSkeleton, ProfileCardsSkeleton).
- **Dashboard sem gráficos** virou /dashboard com line chart Recharts (Recebidas + Resolvidas) + 4 KPIs clicáveis com sparkline + Top 5 cards + Recent Conversations table + drill-down sheets.
- **/perfil divergente do Roteador** refeito fielmente (4 cards stack vertical: Informações Pessoais com avatar+Membro desde / E-mail / Senha / Aparência 3 toggles).
- **/usuarios divergente** refeito fielmente (BadgeSelect inline pra Nível/Status, modal único Criar/Editar — sem wizard de 3 passos, lápis + lixeira nas Ações, owner imutável).

### Adicionado
- **`<BadgeSelect>`** componente reutilizável (dropdown com badges coloridos + ícones) — usado em /usuarios pra Nível/Status inline.
- **`<AdvancedFilters>`** filtros multi-campo com botão Aplicar (não auto-apply), estado draft vs URL applied, indicador "X filtros pendentes", multi-select por inbox/team/atendente/status/prioridade.
- **`<SortableTable>`** + **`<GroupableTable>`** + **`useSortableData`** hook — ordenação clicável por coluna (asc/desc/null cycle) + agrupamento + a11y (aria-sort).
- **`<ConditionalFilters>`** Where-clause builder (AND/OR + 10 operadores eq/neq/gt/lt/contains/in/etc., grupos aninhados) + `applyConditions()` puro.
- **Charts library** (`src/components/charts/`): InteractivePieChart, DonutWithCenter, InteractiveBarChart, InteractiveAreaChart, InteractiveRadialBarChart, ChartTooltip, EmptyChartState — todos com animação 800ms, hover dim, tooltip rico, prefers-reduced-motion respeitado.
- **`<ErrorState>`** + **`<ErrorStateRetry>`** + skeleton variants (TableSkeleton, CardSkeleton, ChartSkeleton, ProfileCardsSkeleton).
- **Dashboard drill-down**: clique em qualquer KPI abre `<DrillDownSheet>` lateral com gráficos detalhados (LineChart + BarChart + AreaChart + tabela) e queries específicas por KPI.
- **5 super-relatórios** consolidando os 12 antigos:
  - `/relatorios/visao-geral` (Status pie + Volumetria)
  - `/relatorios/performance` (Tempos resposta + SLA + CSAT)
  - `/relatorios/equipe` (Ranking + Por departamento)
  - `/relatorios/distribuicao` (Por estado + Horário)
  - `/relatorios/origem-ia` (Leads + Matrix IA)
- **Standalone**: `/relatorios/conversas`, `/relatorios/mensagens-nao-respondidas`.
- **Redirects 302** das 10 rotas antigas (status-conversas, sla, tempos-resposta, ranking-atendentes, por-departamento, por-estado, volumetria, leads-recebidos, matrix-ia, csat) para os super-relatórios.
- **Catálogo de relatórios** + **toggle ON/OFF** em /configuracoes (super_admin) — sidebar respeita imediatamente após salvar (revalidatePath).
- **Footer "Nexus AI © 2026. Todos os direitos reservados"** fixo no rodapé da sidebar.

### Agente Nex (IA com query no DB Chatwoot)
- **Bubble flutuante** `<NexBubble>` bottom-right em todas pages protegidas — gradient violet com glow pulsante, indicador online, respeita prefers-reduced-motion.
- **Chat panel** `<NexChatPanel>` (sheet bottom-right desktop / fullscreen mobile) com markdown rendering, persistência localStorage (40 msgs cap), sugestões iniciais, textarea auto-grow, Enter envia / Shift+Enter quebra.
- **7 tools (function calling):** `query_conversations`, `query_messages`, `query_users`, `query_contacts`, `aggregate_conversations`, `get_top_agents`, `get_dashboard_summary`.
- **Multi-provider LLM:**
  - Adapters via `fetch` puro pra OpenAI / Anthropic / Gemini / OpenRouter — interface comum `ProviderClient.chat({messages, tools})`.
  - Mock automático quando API key vazia/MOCK (permite UI testável sem key real).
  - Pricing por modelo (gpt-4o, claude-3-5-sonnet, gemini-2.0-flash, etc.).
- **UI config** em /configuracoes (super_admin): card "Agente IA (Nex)" com select de provider + modelo + API key (encrypted AES-256-GCM no DB) + botão "Testar conexão" + status badge.
- **Dashboard de consumo** `/configuracoes/consumo` (super_admin): KPIs (chamadas/tokens/custo), gráficos (custo por dia, distribuição por provider, custo por modelo), tabela paginada, filtros sem cap superior (mín = data de criação do sistema), pill "Tudo" cobre desde o início.
- Tabelas DB novas: `llm_configs` + `llm_usage` (criadas via `CREATE TABLE IF NOT EXISTS` idempotente).
- Logging automático de cada chamada do agente em `llm_usage`.

### Mudanças de comportamento
- `PeriodKey` canônico: 4 valores (`hoje | semana_atual | mes_atual | custom`). Fallback síncrono em `getPeriod` pra chaves legadas (ontem/7d/30d/mes_anterior) ainda funciona via Date local.
- Filtros condicionais: novo padrão Where-clause builder disponível mas ainda não aplicado em pages (uso futuro).
- Charts dos relatórios devem usar componentes de `src/components/charts/*` (B6) — Recharts direto agora é exceção.

### Removido
- 10 pages antigas de relatórios (substituídas por redirects 302 para os super-relatórios).
- `kpi-clickable.tsx`, `top5-card.tsx` (substituídos por StatsCard / KpiClickableCard / Top5ListCard).
- `edit-user-dialog.tsx`, `users-table.tsx`, `role-badge.tsx` (consolidados em `users-content.tsx` + `user-form-dialog.tsx`).
- `conversas-filters.tsx`, `period-selector.tsx` (substituídos por `AdvancedFilters` + `PeriodPills`).

### Tests
- 241 testes Jest passando (95 → 241 desde v0.5.0).
- Cobertura: helpers (datetime, filter-state, format-document, generate-temp-password, apply-conditions, calculateCost, charts colors), hooks (useSortableData), tools (Nex definitions + run-nex), providers (mock factory + interface), queries (usage-stats, catalog).

### Stack atualizado
- Recharts 3 (charts)
- Framer Motion 12 (animações)
- date-fns + date-fns-tz (datas com TZ)
- base-ui (Popover, Dialog, Sheet, Tabs)
- Lucide (icons)

---

## [v0.5.0] 2026-04-29 — Foundation + UX shell + dashboards operacionais

### Crítico (corrigido)
- **Login quebrado** (`?error=Configuration`): pg-node SCRAM falhava ao resolver `db` (DNS overlay Swarm devolvia 2 IPs, um stale). Corrigido em duas frentes: (1) `pg_hba.conf` do db container alterado pra `trust` no overlay interno; (2) `DATABASE_URL` aponta agora pra `nexus-insights_db:5432` (FQDN do serviço Swarm) em vez de `db:5432`.
- **Owner trancado pós regen-senha:** botão regen-senha **escondido** (não disabled) pra `isOwner`. Idem botão delete e dropdown de status.
- **Auth bypass Prisma:** `authorizeCredentials` e `logAudit` agora usam `pgPool` raw (`@/lib/pg-pool`) — adapter do Prisma 7 + SCRAM tava dando `AuthenticationFailed` esporádico.

### Adicionado
- **Helpers datetime** (`src/lib/datetime.ts` + `src/lib/datetime-core.ts`): `getPlatformTz()`, `getPlatformLocale()`, `getPeriodInTz()`, etc. Cache 60s, fallback `America/Sao_Paulo` / `pt-BR`. Server action `updatePlatformSettings` (super_admin) com invalidação de cache reports.
- **`platform.timezone` e `platform.locale` em AppSetting**: chaves novas, lazy default (sem migration). UI em `/configuracoes` (super_admin).
- **Senha temporária simples** (`generateTempPassword`): 8 chars alfanuméricos, sem confundíveis (`0`, `1`, `i`, `l`, `o`, `I`, `L`, `O`).
- **/perfil 4 cards** no padrão Roteador Webhook Meta: Informações Pessoais, E-mail, Senha, Aparência (3 toggles grandes Escuro/Claro/Sistema). Layout 2x2 desktop, stack mobile.
- **/usuarios redesign:** Switch de status virou Select dropdown; coluna Ações com lápis editar (EditUserDialog 3 tabs); regen + delete escondidos pra owner; NewUserDialog vira wizard 3 passos com preview da senha temp gerada.
- **Filtros pills mobile-friendly:** 4 períodos (Hoje / Esta semana / Este mês / Personalizado) com `overflow-x-auto snap-x` no mobile, Popover com calendário no desktop, Sheet bottom no mobile. Range custom max 90 dias.
- **Account switcher condicional:** escondido quando user só tem ≤1 conta.
- **TZ Brasil em todos os relatórios:** helper `resolvePeriod(searchParams)` em `src/lib/reports/resolve-period.ts`.
- **Dashboard novo:** 4 KPIs clicáveis (Em Aberto, Pendentes, Resolvidas no período, Mensagens não respondidas) + 3 cards Top 5 (atendentes mais rápidos, mais conversas em aberto, inboxes mais carregados).
- **Mensagens não respondidas (nova tela):** `/relatorios/mensagens-nao-respondidas`. Lista conversas open com última msg incoming. KPIs no topo (Total / Tempo médio / Mais antigo). Mobile cards.
- **Conversas redesign:** 11 colunas (Nome | WhatsApp | Documento | Estado | Departamento | Atendente | Status | Prioridade | Labels | Ações). Removida "Última mensagem". Documento detectado via `identifier` → `additional_attributes.cpf|cnpj` → regex. Labels via `json_agg` com cor de fundo + contraste por luminância. Mobile vira cards.
- **Sidebar reorganizado** com seções (Dashboard / Relatórios / Administração) + item "Mensagens não respondidas".
- **Middleware** com `REDIRECT_MAP` pronto pra ativar consolidação 11→4 (futuro v0.5.1).
- **30+ testes Jest novos:** total 114 testes passando.

### Mudanças de comportamento
- `PeriodKey` reduzido pra 4 valores canônicos (`hoje | semana_atual | mes_atual | custom`). Chaves legadas (`ontem | 7d | 30d | mes_anterior`) ainda funcionam via fallback síncrono.
- Build target: client bundle não puxa mais `pg`/`pg-pool` graças ao split `datetime-core` (puro) vs `datetime` (server-only).

### Pendente (próximo release v0.5.1)
- Consolidar os 11 relatórios em 4 dashboards (`/relatorios/operacao`, `/relatorios/atendentes`, `/relatorios/distribuicao`, `/relatorios/origem-resultado`) com Tabs internas + redirects 302. `REDIRECT_MAP` em `src/middleware.ts` já está com a estrutura pronta.

---

## [PR-B] 2026-04-14 — Pipeline ingest via @nexusai360/webhook-routing

### Adicionado
- `PrismaWebhookAdapter` (`src/lib/webhook/adapter.ts`) implementando `WebhookAdapter` do pacote — mapeia tipos Prisma ↔ records do pacote, captura P2002 retornando inbound existente.
- `instrumentation.ts` (raiz) configura adapter no boot do Next runtime (Node.js).
- `src/worker/index.ts` chama `configureWebhookRouting(webhookAdapter)` no startup.
- Helper `src/lib/webhook/enqueue.ts` — preserva `InboundWebhook.processingStatus = "queued"` com BullMQ jobId determinístico.
- Migration `prisma/migrations/20260414000000_inbound_unique_dedupe/migration.sql` com `UNIQUE(companyId, dedupeKey)` — **criada, não aplicada** (operador roda `prisma migrate deploy` em ambiente conectado; cleanup de duplicatas documentado no `.sql`).
- Flag `USE_PACKAGE_PIPELINE` (default off) — opt-in para o novo pipeline no handler POST.
- `src/app/api/webhook/[webhookKey]/route-inline.ts` mantém pipeline antigo como fallback (deletado em PR-C ~7d após estável).
- Helpers legacy congelados em `src/lib/webhook/legacy/{normalizer-legacy,deduplicator-legacy}.ts` (+ testes movidos para `legacy/__tests__/`).
- Helper de testes `src/__tests__/utils/fake-adapter.ts` (adapter in-memory).
- Testes novos: `adapter.test.ts` (7 cases), `webhook-ingest.test.ts` reescrito (8 cases pipeline novo + flag off), `normalizer.test.ts` reescrito para o novo NormalizedEvent (7 cases).
- Script `scripts/smoke-webhook.mjs` — tráfego sintético HMAC-assinado a cada 30s.
- Runbook `docs/runbooks/webhook-routing-cutover.md`.
- Dev dep: `jest-mock-extended@^4.0.0` (Jest 30 compat).

### Mudanças de comportamento
- `listRoutes` é chamado UMA vez por callback (antes: por evento). Rotas criadas durante processamento de callback multi-evento não recebem deliveries para eventos posteriores no mesmo callback. Diferença teórica — callbacks Meta típicos têm 1–3 eventos.
- Dedupe de `errors.*` (eventos sem ID natural) recomeça do zero pós-deploy: `hashPayloadDeterministic` recursivo do pacote difere do `hashContent` top-level antigo. Aceitável: errors são raros, downstream apenas enfileira HTTP delivery.
- `messages.*` / `statuses.*` / `calls.*` mantêm chave de dedupe **byte-idêntica** (verificado spec I1).
- `normalizer.ts` mudou assinatura: agora recebe `(payload, companyId)` (2º arg é fallback de sourceId). Consumidores legacy continuam via `legacy/normalizer-legacy.ts`.

### Cutover
1. Merge com flag default OFF — produção segue inline.
2. `USE_PACKAGE_PIPELINE=true` em staging por 24h com tráfego sintético (`scripts/smoke-webhook.mjs`).
3. Flip em produção, monitorar 24h (runbook).
4. PR-C deleta `route-inline.ts`, flag, helpers legacy após 7d estáveis.

## [PR-A] 2026-04-14 — Helpers via @nexusai360/webhook-routing@0.2.1

### Adicionado
- Dependência `@nexusai360/webhook-routing@0.2.1` via vendor tarball + verify SHA256.
- Peer deps (tambem via vendor tarball): `@nexusai360/types@0.2.0`, `@nexusai360/core@0.2.1`, `@nexusai360/multi-tenant@0.2.1`.
- Script `scripts/verify-vendor.mjs` + `preinstall` hook validando checksums dos tarballs.
- Config Jest: `moduleNameMapper` resolvendo o pacote e subpaths para `dist/*.cjs`.

### Mudanças de comportamento (SSRF — bloqueios novos no egress de webhooks)
- **CGNAT (100.64.0.0/10)** agora bloqueado. Rotas configuradas para esse range passam a falhar.
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d` decimal e `::ffff:hhhh:hhhh` hex) bloqueado quando mapeia para IPv4 privado.
- **Hostnames extras bloqueados:** `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`, `broadcasthost`.

### Mudanças cosméticas
- Mensagens de erro SSRF agora são códigos estruturados (`private_ipv4`, `non_https_protocol`, `blocked_hostname`, etc.) em vez de strings em português.

### Sem mudanças
- Pipeline de ingest, normalizer, deduplicator, schema Prisma, worker — intactos. Vão ser migrados em PR-B.
