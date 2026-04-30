# Spec — Agente Nex: credenciais gerenciáveis + custo BRL/precisão

> **Status:** v3 (double-check completo)
> **Versão alvo:** v0.12.0
> **Autor:** claude-credenciais-llm
> **Data:** 2026-04-30
> **Tipo:** feature + tech-debt

---

## 1. Contexto

Dois problemas operacionais reportados pelo super_admin durante o uso real:

### 1A — Configuração do Agente Nex
A tela `/configuracoes` mistura "credencial" (a chave do provider) com "config
ativa" (qual provider+modelo o Nex está usando agora). Hoje, na tabela
`llm_configs`, cada row é um snapshot de `(provider, model, encrypted_api_key,
is_active)`. Consequências:
- Para trocar **só** o modelo é preciso re-digitar a chave inteira.
- Para trocar provider sem perder a chave anterior — impossível.
- Para guardar mais de uma chave do mesmo provider (ex.: produção × dev) —
  impossível.

Além disso, a UI usa o nome "Agente IA (Nex)" enquanto o produto é só
**"Agente Nex"** — inconsistência visível em card, página de consumo, mensagens
de erro e empty-states.

### 1B — Página `/configuracoes/consumo`
- O card "Custo total (USD)" e os charts mostram zero quando o gasto é menor
  que um centavo — modelos baratos (Gemini Flash, Haiku) tipicamente custam
  sub-centavo por chamada, então o agregado parece sempre zero.
- O super_admin opera em reais e cobra com cartão de crédito. Hoje a UI só
  mostra USD. Precisa exibir o equivalente em BRL **convertido com a cotação
  do cartão de crédito do dia da chamada** (não a cotação comercial).

## 2. Objetivos

### 2A — Credenciais
1. Em toda a UI/mensagens, o nome do produto é **"Agente Nex"** (sem "IA"
   redundante).
2. **Credenciais** (API keys) viram um recurso de primeira classe, listado e
   gerenciável (criar, renomear, rotacionar, deletar) **separado** da
   configuração ativa do agente.
3. Trocar modelo: **não exige** re-digitar a chave.
4. Trocar provedor: se já existe credencial salva pra esse provider, ela é
   pré-selecionada. Se há mais de uma, super_admin escolhe qual usar.
5. Backward-compat: super_admin que já tem `llm_configs` ativa continua
   funcionando sem nenhuma ação manual; a credencial existente é migrada com
   label "Chave principal" automaticamente no primeiro acesso.

### 2B — Custo BRL & precisão
1. Garantir **mínimo de 4 casas decimais** em toda exibição de custo USD (KPI
   card, charts, tabela detalhada). A DB já guarda 6 casas (`Decimal(10, 6)`),
   o gargalo é só de display.
2. Card "Custo total" passa a mostrar **BRL como valor principal** (R$ X,XXXX)
   com USD em fonte menor abaixo (≈ $X.XXXX).
3. Cada chamada (`llm_usage`) registra a **taxa USD→BRL do dia** no momento da
   inserção, usando taxa "cartão de crédito" (comercial × spread configurável,
   default 1.10).
4. Tabela "Chamadas detalhadas" ganha coluna **Custo BRL** ao lado de Custo USD.
5. Charts (`Custo por dia`, `Custo por modelo`, `Distribuição por provider`)
   passam a usar BRL como métrica primária (eixo Y, tooltips, donut center)
   com tooltip mostrando ambos.

## 3. Não-objetivos

- Compartilhar credencial entre múltiplos super_admins simultâneos com fluxo
  colaborativo.
- Suporte a SSO/OIDC do provedor.
- Cota / rate-limiting por credencial.
- Importar/exportar credenciais.
- Recálculo retroativo da cotação BRL nas rows antigas: deixamos `NULL` e
  exibimos só USD para essas (a partir do deploy, todas as novas têm BRL).
- Alternar moeda (toggle USD/BRL global no UI): BRL é primário, USD secundário,
  fim. Sem toggle.
- API/webhook de cotação interna — usamos APIs públicas existentes.

## 4. Modelo de dados

### 4.1 Nova tabela `llm_credentials`

