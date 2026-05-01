# Status — Nexus Insights

**Última atualização:** 2026-04-30
**Versão atual em produção:** v0.13.1
**URL:** https://insights.nexusai360.com

---

## Em produção (v0.13.1)

### Hotfix v0.13.1 (2026-04-30) — backfill BRL no relatório de Consumo

- `backfillUsageCosts()` agora preenche `cost_brl` + `usd_to_brl_rate` em rows BRL=NULL, aplicando a cotação atual cartão (aproximação retroativa). Idempotente.
- Resultado: KPIs, charts e tabela detalhada de `/configuracoes/consumo` mostram valores em R$ para TODAS as chamadas registradas (antes do v0.12.0 ainda mostravam "—").
- Chamadas a partir de v0.12.0 continuam com cotação real do dia da chamada.

## Em produção anteriormente (v0.13.0)

### Release v0.13.0 (2026-04-30) — Dashboard polish & configurabilidade

- **Configurações de Dashboard** em `/configuracoes` (super_admin): início da semana + modo semana/mês (atual ou rolling).
- **Drill-down de status completo** para Resolvido/Pendente/Adiado (antes só Aberto).
- **Paginação server-side 50/pg** em Recebidas/Resolvidas (era 20 fixo).
- **`comparison.open` + variação relativa em Taxa de Resolução** (era `pp`, agora `%`).
- **Eixo X cheio 0–24h** com scroll horizontal centralizado na hora atual.
- **Pills**: `7 dias` → `Semana`, `30 dias` → `Mês` (defaults agora cobrem mês/semana atual).
- **TZ explícita no SQL bucket**: `(date_trunc(...) AT TIME ZONE $tz)` elimina ambiguidade.
- **KpiClickableCard sem overlap** "ver detalhes" × sparkline; fim do badge "Novo".
- **Tempo relativo curto** (`há 2h`/`há 3d`/`há 2m`) — `formatDistanceToNow` removido das tabelas de drill-down.

670 testes PASS · typecheck 0 erros · build verde.

## Em produção anteriormente (v0.12.3)

### Hotfix v0.12.3 (2026-04-30) — integração com providers + relatório de uso

- **"Modelo não encontrado" para GPT-5.x:** `GET /v1/models` valida só a chave; `POST /v1/chat/completions` valida o modelo (a OpenAI lista snapshots datados, não aliases curtos).
- **Custo zerado em chamadas antigas:** `backfillUsageCosts()` recalcula `cost_usd` em rows com `cost_usd=0` cujos modelos agora têm pricing.
- **Discrepância na contagem de chamadas:** `runNexAgent` agora registra `logUsage` **por iteração** de tool-call, alinhando com o dashboard do provider.

## Em produção anteriormente (v0.12.2)

### Hotfix v0.12.2 (2026-04-30) — root cause "couldn't load"

- **Causa raiz finalmente identificada e corrigida.** `src/lib/actions/exchange-rate.ts` tinha um `export { DEFAULT_CARD_SPREAD }` (constante numérica) num arquivo com diretiva `"use server"`. Next.js 16 rejeita qualquer export não-async-function em arquivo Server Action, lançando "This page couldn't load — A server error occurred". Detectado via logs do container.
- Regra para o futuro: arquivos `src/lib/actions/**/*.ts` só podem exportar funções async + tipos/interfaces (apagados no build).

## Em produção anteriormente (v0.12.1)

### Hotfix v0.12.1 (2026-04-30)

- **Crash ao trocar modelo (P1):** GPT-5.x / o-series usam `max_completion_tokens` sem `temperature`. Resolve "This page couldn't load" + logout.
- **Custos zerados no Consumo (P2):** `MODEL_PRICING` atualizado abril/2026 (GPT-4.1.x, GPT-5.x, o3/o4-mini, Claude 4.5/4.7, Gemini 2.5).
- **Card "Agente Nex" com abas internas (P3):** Configuração / Chaves de API.
- **Spread cartão sem limite superior (P4)** + custos com 3 casas decimais (P5).
- **Visibility Matrix IA "Ninguém" agora respeitada inclusive para super_admin (P7)** + remove toggles duplicados do card Visibilidade (P6).
- **Tarja preta no overscroll eliminada em toda a plataforma (P8).**
- **Server Actions resilientes** com `safeAction` wrapper — defesa contra crashes futuros.

### Novidades da release v0.12.0 (2026-04-30)

