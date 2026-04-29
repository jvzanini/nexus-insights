# Decisões consolidadas — Nexus Insights

**Data:** 2026-04-29

---

## 0. Regra suprema de construção

**Cópia integral do Roteador Webhook Meta como base.** Não é só tela de login — é o projeto inteiro: estrutura de pastas, componentes UI, design tokens, paleta, tipografia, ícones, animações, padrões de auth, server actions, tenant scoping, tema custom, toast, testes, Docker, CI/CD. **Tudo o que existe lá deve ser replicado aqui.** Adaptar apenas o necessário para o domínio deste projeto. **Tudo o que precisar criar novo deve seguir o mesmo padrão visual e arquitetural.** Nenhuma decoração ou padrão diferente do Roteador entra.

---

## 1. Identidade da plataforma

| Item | Valor |
|------|-------|
| Nome | **Nexus Insights** |
| Domínio | `insights.nexusai360.com` |
| Tagline na tela de login | "Relatórios e insights dos atendimentos" |
| Logo | Mesma logo "N" da Nexus AI usada no Roteador Webhook Meta |
| Tema | Dark (mesmo padrão do Roteador) |
| Footer | `Nexus AI © 2026. Todos os direitos reservados` (substitui `NexusAI360 © 2026. ...`) |

### Telas de auth a replicar (mesma estrutura do Roteador Webhook Meta)
- `/login` — copiar `src/components/login/{login-branding,login-content,login-form}.tsx`. Trocar texto do subtítulo de "Roteador de Webhooks" para "Relatórios e insights dos atendimentos". Manter:
  - Logo "N" gradient roxo
  - Título "Nexus AI"
  - Campos Email + Senha (com toggle de mostrar/ocultar)
  - Link "Esqueci minha senha"
  - Botão "Entrar" em gradient roxo
- `/forgot-password` — replicar
- `/reset-password` — replicar
- `/verify-email` — replicar

---

## 2. Modelo de RBAC (regras absolutas)

### 2.1 Hierarquia (4 níveis)
1. **Super Admin** (coroa)
2. **Admin** (escudo azul)
3. **Gerente** (escudo amarelo)
4. **Visualizador** (olho)

### 2.2 Owner — Super Admin Principal
- Criado via seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- Marcado com flag `isOwner = true` no banco.
- **Imutável e indeletável:** nenhum outro usuário (nem outro super admin) pode:
  - Excluir o owner
  - Alterar o nível dele (ele é super admin pra sempre)
  - Alterar email, senha, status (ativo/inativo) por outro usuário — só ele próprio.
- Pode criar usuários de **qualquer nível**.

### 2.3 Super Admin (criado depois pelo owner ou outro super admin)
- Vê todas as accounts e todos os departamentos.
- Pode criar usuários de qualquer nível.
- **Não pode** excluir/alterar o owner.
- Único nível que tem **seletor de account** (troca de Matrix ↔ Invest ↔ outras futuras).
- Único nível que pode ver o inbox **`00-Matrix IA`** e seus relatórios específicos.

### 2.4 Admin (escopo: lista de accounts)
- No momento da criação/edição, recebe um **multi-select de accounts** que poderá ver.
- Vê **todos os departamentos automaticamente** (não há seletor de departamento na criação dele).
- Pode criar Admin / Gerente / Visualizador.
- **Subset rule:** só pode liberar para os usuários que cria as accounts que ele próprio tem permissão. (Se admin tem 3 accounts, pode liberar 1, 2 ou as 3 — nunca uma quarta.)

### 2.5 Gerente (escopo: lista de accounts × lista de departamentos)
- No momento da criação/edição, recebe **dois multi-selects**:
  - Accounts que poderá ver
  - Departamentos (teams) que poderá ver
- Pode criar Gerente / Visualizador.
- **Subset rule duplo:** só pode liberar accounts E departamentos que ele próprio tem.

### 2.6 Visualizador (escopo: lista de accounts × lista de departamentos)
- Mesma estrutura de seleção do gerente (dois multi-selects).
- **Não pode criar nenhum usuário.**
- Apenas lê os relatórios.
- **Pode** clicar no botão "Abrir no Chatwoot" pra ser redirecionado pra conversa específica em nova aba.

### 2.7 Resumo das matrizes de permissão

