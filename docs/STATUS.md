# Status — Nexus Insights

**Última atualização:** 2026-05-01
**Versão atual em produção:** v0.16.0
**URL:** https://insights.nexusai360.com

---

## Em produção (v0.16.0)

### Release v0.16.0 (2026-05-01) — Suite Agente Nex · Refinement

Pacote consolidado de polish da Suite Agente Nex (lançada em v0.15.x). Workflow rigoroso (spec v1→v2→v3 com 51 achados de pente-fino + plan v1→v2→v3 com 50 tasks granulares TDD + ui-ux-pro-max em todas as tasks de UI). 982 testes verde · typecheck 0 erros · build verde.

**A. Tela "Chaves de API"** — header padronizado (ícone + label + atalho "Criar API key" + botão "Nova chave" gradient), AlertDialog substituiu `window.confirm` na exclusão, card vazio com 2 CTAs amigáveis.

**B. Tela "Configuração do Agente Nex"** — `space-y-8` com sections `border-t`, modelo customizado **inline** (`<SearchableSelect customMode>`), 4 tiers (low / medium / high / **premium** novo para >$30/M output), catálogo OpenRouter expandido para **118 modelos** (DeepSeek V3/V4/R1, Qwen 2.5/3/3.6, Llama 3.1/3.3/4, Mistral, Cohere R/R+, xAI Grok 2/3/4/4.20/4.3, Phi-4, Hermes 3, Liquid LFM, Reka, Perplexity Sonar, Inflection, etc).

**C. Tela "Prompt do Agente Nex"** — **PromptPreviewCard** novo (preview client-side em tempo real via `composeSystemPrompt` isomórfico), "Modo override avançado" → **"Modo prompt manual"** com AlertDialog warning, **PlaygroundSheet** lateral substitui playground inline (max 20 msgs FIFO efêmero), IDENTITY_BASE blindada contra "ChatGPT/GPT/Claude/Gemini/OpenAI/Anthropic/Google" como identidade, guardrails default seedados via `seeded_defaults_at` (idempotente), KB aceita **URL** com SSRF guard (`assertPublicUrl` bloqueia RFC1918 + loopback + link-local + cloud metadata) + fetcher 10s/5MB/html-to-text.

**D. Tela "Consumo do Agente Nex"** — PeriodPills compartilhada com /relatorios/conversas, KPIs uniformes 4 casas decimais (`formatBrl4`/`formatUsd4`) + `min-h-[128px]`, ícone `Activity` (era `PhoneCall`), gráficos com eixo Y `R$` 2 casas + fonte 13px + datas `30/ABR`, donut tooltip top-right (não cobre mais o donut/centro), tabela renomeada **"Histórico de chamadas"**, filtros server-side cascateados Provider→Modelo, linha total sticky no topo, drill-down `<UsageDetailSheet>` com 5 seções (Identificação/Tokens/Duração/Custo/Erro) + spread embutido + Whisper "—" tokens, paginação 3-zonas (25/50/100), USD/BRL bruto na tabela.

**E. Calendar global** — `weekStartsOn=1` (segunda-feira) + `showOutsideDays=false` por default em todos os usages (resolve bug visual maio 1-2 não aparecendo em abril).

**F. URLs Públicas Chatwoot** — card novo em `/configuracoes` (super_admin only): lista accounts via `listKnownAccountIds()` (DISTINCT em `chatwoot_facts_daily_by_account`) + input URL + Salvar explícito por linha (UPSERT; URL vazia → DELETE; audit). Schema novo `model ChatwootAccountUrl`. Agente Nex injeta seção "## URLs públicas das contas" no system prompt (apenas com override desligado e ≥ 1 account configurada). Deep-links formato `{publicUrl}/app/accounts/{accountId}/conversations/{conversationId}`.

**G. Schema, Audit, Deploy** — migration aditiva `20260501_v0_16_kb_url_chatwoot_urls_audit`: `nex_kb_documents` ganha `kind` + `source_url`; `nex_settings` ganha `seeded_defaults_at`; tabela `chatwoot_account_urls` nova; backfill condicional dos 5 guardrails default. Audit log universal em toda mutação (prompt config, KB doc, ChatwootAccountUrl).

Runbooks: `docs/runbooks/agente-nex-prompt-v0.16.md`, `docs/runbooks/consumo-drill-down-v0.16.md`, `docs/runbooks/chatwoot-account-urls.md`.

---

