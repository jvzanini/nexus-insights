---
agent: claude-empresa-ativa-global
started_at: 2026-05-02T05:10-03:00
target_version: v0.21.0
status: in_progress
---

## Tópico
Tornar o `AccountSwitcher` do sidebar a fonte ÚNICA e GLOBAL de escopo: (1) auditoria + hardening de `getActiveAccountId()` (fail-closed em vez de leak para Matrix); (2) novas tools do Agente Nex pra responder sobre estado da plataforma na empresa ativa (integrações + nex config + LLM ativa); (3) injeção de contexto da empresa ativa no system prompt do Nex; (4) testes cross-account de isolamento; (5) runbook `escopo-por-empresa.md`. Modo autônomo total.

## Arquivos que provavelmente vou tocar
- src/lib/reports/active-account.ts (assinatura `getActiveAccountId(user)`, validação de acesso, fail-closed)
- src/app/(protected)/layout.tsx (passa user pro helper)
- src/lib/llm/tools/definitions.ts (3 novas tools: get_active_company, get_integrations_status, get_nex_config_summary)
- src/lib/llm/tools/executor.ts (3 novos branches read-only)
- src/lib/llm/agent/run-nex.ts (injeta `CONTEXTO ATIVO: empresa={name} (account_id={X})` após resolveSystemPrompt — sem tocar `prompt.ts`)
- src/lib/platform/active-company-context.ts (NEW — helpers que coletam estado per-company)
- src/app/(protected)/dashboard/page.tsx (audit + assertAccountAccess)
- src/app/(protected)/relatorios/{conversas,distribuicao,equipe,mensagens-nao-respondidas,origem-ia,performance,visao-geral}/page.tsx (audit + assertAccountAccess)
- NEW tests: src/lib/reports/__tests__/active-account.test.ts, src/lib/llm/tools/__tests__/executor-platform-tools.test.ts, src/lib/llm/agent/__tests__/run-nex-context.test.ts
- NEW: docs/runbooks/escopo-por-empresa.md
- NEW: docs/superpowers/specs/2026-05-02-empresa-ativa-global-design.md (v1, v2, v3)
- NEW: docs/superpowers/plans/2026-05-02-empresa-ativa-global.md (v1, v2, v3)
- package.json (bump 0.18.0 → 0.21.0; v0.19/v0.20 estão em curso paralelos)
- CHANGELOG.md (release notes v0.21.0)
- docs/STATUS.md

## Arquivos compartilhados que VOU modificar
- package.json (bump versão — v0.19 e v0.20 estão sendo trabalhadas; vou para v0.21.0 e ajusto se necessário no rebase)
- CHANGELOG.md (entrada v0.21.0)
- docs/STATUS.md

## Arquivos NÃO vou tocar (outros agentes ativos)
- claude-conversas-v019: src/lib/actions/reports/*, src/components/reports/*, src/app/(protected)/relatorios/conversas/page.tsx, src/lib/chatwoot/queries/conversas-list.ts (audit é só LEITURA destes; mudanças vão em `getActiveAccountId` e nos pages que TODOS importam ele)
- claude-nex-suite-polish-v020: src/lib/nex/prompt.ts, src/components/agente-nex/*, src/components/llm/*, src/components/charts/*, src/lib/llm/{pricing,catalog}.ts, src/lib/llm/agent/usage-logger.ts, src/app/api/nex/transcribe/route.ts, prisma/schema.prisma (vou injetar contexto do nex em `run-nex.ts`, NÃO em `prompt.ts`, pra evitar conflito)
- claude-t10-filter-chip-list-popover: só arquivos novos isolados, sem conflito

## Decisões / contexto importante
- **Workflow rigoroso (CLAUDE.md §2.1 + §3)**: spec v1→review#1→v2→review#2→v3 + plan v1→v2→v3 + subagent-driven-development com TDD por task + ui-ux-pro-max em qualquer tarefa UI.
- **Fail-closed em getActiveAccountId**: a função hoje devolve 9 (Matrix) quando cookie ausente/inválido SEM validar se o user tem acesso. Bug latente: user de outra conta sem cookie veria Matrix. Fix: `getActiveAccountId(user)` valida com `getAccessibleAccountIds(user)` e devolve `availableAccounts[0].id` em vez de 9 hardcoded.
- **assertAccountAccess hoje não é chamado de NENHUMA page** (grep prova: só na própria definição). Cada page que chama `getActiveAccountId()` precisa também chamar `assertAccountAccess(user, accountId)` antes da query — defense in depth.
- **3 novas tools do Nex (read-only)**:
  - `get_active_company` → nome + accountId + descrição básica (super_admin / role).
  - `get_integrations_status` → quais integrações estão ativas (Power BI configurado? URL? quantos profiles ativos?).
  - `get_nex_config_summary` → modelo LLM ativo + provedor + se KB tá ligada + audio enabled. Sem secrets.
- **Injeção de contexto no system prompt do Nex**: append "\n\nCONTEXTO ATIVO: Empresa={nome} (account_id={id}). Todas as tools de Chatwoot já filtram por este escopo automaticamente." em `run-nex.ts` após `resolveSystemPrompt`. Não toca `prompt.ts` (conflito com nex-suite-polish-v020).
- **Escopo NEGADO (out of scope)**: tornar prompt do Nex per-company; tornar KB per-company; tornar chaves LLM per-company. Razões: (i) implicações de schema massivas; (ii) implicações de billing; (iii) YAGNI — user não pediu isso. Documentado como follow-up no spec.
- **UI badge per-company**: NEGADO no escopo desta entrega. User pediu garantia comportamental, não UI. Pode virar v0.22+ se ele quiser.
- **Versão**: target v0.21.0 (v0.19 conversas + v0.20 nex polish em curso paralelo).
- **Modo autônomo total**: sem aprovação do user durante o caminho. Notifico só ao final com push + memória atualizada.

## Bloqueios
- (nenhum por ora — coordenado com os 3 agentes ativos via files-not-to-touch acima)