**Pode criar usuário de nível…**
| Quem cria → | Super Admin | Admin | Gerente | Visualizador |
|-------------|:-----------:|:-----:|:-------:|:------------:|
| Owner | ✅ | ✅ | ✅ | ✅ |
| Super Admin | ✅ | ✅ | ✅ | ✅ |
| Admin | ❌ | ✅ | ✅ | ✅ |
| Gerente | ❌ | ❌ | ✅ | ✅ |
| Visualizador | ❌ | ❌ | ❌ | ❌ |

**Recebe seletor de…**
| Nível | Accounts | Departamentos |
|-------|:--------:|:-------------:|
| Super Admin | — (todas) | — (todos) |
| Admin | ✅ multi | — (todos) |
| Gerente | ✅ multi | ✅ multi |
| Visualizador | ✅ multi | ✅ multi |

**Pode editar/excluir o owner:** ❌ ninguém, jamais.

---

## 3. Comportamento da plataforma

- **Apenas leitura.** Nenhuma ação altera dados (nem locais nem do Chatwoot).
- **Único interativo:** botão "Abrir no Chatwoot" em cada linha de conversa.
  - URL: `https://chatwoot.znsolucoes.com.br/app/accounts/{account_id}/conversations/{display_id}`
  - Sempre `display_id` (não o `id` interno).
  - Abre em **nova aba** (`target="_blank"`).
  - Disponível para **todos os níveis**, inclusive visualizador.
- **Realtime: Opção A — polling com cache Redis** (decidido). Não pede permissão extra no Chatwoot, mantém o usuário read-only.
  - **Painéis ao vivo** (cards de backlog, conversas órfãs, contadores no topo): polling **30s**, cache TTL 30s.
  - **Relatórios históricos** (gráficos, rankings, tabelas): polling **5min**, cache TTL 5min, com botão "Atualizar agora" pra forçar refresh imediato.
  - **Cache compartilhado:** N usuários simultâneos = mesma 1 query no Chatwoot por TTL. Carga total estimada <200 queries/h.
  - **Migração futura para Opção B (CDC):** porta aberta, mas só se a operação crescer e exigir latência <1s.
  - **Configuração dinâmica via painel `/settings` (super admin):** os valores das cadências e o botão "Atualizar agora" são gerenciados em runtime, não hardcoded.
    - Campo: `polling.live_seconds` (default 30, validação 5–300)
    - Campo: `polling.historical_seconds` (default 300, validação 30–3600)
    - Campo: `polling.refresh_button_enabled` (boolean, default true)
    - Persistidos em tabela `app_settings` no nosso Postgres, lidos por hook `useAppSettings()` no client e por loader server-side. Mudança no painel propaga sem redeploy.
    - Centralizar essas chaves em `src/lib/constants/settings.ts` para facilitar localização no código.

---

## 4. Filtros padrão em todos os relatórios

- **Conta** (Matrix Fitness Group por padrão; super admin pode trocar).
- **Estado / inbox** (UF brasileira).
- **Departamento** (team: comercial, financeiro, assistência técnica, qualidade).
- **Atendente** (user dentro do escopo).
- **Período** (hoje, ontem, 7d, 30d, mês atual, mês anterior, custom).
- **Status da conversa** (open, pending, resolved, snoozed).

Filtros são aplicáveis combinados (ex.: "comercial do DF nos últimos 30 dias").

---

## 5. Tratamento especial do inbox `00-Matrix IA`

- Visível **apenas para Super Admin**.
- Excluído por padrão de todas as métricas globais (mesmo do super admin).
- Tem relatórios próprios:
  - Conversas atendidas pela IA
  - Conversas que o cliente mandou mensagem e a IA não respondeu (waiting_since sem outgoing seguinte)
  - Tempo médio de resposta da IA
  - Quantas chegaram a ser transferidas para humano
- Toggle "incluir Matrix IA nas métricas" disponível no super admin.

---

## 6. CSAT, SLA, Tags

- **CSAT:** telas montadas, populadas a partir de `csat_survey_responses`. Hoje vazio → mostrar empty state explicativo.
- **SLA:** idem, a partir de `applied_slas` / `sla_events`. Hoje vazio → empty state.
- **Tags (labels):** apenas informativo no relatório de conversas (coluna ou chips). Não vira KPI.

---

## 7. `status_venda`

- **Descartado.** Não é métrica do nosso escopo.

---

## 8. CPF/CNPJ

- Está em `contacts.additional_attributes->>'description'` em texto livre tipo `"CPF: 825.956.075-53"`.
- Extrair via regex no servidor (parsing leve) e exibir formatado no relatório de conversas.
