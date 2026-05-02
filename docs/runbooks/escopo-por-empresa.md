# Runbook — Escopo por Empresa (canônico)

> **Source-of-truth**: o `AccountSwitcher` no sidebar é a fonte ÚNICA da empresa ativa.
> Cookie HttpOnly `nexus_active_account` (gravado por `switchAccount` em `src/lib/actions/account-switch.ts`) carrega o `accountId` Chatwoot.
> Versão deste documento: **v0.21.0** (2026-05-02).

---

## 1. Tabela canônica de superfícies

| Surface | Lê cookie? | Classificação | Notas |
|---|---|---|---|
| `/dashboard` | sim | per-company | `assertAccountAccess` obrigatório (v0.21+) |
| `/relatorios/conversas` | sim | per-company | idem |
| `/relatorios/distribuicao` | sim | per-company | idem |
| `/relatorios/equipe` | sim | per-company | idem |
| `/relatorios/mensagens-nao-respondidas` | sim | per-company | idem |
| `/relatorios/origem-ia` | sim | per-company | idem |
| `/relatorios/performance` | sim | per-company | idem |
| `/relatorios/visao-geral` | sim | per-company | idem |
| `/relatorios` (índice) | não | per-company (passivo) | só lista; sem mudança |
| `/agente-nex` (chat) | sim, via `sendNexMessage` | per-company | injeção de contexto no system prompt (`buildActiveCompanyContext`) |
| Nex Bubble (`NexBubble`) | sim, via `sendNexMessage` | per-company | idem |
| `/agente-nex/chaves` | não | **global** (super_admin) | chaves LLM são globais por design |
| `/agente-nex/configuracao` | não | **global** | KB e prompt são globais |
| `/agente-nex/consumo` | não | **global** | consumo da chave global |
| `/agente-nex/prompt` | não | **global** | prompt único; per-company é follow-up |
| `/integracoes` | não | **super_admin only** | profiles têm `accountIdFilter` |
| `/integracoes/power-bi` | não | super_admin gerencia profiles, embed é per-company | filtro por `accountIdFilter` em todos os caminhos |
| `/configuracoes` | não | **global** (super_admin) | settings de plataforma |
| `/configuracoes/consumo` | não | **global** | |
| `/configuracoes/jobs` | não | **global** | |
| `/perfil` | não | **per-user** | conta do usuário, não da empresa |
| `/usuarios` | não | **global super_admin** | gerência cross-company |

---

## 2. Invariantes do projeto (REGRA ABSOLUTA)

### 2.1 Para TODO novo caller que precise de `accountId`

```ts
// 1. autenticação
const user = await getCurrentUser();
if (!user) redirect("/login");

// 2. resolução fail-closed (cookie validado vs getAccessibleAccountIds)
const accountId = await getActiveAccountId(user);

// 3. defense in depth (mesmo que o helper esteja correto, validar de novo)
await assertAccountAccess(user, accountId);

// 4. agora pode consultar o banco
const data = await query(accountId, ...);
```

Esta sequência é **não-negociável** em qualquer page/server-action que toca dados per-company. A camada (3) parece redundante mas existe para o caso em que (2) tenha um bug de regressão futura — última linha de defesa antes da query.

### 2.2 Defesas em profundidade

5 camadas no total (precisam falhar TODAS para haver vazamento):

1. Cookie `HttpOnly + secure + SameSite=lax` (ataque XSS mitigado).
2. Helper `getActiveAccountId(user)` — re-valida cookie vs `getAccessibleAccountIds(user)` e fail-closed na primeira conta permitida.
3. `assertAccountAccess(user, accountId)` no caller — defense in depth.
4. SQL com `WHERE account_id = $1` em todas as queries.
5. Conexão com user `chatwoot_readonly` (CONNECTION LIMIT 5; somente SELECT).

---

## 3. Comando de auditoria contínua

Use periodicamente (e antes de cada release) para detectar regressão:

```bash
# Lista pages que chamam getActiveAccountId mas NÃO chamam assertAccountAccess.
# Output esperado: VAZIO. Se aparecer alguma page, é furo de defense-in-depth.
comm -23 \
  <(grep -rln "getActiveAccountId" src/app/\(protected\) | sort) \
  <(grep -rln "assertAccountAccess" src/app/\(protected\) | sort)
```

Para auditar novos endpoints API que usem o helper:

```bash
grep -rn "getActiveAccountId" src/app/api/ src/lib/actions/
# Cada caller deve seguir a sequência 2.1
```

---

## 4. Tools do Agente Nex (v0.21.0)

O Nex sabe responder sobre o estado da plataforma na empresa ativa via 3 tools read-only:

| Tool | Para que serve | Dados retornados |
|---|---|---|
| `get_active_company` | "Em qual empresa estou?" / "Qual o meu role?" | `{ id, name, platformRole, companyRole, isOwner }` |
| `get_integrations_status` | "O Power BI está configurado?" / "Quais integrações tem aqui?" | `{ kindCounts: { power_bi: { total, active, errored, disabled, lastSyncAt? } } }` (lastSyncAt só para super_admin) |
| `get_nex_config_summary` | "Qual modelo de IA está rodando?" / "A KB está ativa?" / "Vejo o relatório de conversas?" | `{ provider, model, kbEnabled, kbDocsCount, audioInputEnabled, audioEffectivelyEnabled, bubbleEnabled, nexBubbleVisibility, reportsVisibility }` (sem secrets) |

Todas as 3 tools são **read-only** e nunca expõem chaves, tokens ou URLs internas.

---

## 5. Como saber se uma surface deve ser per-company

Critério prático: **se mudar a empresa no switcher mudaria a resposta correta do app, é per-company**.

- `/relatorios/*` mostra dados de UMA empresa → per-company.
- `/agente-nex/chaves` mostra a lista de chaves LLM da plataforma toda (super_admin pagador único) → global.
- `/integracoes` lista profiles de TODAS as empresas; cada profile tem seu próprio `accountIdFilter` → super_admin only.

Se houver dúvida, escreva uma nota neste runbook + abra issue.

---

## 6. Mudança de schema

**Hoje, v0.21.0**: nenhuma surface global tem coluna `accountId` no banco. Tornar surfaces globais em per-company exige migration + UI + RBAC review. Items abertos como follow-up:

- Tornar prompt do Nex per-company.
- Tornar KB per-company.
- Tornar chaves LLM per-company com billing.
- Badge UI "esta tela é global vs per-company".

Esses estão fora do escopo da v0.21.0.

---

## 7. Histórico

- **v0.21.0 (2026-05-02)**: criação deste runbook; hardening de `getActiveAccountId(user)` (fail-closed, cache, NoAccessibleAccountError); 3 tools Nex; injeção de contexto no system prompt.