- **Credenciais (API keys) gerenciáveis por provedor.** Card "Chaves de API" em `/configuracoes` com CRUD por provedor — listar, criar, renomear, rotacionar e deletar chaves. Ponto verde marca a chave em uso pelo Agente Nex. Trocar modelo ou provedor não exige mais re-digitar a chave.
- **Custo BRL como primário no Consumo do Agente Nex.** Card "Custo total", charts (área/donut/barras) e tabela de chamadas detalhadas mostram R$ em primário, com USD secundário em fonte menor. Mínimo 4 casas decimais em todas as visualizações.
- **Cotação USD→BRL cartão de crédito** capturada por chamada (`llm_usage.usd_to_brl_rate`). Fonte AwesomeAPI com cache 4h e spread configurável (`app_settings.llm.usd_brl.card_spread`, default 1.10, range [1.00, 1.30]).
- **"Agente IA" → "Agente Nex"** em todos os call-sites (card, consumo, mensagens de erro, empty-states).
- **Schema (runtime via `ensureLlmTables`):** nova tabela `llm_credentials`, `llm_configs.credential_id` (NULL), `llm_configs.encrypted_api_key` agora NULLABLE (legacy mantido por rollback), `llm_usage.cost_brl`/`usd_to_brl_rate`. Migração one-shot e idempotente.

## Em produção anteriormente (v0.11.1)

### Hotfix v0.11.1 (2026-04-30)

- Páginas internas estavam quebradas com "This page couldn't load" desde o deploy do v0.10.4 (commit `0a3bfab`). PageHeader fora marcado como Client Component mas recebia ícone Lucide (função). Refatoração: PageHeader volta a ser Server Component; medição via filho `<PageHeaderHeightProbe>`.

### Novidades da release v0.11.0

- **Visibilidade granular por relatório** — dropdown de 3 níveis (Todos / Somente super admin / Ninguém) por cada um dos 7 relatórios, com aplicação global em sidebar, páginas e dropdowns.
- **Visibilidade granular do Matrix IA** — mesma lógica para o inbox 31 (Matrix IA): some de tabelas, charts, KPIs, drill-downs e dropdowns conforme a regra escolhida.
- **Catálogo LLM atualizado (cutoff abril/2026)** — OpenAI ganha família GPT-5 (5/5.1/5.2/5.4/5.5 + minis); Anthropic Sonnet 4.7 + Opus 4.7; Gemini 2.0 Pro; OpenRouter expandido para 40 modelos curados em 4 tiers.
- **Bugs UI corrigidos no card Agente Nex**: dropdown de Modelo agora usa Popover.Portal (não fica preso em containers); ícone Eye da API key visualmente centralizado.

---

## Em produção anteriormente (v0.8.0)

### Novidades desta release

- **Hotfix Bad Gateway** — Dockerfile com chown correto em `/app/.next` resolve o `EACCES` que derrubava o container; `instrumentation.ts` adiciona handlers globais de unhandledRejection como rede de segurança; `prisma/seed.ts` ganha o adapter (Prisma 7).
- **Pré-agregação de relatórios** — pipeline assíncrono (5 jobs BullMQ a cada 5 min) popula 6 tabelas de fatos no banco interno; relatórios `volumetria-heatmap` e `volumetria-dow` migrados; demais 9 relatórios continuam on-demand mas exibem badge de freshness.
- **Tempo "quase real"** — SSE de invalidação dispara `router.refresh()` no frontend assim que um job conclui (`facts:refreshed`).
- **Página `/configuracoes/jobs`** (super_admin) — monitoramento de status + botão "Backfill 90 dias".

### Operação após primeiro deploy

1. Aplicar migrations (automático via entrypoint).
2. Worker sobe os 5 schedules cron automaticamente.
3. Super_admin acessa `/configuracoes/jobs`, clica "Backfill 90 dias" para cada dimensão (4 cliques). Tempo estimado: 5–15 min.



### Plataforma
- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + base-ui
- **Auth:** NextAuth v5 (JWT, Credentials)
- **DB app:** Postgres + Prisma v7
- **DB Chatwoot:** Postgres read-only
- **Cache/queue/realtime:** Redis 7 + BullMQ + Redis Pub/Sub + SSE
- **Deploy:** GitHub Actions → GHCR (público via GITHUB_TOKEN built-in) → Portainer Swarm + Traefik

### Relatórios disponíveis hoje (7)
- **Dashboard / Visão Geral** — pizza de status + volumetria simples + KPIs.
- **Performance** — tempos de resposta + SLA + CSAT (parcial).
- **Equipe** — ranking de atendentes + departamento.
- **Distribuição** — heatmap horário × dia da semana.
- **Origem & IA** — leads recebidos + Matrix IA.
- **Conversas** — lista detalhada (15 colunas + filtros toolbar+drawer + ordenação multi-sort + busca interna nos selects).
- **Mensagens não respondidas** — backlog em aberto.

