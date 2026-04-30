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

## 2. Skills obrigatórias (SUPREMA E ABSOLUTA)

### 2.1 Superpowers — para tudo que envolve construção/decisão técnica

Usar **obrigatoriamente** as skills `superpowers:*` em todas as etapas:

| Etapa | Skill obrigatória |
|-------|-------------------|
| Brainstorm / discovery | `superpowers:brainstorming` |
| Escrever spec | `superpowers:writing-plans` (a spec antecede o plan; ver §3) |
| Escrever plan de implementação | `superpowers:writing-plans` |
| Implementar | `superpowers:test-driven-development` + `superpowers:executing-plans` |
| Debug / falhas | `superpowers:systematic-debugging` |
| Code review | `superpowers:requesting-code-review` |
| Receber review | `superpowers:receiving-code-review` |
| Antes de declarar pronto | `superpowers:verification-before-completion` |
| Finalizar branch | `superpowers:finishing-a-development-branch` |
| Tarefas independentes | `superpowers:dispatching-parallel-agents` |

**Invocar via `Skill` tool** (não ler arquivo diretamente).

### 2.2 UI/UX Pro Max — para tudo que é tela, layout, componente

Usar **obrigatoriamente** `ui-ux-pro-max:ui-ux-pro-max` em **qualquer** trabalho que envolva:

- Construção, ajuste ou revisão de telas, layouts, componentes, design tokens.
- Decisões de UX, estados de interação, acessibilidade, responsividade.
- Escolha de paleta, tipografia, espaçamento, animações.
- Patterns de dashboard, tabelas, formulários, gráficos, navegação.

Antes de escrever uma linha de código de UI: invocar a skill.

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
- **Pré-agregação de relatórios** (v0.8.0+): camada de leitura `src/lib/chatwoot/facts.ts` lê 6 tabelas no banco interno (`chatwoot_facts_daily_by_*` + `chatwoot_facts_hourly_by_account` + `chatwoot_facts_meta`). Worker BullMQ (`src/worker/jobs/pre-agregacao/`) refresca rolling 7 dias a cada 5 min, publica `facts:refreshed` no Redis Pub/Sub, frontend escuta via `useFactsRealtime` (debounce 5s) → `router.refresh()`. Painel `/configuracoes/jobs` (super_admin) controla disparo manual e backfill. Runbook em `docs/runbooks/pre-agregacao.md`.
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
