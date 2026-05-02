# Spec v3 (final) — Empresa Ativa como Escopo Global Definitivo

> **Versão**: v3 (após pente-fino #1 + pente-fino #2)
> **Target release**: v0.21.0
> **Data**: 2026-05-02
> **Autor**: claude-empresa-ativa-global (sessão autônoma)
> **Status**: aprovado autonomamente (modo autônomo total — usuário delegou)

---

## 0. Histórico de revisões

### Pente-fino #1 → v2 (resumido)
13 issues resolvidas (ver v2 §0). Principais: classificar TODAS as superfícies (`/integracoes`, `/configuracoes`, `/agente-nex`, `/usuarios`, `/perfil` adicionados); padronizar nome `buildActiveCompanyContext`; layout passa a chamar o mesmo helper (DRY); separar `platformRole`/`companyRole`; gating de `get_integrations_status` por role; fallback gracioso "Empresa #N"; lista exata de 10 callers a atualizar.

### Pente-fino #2 → v3 (novas issues encontradas)

| # | Issue v2 | Resolução v3 |
|---|---|---|
| P2-1 | Executor não recebe `platformRole` — gating em `get_integrations_status` impossível com a assinatura atual | Adicionada §4.4: `executeTool(name, args, accountId, excludeMatrixIA, platformRole)` — `platformRole` propagado de `runNexAgent` |
| P2-2 | `getActiveAccountId` chamado N vezes por request hit DB N vezes | §3.6: helper envolto em `cache()` do React (Next 16) — dedupe por request |
| P2-3 | API change quebra qualquer test que chama `getActiveAccountId()` direto | §8: `getAccessibleAccountIds` chamado *dentro* do helper; assinatura externa fica só `getActiveAccountId(user)` (sem segundo arg) |
| P2-4 | `companyRole` em `get_active_company` pode falhar se `UserCompanyMembership` vazio | §4.1: tool retorna `null` em vez de throw — degrade gracioso |
| P2-5 | `buildActiveCompanyContext` recebe só `accountId`, mas `userId/role` são úteis pro contexto | §5: assinatura final `buildActiveCompanyContext(accountId, user?)` — adiciona "Você está autenticado como [Nome] ([Role])" se user passado |
| P2-6 | Spec não documenta a regra "todo novo caller DEVE assertAccountAccess" | §11 (NEW) define a regra como invariante do projeto, registrada no runbook |
| P2-7 | Risk residual: novo caller futuro esquece de assertar | §11.2: mitigação via lint/grep — comando documentado no runbook |
| P2-8 | `NoAccessibleAccountError` é capturado onde? Pages podem deixar a request quebrar | §6.4 detalha: `getActiveAccountId` é chamado em layout primeiro; se layout falha, redirect; pages downstream sempre acham um accountId válido |
| P2-9 | Risco de conflito de versão (v0.19 / v0.20 paralelos) | §9: regra de "última a mergear rebasa o bump" |
| P2-10 | `get_nex_config_summary` retorna `reportsVisibility` mas o shape não está definido | §4.3: shape completo definido (`{ dashboard: bool, conversas: bool, ... }`) |
| P2-11 | Tools novas: descrições em PT-BR consistentes com existentes | §4: descrições em PT-BR no padrão do `definitions.ts` atual |
| P2-12 | Spec não menciona impacto em `__tests__` que mockam `getActiveAccountId` | §7.3 (NEW) lista os mocks existentes a ajustar |

---

## 1. Contexto e motivação

A plataforma usa o cookie HttpOnly `nexus_active_account` (gravado por `switchAccount` em `src/lib/actions/account-switch.ts`) como fonte da empresa ativa. Hoje 9 callers leem esse cookie via `getActiveAccountId()` para escopar suas queries.

**Problemas concretos identificados na auditoria:**

1. **`getActiveAccountId()` é fail-open com leak para Matrix (`DEFAULT_ACCOUNT_ID = 9`)**.
   - Implementação atual (`src/lib/reports/active-account.ts`):
     ```ts
     return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACCOUNT_ID;
     ```
   - Se o cookie estiver ausente/inválido, devolve 9 sem checar acesso do user.
   - O layout valida o cookie ao montar a sidebar, mas **não regrava o cookie no fallback**. Cookie stale + caller que não passa pelo layout (Server Action standalone, futura API route) = leak.

2. **`assertAccountAccess` existe mas não é chamado de NENHUMA page** (grep prova):
   ```
   $ grep -rn "assertAccountAccess" src/
   src/lib/tenant.ts:51:export async function assertAccountAccess(...
   ```
   Toda page hoje confia que o `accountId` é válido — sem defense-in-depth.

3. **Nex não sabe explicitamente em qual empresa está**. Tools recebem `accountId` injetado, mas o **system prompt nunca menciona o nome da empresa**. Agente pode citar "account_id=9" em vez de "Matrix Fitness Group".

4. **Nex não sabe responder sobre o estado da plataforma**. As 7 tools atuais consultam apenas Chatwoot. User pediu explicitamente que o Nex saiba responder sobre "formulários em outros menus" (integrações, agente-nex/configuração, etc.).

**Objetivo**: zerar (1)+(2) com hardening + assertions; resolver (3) com injeção de contexto; resolver (4) com 3 novas tools read-only; documentar canonicamente o que é per-company vs global.

## 2. Escopo

### 2.1 Auditoria completa de superfícies

| Surface | Hoje usa cookie? | Classificação | Ação na v0.21 |
|---|---|---|---|
| `/dashboard` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/conversas` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/distribuicao` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/equipe` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/mensagens-nao-respondidas` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/origem-ia` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/performance` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios/visao-geral` | ✅ | per-company | `assertAccountAccess` |
| `/relatorios` (índice) | ❌ | per-company (passivo) | sem mudança |
| `/agente-nex` (chat) | ✅ via `sendNexMessage` | per-company | sem mudança |
| `/agente-nex/chaves` | ❌ | **global** (super_admin) | sem mudança; doc |
| `/agente-nex/configuracao` | ❌ | **global** | sem mudança; doc |
| `/agente-nex/consumo` | ❌ | **global** | sem mudança; doc |
| `/agente-nex/prompt` | ❌ | **global** | sem mudança; doc |
| `/integracoes` | ❌ | **super_admin only**, profiles têm `accountIdFilter` | audit RBAC; sem mudança comportamental |
| `/integracoes/power-bi` | ❌ | super_admin gerencia profiles, embed é per-company | audit: confirmar `accountIdFilter` em todos os caminhos |
| `/configuracoes` | ❌ | **global** (super_admin) | sem mudança; doc |
| `/configuracoes/consumo` | ❌ | **global** | sem mudança; doc |
| `/configuracoes/jobs` | ❌ | **global** | sem mudança; doc |
| `/perfil` | ❌ | **per-user** | sem mudança; doc |
| `/usuarios` | ❌ | **global super_admin** | sem mudança; doc |
| Nex Bubble | ✅ via `sendNexMessage` | per-company | sem mudança |

### 2.2 Dentro do escopo (concreto)

| ID | Item |
|---|---|
| **A1** | `getActiveAccountId(user)` — assinatura nova, validação de acesso, fail-closed na primeira conta permitida |
| **A2** | `cache()` de React envolvendo `getActiveAccountId` — dedupe per-request |
| **A3** | `assertAccountAccess(user, accountId)` em cada uma das 8 pages |
| **A4** | Layout DRY — usa o mesmo helper |
| **A5** | Testes unit cross-account (5 cenários) |
| **B1** | Tool `get_active_company` |
| **B2** | Tool `get_integrations_status` (com gating por `platformRole`) |
| **B3** | Tool `get_nex_config_summary` |
| **B4** | `buildActiveCompanyContext` em `run-nex.ts` (não em `prompt.ts`) |
| **B5** | `executeTool` aceita `platformRole` (propagado de `runNexAgent`) |
| **C1** | `docs/runbooks/escopo-por-empresa.md` |
| **C2** | Bump v0.21.0 + CHANGELOG + STATUS |

### 2.3 Fora de escopo (rejeitados)

| Item | Justificativa |
|---|---|
| Prompt do Nex per-company | Schema `nex_settings(company_id)` + UI + RBAC complexos |
| KB do Nex per-company | Idem; docs hoje globais |
| Chaves LLM per-company | Implicações de billing |
| Badge UI per-company | User pediu garantia comportamental, não UI |
| Reescrita do AccountSwitcher | Já funciona |
| Invalidar/regravar cookie no fallback | Helper já normaliza no read; rewrite é nicer-to-have |

## 3. Arquitetura

### 3.1 Resolução da empresa ativa (read path)

```
Cliente ──cookie nexus_active_account──> Server (RSC)
                                             │
                                             ▼
                                  getCurrentUser()
                                             │
                                             ▼
                                  getActiveAccountId(user)            [REVAMPED + cache()]
                                  ├─ lê cookie
                                  ├─ getAccessibleAccountIds(user)
                                  ├─ se cookie ∈ allowed → cookie
                                  ├─ senão → allowed[0]
                                  └─ se allowed vazio → throw NoAccessibleAccountError
                                             │
                                             ▼
                                  page.tsx
                                  ├─ assertAccountAccess(user, accountId)   [NEW assertion]
                                  └─ query(accountId, ...)
```

### 3.2 Write path (sem mudança)

`AccountSwitcher click → switchAccount(id) → cookie + revalidatePath("/", "layout")`. OK.

### 3.3 Layout DRY

```ts
// (protected)/layout.tsx — depois:
const activeAccountId = await getActiveAccountId(user);   // mesmo helper das pages
```

Comportamento ÚNICO. Layout fica mais curto.

### 3.4 Camada do Agente Nex

```
sendNexMessage(messages)
   │ user = await auth(); accountId = await getActiveAccountId(user)
   ▼
runNexAgent({ messages, accountId, userId, platformRole })
   ├─ resolveSystemPrompt(promptOverride?)
   ├─ buildActiveCompanyContext(accountId, user)        [NEW]
   ├─ systemPrompt = base + "\n\n" + companyContext
   └─ loop client.chat({ messages, tools = NEX_TOOLS })
              │
              ▼
        executeTool(name, args, accountId, excludeMatrixIA, platformRole)   [NEW arg]
        ├─ 7 tools antigas (sem mudança)
        ├─ get_active_company       [NEW]
        ├─ get_integrations_status  [NEW — gating por platformRole]
        └─ get_nex_config_summary   [NEW]
```

### 3.5 Defesas em profundidade

| Camada | Defesa | Falha tolerada |
|---|---|---|
| 1. Cookie | HttpOnly + secure + SameSite=lax | XSS não acessa |
| 2. `getActiveAccountId(user)` | Re-valida cookie vs `getAccessibleAccountIds` | Cookie stale |
| 3. Page | `assertAccountAccess(user, accountId)` | Race / bypass do helper |
| 4. Query | `WHERE account_id = $1` | RBAC layer falha |
| 5. Connection | `chatwoot_readonly`, CONNECTION LIMIT 5, somente SELECT | Tudo acima falha |

5 camadas. Para vazar, todas precisam falhar. Camada 5 garante: nunca há WRITE.

### 3.6 Performance

`getActiveAccountId(user)` faz 1 leitura de cookie + 1 query DB (`getAccessibleAccountIds` que busca `userAccountAccess` para non-super_admin, ou `getKnownAccounts` para super_admin). Para evitar N hits por request, envolto em `cache()` do React:

```ts
import { cache } from "react";

export const getActiveAccountId = cache(async (user: AuthUser): Promise<number> => {
  // ...
});
```

`cache()` dedupe por request (RSC). Layout chama 1x → 8 pages chamam 1x cada (mas todas dentro do mesmo render tree usam o cache).

## 4. Detalhamento das tools novas

### 4.1 `get_active_company`

```ts
{
  name: "get_active_company",
  description:
    "Devolve a empresa (account Chatwoot) ativa para o usuário corrente, junto com o role da plataforma e da empresa. Use sempre que o usuário perguntar 'em qual empresa estou?', 'quem sou eu aqui?', 'qual conta?'.",
  parameters: { type: "object", properties: {} },
}
```

**Retorno**:
```ts
{
  id: number;
  name: string;
  platformRole: "super_admin" | "admin" | "manager" | "viewer";
  companyRole: "company_admin" | "manager" | "viewer" | null;  // null se UserCompanyMembership vazio
  isOwner: boolean;
}
```

### 4.2 `get_integrations_status`

```ts
{
  name: "get_integrations_status",
  description:
    "Lista integrações configuradas para a empresa ativa (Power BI, futuras), com contadores de profiles ativos/com erro. Use quando o usuário perguntar sobre integrações, Power BI, dashboards externos.",
  parameters: { type: "object", properties: {} },
}
```

**Retorno (super_admin)**:
```ts
{
  kindCounts: {
    [kind in IntegrationKind]?: {
      total: number;
      active: number;
      errored: number;
      disabled: number;
      lastSyncAt: string | null;
    }
  }
}
```

**Retorno (managers / viewers / admin)**: idêntico mas SEM `lastSyncAt` (operacional fica restrito a super_admin).

**Filtro**: `IntegrationProfile` onde `accountIdFilter` é `null` (cobre todas) OU contém `accountId` ativo.

### 4.3 `get_nex_config_summary`

```ts
{
  name: "get_nex_config_summary",
  description:
    "Resumo da configuração do Agente Nex e da plataforma: provedor/modelo de IA ativo, KB ligada, áudio, visibilidades de bubble e relatórios. NÃO retorna chaves nem segredos.",
  parameters: { type: "object", properties: {} },
}
```

**Retorno**:
```ts
{
  provider: "openai" | "anthropic" | "gemini" | "openrouter" | null;
  model: string | null;
  kbEnabled: boolean;
  kbDocsCount: number;
  audioInputEnabled: boolean;
  audioEffectivelyEnabled: boolean;        // depende de provider=openai
  bubbleEnabled: boolean;
  nexBubbleVisibility: "all_users" | "admins_only" | "super_admin_only";
  reportsVisibility: {
    dashboard: boolean;
    conversas: boolean;
    distribuicao: boolean;
    equipe: boolean;
    mensagensNaoRespondidas: boolean;
    origemIa: boolean;
    performance: boolean;
    visaoGeral: boolean;
  };
}
```

### 4.4 Mudança de assinatura do executor

```ts
// antes:
executeTool(name, args, accountId, excludeMatrixIA = true)

// depois:
executeTool(name, args, accountId, excludeMatrixIA = true, platformRole?: string | null)
```

`run-nex.ts` propaga `args.platformRole` no loop. Tools antigas ignoram `platformRole`. Tools novas usam (`get_integrations_status`).

## 5. Detalhamento da injeção de contexto

`buildActiveCompanyContext(accountId, user?)` em `src/lib/llm/agent/active-company-context.ts` (NEW):

```
═══ CONTEXTO ATIVO ═══
Empresa: Matrix Fitness Group
Account ID: 9
Você responde SEMPRE no contexto desta empresa. Todas as tools de Chatwoot (query_conversations, query_messages, etc.) já filtram por este escopo automaticamente.

Para responder sobre o estado da plataforma desta empresa, use:
- get_active_company       → identidade da empresa e seu role
- get_integrations_status  → integrações configuradas (Power BI, etc.)
- get_nex_config_summary   → modelo de IA, KB, áudio, visibilidades

NUNCA responda sobre outra empresa, mesmo que perguntem.
═══
```

Quando `user` é passado, a primeira linha incorpora:
```
Empresa: Matrix Fitness Group
Account ID: 9
Você responde para João Vitor Zanini (Super Admin) dentro desta empresa.
```

**Resolução do nome**: `getKnownAccounts()` → fallback `Empresa #${accountId}`.

**Playground**: também injeta — reflete produção fielmente.

**Falha de DB**: contexto degrada para `Account ID: 9`; agente continua funcionando (não derruba o orquestrador).

## 6. Erros e edge cases

### 6.1 Tabela exaustiva

| Cenário | Comportamento |
|---|---|
| Cookie ausente, super_admin | `availableIds[0]` (geralmente 9) |
| Cookie ausente, comum sem 9 | `user.accountIds[0]` |
| Cookie inválido | Trata como ausente |
| Cookie aponta pra conta proibida | `availableIds[0]` |
| User sem nenhuma conta | `throw NoAccessibleAccountError` |
| `get_integrations_status` DB error | `{ result: null, error }` |
| `buildActiveCompanyContext` falha resolver nome | Fallback "Empresa #X" |

### 6.2 Race no switch

Se Server Action está em voo durante troca de conta, ela usa o `accountId` lido **antes** da troca. Consistente para o que o user pediu (antes da troca). OK.

### 6.3 Cookie zumbi

User perde acesso, cookie permanece. Helper detecta e devolve permitida. UI mostra empresa nova. Cookie stale até próximo `switchAccount`. **Risco residual baixo** — helper sempre normaliza.

### 6.4 NoAccessibleAccountError

- Lançado por `getActiveAccountId(user)` quando `availableIds.length === 0`.
- Capturado primeiro no layout (`(protected)/layout.tsx`) — redireciona para `/login` com query string `?reason=no-access`.
- Pages downstream nunca recebem esse throw (layout já abortou).
- Server Actions standalone (sem layout): `try/catch` retorna `{ ok: false, error: "Sem acesso" }`.

## 7. Testes

### 7.1 Unit tests (NEW)

- `src/lib/reports/__tests__/active-account.test.ts`:
  - cookie ausente, `accountIds=[2,9]` → 2 (primeira) — não 9 hardcoded.
  - cookie=2, user com acesso → 2.
  - cookie=99, user sem acesso → primeira permitida.
  - `accountIds=[]` → throws `NoAccessibleAccountError`.
  - super_admin sem cookie → primeira de `getKnownAccounts()`.
- `src/lib/llm/tools/__tests__/executor-platform-tools.test.ts`:
  - `get_active_company`: shape correto, busca `userAccountAccess` + `getKnownAccounts`.
  - `get_integrations_status`: filtra `IntegrationProfile.accountIdFilter`; super_admin vê `lastSyncAt`, viewer não.
  - `get_nex_config_summary`: nunca expõe `apiKey`; reflete `nex_settings` + `llm_credentials` + `platform_settings`.
- `src/lib/llm/agent/__tests__/active-company-context.test.ts`:
  - `buildActiveCompanyContext(9)` contém "Matrix Fitness Group" e "Account ID: 9".
  - Fallback "Empresa #99" para ID desconhecido.
  - Linha de user injetada quando `user` passado.

### 7.2 Verificação manual pós-deploy (smoke)

1. `curl https://insights.example/api/health` → `{ version: "0.21.0" }`.
2. Login super_admin.
3. Trocar conta 9 → 2 no switcher.
4. `/dashboard`, `/relatorios/conversas`, `/relatorios/performance`, `/relatorios/visao-geral` mostram dados de 2.
5. Nex bubble: "em qual empresa estou?" → "Invest Soluções".
6. "o Power BI está configurado nessa empresa?" → invoca `get_integrations_status`.
7. "qual modelo de IA?" → invoca `get_nex_config_summary`.
8. Trocar de volta para 9; perguntar de novo → "Matrix Fitness Group".

### 7.3 Mocks existentes a ajustar

`grep -rn "getActiveAccountId" src/**/__tests__/` retorna 0 hoje (helper não é mockado em testes de pages, porque os pages não têm testes unit). Os pages são testados via integração (RSC). **Sem ajustes necessários.**

Tests novos usam mocks de:
- `cookies()` (Next).
- `prisma.userAccountAccess.findMany`.
- `prisma.integrationProfile.findMany`.
- `prisma.platformSettings.findFirst`.
- `getActiveLlmConfig`, `getNexPromptConfig`, `getKbDocsForPrompt`.

## 8. Migração e compat

- **Sem schema change**.
- **Cookie name e shape mantidos**.
- **API pública**: `getActiveAccountId()` muda assinatura para `getActiveAccountId(user)`. **Breaking interno**.
- **Callers a atualizar (lista exata)**:
  1. `src/app/(protected)/layout.tsx`
  2. `src/app/(protected)/dashboard/page.tsx`
  3. `src/app/(protected)/relatorios/conversas/page.tsx`
  4. `src/app/(protected)/relatorios/distribuicao/page.tsx`
  5. `src/app/(protected)/relatorios/equipe/page.tsx`
  6. `src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx`
  7. `src/app/(protected)/relatorios/origem-ia/page.tsx`
  8. `src/app/(protected)/relatorios/performance/page.tsx`
  9. `src/app/(protected)/relatorios/visao-geral/page.tsx`
  10. `src/lib/actions/nex-chat.ts` (em `sendNexMessage` e `testNexPromptAction`)

10 callers. Atualização atômica no commit set da v0.21.0.

## 9. Plano de release

1. Implementação granular (1 task por commit, ver plan).
2. `npm run typecheck` e `npm test` verde antes de cada commit.
3. Antes de push: `gh run list --limit 5` (não empilhar com v0.19/v0.20).
4. Se v0.19 ou v0.20 mergear primeiro, **rebasar** este branch e ajustar bump (v0.21 vira v0.22 se necessário).
5. `git push origin main` → CI → Portainer.
6. Smoke pós-deploy (§7.2).
7. Append em `docs/agents/HISTORY.md`.
8. Atualizar memória persistente (`project_v0.21_release.md`).
9. Deletar `docs/agents/active/claude-empresa-ativa-global.md`.

## 10. Follow-ups (out of scope hoje)

- Rewrite preventivo do cookie quando helper faz fallback.
- Tornar prompt do Nex per-company.
- Tornar KB per-company.
- Tornar chaves LLM per-company com billing.
- Badge UI "esta tela é global vs per-company".
- Tour explicativo do switcher.
- Page `/sem-acesso` desenhada.

## 11. Invariantes do projeto (canônico — registrado no runbook)

### 11.1 Regra para qualquer novo caller que precise de `accountId`

```
1. await getCurrentUser()
2. await getActiveAccountId(user)             // valida acesso, fail-closed
3. await assertAccountAccess(user, accountId) // defense in depth
4. query(accountId, ...)
```

Esta sequência é OBRIGATÓRIA em toda nova page/server-action que toca dados per-company.

### 11.2 Verificação contínua

Comando documentado no runbook (`docs/runbooks/escopo-por-empresa.md`) para auditar:

```bash
# Lista pages que chamam getActiveAccountId mas NÃO chamam assertAccountAccess
comm -23 \
  <(grep -rln "getActiveAccountId" src/app/\(protected\) | sort) \
  <(grep -rln "assertAccountAccess" src/app/\(protected\) | sort)
```

Se a lista não for vazia, há furo de defense-in-depth.