```sql
CREATE TABLE IF NOT EXISTS "llm_credentials" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "encrypted_api_key" TEXT NOT NULL,
  "last4" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS "llm_credentials_provider_label_idx"
  ON "llm_credentials"("provider", "label");
CREATE INDEX IF NOT EXISTS "llm_credentials_provider_updated_idx"
  ON "llm_credentials"("provider", "updated_at" DESC);
```

- `provider` ∈ {openai, anthropic, gemini, openrouter}.
- `label` é livre, **único por provider** (default sugerido "Chave 1",
  "Chave 2", … se enviar vazio).
- `last4` armazena os últimos 4 chars da chave **original** (não cifrados) para
  exibir "••••••XXXX" sem descriptografar na listagem.
- `encrypted_api_key` continua cifrado com AES-256 via `@/lib/encryption`.

### 4.2 Mudança em `llm_configs`

Adicionar coluna `credential_id` (FK lógica para `llm_credentials.id`). A coluna
`encrypted_api_key` **continua existindo** por compat (deploy zero-downtime). Em
v0.13.0 dropamos.

```sql
ALTER TABLE "llm_configs" ADD COLUMN IF NOT EXISTS "credential_id" UUID;
```

Backend novo lê via JOIN, ignora `encrypted_api_key` quando `credential_id IS
NOT NULL`. Fallback decifra `encrypted_api_key` direto se `credential_id` é
`NULL` (rows pré-migração).

### 4.3 Mudanças em `llm_usage` (custo BRL)

```sql
ALTER TABLE "llm_usage"
  ADD COLUMN IF NOT EXISTS "cost_brl"          DECIMAL(12, 6),
  ADD COLUMN IF NOT EXISTS "usd_to_brl_rate"   DECIMAL(10, 4);
```

- `cost_brl` = `cost_usd × usd_to_brl_rate` (computado em app no INSERT).
- `usd_to_brl_rate` é a cotação efetiva no momento da inserção (já com spread
  cartão aplicado).
- Ambas são **NULLABLE** — rows antigas ficam NULL e a UI mostra só USD para
  elas (sem backfill).

### 4.4 Migração one-shot dentro de `ensureLlmTables()`

Idempotente, transacional, sem ferir compatibilidade:

1. Criar `llm_credentials` (CREATE IF NOT EXISTS).
2. Adicionar `llm_configs.credential_id` (ALTER IF NOT EXISTS).
3. Adicionar `llm_usage.cost_brl` e `llm_usage.usd_to_brl_rate`.
4. Para cada `llm_configs` com `credential_id IS NULL AND encrypted_api_key IS NOT NULL`:
   - Buscar/criar credencial em `llm_credentials` com label "Chave principal"
     (ou "Chave principal 2"… se já existir do mesmo provider) e `last4` derivado
     de `decrypt(encrypted_api_key).slice(-4)`. Se `decrypt` falhar (chave
     corrompida), loga warning e segue — super_admin re-cadastra manualmente.
   - Atualizar `llm_configs.credential_id`.
5. Cachear flag `migrated = true` em memória.

### 4.5 Atualização do `prisma/schema.prisma`

Adicionar `model LlmCredential`, atualizar `model LlmConfig` para incluir
`credentialId`, atualizar `model LlmUsage` para incluir `costBrl`/`usdToBrlRate`.
Como a tabela é criada via SQL bruto em runtime (padrão do projeto), o Prisma é
só pra tipos.

## 5. Camada de cotação USD→BRL

### 5.1 Nova lib `src/lib/llm/exchange-rate.ts`

```ts
getUsdBrlRate(): Promise<{ rate: number; source: 'live' | 'cache' | 'fallback'; fetchedAt: Date }>
```

Estratégia:
1. **Cache primário** em `app_settings` (key `llm.usd_brl.rate_cache`,
   shape `{ commercial: number, fetchedAt: ISO }`). TTL **4 horas** — cotação
   muda devagar e queremos minimizar chamadas externas.
2. Se cache expirado/ausente: fetch da AwesomeAPI
   `https://economia.awesomeapi.com.br/last/USD-BRL` (gratuita, sem auth, ~50ms).
   Resposta: `{ "USDBRL": { "bid": "5.10", ... } }`.
3. Aplicar **spread de cartão** lendo `app_settings.llm.usd_brl.card_spread`
   (default `1.10`). Resultado: `commercial × spread`.
4. Atualizar cache.
5. Em caso de falha de rede/timeout: usar último valor cacheado (mesmo expirado);
   se nem isso, usar fallback hardcoded `5.50` × spread.