## Releases recentes

### v0.15.x — Suite Agente Nex (sidebar dedicado + áudio + prompt config)

- **v0.15.0** (2026-05-01) — Menu lateral `/agente-nex` (4 sub-páginas: Configuração / Chaves / Prompt / Consumo). Gravação de áudio na bolha (Whisper, cap 5 min), AudioPlayer custom (5 velocidades + seek), copy button universal, system prompt configurável (personalidade/tom/guardrails/override), KB PDF/TXT (`pdf-parse`, cap 30k chars), playground inline, toggles audio+KB, redirect 308 `/configuracoes/consumo` → `/agente-nex/consumo`.
- **v0.15.1** — Hotfix microfone bloqueado por `Permissions-Policy: microphone=()` → `microphone=(self)`.
- **v0.15.2** — Hotfix UX bubble audio (3 bugs): input bar reorganizado, timer respeita pause via `recordedMsRef + segmentStartedAtRef`, AudioPlayer speed dropdown vira botão cíclico Gauge.
- **v0.15.3** — Hotfix AudioRecorder unmount loop: instância única sempre montada; só siblings (textarea + Send) renderizam condicional.
- **v0.15.4** — Hotfix UX bubble audio refinements (4 ajustes): AudioPlayer speed sem ícone Gauge (texto puro + border-violet); input bar layout estável (`flex items-end gap-2` idêntico em idle e gravando); player aparece imediatamente ao enviar (audioMsg + loadingMsg antes do Whisper); persistência IndexedDB para áudios (`src/lib/nex/audio-storage.ts` saveAudio/getAudio/deleteAudio/clearAllAudios + skeleton "carregando áudio…").

### v0.14.x — Dashboard polish

- **v0.14.0** (2026-05-01) — Pill "Hoje"→"Dia", PeriodNavigator (← →) no canto sup-direito do chart, eixo X cobrindo todo o range (semana/mês inteiros), `forcedGranularity`, `formatWaiting` centralizado, cache key v5→v6.
- **v0.14.2** (2026-05-01) — Coorte por `last_activity_at` em open/pending/no-response/byTeam/topInboxes/byStatus(0,2,3); received/resolved e byStatus(1) mantêm `created_at`. Bug crítico resolvido: conversa criada 30/04 reaberta 01/05 não aparecia em "Abertas". SQL chart com FULL OUTER JOIN de 2 CTEs. Cache v6→v7.
- **v0.14.3** (2026-05-01) — Bug "Tudo respondido" mesmo com conversa do contato sem resposta: CTE `last_msg` pegava activity (msg_type=2) e template (msg_type=3) como "última msg". Fix: `WHERE m.message_type IN (0,1)`. Cache v7→v8.

### v0.13.x — Dashboard configurabilidade + LLM hotfixes

- **v0.13.0** (2026-04-30) — Configurações de Dashboard (início da semana + modo current/rolling), drill-down de status completo, paginação server-side 50/pg, eixo X cheio 0–24h, pills `7 dias`→`Semana`/`30 dias`→`Mês`.
- **v0.13.1** — Backfill BRL: `cost_brl` + `usd_to_brl_rate` em rows BRL=NULL (cotação atual cartão como aproximação retroativa).
- **v0.13.2/v0.13.3** — Rollback parcial (ConversationsLineChart simplificado + `getDashboardPeriod`/`getDashboardSettings` removidos por ReferenceError em runtime).
- **v0.13.4** — `deepTestOpenAI`: 404 e 400 capturam o body e exibem mensagem oficial da OpenAI no toast.
- **v0.13.5** — `PROVIDER_CATALOG.openai` reescrito com 19 IDs reais (validados em developers.openai.com/api/docs/models/all). Removidos IDs inventados (gpt-5.1-mini etc).
- **v0.13.6** — Probe "Testar conexão" usa `max_completion_tokens=256` e trata "max_tokens limit reached" como `reachable=true`. `translateProviderMessage(raw, model)` mapeia padrões EN→PT em todos os providers.
- **v0.13.7/v0.13.8/v0.13.9** — Dashboard chart redesenhado: `formatDuration "1 dia"/"3 dias"`, `actions/dashboard.ts` voltam com try/catch defensivo + FALLBACK_SETTINGS, 4 séries multi-cor, eixo X cheio. Hotfix RSC error: `dashboard-settings` simplificado (sem `server-only` + WHERE key IN literal). Visibility Agente Nex Matrix IA fix.

