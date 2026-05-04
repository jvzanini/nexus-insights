# CLAUDE.md — Regras Supremas do Projeto

> Estas regras são **absolutas e inegociáveis**. Sobrescrevem qualquer comportamento padrão. Aplicam-se a TODA sessão Claude Code neste diretório.

---

## 1. Idioma e estilo de comunicação

- Sempre responder em **português brasileiro**.
- **Padrão: silêncio.** Trabalho é feito com ferramentas, sem narração.
- Durante o trabalho: no máximo **uma frase** por mensagem, e apenas quando for realmente necessário/útil.
- **Proibido:** narrar etapas, descrever o que está sendo feito, mandar trechos de código no chat, explicar decisões não pedidas, resumos intermediários.
- **Exceção (autorizado um parágrafo único):** erro/bloqueio, informação crítica, ou parágrafo final de finalização.

---

## 2. Skills obrigatórias (REGRA SUPREMA, ABSOLUTA E INVIOLÁVEL)

> **NUNCA furar essa regra. NUNCA pular skill. NUNCA "vou fazer rapidinho sem invocar".**
> Vale para o controlador (sessão principal) **E** para todo subagente despachado.
> Se descobrir, no meio do trabalho, que uma skill aplica → **PARAR e invocar imediatamente**, mesmo que já tenha começado.

### 2.1 Superpowers — para tudo que envolve construção/decisão técnica

Invocar **obrigatoriamente** via `Skill` tool (nunca `Read` no arquivo da skill) nas seguintes etapas:

| Etapa | Skill obrigatória |
|-------|-------------------|
| Brainstorm / discovery / decisão de escopo | `superpowers:brainstorming` |
| Escrever spec (com double-check §3) | `superpowers:writing-plans` |
| Escrever plan de implementação (com double-check §3) | `superpowers:writing-plans` |
| Implementar (modo padrão) | `superpowers:subagent-driven-development` |
| TDD dentro de cada task | `superpowers:test-driven-development` |
| Debug / falhas / regressões | `superpowers:systematic-debugging` |
| Pedir code review | `superpowers:requesting-code-review` |
| Receber code review | `superpowers:receiving-code-review` |
| Antes de declarar pronto | `superpowers:verification-before-completion` |
| Finalizar branch / release | `superpowers:finishing-a-development-branch` |
| Tarefas independentes em paralelo | `superpowers:dispatching-parallel-agents` |

**Workflow padrão (não negociável)** para qualquer feature não trivial:
`brainstorming` → `writing-plans` (spec + plan, ambos com v1→v2→v3 do §3) → `subagent-driven-development` (com TDD por task) → `verification-before-completion` → `requesting-code-review` → `finishing-a-development-branch`.

### 2.2 UI/UX Pro Max — REGRA ABSOLUTA para qualquer toque em UI

**Antes de escrever ou ajustar UMA linha** de código de UI/UX, invocar `ui-ux-pro-max:ui-ux-pro-max` via `Skill` tool. Vale para:

- Construir, ajustar ou revisar telas, layouts, componentes, design tokens.
- Decisões de UX: estados de interação, hover/focus/disabled, acessibilidade, responsividade, motion.
- Escolha de paleta, tipografia, espaçamento, sombras, gradientes, ícones, raios.
- Patterns: dashboard, tabelas, formulários, gráficos, navegação, sidebars, modals, dialogs, toasts, dropdowns, popovers.
- Microcorreções visuais (ex.: "centralizar ícone", "ajustar padding", "trocar cor de hover") — **mesmo "ajuste pequeno" exige a skill primeiro**.

**Aplica também aos subagentes:** ao despachar `subagent-driven-development` para qualquer task que mexa em UI, o prompt do subagente **deve instruir explicitamente** a invocar `ui-ux-pro-max:ui-ux-pro-max` antes de codar.

**Exceções: nenhuma.** Se a task é UI, a skill é invocada — sem rationalização ("é trivial", "já sei como fazer", "é só um one-liner"). Se sentir o impulso de pular, é exatamente nesse momento que ela deve ser invocada.

---

## 3. Metodologia Double-Check (v1 → v2 → v3)

Aplicar **obrigatoriamente** em **specs** e em **plans**.

### Para a spec:
1. **v1** — Escrever a versão inicial.
2. **Pente fino #1** — Revisar criticamente, encontrar erros, inconsistências, ambiguidades, lacunas, escopo. Auto-corrigir.
3. **v2** — Aplicar as correções.
4. **Pente fino #2 (mais profundo)** — Análise ainda mais minuciosa: contradições internas, edge cases, requisitos implícitos, riscos, dependências esquecidas, decisões não justificadas.
5. **v3 (final)** — Versão consolidada, pronta para aprovação do usuário.

### Para o plan:
Mesmo ciclo: v1 → review #1 → v2 → review #2 (mais profundo) → v3 final.