A função é **idempotente em cache** — chamada N vezes em <4h faz 1 fetch.

### 5.2 Integração com `logUsage`

`logUsage()` em `src/lib/llm/agent/usage-logger.ts` ganha:
1. Antes do INSERT: `const { rate } = await getUsdBrlRate()`.
2. Calcula `costBrl = round6(costUsd × rate)`.
3. INSERT inclui `cost_brl` e `usd_to_brl_rate`.
4. Em caso de erro no fetch da cotação: salva `cost_brl=NULL` e
   `usd_to_brl_rate=NULL`, segue. Não bloqueia o chat.

### 5.3 Configuração do spread

Card novo em `/configuracoes` ou subseção do "Agente Nex": campo "Spread
cartão de crédito" (default 1.10, range [1.00, 1.30]). Persistido em
`app_settings.llm.usd_brl.card_spread`.

Decisão: subseção do card "Agente Nex" para evitar mais um card. Visualmente:
linha extra abaixo do bloco de status com um número editável + tooltip
explicando "Use 1.10 para ~10% sobre a comercial (IOF + spread Visa/Master
típico)".

## 6. Camada de dados (server)

### 6.1 `src/lib/llm/credentials.ts` (NOVO)

API server-only:

```ts
listCredentials(provider?: LlmProvider): Promise<CredentialSummary[]>
getCredentialById(id: string): Promise<Credential | null>
createCredential({ provider, label?, apiKey }): Promise<{id, label, last4}>
updateCredential(id, { label?, apiKey? }): Promise<{label, last4}>
deleteCredential(id): Promise<void>  // bloqueia se ativa
```

`CredentialSummary` (sem chave): `{ id, provider, label, last4, createdAt, updatedAt }`.
`createCredential` autogera label se não enviado: "Chave N" onde N = count + 1.
`createCredential` valida unique(provider, label) em app-level antes do INSERT.
`deleteCredential` falha com erro tipado `CREDENTIAL_IN_USE` se essa credencial
for `credential_id` de algum row `llm_configs.is_active = true`.

### 6.2 `src/lib/llm/get-active-config.ts` (REFATOR)

Antes:
```sql
SELECT id, provider, model, encrypted_api_key FROM llm_configs WHERE is_active = true
```

Depois:
```sql
SELECT c.id, c.provider, c.model, cred.encrypted_api_key, cred.id AS credential_id, cred.label, cred.last4
  FROM llm_configs c
  LEFT JOIN llm_credentials cred ON cred.id = c.credential_id
 WHERE c.is_active = true
 ORDER BY c.updated_at DESC
 LIMIT 1
```

Fallback: se `c.credential_id IS NULL` (migração ainda não rodou),
descriptografa `c.encrypted_api_key` direto.

`PublicLlmConfig` cresce com `credentialId` e `credentialLabel`.

### 6.3 `src/lib/llm/queries/usage-stats.ts` (REFATOR)

`UsageSummary` ganha:
```ts
totalCostBrl: number
byDay[].costBrl: number
byProvider[].costBrl: number
byModel[].costBrl: number
exchangeRate: { rate: number; source: 'live'|'cache'|'fallback' } // last applied
```

Queries SQL ajustadas para `SUM(cost_brl)` em paralelo a `SUM(cost_usd)`.

`UsageDetailRow` ganha:
```ts
costBrl: number | null
usdToBrlRate: number | null
```

### 6.4 Server Actions

#### `src/lib/actions/llm-credentials.ts` (NOVO)

```ts
listLlmCredentialsAction(provider?): ActionResult<CredentialSummary[]>
createLlmCredentialAction({ provider, label, apiKey }): ActionResult<{id, label, last4}>
updateLlmCredentialAction(id, { label?, apiKey? }): ActionResult<{label, last4}>
deleteLlmCredentialAction(id): ActionResult<void>
testLlmCredentialAction(id, model): ActionResult<TestLlmConnectionResult>
```

Todas guardadas por `requireSuperAdmin()`. Cada uma loga em `audit_logs` com
`action ∈ { credential_created, credential_updated, credential_deleted, credential_tested }`.

#### `src/lib/actions/llm-config.ts` (AJUSTE)

A action `saveLlmConfig` muda o contrato:

**Antes:** `{ provider, model, apiKey }`.
**Depois:** `{ provider, model, credentialId }`.

Para suportar "criar credencial + ativar imediatamente" da UI nova:
1. UI chama `createLlmCredentialAction(...)` → recebe `{id}`.
2. UI chama `saveLlmConfig({ provider, model, credentialId: id })`.

Adicionar `testLlmConnectionByCredential({ credentialId, model })` que decifra
internamente e roda o `deepTest` igual hoje, sem exigir re-digitar.

#### `src/lib/actions/exchange-rate.ts` (NOVO, leve)

```ts
getCurrentRateAction(): ActionResult<{rate, source, fetchedAt}>
setCardSpreadAction(spread: number): ActionResult<void>  // super_admin only, validates [1.0, 1.3]
```

## 7. UI

### 7.1 Renomeações textuais (sem mudança de função)

| Local | Antes | Depois |
|-------|-------|--------|
| `llm-config-card.tsx` `<CardTitle>` | "Agente IA (Nex)" | "Agente Nex" |
| `consumo/page.tsx` metadata.title + título | "Consumo do Agente IA" | "Consumo do Agente Nex" |
| `consumo-content.tsx` mensagem vazia | "Nenhuma chamada ao Agente IA registrada ainda" | "Nenhuma chamada ao Agente Nex registrada ainda" |
| `run-nex.ts` mensagem de erro | "Vá em Configurações → Agente IA (Nex)" | "Vá em Configurações → Agente Nex" |
| Toasts e mensagens de status que usam "Agente IA" | — | "Agente Nex" |

Grep final no merge garante zero ocorrências de "Agente IA" em `src/`.

### 7.2 Novo card "Chaves de API" em `/configuracoes`

Componente: `src/components/settings/llm-credentials-card.tsx` (Client
Component). Localização: **logo abaixo** do card "Agente Nex".

Layout:

```
┌──────────────────────────────────────────────────────────────┐
│ 🔑 Chaves de API                                             │
│                                                              │
│ Gerencie as chaves de API por provedor. A chave em uso pelo  │
│ Agente Nex aparece destacada.                                │
│                                                              │
│ ┌── OpenAI ─────────────────────────────────────[+ Nova] ──┐ │
│ │ ● Conta principal · ••••••sk-X4Yz   [Renomear][Trocar][🗑]│ │
│ │   Conta dev · ••••••sk-T3st       [Renomear][Trocar][🗑]│ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌── Anthropic ────────────────────────────────[+ Nova] ────┐ │
│ │ — Nenhuma chave cadastrada                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

- O ponto verde marca a credencial em uso pela config ativa (única — só do
  provider ativo).
- "Renomear": input inline. "Trocar": popover com `PasswordInput` para colar
  nova chave (rotação). "🗑": confirmação.
- "+ Nova": dialog com `(label, PasswordInput, [Testar conexão])`.

### 7.3 Card "Agente Nex" simplificado

Remove o campo "API key" do form principal. Agora ele tem:

```
Provedor:  [select dos 4 providers]
Modelo:    [searchable-select do PROVIDER_CATALOG]
Chave:     [select de credenciais salvas para esse provider]
           └─ "+ Nova chave" como última opção → abre dialog de criação
