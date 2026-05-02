# Plan v2 — Empresa Ativa Global (v0.21.0) — Pente-fino #1

> v2 = lista de issues encontradas em v1 + correções a aplicar em v3.
> v3 (final) = `docs/superpowers/plans/2026-05-02-empresa-ativa-global.md`.

## Issues encontradas em v1

| # | Issue | Resolução em v3 |
|---|---|---|
| P1-1 | T9 usa `p.status === "active"` mas Prisma enum vem como `IntegrationProfileStatus.active` (string equivalente — OK) | Confirmado seguro; comentário no código deixando claro |
| P1-2 | T10 referencia `getReportsVisibilitySummary` que não existe | Substituído por inlining: chamar `getVisibleReportKeys` para cada role, montar map. Ou simplificar para retornar só keys do super_admin |
| P1-3 | T10 referencia `getNexBubbleVisibility` que não existe | Função existe internamente em `src/lib/llm/get-nex-bubble-enabled.ts` (re-export); confirmar e ajustar import |
| P1-4 | Tests de T8/9/10 são skeleton — faltam mocks completos | v3 explicita os mocks (`prisma.integrationProfile.findMany`, `getActiveLlmConfig`, etc.) |
| P1-5 | Pages usam `auth()` ou `getCurrentUser` mistos — plan padroniza qual? | v3: usar `getCurrentUser` de `@/lib/auth-helpers` (já retorna `AuthUser`); sem cast `as unknown as` |
| P1-6 | Risk: `assertAccountAccess` sempre passa após `getActiveAccountId` (helper já filtra) — assertion é redundante? | É **defense-in-depth**: se helper for refatorado/bugado, assertion é a última linha. Mantém. v3 documenta no comentário |
| P1-7 | T1 deixa typecheck quebrado até T4-end → commits locais com build vermelho | Aceito (TDD); v3 adiciona nota explícita. CI roda só no push (T12) |
| P1-8 | T4 (8 pages) é trabalho mecânico repetitivo — risco de erro de copy-paste | v3: dividido em 8 passos individuais (4.1.a a 4.1.h), cada um com diff explícito |
| P1-9 | Coordenação `claude-conversas-v019` em T4c — qual é o critério exato pra pausar? | v3: regra clara: se `git log -1 --oneline -- src/app/(protected)/relatorios/conversas/page.tsx` for ≤30min, parar e coordenar |
| P1-10 | Risk: `claude-nex-suite-polish-v020` pode bumpar package.json para 0.20.x antes de mim → v0.21 muda | v3: T12 step 12.1 verifica e ajusta |
| P1-11 | T6 muda `RunNexInput` adicionando `userName` — quebra teste existente? | v3: `userName?: string \| null` (opcional), default null no buildContext |
| P1-12 | Test 7.1 da spec lista 5 cenários; plan T1 só tem 5 — match perfeito (✓) | OK, sem mudança |
| P1-13 | T8 simplificação `companyRole=null, isOwner=false` — vai ficar quebrado pra sempre? | v3: doc explícito como "v0.21 simplificação; segue como follow-up no §10 da spec" |
| P1-14 | T11 (runbook) menciona "tabela canônica do §2.1 da spec" — copia ou linka? | v3: copia o conteúdo (runbook deve ser self-contained) |
| P1-15 | T9 mock complexo (Prisma) sem skeleton | v3: skeleton completo com `jest-mock-extended` |

## Próximo passo

Aplicar correções → `2026-05-02-empresa-ativa-global.md` (v3 final).