### Postura durante os reviews:
- **Análise crítica real**, não cosmética.
- **Personalidade e posicionamento:** defender decisões com base em contexto, evidência e princípios. Não concordar por conveniência.
- **Auto-correção honesta:** se algo está errado, mudar. Sem maquiagem.

---

## 4. Padrão arquitetural — projetos de referência

### 4.1 Template direto: **Roteador Webhook Meta** (regra suprema de cópia)
Caminho: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/Roteador Webhook Meta`

**REGRA ABSOLUTA:** este projeto deve **copiar o Roteador Webhook Meta inteiro** como ponto de partida — não apenas a tela de login. Significa replicar:

- Estrutura de pastas (`src/app`, `src/components`, `src/lib`, `prisma`, `docker`, etc.).
- Componentes UI (todos os `src/components/ui/*` e layout).
- Estilos: Tailwind config, CSS globals, design tokens, paleta, tipografia, espaçamentos, sombras, gradientes.
- Ícones (Lucide React, mesmos tamanhos/pesos), efeitos visuais (animações Framer Motion, transições, hover states).
- Padrão de páginas internas (header com ícone roxo + título + subtítulo + ações).
- Sistema de tema (cookie SSR, ThemeProvider custom).
- Sistema de toast (Sonner customizado).
- Padrão de autenticação (NextAuth v5, `auth.ts`, `auth.config.ts`, middleware, helpers).
- Padrão de Server Actions (`src/lib/actions/*` consolidado).
- Padrão de tenant scoping (`src/lib/tenant.ts`).
- Padrão de testes (Jest + jest-mock-extended).
- Stack Docker (compose, Dockerfile, labels Traefik).
- Workflow CI/CD (GitHub Actions).
- Documentação (CLAUDE.md, README, CHANGELOG, design-system).

**Adaptar apenas o necessário** pra realidade deste projeto (textos, branding, modelo de dados, telas específicas de relatórios). **Tudo que precisar criar novo segue o mesmo padrão visual e arquitetural** do Roteador. Nada de inventar componentes, paletas ou padrões diferentes.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + base-ui (shadcn-style com prop `render`, NUNCA `asChild`).
- **Auth:** NextAuth.js v5 (JWT stateless, Credentials provider, bcryptjs, session refresh por requisição via callback `jwt`).
- **DB:** PostgreSQL + Prisma v7 (`@prisma/adapter-pg`); client importado de `@/generated/prisma/client`.
- **Cache/Queue/Realtime:** Redis 7 + BullMQ + Redis Pub/Sub + SSE em `/api/events`.
- **Pré-agregação de relatórios** (v0.8.0+): camada de leitura `src/lib/chatwoot/facts.ts` lê 6 tabelas no banco interno (`chatwoot_facts_daily_by_*` + `chatwoot_facts_hourly_by_account` + `chatwoot_facts_meta`). Worker BullMQ (`src/worker/jobs/pre-agregacao/`) refresca on-demand quando `runDeltaSync` (polling delta v0.41+) detecta mudança; cron 30 min como fallback. Publica `facts:refreshed` no Redis Pub/Sub, frontend escuta via `useFactsRealtime` (debounce 5s) → `router.refresh()`. Painel `/bancos-de-dados/[id]?tab=jobs` (super_admin) controla disparo manual e backfill. Runbook em `docs/runbooks/pre-agregacao.md`.
- **Polling delta universal** (v0.41+): substitui webhook event-driven. Worker BullMQ `chatwoot-sync-delta` executa a cada `pollingIntervalSeconds` (default 30s, mín 20s, configurável per-connection no Edit Dialog). 10 table-syncs em `src/lib/chatwoot/sync/table-syncs/` comparam `updated_at`/`id` no banco do Chatwoot vs cursor em `chatwoot_sync_cursors`. Quando há mudança, enfileira `refresh-by-*` jobs (pré-agregação). Sweep diário 03:00 BRT detecta IDs órfãos. Runbook em `docs/runbooks/polling-delta-sync.md`. UI super_admin em `/bancos-de-dados/[id]?tab=sincronizacao` (4 KPIs + lista runs polling 5s).
- **Estrutura de pastas:**
  - `src/app/(auth)` (rotas públicas) e `src/app/(protected)` (autenticadas).
  - `src/lib/actions/` consolidado para Server Actions.
  - `src/lib/tenant.ts` para tenant scoping (`getAccessibleCompanyIds`, `buildTenantFilter`, `assertCompanyAccess`).
  - `src/lib/auth-helpers.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`.
- **RBAC em duas camadas:** `platformRole` (super_admin > admin > manager > viewer) + `companyRole` (company_admin > manager > viewer) via `UserCompanyMembership`.
- **Tema:** ThemeProvider customizado via cookie SSR-aware (NUNCA `next-themes`); persistência por `fetch POST /api/user/theme`.
- **Toast:** Sonner customizado (pilha bottom-up, timers independentes).
- **Ícones:** Lucide React. Emojis **proibidos** em UI.
- **Testes:** Jest (`jest-mock-extended`, mocks de `@/lib/prisma`, `@/lib/auth`, `@/lib/audit`, `next/cache`).
- **Soft delete:** padrão `deletedAt: DateTime?`.
- **Encryption:** AES-256 para dados sensíveis (`src/lib/encryption.ts`).
- **Rate limit:** Redis para login e endpoints sensíveis.
- **Auditoria:** `src/lib/audit.ts → logAudit()`.
- **Documentação canônica:** `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `design-system/<projeto>/MASTER.md`, `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/runbooks/`.

### 4.2 Referência adicional: **nexus-blueprint**
Caminho: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-blueprint`

Design system industrial (monorepo `@nexusai360/*`). Usar como **fonte de patterns, tokens e contratos** quando útil — sem migrar para monorepo. Consultar especialmente:

- `docs/program/00-carta-programa.md` (manifesto canônico).
- `docs/program/02-naming.md` (convenções).
- `docs/architecture/` (referência técnica).
- `docs/platforms/_template/` e `docs/platforms/roteador-webhook-meta/` (casos).

---

## 5. Deploy e infraestrutura

- **VPS Hostinger** com **Portainer + Docker**, gerida pelo usuário.
- Stacks no Portainer; rede externa `rede_nexusAI`.
- **Reverse proxy Traefik** (labels no `docker-compose.yml`) com **SSL automático Let's Encrypt**.
- **Containers padrão:** `app` (Next.js), `worker` (BullMQ, se aplicável), `db` (Postgres 16-alpine), `redis` (7-alpine).
- **CI/CD:** GitHub Actions → build → push para `ghcr.io/jvzanini/<nome-projeto>` → Portainer redeploy.
- **Migrations Prisma:** rodadas manualmente em produção (não em runtime).

---

## 6. Banco de dados deste projeto

- Banco PostgreSQL hospedado na VPS do usuário.
- Acesso para o dashboard será **somente leitura** (read-only), conforme combinado.
- Atualização do dashboard deve ser **em tempo real** (polling/SSE/CDC a definir na spec).

---

## 7. Permissões e usuários do dashboard

- Plataforma exige **login e senha** (nada anônimo).
- **Usuários cadastráveis** com **níveis de permissão** seguindo o modelo do Roteador Webhook Meta (`platformRole` × `companyRole`).
- Decisões finais de níveis e telas restritas serão consolidadas na spec.

---

## 8. Workflow de cada nova feature

1. `superpowers:brainstorming` (alinhamento e design).
2. Escrever **spec v1 → v2 → v3** (double-check) em `docs/superpowers/specs/YYYY-MM-DD-<topico>-design.md`.
3. Aprovação do usuário.
4. `superpowers:writing-plans` para **plan v1 → v2 → v3** em `docs/superpowers/plans/YYYY-MM-DD-<topico>.md`.
5. Aprovação do usuário.
6. **Implementação obrigatoriamente com `superpowers:subagent-driven-development`** — um subagent fresh por task com revisão entre tasks. Aplica `superpowers:test-driven-development` dentro de cada task quando há código testável.
7. **UI/layout/componentes obrigatoriamente com `ui-ux-pro-max:ui-ux-pro-max`** — invocada **antes** de criar/ajustar qualquer tela, componente, paleta, espaçamento, animação ou interação. Regra absoluta: nada de UI sem invocar a skill primeiro.
8. Verificação com `superpowers:verification-before-completion`.
9. Code review com `superpowers:requesting-code-review`.
10. Finalização com `superpowers:finishing-a-development-branch`.

---

## 8.5 Coordenação multi-agente (regra absoluta)

Há 2–3 sessões Claude no repositório ao mesmo tempo. **Antes de qualquer ação**: ler `docs/agents/_README.md`, listar `docs/agents/active/`, ler `tail docs/agents/HISTORY.md`, executar o checklist do `AGENTS.md`. Criar `docs/agents/active/<agent-id>.md` no início da sessão e deletar no fim. Append linha em `docs/agents/HISTORY.md` a cada commit relevante. Antes de push: `gh run list --limit 5` (não acumular deploys em CI).

## 9. Conduta autônoma

- **Trabalhar em paralelo sempre que possível** (múltiplas tool calls independentes em uma única mensagem).
- **Não pedir aprovação** para ações reversíveis e locais (ler, criar/editar arquivos do projeto, rodar testes).
- **Pedir confirmação** apenas para ações destrutivas, irreversíveis, com efeito em sistemas compartilhados (push, deploy, drop, force).
- Investigar antes de remover/sobrescrever estado desconhecido.

---

## 10. Memórias canônicas a respeitar

- Hoje é **2026-04-29**.
- Usuário: João Vitor Zanini, e-mail `zanini107@gmail.com`.
- Usuário **leigo em partes técnicas** — explicar passo a passo quando precisar de ação manual dele (ex.: criar usuário read-only no Postgres, configurar DNS, abrir porta).
- Nome da plataforma e domínio serão definidos junto com o usuário durante o brainstorm.