Spread cartão: [number input — default 1.10]
```

Botões: "Testar conexão" e "Salvar configuração".

Comportamento ao trocar provider:
- Se há credenciais salvas pra esse provider: seleciona a `updated_at` mais
  recente. Modelo: o primeiro do PROVIDER_CATALOG do novo provider.
- Se não há: select de chave fica em "+ Nova chave" + mensagem "Sem chaves
  cadastradas — adicione uma para continuar". Botões "Testar"/"Salvar"
  desabilitados.

Comportamento ao trocar credential dentro do mesmo provider: limpa estado de
teste. Salvar dispara update do `llm_configs` com novo `credential_id`.

Comportamento ao trocar modelo: idem. Não exige re-input de chave.

Spread: campo numérico, validação `[1.00, 1.30]`. Salva via
`setCardSpreadAction` em `onBlur` (debounce). Tooltip: "Multiplicador aplicado
sobre a cotação comercial USD/BRL (default 1.10 ≈ IOF + spread Visa/Master)."

### 7.4 Dialog "Adicionar/editar chave"

`<Dialog>` (base-ui), max-w 500px:

- Provider (read-only se aberto via "+ Nova" de seção específica)
- Label (input — placeholder "Chave principal", auto-sugere "Chave N" se vazio)
- API key (PasswordInput, com olhinho centralizado — padrão v0.11.0)
- Botão "Testar conexão" (testa contra modelo padrão do provider)
- Botões "Cancelar" / "Salvar"

Validações UI:
- Label: ≤ 60 chars, único por provider (erro inline se duplicado).
- API key: ≥ 10 chars.

Modal "Editar" reaproveita o mesmo dialog com title "Editar chave":
- Label editável.
- API key opcional (vazio = mantém atual; preenchido = rotaciona).

### 7.5 Toggle bolha + status

Mantidos. O bloco "Configurado: <provider> · <model> · chave ••••XXXX" agora
mostra também a label: "… · «Conta principal» ••••XXXX".

### 7.6 Página `/configuracoes/consumo` — custos & precisão

#### KPI "Custo total"

Antes: 1 valor USD em fonte grande.
Depois: 2 valores empilhados verticalmente:
- **Linha 1 (grande, primária):** `R$ X,XXXX` em violet-foreground.
- **Linha 2 (pequena, muted):** `≈ $X.XXXX USD · cotação R$ Y,YY (cartão)`.

Rótulo do card vira "Custo total".

#### Charts

`Custo por dia` (area), `Custo por modelo` (bar), `Distribuição por provider`
(donut):
- Eixo Y / valor central / labels: BRL (`R$ X,XXXX`).
- Tooltip: 2 linhas (`R$ X,XXXX` + `$ X.XXXX USD`).
- Donut center label: "Custo total"; centerValue em BRL com USD em fonte
  menor.

#### Tabela "Chamadas detalhadas"

- Coluna "Custo USD" (valor com 4-6 decimais, tabular-nums).
- Coluna "Custo BRL" nova (valor com 4-6 decimais, tabular-nums; "—" para rows
  sem `cost_brl`).
- Mantém Tokens in/out, Duração.

Header da tabela: ordem visual ` Data | Provider | Modelo | Tokens in | Tokens
out | Duração | USD | BRL` (BRL ao final pra leitura natural ←→).

#### Empty state ajustado

`EmptyConsumoState`: troca "Nenhuma chamada ao Agente IA registrada ainda" →
"Nenhuma chamada ao Agente Nex registrada ainda".

#### Formatação BRL

Novo helper em `consumo-content.tsx`:
```ts
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

