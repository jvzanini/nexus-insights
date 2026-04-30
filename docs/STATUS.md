# Status — Nexus Insights

**Última atualização:** 2026-04-30
**Versão atual em produção:** v0.11.0
**URL:** https://insights.nexusai360.com

---

## Em produção (v0.11.0)

### Novidades desta release (v0.11.0)

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
