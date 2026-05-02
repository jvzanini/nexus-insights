# Spec v1 — Empresa Ativa como Escopo Global Definitivo

> **Versão**: v1 (rascunho inicial — pré pente-fino #1)
> **Target release**: v0.21.0
> **Data**: 2026-05-02
> **Autor**: claude-empresa-ativa-global (sessão autônoma)

---

## 1. Contexto e motivação

Hoje a plataforma já tem `AccountSwitcher` no sidebar, gravando a conta ativa em cookie HttpOnly `nexus_active_account`. 9 superfícies (`/dashboard` + 7 relatórios + Nex chat) leem este cookie via `getActiveAccountId()` e filtram seus dados por essa conta.

**Problemas identificados na auditoria pré-spec:**

1. **`getActiveAccountId()` é fail-open com leak para Matrix**: quando cookie ausente/inválido, retorna `9` (Matrix Fitness Group) sem validar acesso do user. Risco: user de outra conta sem cookie veria dados de Matrix; user sem nenhum acesso veria dados de Matrix antes de bater num gate downstream.
2. **`assertAccountAccess` existe mas não é chamado de NENHUMA page**: cada page atualmente chama `getActiveAccountId()` e segue direto pra query, confiando que o cookie reflete acesso válido. Se a validação do layout falhar ou for bypassada, leak.
3. **Agente Nex não sabe explicitamente em qual empresa está**: hoje o `accountId` é injetado nas tools, mas o system prompt não é informado do nome da empresa. O modelo pode citar "account_id=9" ao usuário em vez de "Matrix Fitness Group".
4. **Agente Nex não consegue responder sobre estado da plataforma**: o user pediu explicitamente que o Nex saiba responder sobre "formulários em outros menus" (integrações, configurações). Hoje o Nex tem 7 tools, todas sobre dados Chatwoot — nenhuma sobre integrações ou config da plataforma.

**Objetivo desta entrega**: tornar a empresa ativa **comportamentalmente absoluta** — sem leaks, sem fallback silencioso, e o Nex sabendo exatamente em qual empresa está e respondendo sobre o estado dela.

## 2. Escopo

### Dentro do escopo

- **A1**. Hardening de `getActiveAccountId()`: aceita `user`, valida acesso, fail-closed em `availableAccounts[0].id` em vez de hardcode 9.
- **A2**. Cada page que lê `getActiveAccountId()` chama também `assertAccountAccess(user, accountId)` — defense in depth.
- **A3**. Testes de cross-account isolation: subagent não-super_admin com cookie de conta proibida deve cair pra primeira conta permitida (não para Matrix).
- **B1**. Nova tool `get_active_company`: devolve `{ id, name, role, isOwner }`.
- **B2**. Nova tool `get_integrations_status`: devolve `{ powerBi: { configured, profilesCount, lastSync }, ... }` — read-only, sem secrets.
- **B3**. Nova tool `get_nex_config_summary`: devolve `{ provider, model, kbEnabled, kbDocsCount, audioEnabled, promptVersion }` — sem secrets.
- **B4**. Injeção de contexto no system prompt do Nex: append em `run-nex.ts` (não em `prompt.ts` — coordenação com nex-suite-polish-v020).
- **C1**. Runbook `docs/runbooks/escopo-por-empresa.md`: tabela de superfícies × nível (per-company / global), com justificativa.
- **C2**. CHANGELOG, STATUS, package.json bump, commits.

### Fora de escopo (rejeitados com justificativa)

- ❌ **Tornar prompt do Nex per-company**: schema change massiva (`nex_settings` é 1 row), implicações de UX (cada admin de empresa edita seu prompt?), out of scope para esta entrega. Fica como follow-up.
- ❌ **Tornar KB do Nex per-company**: idem (docs hoje globais; per-company implicaria FK + UI de upload por empresa).
- ❌ **Tornar chaves LLM per-company**: implicações de billing complexas (super_admin paga? cada empresa paga? como rateia?).
- ❌ **Badge UI "Esta tela é global vs per-company"**: user não pediu UI, pediu garantia comportamental. YAGNI.
- ❌ **Reescrita do AccountSwitcher para ser server component**: já funciona, sem necessidade.

## 3. Arquitetura

### 3.1 Camada de "active company" (read)

```
Cliente (browser) ──cookie nexus_active_account──> Server (RSC)
                                                       │
                                                       ▼
                                       getActiveAccountId(user)  [src/lib/reports/active-account.ts]
                                                       │
                                       1. lê cookie
                                       2. valida vs getAccessibleAccountIds(user)
                                       3. fail-closed: primeira conta permitida (não Matrix hardcoded)
                                                       │
                                                       ▼
                                       page.tsx:
                                         - assertAccountAccess(user, accountId)
                                         - query(accountId)
```

### 3.2 Camada de "active company" (write)

```
AccountSwitcher click ──> switchAccount(id)  [já existe — não muda]
                              │
                              ├── valida acesso
                              ├── set cookie HttpOnly secure SameSite=lax (30d)
                              ├── logAudit("account_switched")
                              └── revalidatePath("/", "layout")  ← invalida RSC, força refetch
```

Sem mudança aqui. Já está correto.

### 3.3 Camada do Agente Nex

```
sendNexMessage(messages) ──> runNexAgent({ messages, accountId, userId, role })
                                  │
                                  ├── resolveSystemPrompt() → "Você é o Agente Nex..."
                                  ├── injectActiveCompanyContext(prompt, accountId) [NEW]
                                  │     append: "\n\nCONTEXTO ATIVO:\n- Empresa: Matrix Fitness Group (account_id=9)\n- ..."
                                  └── loop: client.chat({ messages, tools }) → executeTool(name, args, accountId)
                                                                                       │
                                                                                       └── 7 tools antigas + 3 NEW
                                                                                            ├── get_active_company       (lê userAccountAccess+ session)
                                                                                            ├── get_integrations_status  (lê IntegrationProfile filtrado por accountId)
                                                                                            └── get_nex_config_summary   (lê nex_settings + llm_credentials.active)
```

### 3.4 Defesas em profundidade

| Camada | Defesa | Falha tolerada |
|---|---|---|
| Cookie | HttpOnly + secure + SameSite=lax | XSS não pega; CSRF mitigado |
| Layout | Resolve cookie → set in `availableAccounts` | Cookie inválido → primeira allowed |
| `getActiveAccountId(user)` | Re-valida acesso | Cookie ainda válido mas user perdeu acesso → primeira allowed |
| Page | `assertAccountAccess(user, accountId)` | Race condition / bypass do layout → throw 403 |
| Query SQL | `WHERE account_id = $1` | RBAC layer falha → SQL ainda filtra |

5 camadas. Para vazar, todas as 5 precisam falhar.

## 4. Detalhamento das tools novas

### 4.1 `get_active_company`

**Quando o LLM usa**: "Em qual empresa estou?", "Qual conta estou olhando?", "Quem sou eu aqui?"

**Argumentos**: nenhum.

**Retorno**:
```ts
{
  id: number;            // chatwootAccountId
  name: string;          // "Matrix Fitness Group"
  userRole: string;      // "Super Admin" | "Admin" | "Manager" | "Viewer"
  isOwner: boolean;
}
```

### 4.2 `get_integrations_status`

**Quando o LLM usa**: "O Power BI está configurado?", "Quais integrações tem nessa empresa?"

**Argumentos**: nenhum (sempre filtra pela empresa ativa via accountId injetado).

**Retorno**:
```ts
{
  powerBi: {
    profilesCount: number;     // quantos IntegrationProfile kind=power_bi têm accountIdFilter cobrindo essa conta
    activeCount: number;
    erroredCount: number;
    lastSyncAt: string | null;
  };
  // futuro: outras integrações
}
```

Read-only. Nunca expõe URL, embed token, secret. Apenas contadores.

### 4.3 `get_nex_config_summary`

**Quando o LLM usa**: "Qual modelo de IA está sendo usado?", "A KB tá ativa?", "O áudio funciona?"

**Argumentos**: nenhum.

**Retorno**:
```ts
{
  provider: "openai" | "anthropic" | "gemini" | "openrouter" | null;
  model: string | null;
  kbEnabled: boolean;
  kbDocsCount: number;
  audioInputEnabled: boolean;
  audioEffectivelyEnabled: boolean;  // depende de provider=openai
  bubbleEnabled: boolean;
  visibility: "all_users" | "admins_only" | "super_admin_only";
}
```

Read-only. Sem chave, sem prompt completo (LLM já recebe o prompt no system message).

## 5. Detalhamento da injeção de contexto

Em `run-nex.ts` (NÃO em `prompt.ts`), após `resolveSystemPrompt`:

```ts
const baseSystemPrompt = await resolveSystemPrompt(args.promptOverride);
const activeCompanyContext = await buildActiveCompanyContext(args.accountId);
const systemPrompt = `${baseSystemPrompt}\n\n${activeCompanyContext}`;
```

`buildActiveCompanyContext(accountId)` produz:
```
═══ CONTEXTO ATIVO (não responda sobre outra empresa) ═══
Empresa: Matrix Fitness Group
Account ID: 9
Todas as tools de Chatwoot (query_conversations, query_messages, etc.) já filtram automaticamente por esta empresa.
Para responder sobre o estado da plataforma nesta empresa, use as tools get_integrations_status e get_nex_config_summary.
═══
```

Isolado em função própria pra ser testável. Falha graciosa: se o nome da empresa não for resolvível, usa "account_id=X" como fallback.

## 6. Erros e edge cases

| Cenário | Comportamento esperado |
|---|---|
| Cookie ausente, user super_admin | activeAccountId = 9 (Matrix, default sensato pois super_admin tem acesso a tudo) |
| Cookie ausente, user comum sem acesso a 9 | activeAccountId = primeira conta de `user.accountIds` (não 9) |
| Cookie inválido (string, NaN, negativo) | Trata como ausente |
| Cookie aponta pra conta que user perdeu acesso | activeAccountId = primeira permitida; (TBD: invalidar cookie) |
| User sem nenhuma conta acessível | Throw 403 — page deve renderizar erro amigável |
| Tool `get_integrations_status` com erro de DB | Retorna `{ result: null, error }` (padrão atual do executor) |
| Tool `get_nex_config_summary` com tabela ausente | Idem |

## 7. Testes

### 7.1 Unit tests

- `__tests__/active-account.test.ts`:
  - Cookie ausente → primeira conta permitida (não 9 hardcoded).
  - Cookie válido, user tem acesso → retorna do cookie.
  - Cookie aponta pra conta proibida → primeira permitida.
  - User sem nenhuma conta → throw.
- `__tests__/executor-platform-tools.test.ts`:
  - `get_active_company` retorna shape esperado.
  - `get_integrations_status` filtra por `accountIdFilter`.
  - `get_nex_config_summary` não expõe secrets.
- `__tests__/run-nex-context.test.ts`:
  - System prompt contém "Empresa: X" e "account_id=Y".
  - Fallback gracioso quando nome da empresa não resolve.

### 7.2 Integration tests

- Snapshot test: trocar cookie de conta A para conta B no mesmo render → dados mudam.
- Smoke: `npm run dev`, login, trocar conta no switcher, verificar que dashboard refresca com dados da nova conta.

## 8. Migração e compat

- Sem mudança de schema do banco.
- Cookie name e shape mantidos.
- API pública de `getActiveAccountId()` muda (passa a aceitar `user`). **Quebra interna**: todos os callers precisam ser atualizados na mesma PR (8 pages + nex-chat).
- Backwards-compat: NÃO. Versão minor (v0.21.0) e os callers são poucos e todos no nosso código — fácil corrigir todos.

## 9. Plano de release

1. v0.21.0 vai pra `main` quando todas as 8 pages forem atualizadas + 3 tools + injeção de contexto + testes passarem.
2. Coordenação com v0.19 (conversas) e v0.20 (nex polish) via `docs/agents/active/*.md`.
3. Deploy automático via GitHub Actions → Portainer.
4. Smoke pós-deploy: trocar conta no switcher, verificar `/api/health` e que cada relatório carrega para a nova conta.

## 10. Aberta

- TBD: invalidar cookie quando user perde acesso à conta atual? Mais defensivo, mas adiciona complexidade. Por ora apenas o fallback do helper resolve.
- TBD: tour da empresa ativa?