function formatCostBrl(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return brlFmt.format(v);
}
```

USD existente continua, mas `usdFmtCompact` é descontinuado — todas chamadas
passam a usar `usdFmt` (4–6 decimais sempre).

## 8. Compatibilidade & rollout

- **Deploy zero-downtime:** o pod novo aplica a migração `ensureLlmTables()` na
  primeira request e o pod antigo continua lendo `encrypted_api_key` direto. A
  função `getActiveLlmConfig()` no pod novo faz fallback se `credential_id` for
  `NULL`. Para `llm_usage`, rows antigas têm `cost_brl=NULL` e a UI mostra "—".
- **Rollback:** se voltar a v0.11.x, o backend antigo ignora `llm_credentials`,
  `credential_id`, `cost_brl`, `usd_to_brl_rate`. As colunas adicionadas são
  todas NULLABLE / opcionais.
- **v0.13.0 (futuro):** dropar `llm_configs.encrypted_api_key`.

## 9. Testes

### 9.1 Unidade

- `src/lib/llm/__tests__/credentials.test.ts` (NOVO):
  - cria/atualiza/deleta credencial com mock de `pgPool`.
  - valida `last4` (últimos 4 chars da chave decifrada).
  - bloqueia delete se credencial é ativa.
  - autogera label "Chave N" sequencial.
- `src/lib/llm/__tests__/get-active-config.test.ts` (NOVO):
  - JOIN funciona com `credential_id` populado.
  - Fallback funciona com `credential_id IS NULL`.
- `src/lib/llm/__tests__/exchange-rate.test.ts` (NOVO):
  - cache hit (não chama fetch).
  - cache miss → fetch real (mockado) → cache write.
  - fetch fail → fallback pra cache antigo.
  - fetch fail + sem cache → fallback hardcoded 5.50.
  - aplica spread `card_spread` lido de `app_settings`.
- `src/lib/llm/agent/__tests__/usage-logger.test.ts` (AJUSTE):
  - INSERT inclui `cost_brl` e `usd_to_brl_rate`.
  - rate fetch falha → INSERT com NULL não bloqueia.

### 9.2 Componente

- `src/components/settings/__tests__/llm-config-card.test.tsx` (AJUSTE):
  - sem campo de API key visível na config ativa.
  - select de credencial popula a partir das chaves do provider.
  - troca de modelo dispara save sem prompt de chave.
  - input de spread aceita 1.10, rejeita 1.5.
- `src/components/settings/__tests__/llm-credentials-card.test.tsx` (NOVO):
  - lista por provider, mostra ponto verde na ativa.
  - dialog de nova chave abre, valida, cria.
  - rotação preserva label.
  - delete bloqueado para ativa exibe toast claro.

### 9.3 Server Actions

- `src/lib/actions/__tests__/llm-credentials.test.ts` (NOVO):
  - guarda super_admin.
  - audit log emitido com action correta.
- `src/lib/actions/__tests__/exchange-rate.test.ts` (NOVO):
  - `setCardSpreadAction` valida range.
  - `getCurrentRateAction` retorna shape esperado.

### 9.4 Migração

- `src/lib/llm/__tests__/ensure-tables.test.ts` (NOVO):
  - cenário "fresh" cria tudo.
  - cenário "v0.11.x" migra row → cria credencial e popula `credential_id`.
  - idempotente: rodar 2× não duplica.
  - adiciona colunas em `llm_usage`.

## 10. Segurança & auditoria

- AES-256 mantido para `llm_credentials.encrypted_api_key`.
- `last4` é não-sensível (4 chars finais já visíveis no preview hoje).
- Toda mutação dispara `logAudit`:
  - target_type ∈ `llm_credential` | `llm_config` | `platform_settings`.
  - details = `{ provider, label }` ou `{ key, value }` (sem chave/segredo).
- AwesomeAPI não exige auth e expõe taxa pública (não há vazamento).

## 11. Documentação

- `CHANGELOG.md` — entrada v0.12.0.
- `docs/STATUS.md` — bumpar.
- `docs/runbooks/credenciais-llm.md` (NOVO) — passo-a-passo: criar, rotacionar,
  deletar credencial; trocar provider/modelo; ajustar spread cartão.

## 12. Riscos

| Risco | Mitigação |
|-------|-----------|
| Migração: `decrypt` falha numa row corrompida | Try/catch isolado por row: loga warning e segue; super_admin re-cadastra. |
| AwesomeAPI fora do ar / lenta | Cache 4h em `app_settings` + fallback hardcoded 5.50. |
| logUsage virar "fire-and-forget" mas exchange-rate adicionar latência crítica | Cache em Redis-like (`app_settings`); a busca real acontece no máximo 1×/4h. |
| Spread cartão "errado" no default 1.10 | Configurável pelo super_admin com explicação inline. |
| Pod antigo escreve em `llm_configs` durante o rollout | Fallback no pod novo trata `credential_id IS NULL`. |
| Outro agente Claude paralelo mexendo em `llm-config-card.tsx` | Protocolo `AGENTS.md` cobre — `docs/agents/active/` checado antes de escrever. |
| Build em paralelo na release | `gh run list --limit 5` antes de push. |

## 13. Critérios de aceite

1. **Renomeação completa:** grep `"Agente IA"` em `src/` retorna **zero**.
2. **Credenciais:** card "Chaves de API" em `/configuracoes` lista por provider,
   ações funcionam, ponto verde marca ativa, delete bloqueado para ativa.
3. **Trocar modelo:** sem pedir chave. Trocar provider: pré-seleciona credencial.
4. **2+ credenciais por provider:** super_admin escolhe.
5. **Custo total no Consumo:** linha 1 BRL (R$ X,XXXX), linha 2 USD pequena.
6. **Charts:** valores em BRL como primário, tooltips com ambos.
7. **Tabela detalhada:** colunas USD e BRL, ambas com 4 casas decimais mínimas.
8. **Cotação:** registrada no INSERT em `llm_usage.usd_to_brl_rate`. Cache 4h.
9. **Spread:** editável em `/configuracoes`, default 1.10, range [1.00, 1.30].
10. Build verde, typecheck verde, testes verdes.
11. `curl /api/health` retorna `version: v0.12.0`.

---

## Apêndice A — Decisões justificadas

**Por que tabela `llm_credentials` separada e não JSON em `llm_configs.metadata`?**
Listagem, unique-index e migração ficam triviais com tabela. JSON exigiria
parsing em todo lugar e perdemos validação relacional.

**Por que manter `encrypted_api_key` em `llm_configs` por mais uma release?**
Permite rollback sem perder a chave.

**Por que AwesomeAPI e não Banco Central?**
- Sem auth, gratuita, latência baixa (~50ms), formato JSON simples.
- BCB exige token em alguns endpoints e tem latência maior.

**Por que cache 4h e não 24h?**
- Cotação muda durante o dia (em especial em mercado volátil).
- 4h é compromisso entre frescor e número de chamadas externas.

**Por que spread cartão configurável e não fixo?**
- Cartões diferentes têm spreads diferentes (Nubank ~1.04, Bradesco ~1.12).
- Default 1.10 atende a maioria; usuário avançado ajusta.

**Por que não toggle USD/BRL global?**
- Usuário pediu BRL primário, USD secundário. Toggle adicional é overkill.

**Por que o card "Chaves de API" em `/configuracoes` e não tela própria?**
- Volume baixo (2-8 credenciais total). Tela própria seria overkill.

**Por que dropar `usdFmtCompact` e usar só `usdFmt` (4-6 decimais)?**
- Usuário pediu mínimo 4 casas. Manter dois formatadores invitava regressão.

---

## Apêndice B — Self-review (v1 → v3)

### Pente fino #1 (resultou em v2)

Issues encontradas e corrigidas inline:
- **v1** definia `label` como UNIQUE global (sem provider). Corrigido para
  `UNIQUE(provider, label)`.
- **v1** não previa `last4` armazenado, exigiria descriptografar pra listar.
  Adicionado `last4`.
- **v1** sugeria dropar `encrypted_api_key` na mesma release. Movido pra
  v0.13.0.
- **v1** não tinha fallback no `getActiveLlmConfig`. Adicionado para zero-
  downtime.
- **v1** cobria só credenciais. Expandido para incluir 1B (custo BRL +
  precisão decimal) — adicionados §1B, §4.3, §5, §6.3, §6.4 (exchange-rate
  action), §7.6 e critérios 5-9.

### Pente fino #2 (resultou em v3 final)

Análise mais profunda:
- **§4.3** não cobria `decrypt` falhar em row antiga. Adicionado tratamento
  isolado por row em §11.
- **§5.3** o contrato de `saveLlmConfig({apiKey})` ainda existe. Adicionada nota
  de quebra explícita; tests existentes vão precisar ajuste.
- **§6.2** não dizia onde fica a credencial **inativa de outro provider**.
  Esclarecido: toda credencial daquele provider é exibida; ponto verde só na
  do provider ativo.
- **§6.4** não validava `label` por provider. Validação app-level antes do
  INSERT.
- **§7** rollout não cobria escrita do pod antigo. Documentado: pod novo
  re-migra na próxima leitura.
- **§5.1 (exchange-rate)** não cobria caso de `app_settings` retornar valor
  inválido (usuário modifica manualmente o spread fora do range). Adicionada
  validação no `getUsdBrlRate` (clamp para [1.00, 1.30]).
- **§5.2** logUsage poderia chamar fetch externo no path de chat — decisão
  documentada: a chamada é feita 1×/4h via cache, então é assíncrona e barata.
- **§7.3** spread cartão estava como dialog separado. Movido para subseção do
  card "Agente Nex" para reduzir cliques.
- **§7.6** charts não detalhavam tooltip. Adicionado: 2 linhas (BRL + USD).
- **§8** `ALTER TABLE` em `llm_usage` sem `IF NOT EXISTS` quebra em rerun.
  Corrigido em §4.4 com `IF NOT EXISTS`.
- **§11** não listava risco de outro agente Claude paralelo. Adicionado.
- **§9.1** test de exchange-rate não cobria clamping. Adicionado.
- **Inconsistência de plural** "credenciais salvas" × "credencial salva" —
  uniformizado.

### v3 — final

Documento consolidado, sem placeholders, internamente consistente, escopo
fechado em v0.12.0. Pronto para fase de plan.
