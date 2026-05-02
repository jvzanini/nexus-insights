# Spec v2 — Empresa Ativa como Escopo Global Definitivo

> **Versão**: v2 (após pente-fino #1)
> **Target release**: v0.21.0
> **Data**: 2026-05-02

---

## Pente-fino #1 — Issues encontradas e resolvidas

| # | Issue identificada na v1 | Resolução na v2 |
|---|---|---|
| 1.1 | v1 listou só 9 superfícies "per-company"; faltou auditar `/integracoes/*`, `/configuracoes/*`, `/agente-nex/*` | §2 agora lista TODAS as superfícies com classificação per-company / global / super_admin-gated |
| 1.2 | Não fica claro POR QUE o helper é vulnerável quando o layout já valida | §1 explica: layout não regrava cookie quando fallback acontece, então cookie stale + helper que não valida = leak via Server Actions ou pages que não passem pelo layout (ex: API routes futuras) |
| 3.1 | Diagrama mistura `injectActiveCompanyContext` e `buildActiveCompanyContext` | Padronizado: `buildActiveCompanyContext` |
| 3.3 | Tabela "defesas em profundidade" diz layout faz fallback para "primeira allowed", mas o código real ainda tem fallback duro pra `DEFAULT_ACCOUNT_ID=9` | §3.5 explicita que o layout **passará a chamar `getActiveAccountId(user)`** — uma única fonte de verdade |
| 4.1 | `userRole` em `get_active_company` ambíguo (platform vs company role) | Renomeado: tool retorna `platformRole` E `companyRole` separados |
| 4.2 | `get_integrations_status` só cobre Power BI | Generalizado para `kindCounts: Record<IntegrationKind, {...}>`; v0.21 popula só Power BI mas a API já é genérica |
| 4.3 | `visibility` ambíguo | Renomeado: `nexBubbleVisibility` (bubble) e `reportsVisibility` separados |
| 4.4 | Tools expostas a viewers/managers vazam info sensível? | Adicionada gating por role: `get_integrations_status` retorna apenas contadores agregados a managers/viewers; super_admin recebe `lastSyncAt` + detalhes |
| 5.1 | Fallback "account_id=X" expõe ID cru | Sempre resolve via `getKnownAccounts()` (que tem fallback hardcoded Matrix/Invest); helper nunca devolve ID cru |
| 5.3 | Playground deve injetar contexto? | Sim — playground reflete produção. Decisão registrada na §5 |
| 6.1 | "User sem conta → throw" sem definir camada | Definido: `getActiveAccountId(user)` lança `NoAccessibleAccountError`; layout captura e redireciona para `/sem-acesso` |
| 6.2 | Cookie stale após perder acesso | §6.3 define: `switchAccount` faz revalidação; helper apenas faz fallback (não rewrite). Rewrite ficaria como follow-up |
| 7.1 | Como testar troca de cookie em RSC sem browser | §7 simplifica: testes unit cobrem a lógica do helper; snapshot do componente é dispensável (helpers já cobrem) |
| 8.1 | Inconsistência "8 pages + nex-chat" vs realidade (9 callers) | Lista exata em §8 |
| 9.2 | Smoke pós-deploy vago | Lista exata em §9 |
| 10 | TBDs em spec final | Movidos para "Follow-ups" em §10 |

---

## 1. Contexto e motivação

A plataforma usa o cookie HttpOnly `nexus_active_account` (gravado por `switchAccount` em `src/lib/actions/account-switch.ts`) como fonte da empresa ativa. Hoje 9 callers leem esse cookie via `getActiveAccountId()` para escopar suas queries.

**Problemas concretos identificados na auditoria:**

1. **`getActiveAccountId()` é fail-open com leak para Matrix (`DEFAULT_ACCOUNT_ID = 9`)**.
   - Implementação atual (`src/lib/reports/active-account.ts`):
     ```ts
     return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACCOUNT_ID;
     ```
   - Se o cookie estiver ausente/inválido, devolve 9 sem checar se o user tem acesso.
   - O layout valida o cookie ao montar a sidebar, mas **não regrava o cookie quando faz fallback**. Então um cookie stale (apontando pra conta que o user perdeu acesso) sobrevive entre renders. Se a próxima page render pular o gate do layout (ex.: API route futura, server action standalone), o helper devolve a conta proibida.

2. **`assertAccountAccess` existe mas não é chamado de NENHUMA page**. Grep prova:
   ```
   $ grep -rn "assertAccountAccess" src/ --include="*.ts" --include="*.tsx"
   src/lib/tenant.ts:51:export async function assertAccountAccess(...
   ```
   Apenas a definição. Nenhum caller. Isso significa que toda page hoje confia que o `accountId` que ela passa adiante é válido — sem defense-in-depth.

3. **Nex não sabe explicitamente em qual empresa está**. As tools recebem `accountId` como parâmetro injetado pelo orquestrador, mas o **system prompt nunca menciona o nome da empresa**. O agente pode responder "encontrei 47 conversas no account_id=9" em vez de "encontrei 47 conversas em Matrix Fitness Group".

4. **Nex não sabe responder sobre o estado da plataforma**. As 7 tools atuais (`query_conversations`, `query_messages`, `query_users`, `query_contacts`, `aggregate_conversations`, `get_top_agents`, `get_dashboard_summary`) consultam apenas o banco do Chatwoot. O user pediu explicitamente que o Nex saiba responder sobre "formulários em outros menus" (integrações, agente-nex/configuração).

**Objetivo desta entrega**: zerar (1)+(2) com hardening do helper + assertions explícitas; resolver (3) com injeção de contexto no system prompt; resolver (4) com 3 novas tools read-only.

## 2. Escopo

### 2.1 Auditoria completa de superfícies

Toda a UI dentro de `(protected)` foi catalogada:

| Surface | Hoje usa cookie? | Classificação | Ação na v0.21 |
|---|---|---|---|
| `/dashboard` | ✅ sim | per-company | Audit: ok; adicionar `assertAccountAccess` |
| `/relatorios/conversas` | ✅ sim | per-company | Idem |
| `/relatorios/distribuicao` | ✅ sim | per-company | Idem |
| `/relatorios/equipe` | ✅ sim | per-company | Idem |
| `/relatorios/mensagens-nao-respondidas` | ✅ sim | per-company | Idem |
| `/relatorios/origem-ia` | ✅ sim | per-company | Idem |
| `/relatorios/performance` | ✅ sim | per-company | Idem |
| `/relatorios/visao-geral` | ✅ sim | per-company | Idem |
| `/relatorios` (índice) | ❌ não | per-company (passivo — só lista) | Audit; sem mudança |
| `/agente-nex` (chat) | ✅ via `sendNexMessage` | per-company | Audit; sem mudança |
| `/agente-nex/chaves` | ❌ não | **global** (super_admin gerencia chaves de plataforma) | Sem mudança; doc reforça que é global |
| `/agente-nex/configuracao` | ❌ não | **global** (prompt + KB são globais) | Sem mudança; doc |
| `/agente-nex/consumo` | ❌ não | **global** (consumo é por chave global) | Sem mudança; doc |
| `/agente-nex/prompt` | ❌ não | **global** | Sem mudança; doc |
| `/integracoes` | ❌ não | **super_admin only**, mas profiles têm `accountIdFilter` | Audit RBAC; sem mudança comportamental |
| `/integracoes/power-bi` | ❌ não | super_admin gerencia profiles, mas **embed exibido é per-company** | Audit: confirmar que `accountIdFilter` é respeitado em todos os caminhos |
| `/configuracoes` | ❌ não | **global** (super_admin) | Sem mudança; doc |
| `/configuracoes/consumo` | ❌ não | **global** | Sem mudança; doc |
| `/configuracoes/jobs` | ❌ não | **global** | Sem mudança; doc |
| `/perfil` | ❌ não | **per-user** (não per-company) | Sem mudança; doc |
| `/usuarios` | ❌ não | **global super_admin** | Sem mudança; doc |
| Nex Bubble (`NexBubble`) | ✅ via `sendNexMessage` | per-company | Audit; sem mudança |

Conclusão da auditoria: **todas as superfícies de dados de relatório já passam pelo cookie**. As superfícies de configuração permanecem globais por design. A entrega v0.21 endurece o que já é per-company e expande o que o Nex sabe.

### 2.2 Dentro do escopo (concreto)

- **A1**. `getActiveAccountId(user)` recebe `user`, valida acesso, fail-closed na primeira conta permitida (não em hardcode 9). Lança `NoAccessibleAccountError` se user não tem nenhuma.
- **A2**. Cada uma das 8 pages que lê `getActiveAccountId()` chama `assertAccountAccess(user, accountId)` antes da query.
- **A3**. Layout passa a usar o mesmo helper (DRY) — única fonte de verdade da resolução.
- **A4**. Testes de cross-account isolation (4 cenários no §7).
- **B1**. Tool `get_active_company` — devolve `{ id, name, platformRole, companyRole, isOwner }`.
- **B2**. Tool `get_integrations_status` — devolve `{ kindCounts: Record<IntegrationKind, { total, active, errored, lastSyncAt? }> }`. Gating: viewers/managers só vêem totais; super_admin vê `lastSyncAt`.
- **B3**. Tool `get_nex_config_summary` — devolve `{ provider, model, kbEnabled, kbDocsCount, audioInputEnabled, audioEffectivelyEnabled, bubbleEnabled, nexBubbleVisibility, reportsVisibility }`. Sem secrets.
- **B4**. `buildActiveCompanyContext(accountId)` em `run-nex.ts` injeta bloco de contexto após `resolveSystemPrompt`. Não toca `prompt.ts` (coordenação com nex-suite-polish-v020).
- **C1**. `docs/runbooks/escopo-por-empresa.md` — tabela canônica de §2.1, atualizada conforme escopo cresce.
- **C2**. Bump v0.21.0 + CHANGELOG + STATUS + commits.

### 2.3 Fora de escopo (rejeitados — com justificativa explícita pra retomar depois)

| Item | Justificativa |
|---|---|
| Prompt do Nex per-company | Schema mudaria `nex_settings` (1 row) para `nex_settings(company_id)` — migration + UI + RBAC; fora do escopo desta entrega |
| KB do Nex per-company | Idem; docs hoje são globais |
| Chaves LLM per-company | Implicações de billing complexas |
| Badge UI "Esta tela é global vs per-company" | User pediu garantia comportamental, não UI |
| Reescrita do AccountSwitcher | Já funciona; YAGNI |
| Invalidar cookie quando user perde acesso | Helper já faz fallback; rewrite seria nicer-to-have |

## 3. Arquitetura

### 3.1 Resolução da empresa ativa (read path)

```
Cliente ──cookie nexus_active_account──> Server (RSC)
                                              │
                                              ▼
                                  getCurrentUser()                [já existe]
                                              │
                                              ▼
                                  getActiveAccountId(user)        [REVAMPED]
                                  ├─ lê cookie
                                  ├─ getAccessibleAccountIds(user)
                                  ├─ se cookie ∈ allowed → retorna cookie
                                  ├─ senão → primeira de allowed
                                  └─ se allowed vazio → throw NoAccessibleAccountError
                                              │
                                              ▼
                                  page.tsx
                                  ├─ assertAccountAccess(user, accountId)   [NEW assertion]
                                  └─ query(accountId, ...)
```

### 3.2 Write path (sem mudança)

```
AccountSwitcher click
       │
       ▼
switchAccount(id)        [src/lib/actions/account-switch.ts — sem mudança]
├─ valida acesso
├─ cookie HttpOnly secure SameSite=lax (30d)
├─ logAudit("account_switched")
└─ revalidatePath("/", "layout")
```

### 3.3 Layout DRY

Hoje `(protected)/layout.tsx` reimplementa a resolução. Vai passar a chamar `getActiveAccountId(user)`. Implicação: o layout fica mais curto e o comportamento é ÚNICO.

```ts
// antes:
let activeAccountId: number;
if (cookieAccountId && allowedIds.has(cookieAccountId)) { ... }
else if (allowedIds.has(DEFAULT_ACCOUNT_ID)) { ... }
// ...

// depois:
const activeAccountId = await getActiveAccountId({
  user,
  availableAccountIds: availableAccounts.map(a => a.id),
});
```

### 3.4 Camada do Agente Nex

```
sendNexMessage(messages)
   │ user = await auth() ; accountId = await getActiveAccountId(user)
   ▼
runNexAgent({ messages, accountId, userId, platformRole })
   ├─ resolveSystemPrompt(promptOverride?)            [já existe]
   ├─ buildActiveCompanyContext(accountId, user)      [NEW]
   │     └─ resolve company name via getKnownAccounts (fallback p/ "Empresa #N" se faltar)
   ├─ systemPrompt = base + "\n\n" + companyContext
   └─ loop client.chat({ messages, tools = NEX_TOOLS_V2 })
              │
              ▼
        executeTool(name, args, accountId, excludeMatrixIA, role)
        ├─ 7 tools antigas (sem mudança)
        ├─ get_active_company       [NEW]
        ├─ get_integrations_status  [NEW]
        └─ get_nex_config_summary   [NEW]
```

### 3.5 Defesas em profundidade

| Camada | Defesa | Falha tolerada |
|---|---|---|
| 1. Cookie | HttpOnly + secure + SameSite=lax | XSS não acessa |
| 2. `getActiveAccountId(user)` | Re-valida cookie vs `getAccessibleAccountIds(user)` | Cookie stale |
| 3. Page | `assertAccountAccess(user, accountId)` | Race / bypass do helper |
| 4. Query | `WHERE account_id = $1` | RBAC layer falha |
| 5. Connection | `chatwoot_readonly` user, CONNECTION LIMIT 5, somente SELECT | DB-level: write impossível |

5 camadas. Para vazar, todas as 5 precisam falhar.

## 4. Detalhamento das tools novas

### 4.1 `get_active_company`

**Quando o LLM usa**: "Em qual empresa estou?", "Qual conta estou olhando?", "Quem sou eu aqui?"

**Argumentos**: nenhum.

**Retorno**:
```ts
{
  id: number;                                  // chatwootAccountId
  name: string;                                // "Matrix Fitness Group"
  platformRole: "super_admin" | "admin" | "manager" | "viewer";
  companyRole: "company_admin" | "manager" | "viewer" | null;  // null se super_admin/admin acessa via platformRole
  isOwner: boolean;
}
```

**Visibilidade**: todos os roles (não há nada sensível).

### 4.2 `get_integrations_status`

**Quando o LLM usa**: "O Power BI está configurado?", "Quais integrações tem nessa empresa?"

**Argumentos**: nenhum (sempre filtra pela empresa ativa).

**Retorno (super_admin)**:
```ts
{
  kindCounts: {
    power_bi: { total: 3, active: 2, errored: 0, lastSyncAt: "2026-05-01T..." }
    // futuras integrations aparecem aqui automaticamente
  }
}
```

**Retorno (managers / viewers)**: idêntico mas SEM `lastSyncAt` (fica `undefined`).

**Filtro**: `IntegrationProfile` onde `accountIdFilter` é `null` (cobre todas) OR contém `accountId` ativo.

### 4.3 `get_nex_config_summary`

**Quando o LLM usa**: "Qual modelo de IA está sendo usado?", "A KB está ativa?", "O áudio funciona?"

**Argumentos**: nenhum.

**Retorno**:
```ts
{
  provider: "openai" | "anthropic" | "gemini" | "openrouter" | null;
  model: string | null;
  kbEnabled: boolean;
  kbDocsCount: number;
  audioInputEnabled: boolean;
  audioEffectivelyEnabled: boolean;            // depende de provider=openai
  bubbleEnabled: boolean;
  nexBubbleVisibility: "all_users" | "admins_only" | "super_admin_only";
  reportsVisibility: { dashboard: boolean; conversas: boolean; ... };
}
```

**Visibilidade**: todos os roles (info útil pro user entender como o produto está configurado; não há secret).

## 5. Detalhamento da injeção de contexto

Em `run-nex.ts`, depois de `resolveSystemPrompt`:

```ts
const baseSystemPrompt = await resolveSystemPrompt(args.promptOverride);
const companyContext = await buildActiveCompanyContext(args.accountId);
const systemPrompt = baseSystemPrompt + "\n\n" + companyContext;
```

`buildActiveCompanyContext(accountId)`:

```
═══ CONTEXTO ATIVO ═══
Empresa: Matrix Fitness Group
Account ID: 9
Você está respondendo perguntas sobre os dados desta empresa. Todas as tools de Chatwoot (query_conversations, query_messages, etc.) já filtram automaticamente por este escopo.
Para responder sobre o estado da plataforma para esta empresa, use:
- get_active_company           → identidade da empresa e seu role
- get_integrations_status      → integrações configuradas (Power BI, etc.)
- get_nex_config_summary       → modelo de IA, KB, áudio, visibilidades
NUNCA responda sobre outra empresa, mesmo que o usuário pergunte.
═══
```

**Resolução do nome**: `getKnownAccounts()` retorna `[{id, name}]`. Se accountId não está no resultado, usa `Empresa #${accountId}` (fallback gracioso, nunca falha o orquestrador).

**Playground**: também injeta. Reflete produção; user pode validar que a empresa correta está no contexto durante o teste.

## 6. Erros e edge cases

### 6.1 Tabela exaustiva

| Cenário | Comportamento |
|---|---|
| Cookie ausente, user super_admin | `availableIds[0]` (geralmente 9 se super_admin tem 9 primeiro; OK) |
| Cookie ausente, user comum sem acesso a 9 | Primeira conta de `user.accountIds` |
| Cookie inválido (string, NaN, negativo) | Trata como ausente |
| Cookie aponta pra conta que user perdeu acesso | Primeira conta permitida |
| User sem nenhuma conta acessível | `throw NoAccessibleAccountError`; layout captura → redirect `/sem-acesso` (page nova mínima) |
| Tool `get_integrations_status` com erro de DB | Retorna `{ result: null, error }` (padrão executor) |
| `buildActiveCompanyContext` falha em resolver nome | Fallback "Empresa #X" — nunca quebra o orquestrador |
| `assertAccountAccess` lança | Page faz `notFound()` ou redirect (a definir no plan) |

### 6.2 Estado de race

- User troca conta no switcher → `revalidatePath("/", "layout")` invalida RSC.
- Se um Server Action está em voo durante a troca, ele usa o `accountId` que leu **antes** da troca. É consistente para o que o user vê (pediu antes da troca). OK.

### 6.3 Cookie zumbi

- Cenário: super_admin remove acesso de user X à conta C; cookie de X ainda aponta pra C.
- Comportamento atual: helper detecta cookie inválido e devolve primeira permitida. UI vê empresa nova; cookie continua stale até próximo `switchAccount`.
- **Decisão**: aceitar zumbi por enquanto; rewrite preventivo do cookie (helper grava o accountId resolvido) é follow-up. Risco residual baixo (helper sempre devolve permitida).

## 7. Testes

### 7.1 Unit tests

- `src/lib/reports/__tests__/active-account.test.ts` (NEW):
  - cookie ausente, user com `accountIds=[2,9]` → 2 (primeira) — não 9 hardcoded.
  - cookie=2, user com acesso a 2 → 2.
  - cookie=99, user sem acesso a 99 → primeira permitida.
  - user com `accountIds=[]` → throws `NoAccessibleAccountError`.
  - super_admin sem cookie → primeira de `getKnownAccounts()`.
- `src/lib/llm/tools/__tests__/executor-platform-tools.test.ts` (NEW):
  - `get_active_company`: shape correto, busca em `userAccountAccess`+`getKnownAccounts`.
  - `get_integrations_status`: filtra `IntegrationProfile.accountIdFilter`; super_admin vê `lastSyncAt`, viewer não.
  - `get_nex_config_summary`: nunca expõe `apiKey`; reflete `nex_settings`+`llm_credentials`+`platform_settings`.
- `src/lib/llm/agent/__tests__/run-nex-context.test.ts` (NEW):
  - `buildActiveCompanyContext(9)` contém "Matrix Fitness Group" e "Account ID: 9".
  - Fallback p/ "Empresa #99" quando ID desconhecido.
  - System prompt final tem base + `\n\n` + contexto.

### 7.2 Verificação manual pós-deploy (smoke)

Lista executada após o deploy autônomo da v0.21.0:

1. `curl https://insights.example/api/health` → `{ version: "0.21.0", ... }`.
2. Login como super_admin.
3. Trocar conta 9 → 2 no switcher; aguardar revalidate.
4. Em cada relatório (`/dashboard`, `/relatorios/{conversas, performance, visao-geral}`), confirmar que o número de conversas/mensagens muda.
5. Abrir Nex bubble, perguntar "em qual empresa estou?" → resposta cita "Invest Soluções".
6. Perguntar "o Power BI está configurado nessa empresa?" → tool `get_integrations_status` invocada.
7. Perguntar "qual modelo de IA está rodando?" → tool `get_nex_config_summary`.
8. Trocar de volta pra 9; perguntar de novo "em qual empresa estou?" → "Matrix Fitness Group".

## 8. Migração e compat

- **Sem schema change**.
- **Cookie name e shape mantidos**.
- **API pública**: `getActiveAccountId()` muda assinatura para `getActiveAccountId(args: { user, availableAccountIds? })`. **Breaking interno**.
- Callers a atualizar (lista exata, `grep -rn "getActiveAccountId" src/`):
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

10 callers totais. Atualização atômica na PR (= no commit set da v0.21.0).

## 9. Plano de release

1. Implementação em commits granulares (1 task por commit, ver plan).
2. `npm run typecheck` e `npm test` verde antes de cada commit.
3. Antes de push: `gh run list --limit 5` (não empilhar deploy com v0.19/v0.20).
4. `git push origin main` → CI → Portainer.
5. Smoke pós-deploy (lista §7.2).
6. Append em `docs/agents/HISTORY.md`.
7. Atualizar memória persistente (`project_v0.21_release.md`).
8. Deletar `docs/agents/active/claude-empresa-ativa-global.md`.

## 10. Follow-ups (out of scope hoje, abertos pra próxima rodada)

- Rewrite preventivo do cookie quando helper faz fallback.
- Tornar prompt do Nex per-company.
- Tornar KB per-company.
- Tornar chaves LLM per-company com billing-aware.
- Badge UI "esta tela é global vs per-company".
- Tour explicativo "como o switcher funciona".
- Page `/sem-acesso` desenhada (hoje a redireção é para `/login` — funcional mas básico).