### Funcionalidades principais
- **RBAC** em duas camadas: `platformRole` (super_admin > admin > manager > viewer) + `companyRole` (Chatwoot multi-account).
- **Filtros** — toolbar compacta + drawer lateral com busca interna, "Selecionar todos/visíveis", chips aplicados.
- **Tour interativo** com botão `?` em cada relatório (Conversas tem 9 etapas).
- **Sidebar** com active state pílula sólida (raiz) + dot violet (submenu); longest-prefix-match resolve bug pai/filho.
- **PageShell** com variantes wide (1600px) / narrow (1280px).
- **Toggle Matrix IA** em /configuracoes — quando OFF, inbox 31 some de tabelas, gráficos, KPIs e dropdowns para todos exceto super_admin.
- **Agente Nex** (chatbot IA bubble flutuante) com config 2.0:
  - Catálogo de 42 modelos atualizados (abril/2026): OpenAI GPT-4o/4.1/o1-o3, Anthropic Claude 3.5/4.5/4.6/4.7, Gemini 1.5/2.0/2.5, OpenRouter ~17 modelos free/low/medium/high.
  - `<SearchableSelect>` com busca + tier badges $/$$/$$$/FREE.
  - Primeira opção sempre "Outro (digitar manualmente)" — habilita modelo customizado.
  - Atalhos "Criar API key" + "Adicionar crédito" por provider.
  - Test connection profundo: detecta `invalid_key`, `model_not_found`, `no_credit`, `rate_limit`.
  - Auto-save após teste OK.
- **Consumo IA** dashboard (super_admin) — KPIs + charts + tabela paginada.

### Componentes UI base
- `<Sheet>`, `<CollapsibleSection>`, `<MultiSelectCheckbox>` 2.0, `<SearchableSelect>`, `<TierBadge>`, `<PageShell>` — todos testados.

---

## Próximas releases (não implementado ainda)

### v0.8.0 — Próximos relatórios novos (em decisão pelo João)

**Status:** brainstorm completo em `docs/superpowers/brainstorms/2026-04-30-novos-relatorios.md`. 52 ideias categorizadas (A-J). Top 5 propostos para v0.8.0:

1. **Pulse Semanal Comparativo** (categoria A — visão executiva).
2. **First Contact Resolution + Reopen Rate** (categoria B — qualidade real).
3. **Forecast 7 dias + Detector de Anomalia** (categoria A/H — antecipação).
4. **Topic Clustering com Agente Nex** (categoria E/J — descoberta de temas via IA).
5. **Live Queue Dashboard** (categoria H — TV operacional ao vivo).

**Pré-condições pendentes** (algumas ideias dependem):
- CSAT — confirmar se `csat_survey_responses` está povoado no banco Chatwoot.
- Funil/Negócio — alinhar com Matrix Fitness quais `custom_attributes` em conversations sinalizam "matriculado", "visita agendada".
- SLA — definir SLA configurado (ex: 5 min FRT em horário comercial).

**Aguardando aprovação do João** para fechar escopo da v0.8.0 e partir para spec → plan → implementação.

---

## Como continuar (em outra sessão / outro terminal)

Abrir o projeto e dizer **um dos seguintes**:

### Caso A — quer continuar a v0.8.0 (relatórios novos)
> "Continue de onde paramos. Lê `docs/superpowers/brainstorms/2026-04-30-novos-relatorios.md` e me mostra os 5 relatórios propostos para a v0.8.0. Quero decidir o escopo agora."

### Caso B — quer fazer outra coisa (feedback/bug/feature pontual)
> "Quero ajustar/adicionar [tópico]. Lê o estado atual em `docs/STATUS.md` e me ajuda."

### Caso C — quer fazer review do que está em produção
> "Faz um pente fino na produção (https://insights.nexusai360.com). Lista o que está bom e o que poderia melhorar."

---

## Histórico de releases

- **v0.4.0 (MVP)** — base do Roteador + auth + RBAC + 7 relatórios v1 + cache + tour + filtros básicos.
- **v0.5.0** — refinamentos UX iniciais (rejeitado por qualidade — base do v0.6.0).
- **v0.6.0** — 5 super-relatórios consolidados + sortable/groupable tables + charts modernos + drill-down + Agente Nex 1.0 + dashboard de Consumo IA.
- **v0.6.1** — Conversas parruda + busca global Cmd+K + tour + toggles Nex/Matrix IA + fixes 500.
- **v0.7.0** (atual) — Polimento UX (sidebar / filtros / tour / largura) + Agente Nex 2.0 + Matrix IA sync total + sidebar bug fix.

Ver detalhes em `CHANGELOG.md` e em `docs/superpowers/specs/`.
