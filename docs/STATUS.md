# Status — Nexus Insights

**Última atualização:** 2026-04-29

## Onde estamos

### ✅ Concluído

#### Fase de Discovery e Design
- Levantamento completo do banco do Chatwoot (`docs/discovery/2026-04-29-chatwoot-schema-discovery.md`).
- Decisões consolidadas (`docs/discovery/2026-04-29-decisoes-consolidadas.md`).
- **Spec de design v1 → v2 → v3** (final em `docs/superpowers/specs/2026-04-29-nexus-insights-design-v3.md`).
- **Plan de implementação v1 → v2 → v3** (final em `docs/superpowers/plans/2026-04-29-nexus-insights-implementation-v3.md`).
- `CLAUDE.md` raiz com todas as regras supremas (idioma, skills obrigatórias, double-check, padrão Roteador, RBAC, deploy).

#### Fase 0 (parcial — esqueleto)
- Cópia integral do Roteador Webhook Meta como base (preservando os docs locais).
- Limpeza cirúrgica de entidades de webhook/Meta (companies, webhook routes, deliveries, meta integrations, vendor packages do roteador).
- `package.json` adaptado (nome `nexus-insights`, scripts ajustados).
- `prisma/schema.prisma` reescrito com novos modelos: User, UserAccountAccess, UserTeamAccess, AppSetting, AuditLog, PasswordResetToken, EmailChangeToken.
- `prisma/seed.ts` reescrito (idempotente, popula owner e AppSettings defaults).
- `src/auth.ts` + `auth.config.ts` + `middleware.ts` adaptados ao novo schema (com guard de `mustChangePassword`).
- `src/lib/auth-helpers.ts`, `src/lib/auth.ts` adaptados (com `accountIds`, `teamIds`, `isOwner`).
- `src/lib/audit.ts` reescrito (modelo novo, fire-and-forget).
- `src/lib/permissions.ts` criado (canCreateRole, canEditUser, canDeleteUser, canDeactivateUser, canGrantAccounts, canGrantTeams, canSeeMatrixIA).
- `src/lib/tenant.ts` criado (getKnownAccounts, getAccessibleAccountIds, getAccessibleTeamIds, assertAccountAccess).
- `src/lib/constants/roles.ts` reescrito (4 níveis com ícones, descrições, cores).
- `src/lib/constants/nav.ts` criado (NAV_ITEMS + filterNav respeitando role e flags).
- `src/lib/email.ts` adaptado (templates com identidade Nexus Insights: password reset, email change, welcome).
- `src/lib/env.ts` adaptado (sem variáveis Meta; com CHATWOOT_*, RESEND_FROM).
- `src/lib/queue.ts` simplificado para queues do Insights (audit-write, prewarm-live, prewarm-historical, housekeeping).
- `src/lib/realtime.ts` adaptado (canal `nexus-insights:realtime`, eventos novos).
- `src/lib/chatwoot/pool.ts` criado (pool dedicado pg).
- `src/lib/chatwoot/deep-link.ts` criado.
- `src/lib/chatwoot/resilience.ts` criado (`withChatwootResilience`).
- `src/lib/cache/keys.ts` + `pull-through.ts` criados.
- `src/lib/settings/get.ts` + `update.ts` criados (cache Redis, SSE event).
- `src/lib/actions/settings.ts` reescrito (server actions wrappers).
- `src/lib/prisma.ts` ajustado (import do generated path correto, adapter pg).
- Sidebar adaptada (logo Nexus Insights, nav com submenu colapsível, theme toggle, logout).
- `src/app/(protected)/layout.tsx` adaptado (sem CommandPalette/SearchProvider — vão na Fase 1+).
- Tela de login com novos textos (subtítulo "Relatórios e insights dos atendimentos", branding Nexus Insights).
- Telas de auth (login, forgot-password, reset-password, verify-email) com títulos e footer "Nexus AI © ano".
- `src/components/page-header.tsx` (header padrão de páginas).
- `src/components/coming-soon.tsx` (placeholder reutilizável).
- 17 páginas placeholder criadas (`/dashboard`, `/perfil`, `/perfil/trocar-senha`, `/usuarios`, `/configuracoes`, `/relatorios` + 11 sub-relatórios).
- `src/app/api/health/route.ts` adaptado (checks granulares db/redis/chatwoot).
- `Dockerfile` adaptado (multi-stage, sem vendor-packages, com entrypoint).
- `docker/entrypoint.sh` criado (migrate deploy + seed idempotente + start).
- `docker-compose.yml` adaptado para dev local.
- `.env.example` reescrito.
- Todos os testes antigos removidos (serão refeitos na Fase 6).