### v0.12.x — Credenciais LLM + BRL

- **v0.12.0** (2026-04-30) — Credenciais (API keys) gerenciáveis por provedor (CRUD com ponto verde marcando a ativa). Cotação USD→BRL cartão capturada por chamada (`llm_usage.cost_brl` + `usd_to_brl_rate`, AwesomeAPI cache 4h, spread `app_settings.llm.usd_brl.card_spread` default 1.10). Custo BRL como primário no Consumo Nex. "Agente IA" → "Agente Nex" em todos call-sites. Schema (runtime via `ensureLlmTables`): `llm_credentials`, `llm_configs.credential_id` (NULL), `encrypted_api_key` NULLABLE.
- **v0.12.1** — GPT-5.x/o-series usam `max_completion_tokens` sem `temperature`. `MODEL_PRICING` atualizado abril/2026. Card Agente Nex com abas internas (Configuração/Chaves de API). Spread cartão sem limite superior + custos com 3 casas decimais. Visibility Matrix IA "Ninguém" respeitada inclusive para super_admin. Tarja preta no overscroll eliminada. `safeAction` wrapper em Server Actions.
- **v0.12.2** — Root cause "couldn't load": `src/lib/actions/exchange-rate.ts` tinha `export { DEFAULT_CARD_SPREAD }` em arquivo `"use server"`. Next.js 16 só aceita exports de funções async. Regra: arquivos em `src/lib/actions/**` só exportam funções async + tipos.
- **v0.12.3** — `GET /v1/models` valida só a chave; `POST /v1/chat/completions` valida o modelo. `backfillUsageCosts()` recalcula `cost_usd` em rows com `cost_usd=0`. `runNexAgent` registra `logUsage` por iteração de tool-call.

### v0.11.x — Visibilidade granular

- **v0.11.0** — Visibilidade granular por relatório (Todos / Somente super admin / Ninguém) para 7 relatórios + Matrix IA. Catálogo LLM cutoff abril/2026 (GPT-5 família + Sonnet/Opus 4.7 + Gemini 2.0 Pro + OpenRouter expandido).
- **v0.11.1** — Hotfix PageHeader (Server Component) — fix "This page couldn't load" desde v0.10.4.

### v0.10.0 — Dashboard Pulse

KPIs coorte única + sem-resposta hero + distribuições clicáveis (bar/donut toggle) + drill-down central + TZ fix + account selector consolidado no sidebar.

### v0.9.0 — Conversas Poderoso

Query builder E/OU + painel ordenação cadeia + drill-down inline + sticky toolbar/thead + status feminino + etiquetas + tipografia.

### v0.8.0 — Pré-agregação + infraestrutura

Pipeline assíncrono (5 jobs BullMQ a cada 5 min) popula 6 tabelas de fatos no banco interno; relatórios `volumetria-heatmap` e `volumetria-dow` migrados; SSE de invalidação dispara `router.refresh()` ao concluir job. Página `/configuracoes/jobs` (super_admin) com botão "Backfill 90 dias". Hotfix Bad Gateway: Dockerfile com chown correto em `/app/.next` resolve EACCES; `instrumentation.ts` adiciona handlers globais; `prisma/seed.ts` com adapter (Prisma 7).

### v0.7.0 — Polimento UX + Agente Nex 2.0

Sidebar/filtros/tour/largura + catálogo 42 modelos atualizados + deep test + auto-save.

---

## Plataforma

### Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + base-ui (`render` prop, NUNCA `asChild`)
- **Auth:** NextAuth v5 (JWT, Credentials, bcryptjs, session refresh por requisição via callback `jwt`)
- **DB app:** Postgres + Prisma v7 (`@prisma/adapter-pg`, client de `@/generated/prisma/client`)
- **DB Chatwoot:** Postgres read-only
- **Cache/queue/realtime:** Redis 7 + BullMQ + Redis Pub/Sub + SSE em `/api/events`
- **Tema:** ThemeProvider customizado via cookie SSR-aware (NUNCA `next-themes`); `fetch POST /api/user/theme`
- **Toast:** Sonner customizado (pilha bottom-up, timers independentes)
- **Ícones:** Lucide React (emojis proibidos em UI)
- **Encryption:** AES-256 (`src/lib/encryption.ts`)
- **Audit:** `src/lib/audit.ts → logAudit()`
- **Rate limit:** Redis para login + endpoints sensíveis
- **Soft delete:** padrão `deletedAt: DateTime?`
- **Testes:** Jest (`jest-mock-extended`, mocks de `@/lib/prisma`, `@/lib/auth`, `@/lib/audit`, `next/cache`)
- **Deploy:** GitHub Actions → GHCR (`ghcr.io/jvzanini/nexus-insights`) → Portainer Swarm + Traefik (SSL automático Let's Encrypt)

### Estrutura de pastas

- `src/app/(auth)` (rotas públicas) e `src/app/(protected)` (autenticadas)
- `src/lib/actions/` consolidado para Server Actions (regra: só exporta async functions + tipos)
- `src/lib/tenant.ts` (`getAccessibleCompanyIds`, `buildTenantFilter`, `assertCompanyAccess`)
- `src/lib/auth-helpers.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`
- `src/lib/nex/*` — prompt, kb, transcribe, audio-storage, ensure-tables
- `src/lib/llm/*` — credentials, get-active-config, pricing, exchange-rate, providers, queries, agent
- `src/components/nex/*` — bubble, chat-panel, message, audio-player, audio-recorder
- `src/components/agente-nex/*` — llm-config-form, prompt-config-form, resources-toggles, kb-section, kb-upload-dialog, playground
- `src/app/(protected)/agente-nex/*` — page, layout, configuracao, chaves, prompt, consumo
- `src/app/api/nex/transcribe/route.ts` — Whisper Route Handler

### RBAC

Duas camadas: `platformRole` (super_admin > admin > manager > viewer) + `companyRole` (Chatwoot multi-account, via `UserCompanyMembership`).

### Relatórios disponíveis (7)

- Dashboard / Visão Geral
- Performance
- Equipe
- Distribuição
- Origem & IA
- Conversas (15 colunas + filtros toolbar+drawer + ordenação multi-sort + busca interna)
- Mensagens não respondidas

### Funcionalidades

- **Filtros** — toolbar compacta + drawer lateral com busca interna, "Selecionar todos/visíveis", chips aplicados
- **Tour interativo** com botão `?` por relatório
- **Sidebar** com active state pílula sólida + dot violet (longest-prefix-match)
- **PageShell** com variantes wide (1600px) / narrow (1280px)
- **Visibilidade granular** por relatório (Todos / super_admin / Ninguém) + Matrix IA
- **Agente Nex** (chatbot IA bubble flutuante) com Suite dedicada `/agente-nex` (Configuração / Chaves / Prompt / Consumo)
  - 19 modelos OpenAI canônicos (validados em developers.openai.com)
  - Multi-provider (Anthropic, Gemini, OpenRouter — 42 modelos catalogados)
  - Áudio Whisper + system prompt config + KB (PDF/TXT) + playground
  - Custo BRL primário (cotação cartão por chamada)
- **Pré-agregação** — 6 tabelas de fatos refrescadas a cada 5 min via BullMQ + SSE; runbook em `docs/runbooks/pre-agregacao.md`

---

## Como continuar (em outra sessão / outro terminal)

Abrir o projeto e dizer **um dos seguintes**:

### Caso A — feature/bug pontual
> "Lê `docs/STATUS.md` (estado atual em produção) e me ajuda com [tópico]."

### Caso B — review do que está em produção
> "Faz um pente fino na produção (https://insights.nexusai360.com). Lista o que está bom e o que poderia melhorar."

### Caso C — continuar com novos relatórios
> "Lê `docs/superpowers/brainstorms/2026-04-30-novos-relatorios.md` (52 ideias categorizadas) e me ajuda a definir o que vem depois da Suite Agente Nex."

---

## Documentação canônica

- **`CLAUDE.md`** — regras supremas (skills obrigatórias + double-check + padrão arquitetural).
- **`AGENTS.md`** — protocolo multi-agente (active files + HISTORY).
- **`CHANGELOG.md`** — log de releases.
- **`docs/STATUS.md`** — este arquivo (estado atual + histórico curto).
- **`docs/agents/_README.md`** — protocolo coordenação detalhado.
- **`docs/agents/HISTORY.md`** — log append-only de atividade dos agentes.
- **`docs/superpowers/specs/`** — design docs (uma por feature).
- **`docs/superpowers/plans/`** — implementation plans (uma por feature).
- **`docs/runbooks/`** — runbooks operacionais.

Detalhes técnicos por release em `CHANGELOG.md` + design docs em `docs/superpowers/specs/`.