### 🔄 Em andamento / próximos passos

#### Fase 0 — finalização
- [ ] `npm install` + `npx prisma generate` + smoke local de build.
- [ ] Resolver eventuais quebras de imports (TS) que aparecerem no build.
- [ ] Adicionar `output: 'standalone'` ao `next.config.ts` se ainda não estiver.
- [ ] Validar `npm run build` passa.
- [ ] Validar healthcheck localmente.
- [ ] `git init`, `gh repo create jvzanini/nexus-insights --private`, push inicial.
- [ ] Configurar GitHub Secrets (GHCR_TOKEN, PORTAINER_*).
- [ ] `.github/workflows/deploy.yml` adaptado (apontando para imagem `nexus-insights`).

#### Fase 1 — Auth, RBAC, Settings (próxima sessão)
- [ ] Server actions de usuários (`src/lib/actions/users.ts`).
- [ ] Validations Zod (`src/lib/validations/user.ts`).
- [ ] Tela `/usuarios` completa (tabela + dialogs de criação/edição/exclusão/desativação).
- [ ] Tab Auditoria.
- [ ] Server actions de password-reset, profile, email-change.
- [ ] Forms de `/perfil`, `/perfil/trocar-senha`.
- [ ] Tela `/configuracoes` com forms para polling, visibilidade, módulos, auditoria.
- [ ] Account switcher na sidebar (super admin).

#### Fase 2 — Acesso Chatwoot e cache (próxima sessão)
- [ ] Filter builder (`src/lib/chatwoot/filters.ts`).
- [ ] Worker BullMQ (`src/worker/index.ts` + jobs).
- [ ] Endpoint `/api/chatwoot/refresh`.
- [ ] Endpoint `/api/events` (SSE) atualizado.

#### Fase 3 — Relatórios v1
- [ ] Componentes base de relatórios (FiltersBar, gráficos, tabelas).
- [ ] Dashboard home com KPIs.
- [ ] Conversas (com paginação cursor + Open in Chatwoot).
- [ ] Leads recebidos.
- [ ] Volumetria (heatmap).
- [ ] Tempos de resposta.
- [ ] Status das conversas (com órfãs).

#### Fase 4 — Relatórios v2
- [ ] Ranking de atendentes.
- [ ] Por departamento.
- [ ] Por estado.

#### Fase 5 — Especiais
- [ ] Matrix IA (super admin).
- [ ] CSAT placeholder com dados quando existirem.
- [ ] SLA placeholder.

#### Fase 6 — Testes
- [ ] Cobertura crítica em permissions, tenant, filter builder, cache, server actions.

#### Fase 7-8 — Deploy
- [ ] Build da imagem.
- [ ] Push GHCR.
- [ ] `docker-compose.production.yml` (NÃO no git).
- [ ] `.env.production` (NÃO no git).
- [ ] Stack Portainer criada via API.
- [ ] DNS `insights.nexusai360.com` resolvendo.
- [ ] SSL Traefik provisionado.

#### Fase 9 — Validação e entrega
- [ ] Smoke em produção (login, navegação, criar usuário teste, abrir relatório).
- [ ] README, CHANGELOG, runbooks.
- [ ] Memórias atualizadas.

## Como continuar

Em uma próxima sessão, abrir o projeto e dizer:
> "Continue executando o plan v3 a partir de onde paramos no STATUS.md. Próximo passo: rodar `npm install` e validar o build local da Fase 0."

A spec v3 e o plan v3 são auto-contidos: tudo que precisa ser feito está documentado em detalhes lá.
