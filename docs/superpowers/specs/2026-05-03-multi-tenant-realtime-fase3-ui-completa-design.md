---
title: "Multi-tenant Realtime — Fase 3 (UI completa de gestão)"
status: "v3 (final — pronta para aprovação)"
authored_at: 2026-05-03
authored_by: claude-fase3-spec
target_version: v0.38.0
phase: "3 de 3 (UI completa, sidebar reorg)"
depends_on:
  - "Fase 1 — Fundação (v0.33+, em produção parcial)"
  - "Fase 2 — Webhook + realtime em todos os relatórios (v0.36/0.37)"
unblocks:
  - "Plataforma 100% multi-tenant operável por super_admin sem precisar de SSH/SQL"
---

# Spec — Multi-tenant Realtime — Fase 3 (UI completa de gestão)

> **v3 — pente fino #1 (24 achados) e #2 (22 achados) aplicados. Pronta para aprovação do João.**

## 1. Sumário executivo

A Fase 1 entregou a fundação invisível (modelos `nexus_chat_connection` + `company_chat_binding`, pool dinâmico, refator de queries, seed da connection legada) e uma rota administrativa **mínima** em `/configuracoes/conexoes`. A Fase 2 ligou o webhook do Nexus Chat (autenticado por HMAC) e refatorou todos os relatórios para escutarem eventos em tempo real.

**Esta Fase 3 transforma `/configuracoes/conexoes` em uma página rica em 4 abas — Conexões, Tempo real, Jobs, Saúde — para que o super_admin opere a plataforma multi-tenant pelo painel, sem `kubectl`, sem `psql`, sem SSH.** Inclui também: reorganização do sidebar (renomeia "Jobs de pré-agregação" para a nova entrada **"Bancos Nexus Chat"** sub-menu de Configurações), wizard de onboarding de nova empresa, polish em formulários e tabelas, acessibilidade ARIA-compliant em todas as Tabs/Dialogs/AlertDialogs, performance com lista virtualizada na aba "Tempo real", e SSE com reconnect automático. O escopo cobre apenas UI/UX e Server Actions de leitura — nenhuma migration nova, nenhum modelo de dados novo.

## 2. Motivação

- A Fase 1 deixou a operação multi-tenant **funcional mas escondida**: super_admin precisava acessar via URL direta, e várias ações operacionais (ver eventos webhook chegando, monitorar saúde de cada banco, disparar refresh de pré-agregação por connection específica) ficavam fragmentadas em rotas separadas (`/configuracoes/jobs`, comandos no banco interno, audit log via SQL).
- A Fase 2 amplifica o problema: agora há eventos webhook chegando em tempo real, mas sem UI o super_admin não consegue saber se HMAC está validando, se a latência subiu, se algum cliente parou de mandar eventos.
- Uma **plataforma multi-tenant sem painel de operação não escala** — cada cliente novo onboardado vira ticket de suporte ou intervenção manual no banco.
- João é o usuário-alvo: leigo em parte técnica, precisa de UI clara e ações operacionais óbvias, sem precisar lembrar payloads SQL ou comandos shell.
- O sidebar atual já carrega 11+ entradas; "Jobs de pré-agregação" no nível raiz é ruído visual e expõe um detalhe técnico interno. Reorganizar para um único item "Bancos Nexus Chat" sub Configurações reduz cognitivo.

## 3. Estado atual (linha de base — assumindo Fase 1 e Fase 2 LIVE)

- `/configuracoes/conexoes` (Fase 1): tabela básica de connections com colunas Nome / Host masked / Banco / Status / `last_test_at` / Ações (Edit / Test / Delete / Bindings via Sheet). Form em Dialog (base-ui). Server Actions super_admin-gated. Sem aba "Tempo real" e sem aba "Saúde".
- `/configuracoes/jobs` (Fase 1, herdado): rota separada com componente `JobsPanel` (`src/components/settings/jobs-panel.tsx`, 372 linhas). Mostra status dos 4 jobs (`by_account`, `by_inbox`, `by_agent`, `by_team`, `hourly_by_account`) agrupados por `accountId`. Polling 5s via `setInterval` chamando `getJobsStatus()`. Suporta `triggerRefresh({ dimension })` e `triggerBackfill({ dimension, days: 90 })`. Status: `fresh` / `stale` / `lagging` / `never` com cores Emerald / Amber / Rose / Muted. **Não conhece `connectionId` ainda** — assume connection ativa via `getActiveConnectionId(user)`.
- Webhook Nexus Chat (Fase 2): endpoint `/api/webhooks/nexus-chat/{token}` autentica HMAC (`webhook_secret_enc`), normaliza evento, persiste em tabela `webhook_events` (connection_id, event_type, account_id, payload_jsonb, received_at, processed_at, hmac_valid, latency_ms, error_message), publica `facts:refreshed` no Redis Pub/Sub. Frontend escuta via SSE `/api/events`.
- `src/lib/constants/nav.ts`: array `NAV_ITEMS` com 11 itens; "Jobs de pré-agregação" no nível raiz, super_admin only, ícone `Database`.
- `src/components/layout/sidebar.tsx`: render dos itens com seções `reports` / `admin`; `filterNav()` aplica `superAdminOnly` / `visibleTo` / `featureFlag` / `key`.
- `src/lib/audit.ts → logAudit()`: já registra ações `connection.*` e `binding.*` desde a Fase 1.
- Padrão visual canônico (Roteador Webhook Meta): PageHeader com ícone violeta `bg-violet-500/10 rounded-lg`, base-ui Dialog/Sheet/AlertDialog (prop `render`, NUNCA `asChild`), Sonner toasts customizados (pilha bottom-up), Lucide icons, Tailwind v4, ThemeProvider cookie SSR-aware.

## 4. Escopo desta Fase 3

### 4.1 Objetivos (entregáveis)

1. **Sidebar reorg:**
   - Remover entrada "Jobs de pré-agregação" do `NAV_ITEMS` em `src/lib/constants/nav.ts`.
   - Adicionar entrada **"Bancos Nexus Chat"** como item raiz, **superAdminOnly**, ícone Lucide `Database`, href `/configuracoes/conexoes`, posicionada entre "Configurações" e "Perfil".
   - Página `/configuracoes/jobs` mantém-se acessível por **redirect 308 permanente** para `/configuracoes/conexoes?tab=jobs` (preserva bookmarks e links externos).

2. **Página `/configuracoes/conexoes` evolui para 4 abas (base-ui Tabs):**
   - **Aba 1 — Conexões** (default): tabela polida de connections com colunas adicionais (Última edição, ações inline com tooltips), CTA primário "Onboardar empresa" (wizard), CTA secundário "Nova conexão" (form direto). Form de connection mostra última edição (autor + timestamp do audit log). Test connection com feedback visual Loader2 → CheckCircle/XCircle + tempo de resposta. Soft delete bloqueado abre AlertDialog listando bindings ativos com CTA "Ir para a aba Bindings da connection".
   - **Aba 2 — Tempo real**: dashboard de telemetria do webhook Nexus Chat. Topo: 4 KPI cards (eventos/min, latência média, erros HMAC 24h, último heartbeat por connection). Meio: line chart eventos/min últimas 24h (1 série por connection ou agregado). Embaixo: stream ao vivo de eventos webhook (lista virtualizada, atualiza via SSE; capacity hard 500 itens visíveis com janela rolante FIFO). Filtros: connection (multi), empresa/account (multi), tipo de evento (multi: `conversation_created`, `message_created`, etc.).
   - **Aba 3 — Jobs**: absorve a UI atual do `JobsPanel` adaptada para multi-tenant. Adiciona seletor de connection no topo (default = todas). Move componente para `src/components/settings/nexus-chat/jobs-tab.tsx`. Inclui ação nova "Housekeeping" (limpa eventos webhook >24h, default disparado por cron mas com botão manual aqui — confirma com AlertDialog).
   - **Aba 4 — Saúde**: visão consolidada por connection. Para cada connection ativa: card com lag (delta entre `last_refresh_at` e `now()`), taxa de erros 24h (% eventos webhook com `hmac_valid=false` ou `error_message != null`), mini-gráfico bar eventos webhook/hora últimas 24h. Embaixo: lista de últimos 50 audit logs filtrados por escopo `connection.*` ∪ `binding.*` ordenada por `created_at desc`.

3. **Wizard "Onboardar empresa" (acessível via CTA na aba Conexões):**
   - Step 1 — Escolher connection: lista de connections ativas em tiles selecionáveis + opção "Cadastrar nova conexão" que abre form inline (nome, host, porta, banco, usuário, senha, sslMode). Validação síncrona via `testNexusChatConnection` antes de avançar.
   - Step 2 — Identidade da empresa: form com `chatwoot_account_id` (input numérico, validação de unicidade global enforcement-aware), `display_name` (texto). Auto-sugere `display_name` consultando `chatwoot_accounts.name` no banco se a connection responder; user pode editar.
   - Step 3 — Webhook: gera URL `https://insights.exemplo.com/api/webhooks/nexus-chat/{token}` e exibe `webhook_secret` plain (visível **uma única vez** — só nesse momento; depois fica cifrado). Botões "Copiar URL" e "Copiar secret" com checkmark verde 1500ms. Instruções passo-a-passo: "1. Acesse o painel do Nexus Chat → Settings → Integrations → Webhooks. 2. Clique 'Add new webhook'. 3. Cole a URL acima. 4. Cole o Secret no campo HMAC. 5. Selecione todos os eventos. 6. Salve." Inclui screenshot ilustrativo (asset estático em `public/onboarding/`).
   - Step 4 — Próximos passos: confirma criação (toast Sonner verde "Empresa onboardada"), mostra resumo (connection + account_id + display_name), CTA "Liberar usuários" (link para `/usuarios?company={bindingId}`) e CTA "Ver eventos chegando" (link para `/configuracoes/conexoes?tab=tempo-real&connection={connectionId}`).
   - Stepper visual horizontal sticky no topo do Dialog/Sheet (1 — Conexão / 2 — Empresa / 3 — Webhook / 4 — Conclusão). Animação slide-in-from-right (200ms ease-out, motion-safe). Botões Voltar / Próximo no footer; Próximo desabilitado até validação do step. Wizard pode ser fechado a qualquer momento; estado **não persistente** (re-iniciar do zero), mas confirma com AlertDialog "Descartar progresso?" se houver dados preenchidos.

4. **Polish da UI atual (aba Conexões):**
   - Form de connection mostra "Última edição" abaixo do título do Dialog: `Editado por {nome} em {dd/mm/yyyy HH:mm}` (lê do audit log mais recente com `targetType=nexus_chat_connection AND targetId={id}`).
   - Test connection: ao clicar, ícone TestTube vira Loader2 (animate-spin); ao terminar, vira CheckCircle (emerald) ou XCircle (rose) por 2.5s, depois volta a TestTube. Toast Sonner mostra "Conectado em 142ms" (success) ou "Falhou em 10s: {erro}" (error). `last_test_at` e `last_test_error` atualizam na tabela em tempo real (router.refresh).
   - Soft delete: ao clicar Trash, se houver `companyChatBinding` com `enabled=true` e `deletedAt=null` apontando para a connection, abre AlertDialog "Não é possível apagar" listando os bindings (display_name + chatwoot_account_id) e CTA "Ir para Bindings" que abre o Sheet de bindings da connection. Se não houver bindings ativos, AlertDialog padrão de confirmação "Apagar conexão {nome}?" com botão destrutivo.
   - Ações inline: ícones Edit (Pencil) / Test (TestTube) / Delete (Trash2) / Bindings (Users) em colunas próprias (não dropdown), cada um com tooltip base-ui (atraso de 700ms padrão). Tap area ≥44px via `min-h-9 min-w-9 p-2` (icon-only buttons).
   - Mobile: tabela colapsa em cards verticais quando viewport `< lg` (1024px). Cada card mostra Nome (texto bold), Host masked + Banco em linhas separadas, Status badge, "Última edição" pequeno embaixo, ações em row de ícones grandes (touch-friendly).

5. **Acessibilidade:**
   - **Tabs ARIA-compliant**: usar base-ui `Tabs.Root` (`orientation="horizontal"`, `value` controlado via URL `?tab=`), `Tabs.List` com `role="tablist"`, `Tabs.Tab` com `role="tab"` e `aria-controls`/`aria-selected`, `Tabs.Panel` com `role="tabpanel"` e `tabindex={0}`. Setas esquerda/direita ciclam entre tabs (focus + activate). Home/End vão pro primeiro/último.
   - **Focus management**: ao trocar de aba, focus move para o `Tabs.Panel` ativo (`autoFocus` ou `useEffect` com ref). Anuncia via `aria-live="polite"` apenas quando aba muda **por interação direta** (não no mount inicial).
   - **Loading states**: Skeleton (componente já existe em `src/components/ui/skeleton.tsx`) durante fetch inicial de cada aba. Skeleton de tabela = 5 rows com cells vazias do mesmo height; KPI cards = 4 cards com `animate-pulse`. Sem layout shift quando dado chega (Skeleton ocupa altura final).
   - **Toasts Sonner**: cada Server Action retorna `{ ok: bool, message?: string }`; UI dispara `toast.success` ou `toast.error`. Toasts têm `role="status"` ou `role="alert"` automaticamente via Sonner; auto-dismiss 4s padrão; pilha bottom-up.
   - **Contrast & color-not-only**: badges de status sempre incluem ícone + texto + cor (CheckCircle "Ativo", PauseCircle "Pausado", AlertCircle "Erro"). Charts incluem labels textuais.
   - **Reduced motion**: `motion-safe:` em todas animações de slide/fade do wizard e da troca de painel. Quando `prefers-reduced-motion: reduce`, troca instantânea (zero animação).
   - **Keyboard escape**: ESC fecha Dialog/Sheet/AlertDialog (default base-ui). Wizard com dados preenchidos pede confirmação antes de fechar via ESC.
   - **AlertDialog**: foco inicial no botão "Cancelar" (não no destrutivo) — padrão WCAG para reduzir cliques acidentais.
   - **Dynamic Type / browser zoom**: layout não quebra em zoom 200%; textos não truncam por crop horizontal.

6. **Performance:**
   - **Aba Tempo real — lista virtualizada**: usar `@tanstack/react-virtual` (já dependência via `/relatorios/conversas`) com `useVirtualizer({ count, getScrollElement, estimateSize: () => 56, overscan: 8, measureElement })`. Capacity hard 500 itens (FIFO ring buffer); novos eventos via SSE inseridos no topo, antigos removidos do final. Render apenas 12-15 itens visíveis simultâneos.
   - **Métricas e gráficos**: Server Actions cacheadas com `unstable_cache` (Next.js 16) ou React `cache()` por 30s. Não usar TanStack Query (não é dependência atual; introduzir só se necessário em fase futura). Métricas refetch via `router.refresh()` quando SSE entrega `facts:refreshed` ou `webhook:received`.
   - **SSE reconnect**: `EventSource` nativo já reconecta automaticamente (default browser). Hook `useRealtimeEvents` (existente, ampliado nesta fase) trata `error` event, faz exponential backoff de 1s → 2s → 5s → 10s → 30s (max), expõe estado `connection: 'open' | 'connecting' | 'closed' | 'error'` para indicador visual no header da aba Tempo real (badge animate-pulse verde quando open).
   - **Code splitting**: cada aba é dynamic import (`next/dynamic`) com `loading: () => <Skeleton />`. Reduz bundle inicial; aba Tempo real (com chart libs) só carrega se acessada.
   - **Debounce em filtros**: filtros de aba Tempo real (connection, account, event_type) com `useDeferredValue` ou debounce 200ms para não rerender a cada keystroke.

### 4.2 Não-objetivos (explicitamente fora desta fase)

- ❌ Multi-language (i18n) — copy em pt-BR continua hardcoded; i18n é fase futura dedicada.
- ❌ Notificações push (browser/email) sobre erros HMAC ou connection down — alertas via UI in-app apenas.
- ❌ Histórico completo de eventos webhook >24h na UI — dados antigos são consultados via audit logs (já registrados desde Fase 2). Stream ao vivo é só janela rolante.
- ❌ Dashboard de telemetria além de connections (ex.: queries por minuto, hits no Redis) — Fase 4 ou nunca.
- ❌ Remover ou migrar tabelas legadas `chatwoot_*` → `nexus_chat_*` (TODO Q3 da spec Fase 1, fase própria de naming cleanup).
- ❌ Fluxo de aprovação multi-step para criar connection (ex.: super_admin solicita → outro super_admin aprova) — escala atual não justifica.
- ❌ Edição/desabilitação de connections por usuário não-super_admin — RBAC permanece igual à Fase 1.
- ❌ Export CSV/XLSX dos eventos webhook ou audit logs nesta fase (pedidos pelos usuários poderão entrar em fase futura).

## 5. Sidebar reorg

### 5.1 Mudanças em `src/lib/constants/nav.ts`

**Removido:**
```typescript
// linha ~138 (referência)
{
  label: "Jobs de pré-agregação",
  href: "/configuracoes/jobs",
  icon: Database,
  superAdminOnly: true,
},
```

**Adicionado** (no lugar daquela entrada, mantendo ordem):
```typescript
{
  label: "Bancos Nexus Chat",
  href: "/configuracoes/conexoes",
  icon: Database,
  superAdminOnly: true,
},
```

### 5.2 Posicionamento e copy

- Item raiz, NÃO sub-item de "Configurações" (manter "Configurações" linka pra `/configuracoes`, página geral de toggles/visibilidade).
- Naming "Bancos Nexus Chat" foi escolhido em vez de "Conexões" / "Instâncias" / "Bancos de dados" porque:
  - "Conexões" é ambíguo com a aba interna (uma das 4 abas chama-se Conexões — evita repetição confusa "Conexões → Conexões").
  - "Bancos Nexus Chat" comunica que é o painel de operação dos bancos de dados que o produto consome via Nexus Chat. Alinhado com nomenclatura do CLAUDE.md (sempre "Nexus Chat" na UI).
  - "Instâncias" tem conotação técnica (instância de máquina/VM) — confunde super_admin não-DBA.

### 5.3 Redirect de `/configuracoes/jobs`

Página `src/app/(protected)/configuracoes/jobs/page.tsx` é convertida para componente que retorna `redirect("/configuracoes/conexoes?tab=jobs")` (Next.js 16 server redirect, status 308 implícito). Mantém bookmarks e links externos vivos.

### 5.4 Manter o sidebar enxuto: contagem antes/depois

- Antes (Fase 2): 11 itens raiz visíveis para super_admin (Dashboard / Relatórios / Agente Nex / Integrações / Usuários / Configurações / **Jobs de pré-agregação** / Perfil + 7 sub-itens em Relatórios + 4 em Agente Nex).
- Depois (Fase 3): 11 itens raiz (substituição direta — não diminui número, mas substitui um detalhe técnico por um agregador semântico).

## 6. Layout da página `/configuracoes/conexoes`

### 6.1 PageHeader (sticky no topo)

Padrão do Roteador Webhook Meta:

```
┌──────────────────────────────────────────────────────────────┐
│  [Database violet 18px]  Bancos Nexus Chat                   │
│                          Gerencie instalações do Nexus Chat, │
│                          bindings de empresas, jobs de       │
│                          pré-agregação e saúde em tempo real.│
│                                              [SSE: ● 142 evt]│
└──────────────────────────────────────────────────────────────┘
```

- Container: `flex items-start gap-3 mb-6`.
- Ícone: `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10` com `<Database className="h-[18px] w-[18px] text-violet-500" />`.
- Título: `text-2xl font-semibold tracking-tight text-foreground`.
- Subtítulo: `mt-1 text-sm text-muted-foreground` (max-w 60ch).
- Indicador SSE no canto direito: `flex items-center gap-1.5 text-xs text-muted-foreground` com badge animate-pulse verde se aberto, âmbar se reconectando, rose se erro. Mostra contagem `{N} eventos/min` em tabular-nums atualizada por interval 5s.

### 6.2 Tabs

Usa **base-ui Tabs primitive** (`Tabs.Root`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`).

```
┌──────────────────────────────────────────────────────────────┐
│  [Conexões 3]  [Tempo real]  [Jobs]  [Saúde]                │
│ ─────────────                                                │
│                                                              │
│  Conteúdo da aba ativa                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- `Tabs.List` com `role="tablist"`, `aria-label="Bancos Nexus Chat"`.
- Cada `Tabs.Tab` é um botão `min-h-10 px-4` com:
  - State idle: `text-muted-foreground hover:text-foreground hover:bg-muted/40`.
  - State active: `text-foreground font-medium border-b-2 border-violet-500 -mb-px`.
  - State focus-visible: `ring-2 ring-violet-500 ring-offset-2 outline-none`.
- Badge de contagem ao lado do label (só na aba Conexões: `(N)` em `bg-muted/60 px-1.5 py-0.5 rounded text-xs tabular-nums`). Outras abas sem contagem (números são variáveis e dinâmicos demais).
- Keyboard navigation:
  - ←/→ ciclam entre tabs (focus + activate, conforme padrão WAI-ARIA "automatic activation").
  - Home / End vão pro primeiro / último.
  - Tab move foco para fora do tablist (para o panel ativo).
- `Tabs.Panel` com `role="tabpanel"`, `tabindex={0}` (focável). Animação de troca: `motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200`.
- URL state: `?tab=conexoes|tempo-real|jobs|saude` via `useSearchParams` + `router.replace` (preserva back/forward do browser, deep-link friendly). Default = `conexoes` se ausente ou inválido.

### 6.3 Container principal

`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6` para alinhar com layout do app.

## 7. Aba 1 — Conexões

### 7.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [+ Nova conexão]               [+ Onboardar empresa] (cta)  │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Nome      | Host          | Banco   | Status | Last test  | Última edição     | Ações                          │
├──────────────────────────────────────────────────────────────┤
│  Padrão... | db.host... mas| nexus   | ● Ativo| há 2 min   | João — 03/05 14:22| [✎] [🧪] [👥] [🗑]              │
│  HZ Cliente| db.example... | chat_h  | ● Ativo| há 5 min   | João — 02/05 09:11| [✎] [🧪] [👥] [🗑]              │
└──────────────────────────────────────────────────────────────┘
```

- Topo: row com 2 botões.
  - **"+ Nova conexão"** (secondary, variant `outline`): abre Dialog com form direto (sem wizard). Para super_admins que sabem o que estão fazendo.
  - **"+ Onboardar empresa"** (primary, variant `default` violet): abre Wizard 4 steps. CTA primário porque é o caso de uso principal pra escala (cadastrar cliente novo).
- Tabela `>=lg`: `<table>` semântico (não div-soup), `colgroup` com larguras fixas, `<thead>` sticky, divisões discretas `divide-y divide-border`.

### 7.2 Colunas

| Coluna | Conteúdo | Largura | Notas |
|---|---|---|---|
| Nome | `connection.name` | 200px | `font-medium`. Click leva pra editar (atalho). |
| Host | `connection.host` truncado em 24 chars com tooltip mostrando completo | 240px | Não exibe porta. Senha NUNCA aparece. |
| Banco | `connection.database` | 160px | Texto plano, mono opcional. |
| Status | Badge com ícone + texto | 120px | `active`=emerald CheckCircle / `paused`=amber PauseCircle / `error`=rose AlertCircle. |
| Last test | Relativo (`há 2 min`) com tooltip absoluto (`02/05/2026 14:22:31`) | 140px | `text-xs text-muted-foreground tabular-nums`. Se nunca testado: `—`. |
| Última edição | `{nome} — {dd/mm HH:mm}` | 200px | Lê do audit log; fallback `—` se nunca editado pós-Fase 1. |
| Ações | 4 ícones em row | 200px | Tooltips. Tap area ≥44px. |

### 7.3 Ações inline

Cada ícone é `<button>` icon-only com tooltip base-ui (`TooltipPrimitive` com `delayDuration={700}`):

| Ícone | Label / Tooltip | Ação |
|---|---|---|
| Pencil | "Editar conexão" | Abre Dialog de edição. |
| TestTube | "Testar conexão" | Server Action síncrona; ícone vira Loader2 → CheckCircle (verde 2.5s) ou XCircle (rose 2.5s). Toast com tempo de resposta. |
| Users | "Bindings (N)" | Abre Sheet listando bindings (mantém da Fase 1). Badge `(N)` com count. |
| Trash2 | "Apagar conexão" | Verifica bindings; se houver → AlertDialog informativo; senão → AlertDialog de confirmação destrutiva. |

Estilo padrão dos ícones: `h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 outline-none transition-colors`. Cores semânticas no hover do destrutivo: `Trash2:hover:text-destructive hover:bg-destructive/10`.

### 7.4 Form de connection (Dialog)

Padrão base-ui Dialog com `render={<DialogContent>}` (NUNCA `asChild`).

```
┌──────────────────────────────────────────────────────────────┐
│  Editar conexão                                              │
│  Editado por João Vitor em 03/05/2026 14:22                  │
├──────────────────────────────────────────────────────────────┤
│  Nome*           [_______________________]                   │
│  Host*           [_______________________]   Porta [5432]    │
│  Banco*          [_______________________]                   │
│  Usuário*        [_______________________]                   │
│  Senha           [•••••••••••••••••••••] [👁] (deixe vazio)  │
│                  Deixe vazio para manter senha atual.        │
│  SSL Mode        [prefer ▾]                                  │
│                                                              │
│                              [Cancelar] [🧪 Testar] [Salvar] │
└──────────────────────────────────────────────────────────────┘
```

- Header: título + linha pequena `text-xs text-muted-foreground` "Editado por {nome} em {data}". Lê do audit log: `audit_logs WHERE targetType='nexus_chat_connection' AND targetId={id} ORDER BY created_at DESC LIMIT 1`. Em `connection.create`, fallback "Criada por {nome} em {data}". Ausente em ambas as ações = `—`.
- Inputs: padrão Tailwind v4 + base-ui Field.
- Senha: `type="password"` com toggle eye (Eye / EyeOff). Helper text persistente embaixo "Deixe vazio para manter senha atual" no modo edit (oculto no modo create).
- "🧪 Testar" no footer: testa **a configuração do form** (não persiste). Server Action recebe payload do form, abre conexão temporária, query SELECT 1, retorna duração + erro. Useful pra validar antes de salvar.
- Submit: Server Action `createNexusChatConnection` ou `updateNexusChatConnection` (Fase 1). UI mostra Loader2 no botão, dispara toast em sucesso/erro, fecha Dialog em sucesso.
- Inline validation: required fields mostram erro embaixo só **on blur** (não on keystroke). Errors com `aria-live="polite"` e `text-destructive`.
- Focus management: ao abrir, foco no primeiro input vazio (ou no Nome). Ao fechar, foco volta para o trigger.

### 7.5 AlertDialog "Soft delete bloqueado"

Caso houver `companyChatBinding` ativos:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ Não é possível apagar esta conexão                        │
├──────────────────────────────────────────────────────────────┤
│  Existem 3 empresas ativas vinculadas:                       │
│                                                              │
│   • Matrix Fitness (account 1)                               │
│   • Cliente XYZ (account 4)                                  │
│   • Outro Cliente (account 7)                                │
│                                                              │
│  Desabilite ou apague essas empresas antes.                  │
│                                                              │
│                          [Fechar]  [Ir para Bindings]        │
└──────────────────────────────────────────────────────────────┘
```

- Ícone: `AlertTriangle` em `text-amber-500` (não destructive — é informativo, não destrutivo).
- "Ir para Bindings" abre o Sheet de bindings da connection (consistente com a coluna de ações).
- Foco inicial: botão "Fechar" (não-destrutivo).

Caso NÃO houver bindings ativos:

```
┌──────────────────────────────────────────────────────────────┐
│  Apagar conexão "Padrão (legado)"?                           │
├──────────────────────────────────────────────────────────────┤
│  Esta ação faz soft delete (recuperável por 30 dias via      │
│  super_admin no banco). Os jobs de pré-agregação param de    │
│  rodar para esta connection imediatamente.                   │
│                                                              │
│                              [Cancelar]  [Apagar conexão]    │
└──────────────────────────────────────────────────────────────┘
```

- Botão destrutivo: `bg-destructive text-destructive-foreground`.
- Foco inicial: "Cancelar".

### 7.6 Mobile (`< lg`)

Tabela colapsa em cards verticais:

```
┌──────────────────────────────────────────┐
│  Padrão (legado)        ● Ativo          │
│  db.example.com:5432                     │
│  nexus_chat                              │
│  Last test: há 2 min                     │
│  Editado por João — 03/05 14:22          │
│                                          │
│  [✎ Editar] [🧪 Testar] [👥 3] [🗑]       │
└──────────────────────────────────────────┘
```

- Cada card: `rounded-2xl border border-border bg-muted/30 p-4 space-y-2`.
- Status badge no canto superior direito.
- Ações em row de botões com label + ícone (touch-friendly, `min-h-11`).
- Lista vertical com `space-y-3`.

## 8. Aba 2 — Tempo real

### 8.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  KPI: Eventos/min  | KPI: Latência | KPI: HMAC errs| Heartb. │
│  142  ▲ +12%       | 87 ms ▼ -5%   | 0 ✓           | ● ok    │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Eventos/minuto · últimas 24h                                │
│  [line chart sparkline-style 1 série por connection]         │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  [Filtros: connection ▾] [empresa ▾] [tipo ▾]    [pause ⏸]  │
├──────────────────────────────────────────────────────────────┤
│  Stream ao vivo (virtualizado, 500 itens)                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [conv_created] Padrão · acc 1 · há 2s · 78ms ✓         │  │
│  │ [msg_created]  HZ Client · acc 4 · há 5s · 92ms ✓      │  │
│  │ ... (rolando, FIFO, max 500 visíveis)                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 KPI Cards (4 cards em grid)

`grid grid-cols-2 lg:grid-cols-4 gap-4`. Cada card:

```
┌──────────────────────────┐
│ [pulse violet] Eventos   │
│ /minuto                  │
│ 142  ▲ +12% vs 24h média │
│                          │
│ Últimas 5 min            │
└──────────────────────────┘
```

- Container: `rounded-2xl border border-border bg-muted/30 p-4`.
- Label: `text-xs uppercase tracking-wider text-muted-foreground` com ícone Lucide pequeno.
- Valor: `text-2xl font-semibold tabular-nums text-foreground`.
- Trend: `text-xs` com seta TrendingUp/TrendingDown (`text-emerald-500` se up = bom; varia por métrica — para latência, up = ruim → `text-rose-500`).
- Subtítulo: `text-xs text-muted-foreground` ("Últimas 5 min" / "Última hora" — explicita janela).

KPIs:

| KPI | Source query | Trend reference | Cor up |
|---|---|---|---|
| Eventos/min | `webhook_events COUNT WHERE received_at > now() - 5min` ÷ 5 | vs média 24h | emerald (mais é melhor) |
| Latência média | `webhook_events AVG(latency_ms) WHERE received_at > now() - 5min` | vs média 24h | rose (mais é pior) |
| Erros HMAC 24h | `webhook_events COUNT WHERE hmac_valid=false AND received_at > now() - 24h` | vs 24h anterior | rose (mais é pior) |
| Heartbeat | Status do SSE local + per-connection `MAX(received_at)`; se >5min sem evento → amber, >15min → rose. | last seen | emerald se ok |

### 8.3 Line chart eventos/min últimas 24h

- Componente baseado no `recharts` (já dependência via dashboard). 1 série por connection ativa, max 5 series visíveis (legenda); se >5 connections, mostra agregado total como série única.
- Eixo X: timestamp em `HH:mm` (intervalo de 30 min, 48 buckets em 24h).
- Eixo Y: `tabular-nums`, escala linear até `max(buckets) * 1.2`.
- Tooltip on hover/focus com valores exatos por connection.
- Legenda interativa (clique toggle visibilidade da série).
- Cores semânticas: cada connection ganha uma cor estável (hash determinístico do `connection.id` → palette pré-definida de 5 cores acessíveis, viradas pra colorblind-safe).
- Empty state: "Sem dados nas últimas 24 h" com ícone `LineChart` cinza, sem axis frame vazio.

### 8.4 Stream virtualizado de eventos

- Container: `rounded-2xl border border-border bg-background overflow-hidden`. Altura fixa `h-[480px]` (overflow scroll vertical).
- Cabeçalho do stream: `sticky top-0` com filtros (multi-select base-ui) e botão Pause/Play (`Pause` / `Play` Lucide). Pause congela o ring buffer (não recebe novos via SSE).
- Lista virtualizada: `@tanstack/react-virtual` com `count`, `getScrollElement` (ref do container), `estimateSize: () => 56`, `overscan: 8`, `measureElement` (eventos podem ter altura variável se `error_message` longo).
- Cada item:
  ```
  [badge tipo evento] {connection.name} · acc {accountId} · {relativeTime} · {latencyMs}ms {iconStatus}
  ```
- Badge tipo evento: cores por categoria (conversation = violet-500/15 / message = blue-500/15 / contact = teal-500/15 / agent = amber-500/15). Texto em `text-[11px] font-medium uppercase tracking-wide`.
- Se `hmac_valid=false`: ícone XCircle rose ao invés de CheckCircle emerald. Linha tem `bg-rose-500/5` discreto. `error_message` em `text-xs text-rose-500 mt-1` com `line-clamp-2`.
- Click no item abre Sheet com payload JSON formatado (read-only, monospace, `JSON.stringify(payload, null, 2)`).
- Hover: `bg-muted/40` linha inteira, `cursor-pointer`.
- Aria-live: "polite" no container; `aria-label="Stream de eventos webhook ao vivo, {N} novos"` atualiza via interval 5s. Não anuncia cada evento individual (spam de screen reader).
- Empty state: "Aguardando eventos…" com ícone `Activity` animate-pulse; persiste até primeiro evento chegar.

### 8.5 Filtros

3 multi-selects em row:

| Filtro | Opções | Default |
|---|---|---|
| Connection | Lista de connections ativas | Todas |
| Empresa | Lista de bindings ativos (filtrada pela connection escolhida) | Todas |
| Tipo evento | `conversation_created`, `conversation_updated`, `message_created`, `contact_created`, `agent_assigned`, `team_changed`, etc. | Todos |

- Componente: base-ui Select com `multiple` ou DropdownMenu com Checkbox items.
- Estado mantido em URL (`?connection=A,B&account=1,4&type=msg_created`) para deep-link.
- Filtros aplicam **client-side** sobre o ring buffer (events já recebidos), não fazem re-fetch — instantâneo.

## 9. Aba 3 — Jobs

### 9.1 Estrutura

Mesmo `JobsPanel` da Fase 1, com 2 mudanças:

1. **Seletor de connection no topo**: `Select` base-ui com opção "Todas" (default) ou connection específica. Quando "Todas", mostra rows agrupadas por connection ; quando específica, só essa.
2. **Botão "Housekeeping"** ao lado do seletor: limpa registros de `webhook_events` >24h. Confirma com AlertDialog ("Você está prestes a limpar 14.231 eventos de >24h. Continuar?"). Server Action `runWebhookEventsHousekeeping()`. Toast com count limpo. Esse botão é redundante com o cron de housekeeping (que roda a cada 1h por padrão) — útil pra forçar limpeza manual quando volume cresce.

### 9.2 Adaptação visual

Move `src/components/settings/jobs-panel.tsx` para `src/components/settings/nexus-chat/jobs-tab.tsx` mantendo lógica, adicionando seletor + botão, e ajustando query `getJobsStatus()` para receber `connectionId` opcional. Server Action existente (`src/lib/actions/jobs.ts`) ganha overload com `connectionId`.

### 9.3 Status colors (mantém Fase 1)

- `fresh` (lag <10min): emerald-500 `CheckCircle2`.
- `stale` (10-30min): amber-500 `Clock`.
- `lagging` (>30min): rose-500 `AlertCircle`.
- `never`: muted `CircleSlash`.

Sem mudança na semântica — só a UI agrupa por connection antes de account.

## 10. Aba 4 — Saúde

### 10.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Resumo por connection                                       │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐ ┌────────────────────┐               │
│  │ Padrão (legado)    │ │ HZ Cliente X       │               │
│  │ ● Ativo            │ │ ● Ativo            │               │
│  │ Lag: 2 min         │ │ Lag: 4 min         │               │
│  │ Erros 24h: 0,1%    │ │ Erros 24h: 0%      │               │
│  │ [bar chart 24h]    │ │ [bar chart 24h]    │               │
│  └────────────────────┘ └────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Audit logs recentes (50 últimos · connection.* + binding.*) │
│  03/05 14:22 · João · binding.create · acc 4 (HZ Cliente)    │
│  03/05 14:18 · João · connection.test · Padrão · 142ms ✓     │
│  03/05 13:55 · sistema · connection.update · seed legacy     │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

### 10.2 Cards por connection

`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`. Cada card:

- Header: nome da connection + badge de status + ícone Database violet pequeno.
- Body:
  - **Lag**: `last_refresh_at` (`MAX(chatwoot_facts_meta.last_refresh_at)` filtrado por `connectionId`) — agora. `text-2xl tabular-nums` em emerald/amber/rose conforme thresholds.
  - **Taxa de erros 24h**: `(COUNT(*) FILTER WHERE hmac_valid=false OR error_message IS NOT NULL) / NULLIF(COUNT(*), 0) * 100` em `webhook_events` últimas 24h. Format `0.1%` ou `—` se sem eventos. Cor: emerald se 0%, amber 0.1%-1%, rose >1%.
  - **Bar chart eventos webhook/hora**: 24 barras, altura proporcional à contagem. Recharts BarChart minimalista, sem axis labels (só tooltip on hover). Cor da barra: `var(--color-violet-500)` para barras ok, `var(--color-rose-500)` se a barra tem >0 eventos com erro.

### 10.3 Lista de audit logs

- Container: `rounded-2xl border border-border bg-muted/30 p-4`.
- Lista de 50 últimos `audit_logs` filtrados por `action LIKE 'connection.%' OR action LIKE 'binding.%'` ordenado `created_at DESC`.
- Cada linha:
  ```
  [pequeno timestamp] · [actor name] · [action badge] · [target description] · [ícone status]
  ```
- Action badge: cor por categoria (`*.create` = emerald, `*.update` = blue, `*.delete` = rose, `*.test` = violet).
- Click expande detalhes (JSON formatado em `<pre>` monospace).
- Empty state: "Sem ações registradas no escopo conexão / empresa".
- CTA "Ver todos no log de auditoria" linka pra `/configuracoes/audit?scope=connections` (rota futura — Q1 §22).

## 11. Wizard "Onboardar empresa"

### 11.1 Estrutura

Componente abre via `Sheet` (drawer lateral direito, `w-full lg:w-[640px]`) — não Dialog modal, porque o wizard é uma tarefa multi-step que beneficia de mais espaço vertical e do user poder ver o contexto da página de fundo.

```
┌──────────────────────────────────────────────────────────────┐
│  Onboardar nova empresa                              [X]     │
│                                                              │
│  ●━━━━━━○━━━━━━○━━━━━━○                                       │
│  1 Conexão  2 Empresa  3 Webhook  4 Conclusão                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Conteúdo do step ativo, animação slide-in]                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [< Voltar]                              [Próximo >]         │
└──────────────────────────────────────────────────────────────┘
```

### 11.2 Stepper visual

- 4 círculos numerados conectados por linhas (`flex items-center gap-2`).
- Step ativo: círculo violet preenchido (`bg-violet-500 text-white`); steps anteriores: emerald preenchido com CheckIcon; futuros: cinza outline (`border-2 border-border bg-background text-muted-foreground`).
- Conector entre steps: linha 2px (`h-0.5 bg-border` / ativos: `bg-violet-500`).
- Label embaixo do círculo: `text-xs font-medium`. Em mobile (`<sm`), mostrar só número (sem label) para caber.
- Sticky no topo do Sheet content.

### 11.3 Step 1 — Escolher connection

```
┌──────────────────────────────────────────────────────────────┐
│  Para qual instalação Nexus Chat?                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⊙ Padrão (legado)                                    │   │
│  │   db.example.com / nexus_chat                        │   │
│  │   3 empresas vinculadas · Ativo                      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ○ HZ Cliente                                          │   │
│  │   db-hz.host.com / chatwoot_hz                       │   │
│  │   1 empresa vinculada · Ativo                        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ○ + Cadastrar nova conexão                           │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- Tiles selecionáveis (radio group base-ui).
- Tile ativo: `border-2 border-violet-500 bg-violet-500/5`.
- Hover idle: `bg-muted/40`.
- Tile "+ Cadastrar nova conexão" expande inline form (mesmo form do Dialog "Nova conexão" da §7.4) abaixo. Validação: clica "🧪 Testar" antes de avançar.
- Botão "Próximo" desabilitado até connection escolhida ou nova connection criada+testada com sucesso.

### 11.4 Step 2 — Identidade da empresa

```
┌──────────────────────────────────────────────────────────────┐
│  Identifique a empresa                                       │
│                                                              │
│  Account ID*                                                 │
│  [____]  (numérico, obrigatório)                             │
│  ⓘ Esse é o ID interno da account no Nexus Chat.             │
│                                                              │
│  Nome amigável*                                              │
│  [_____________________________]                             │
│  ⓘ Aparece pra usuários da empresa.                          │
│                                                              │
│  ✓ Sugestão automática: "Matrix Fitness Group"               │
│    (encontrada na conta Nexus Chat)                          │
└──────────────────────────────────────────────────────────────┘
```

- Account ID: `<input type="number" inputmode="numeric">` com validação síncrona `chatwoot_account_id` único globalmente (constraint operacional da Fase 1). Erro embaixo se duplicado.
- Auto-suggest display_name: ao blur do account ID, Server Action consulta `chatwoot_accounts.name` no pool da connection escolhida (com timeout 5s). Sucesso → preenche placeholder; user pode editar. Falha → mantém vazio, user digita manual. Sem skeleton (operação rápida); apenas Loader2 inline ao lado do campo.
- Próximo: desabilitado até ambos preenchidos.

### 11.5 Step 3 — Webhook

```
┌──────────────────────────────────────────────────────────────┐
│  Cole isso no painel do Nexus Chat                           │
│                                                              │
│  URL do webhook                                              │
│  [https://insights.../api/webhooks/nexus-chat/abc123def] [📋]│
│                                                              │
│  Secret HMAC                                                 │
│  [Sx9zKpQ2...visível 1 vez]                              [📋]│
│  ⚠ Esse secret só aparece agora. Salve antes de fechar.      │
│                                                              │
│  ─────────────────────────                                   │
│                                                              │
│  Como configurar:                                            │
│  1. No painel do Nexus Chat, vá em                          │
│     Settings → Integrations → Webhooks                       │
│  2. Clique em "Add new webhook"                              │
│  3. Cole a URL acima                                         │
│  4. Cole o Secret no campo HMAC                              │
│  5. Selecione todos os eventos                               │
│  6. Salve                                                    │
│                                                              │
│  [Imagem ilustrativa do painel Nexus Chat]                   │
└──────────────────────────────────────────────────────────────┘
```

- URL e Secret em `<input readonly>` com `type="text"` (URL) e `type="password"` (secret) com toggle eye.
- Botão Copy: ícone `Copy`, ao clicar muda pra `CheckCircle` emerald por 1500ms + toast Sonner "URL copiada" / "Secret copiado".
- Banner amarelo `AlertTriangle text-amber-500` enfatiza "secret só aparece agora". Texto também aparece como helper sob o campo Secret.
- Imagem screenshot ilustrativa em `public/onboarding/nexus-chat-webhook.png` (estática, asset de produto).
- Avançar: livre (não obriga marcar checkbox de confirmação) — confiança no super_admin.

### 11.6 Step 4 — Conclusão

```
┌──────────────────────────────────────────────────────────────┐
│           ✓ Empresa onboardada com sucesso                   │
│                                                              │
│  Resumo:                                                     │
│   • Conexão: Padrão (legado)                                 │
│   • Account ID: 7                                            │
│   • Nome: Matrix Fitness Group                               │
│   • Webhook: configurado                                     │
│                                                              │
│  Próximos passos:                                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ → Liberar usuários para esta empresa                 │   │
│  │   /usuarios?company={bindingId}                       │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ → Ver eventos chegando em tempo real                 │   │
│  │   /configuracoes/conexoes?tab=tempo-real&...         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                                            [Concluir]        │
└──────────────────────────────────────────────────────────────┘
```

- Ícone CheckCircle grande emerald-500 (h-12 w-12) centralizado.
- Resumo em lista compacta.
- 2 cards de próximos passos como links navegáveis (cursor-pointer, hover `bg-muted/40`).
- "Concluir" fecha o Sheet e dá `router.refresh()` na aba Conexões pra mostrar a connection/binding novos.

### 11.7 Persistência interna do wizard

- Estado do wizard local (`useReducer` ou `useState` com objeto `WizardState`). NÃO persistido em localStorage/sessionStorage — fechar wizard começa do zero.
- Server Actions são chamadas só em momentos críticos:
  - Step 1: `createNexusChatConnection` (se "nova conexão"), depois `testNexusChatConnection`.
  - Step 2: `validateAccountIdUnique({ chatwootAccountId })` síncrona; `getChatwootAccountName({ connectionId, accountId })` opcional.
  - Step 3: cria binding (`createCompanyChatBinding`) + gera `webhook_token` e `webhook_secret_enc` na `nexus_chat_connection` (se ainda não existir; já há na Fase 2). **Secret plaintext só existe in-memory durante a request da Server Action**; nunca persistido em plaintext, nunca logado, nunca exposto fora desta resposta.
  - Step 4: nada (só feedback).
- Se o user fecha o Sheet entre steps com dados preenchidos, AlertDialog "Descartar progresso?" pede confirmação. Se user confirma descartar **após** uma Server Action de step 3 ter rodado (binding criado), avisa: "A empresa foi criada, mas o webhook precisa ser configurado no Nexus Chat. Você pode acessar [link aba Conexões] para gerar novamente o secret se necessário." (Não-ideal mas honesto: secret regenerável só por super_admin via "Regenerar secret" na linha da connection — Server Action separada `rotateWebhookSecret`.)

### 11.8 Validação por step (resumo)

| Step | Validação | Server Action |
|---|---|---|
| 1 | Connection escolhida (existing) OU nova connection criada+testada | `testNexusChatConnection` (se nova) |
| 2 | `chatwootAccountId` numérico positivo + único (constraint Fase 1); `displayName` não-vazio | `validateAccountIdUnique`, `getChatwootAccountName` (opcional) |
| 3 | Nada (info display) | `createCompanyChatBinding` + `ensureWebhookSecret` (rota nova; idempotente) |
| 4 | Nada | — |

## 12. Estados e transições

### 12.1 Loading states (Skeleton)

- Aba Conexões: 5 rows de skeleton table (`h-12` cada, com cells vazias `bg-muted/40 animate-pulse rounded`).
- Aba Tempo real: 4 KPI cards skeleton + chart skeleton (`h-48 bg-muted/40 animate-pulse rounded-2xl`) + stream skeleton (10 linhas).
- Aba Jobs: re-uso do empty state existente do `JobsPanel` enquanto fetch.
- Aba Saúde: 3 cards skeleton + lista de 10 audit logs skeleton.

### 12.2 Empty states

- Conexões vazias: "Nenhuma conexão cadastrada ainda. Comece com [+ Onboardar empresa]" (CTA grande no centro da tabela).
- Tempo real sem eventos 24h: "Aguardando primeiro evento webhook…" + ícone `Activity` animate-pulse violet.
- Jobs nenhum status: re-uso do empty state existente (`Os jobs rodam em cron de 5 min…`).
- Saúde sem connections: "Nenhuma conexão ativa".
- Audit logs vazios: "Sem ações registradas".

### 12.3 Error states

- Erro fetch geral: card vermelho centralizado `bg-destructive/10 text-destructive p-4 rounded-2xl` com ícone AlertTriangle + mensagem + botão "Tentar de novo" (chama `router.refresh()`).
- Erro Server Action específica: toast Sonner vermelho.
- SSE error: badge no header da página passa de verde → âmbar (reconectando) → vermelho (erro persistente). Tooltip explica.

### 12.4 Pause/resume do stream

Botão Pause/Play no header do stream (aba Tempo real) congela o ring buffer:
- Pause: SSE continua recebendo, mas eventos vão pra buffer secundário "pendentes". Mostra badge "{N} novos eventos" no header.
- Play: aplica buffer pendente em sequência (animação fade-in stagger 50ms cada item, motion-safe).

## 13. Server Actions e endpoints (lista)

Toda em `src/lib/actions/nexus-chat/`. Async functions (regra runtime AGENTS.md). Super_admin-gated em todas.

| Server Action | Input | Output | Side effects |
|---|---|---|---|
| `getConnectionsTabData()` | — | `{ connections: ConnectionRow[] }` | — |
| `getRealtimeTabData({ since })` | `since: string` ISO | `{ kpis, chartSeries, lastEvents[] }` | — |
| `getHealthTabData()` | — | `{ perConnection: HealthCard[], auditLogs: AuditLogRow[] }` | — |
| `getLastEditMeta({ targetType, targetId })` | targetType, targetId | `{ actorName?, at? }` | — |
| `getJobsTabData({ connectionId? })` | connectionId opcional | `{ rows: JobsStatusRow[] }` | — |
| `runWebhookEventsHousekeeping()` | — | `{ deletedCount }` | DELETE `webhook_events` >24h |
| `rotateWebhookSecret({ connectionId })` | connectionId | `{ secretPlain, secretMaskedAfter }` | UPDATE `webhook_secret_enc`. Plain só na resposta. |
| `validateAccountIdUnique({ chatwootAccountId })` | accountId | `{ ok: bool, conflictWith?: { connectionId, displayName } }` | — |
| `getChatwootAccountName({ connectionId, accountId })` | conn, acc | `{ name?: string }` | — |
| `createCompanyChatBinding({ connectionId, chatwootAccountId, displayName })` | bind | `{ binding }` + audit log | INSERT |

**Reúso (existem desde Fase 1):** `createNexusChatConnection`, `updateNexusChatConnection`, `testNexusChatConnection`, `softDeleteNexusChatConnection`, `getJobsStatus`, `triggerRefresh`, `triggerBackfill`.

**SSE endpoint** (existe Fase 2): `/api/events` ganha filtros opcionais via query: `?event_types=webhook:received,facts:refreshed&connection={id}`. Backend filtra antes de pushar — reduz payload SSE.

## 14. Acessibilidade — checklist exaustivo

| Item | Cumprimento |
|---|---|
| Tabs com `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls` | base-ui Tabs já cobre |
| Setas L/R ciclam tabs; Home/End vão pro primeiro/último | base-ui Tabs cobre |
| Focus visível 2-4px ring violet | `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2` |
| Foco move pro Tabs.Panel ao trocar aba (com aria-live polite anunciando título da aba) | `useEffect` com ref no panel + `<span className="sr-only">` |
| Skeleton durante fetch (sem layout shift) | Skeleton component height ≈ final |
| Toasts não roubam foco; `aria-live="polite"` automático Sonner | Sonner default |
| Touch target ≥44px nas ações inline | `min-h-9 min-w-9 p-2` (h-9=36px ≈ 44px com padding hit-area? — usar `min-h-11 min-w-11` em mobile via `lg:min-h-9 lg:min-w-9` e `min-h-11 min-w-11`) |
| Color-not-only: badges com ícone + texto | sempre |
| Labels visíveis nos inputs (não placeholder-only) | sempre |
| Errors embaixo do field, `aria-live="polite"` | Field component base-ui |
| ESC fecha Dialog/Sheet/AlertDialog | base-ui default |
| AlertDialog destrutivo: foco inicial no Cancelar | `initialFocus={cancelRef}` |
| Contrast 4.5:1 para texto, 3:1 para large text + UI elements | validar com tooling no review |
| Reduced motion: `motion-safe:` em animações de slide/fade | applied |
| Browser zoom 200% sem quebra horizontal | layout fluido `max-w-` + breakpoints |
| Heading hierarchy: PageHeader = h1, abas = h2, subseções = h3 | renderização semântica |
| Sortable table aria-sort | aba Conexões, opcional na Fase 3 |
| Aria-label em ícone-only buttons | tooltips traduzem |
| Skip link "Pular pra conteúdo principal" no app | já existe globalmente |

## 15. Segurança

- **RBAC**: rota `/configuracoes/conexoes` continua super_admin only (Fase 1). Server Actions novas validam `requireSuperAdmin(user)` antes de qualquer operação.
- **Secret display**: `webhook_secret` plaintext aparece **uma única vez no Step 3 do wizard** ou via `rotateWebhookSecret` (que gera novo e descarta o antigo). Em fluxo de edit/list, **nunca** retornado ao client.
- **Audit log**: toda ação dispara `logAudit` com escopos `connection.*` ou `binding.*` (já existe Fase 1). Aba Saúde lê esses audit logs para mostrar histórico.
- **Rate limit**: `testNexusChatConnection` mantém 10/min/super_admin (Fase 1). `rotateWebhookSecret` ganha rate limit 5/h/connection para evitar abuso acidental.
- **CSRF**: Server Actions Next.js já validam origin por padrão.
- **XSS / payload JSON do stream**: ao mostrar JSON formatado em `<pre>`, escapar via `React` (sem dangerouslySetInnerHTML). Nunca renderizar payload raw como HTML.
- **HTTPS-only**: webhook URL gerada usa `https://` se `NEXTAUTH_URL` é HTTPS; senão warning no Step 3 ("URL gerada em http; só funciona em produção HTTPS").

## 16. Testes

### 16.1 Unitários (Jest + jest-mock-extended)

- `src/lib/actions/nexus-chat/__tests__/getConnectionsTabData.test.ts`: super_admin OK, outros bloqueados.
- `getRealtimeTabData.test.ts`: KPIs calculados corretamente; series do chart agrupadas por bucket de 30 min.
- `getHealthTabData.test.ts`: lag calculado corretamente; taxa de erros 24h respeitando NULLIF(0); bar chart 24h zerado quando sem eventos.
- `getLastEditMeta.test.ts`: retorna meta do audit log mais recente; fallback `—` se vazio.
- `runWebhookEventsHousekeeping.test.ts`: deleta apenas >24h; conta correta.
- `rotateWebhookSecret.test.ts`: gera novo, persiste cifrado, retorna plaintext único.
- `validateAccountIdUnique.test.ts`: bloqueia duplicado entre connections enabled.
- `getChatwootAccountName.test.ts`: timeout 5s; fallback null se erro.

### 16.2 Component (React Testing Library)

- `tabs.test.tsx`: keyboard nav setas, Home/End; URL state sync; focus management.
- `connections-table.test.tsx`: render rows; ações inline disparam Server Actions corretas; tooltips.
- `wizard.test.tsx`: navegação entre steps; validação por step bloqueia Próximo; Voltar preserva state local.
- `realtime-stream.test.tsx`: virtualizer renderiza ~12 itens; ring buffer FIFO 500; pause/play congela atualizações.
- `health-card.test.tsx`: thresholds de cor por lag/taxa de erro.
- `audit-log-list.test.tsx`: expand/collapse de detalhes JSON.
- `mobile-cards.test.tsx`: viewport <lg colapsa em cards; tap targets ≥44px.

### 16.3 Integração (Playwright opcional Fase 3.5)

- Wizard end-to-end: criar connection → cadastrar binding → copiar webhook URL+secret → ver evento mock chegar na aba Tempo real.
- Soft delete bloqueado: tentar apagar connection com binding ativo → AlertDialog → "Ir para Bindings" → desabilita binding → tentar de novo → AlertDialog destrutivo → confirma.
- Acessibilidade: rodar axe-core nas 4 abas e no wizard.

### 16.4 Cobertura mínima

- 100% das Server Actions novas.
- ≥80% dos componentes UI novos (cobertura via React Testing Library + jsdom).
- 0 erros typecheck na área tocada.
- Visual regression (screenshot) opcional: Chromatic ou Percy desabilitado por padrão; suficiente review manual via mock data.

## 17. Performance — métricas-alvo

| Métrica | Alvo | Como medir |
|---|---|---|
| First Contentful Paint da página | <1.2s (P75) | Web Vitals via Vercel Analytics ou stub local |
| Time to Interactive | <2.5s (P75) | idem |
| Bundle inicial | ≤120 KB gzipped (excluindo libs base) | `next build` analytics |
| Aba Tempo real — render de 500 eventos | <200ms (P75) | React Profiler + `@tanstack/react-virtual` overhead <5% |
| SSE reconnect: tempo até primeira reconexão | <2s | implementação manual com backoff |
| Stream FPS sob bursting (50 events/s) | ≥30fps | scrollTo + measureElement otimizados |

Code splitting por aba (dynamic import) reduz bundle inicial — só carrega o necessário.

## 18. Critérios de aceitação

A Fase 3 está completa quando:

- [ ] Sidebar mostra "Bancos Nexus Chat" para super_admin (e oculta para outros papéis); "Jobs de pré-agregação" foi removido.
- [ ] `/configuracoes/jobs` redireciona 308 para `/configuracoes/conexoes?tab=jobs`.
- [ ] As 4 abas funcionam (Conexões, Tempo real, Jobs, Saúde) com URL state preservado, keyboard nav ARIA-compliant.
- [ ] Aba Conexões: tabela com Última edição, ações inline com tooltips, mobile colapsa em cards.
- [ ] Test connection: feedback Loader2 → CheckCircle/XCircle 2.5s + toast com tempo.
- [ ] Soft delete bloqueado: AlertDialog com lista de bindings + CTA "Ir para Bindings".
- [ ] Wizard 4 steps: stepper visual, animação slide-in motion-safe, validação por step, secret plain só no Step 3.
- [ ] Aba Tempo real: 4 KPIs, line chart 24h, stream virtualizado 500 itens com pause/play, filtros funcionam.
- [ ] SSE com reconnect exponential backoff (1→30s).
- [ ] Aba Jobs: seletor de connection + botão Housekeeping com AlertDialog.
- [ ] Aba Saúde: cards por connection com lag + taxa erros 24h + bar chart 24h; lista de 50 audit logs.
- [ ] Acessibilidade: axe-core verde nas 4 abas + wizard; tab order matches visual; focus visible.
- [ ] Skeleton em todas as abas durante fetch (sem layout shift).
- [ ] Sonner toasts em todas as ações.
- [ ] Suíte de testes verde (typecheck 0, jest verde, ≥80% cobertura UI nova).
- [ ] Smoke test em staging: super_admin onboarda nova empresa fim-a-fim via wizard.
- [ ] Smoke test em produção: super_admin acessa as 4 abas, navega, vê dados reais.
- [ ] Performance: TTI <2.5s P75, bundle inicial ≤120KB gz.
- [ ] Documentação: `docs/runbooks/multi-tenant-realtime.md` ganha seção "UI completa" com screenshots e fluxos.

## 19. Dependências e bloqueios

**Depende de:**
- Fase 1 LIVE em produção (modelos `nexus_chat_connection` + `company_chat_binding`, pool dinâmico, audit logs). ✅ Em andamento (v0.33).
- Fase 2 LIVE em produção (webhook endpoint, tabela `webhook_events`, SSE com `webhook:received`, HMAC validation). 🟡 spec em paralelo (v0.36/0.37).

**Bloqueia:**
- Operação multi-tenant em escala (cliente novo via UI, sem ticket).
- Q1 (UAA → UBA refactor): UI da aba Saúde já mostra audit logs no escopo `binding.*`, e o link "Liberar usuários" do Wizard step 4 leva pra `/usuarios?company={bindingId}`; mas o filtro real só funciona corretamente quando UAA virar UBA (TODO em fase futura).

## 20. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Stream com burst de eventos derruba FPS | Média | Médio | Virtualizer + ring buffer 500 + debounce em filtros + Pause manual. |
| SSE não reconecta em network flap | Média | Alto | Exponential backoff implementado; indicador visual no header; user pode `router.refresh()` manual. |
| Secret webhook copiado mas não salvo pelo user | Alta | Crítico | Step 3 com banner amarelo enfático; Concluir step só após user confirmar; CTA "Regenerar secret" disponível em fase posterior. |
| Wizard interrompido após binding criado | Média | Médio | AlertDialog "Descartar progresso?" explicativa; binding fica no banco (recuperável); secret regenerável via Server Action. |
| Mobile (<lg) sem espaço para 4 KPI cards | Alta | Baixo | `grid-cols-2 lg:grid-cols-4`; em <sm, KPIs viram 2x2 (compactos). |
| Audit log query lenta (50 últimos com JOIN) | Baixa | Baixo | Index existente em `audit_logs(action, created_at desc)` cobre. Se ficar >200ms P75, adicionar cursor pagination. |
| Tooltips se sobrepõem em mobile (não há hover) | Média | Baixo | Tooltips com `delayDuration={700}` e `disableHoverableContent` em touch devices via media query; ações também têm `aria-label` redundante. |
| Recharts SSR mismatch (line/bar chart) | Baixa | Médio | Usar `next/dynamic` com `ssr: false` para componentes de chart; já é padrão no projeto. |
| Wizard fecha sem salvar progresso e user perde dados | Média | Médio | `beforeunload` listener apenas no step 1-2 (steps anteriores ao binding criado); AlertDialog padrão pra ESC/X. |
| Stream payload JSON renderizado pode vazar dados sensíveis | Baixa | Médio | JSON é só metadados webhook (não credenciais). Mesmo assim, mascarar campos `secret`, `password`, `token` antes de exibir (regex client-side). |
| Bundle cresce com Recharts + virtualizer | Média | Médio | Code splitting por aba (`dynamic`). Aba Tempo real e Saúde lazy-loaded. |
| Filtros multi-select com 50+ connections fica lento | Baixa | Baixo | Hard limit 100 connections (Fase 1) cobre; Combobox base-ui com search se >20. |

## 21. Decision records

| Decisão | Alternativa considerada | Razão |
|---|---|---|
| Tabs primitive base-ui (não shadcn primitivo) | shadcn Tabs | base-ui é o padrão do projeto (Roteador Webhook Meta); prop `render` em vez de `asChild` (regra absoluta CLAUDE.md). |
| 4 abas em vez de 5 (sem aba "Bindings" separada) | Aba Bindings dedicada | Bindings ficam no Sheet por linha de connection (Fase 1) — manter consistência. Wizard cobre criação. |
| Wizard em Sheet (drawer) e não Dialog | Dialog modal | Sheet dá mais espaço vertical pra screenshots e conteúdo do step 3; user vê background da página. |
| Stream FIFO ring buffer 500 itens em memória | Buscar do banco com paginação | Stream é "ao vivo"; banco já tem audit log para histórico. 500 é limite que cobre 95% dos casos sem stress de memória. |
| SSE nativa (EventSource) com backoff manual | WebSocket / TanStack Query refetch | EventSource é mais simples, server-only push, suficiente; backoff manual permite UX clara de estado. |
| Code splitting por aba (`next/dynamic`) | SSR de tudo de uma vez | Reduz bundle inicial; abas pesadas (Tempo real, Saúde) só carregam se acessadas. |
| Sem TanStack Query | Adicionar TanStack Query | Não é dependência atual; React `cache()` + `unstable_cache` cobre necessidades. Add só se justificar em fase futura. |
| Mobile colapsa em cards a partir de `<lg` (1024px) | `<md` (768px) | Tabela com 7 colunas só fica legível em ≥lg. <lg vai pra cards. Padrão do projeto (já usado em `/relatorios/conversas`). |
| Audit log lista 50 últimos sem paginação | Cursor pagination | 50 cobre >95% das demandas; pagination adiciona complexidade pra benefício marginal. CTA "Ver todos" linka pra rota futura. |
| Naming "Bancos Nexus Chat" | "Conexões" / "Instâncias" | Comunica claramente o domínio; alinha com nomenclatura UI; evita repetição com aba interna "Conexões". |
| Wizard NÃO persiste estado em localStorage | Persistir | Risco de exposição do secret; complexidade adicional; UX aceitável re-iniciando do zero. |
| Botão Housekeeping na aba Jobs (não automático apenas) | Apenas cron | Útil pra forçar limpeza quando volume cresce; cron continua como fonte primária. |
| `?tab=` URL state em vez de só state local | Só state local | Deep-link friendly (suporte de browser back/forward, links externos a abas específicas). |
| Tile selector no Step 1 do wizard (não dropdown) | Dropdown/Select | Para 1-10 connections, tiles dão visibility do contexto (host+banco+count); >10 connections → fallback Combobox (raro na escala atual). |

## 22. TODOs e questões abertas

- [ ] **Q1**: Botão "Regenerar secret" na aba Conexões (linha de cada connection) — útil em casos de secret comprometido. Server Action `rotateWebhookSecret` já planejada nesta fase, mas UI da ação fica para fase futura (ou v0.39+ se for trivial). Decisão: incluir na v0.38 ou empurrar?
- [ ] **Q2**: Notificação in-app (badge no sidebar) quando há erro HMAC ou connection error >5 min — fora do escopo, mas seria valor. Decisão futura: implementar via SSE + toast persistente, ou depender do user abrir aba Tempo real.
- [ ] **Q3**: Histórico de testes de conexão (não só `last_test_at`/`last_test_error`, mas timeline). Útil pra debug. Fora do escopo Fase 3; talvez parte de uma feature "Diagnóstico" futura.
- [ ] **Q4**: Wizard step 1 com auto-detecção de connection via `host` (se super_admin já cadastrou conexão pra aquele banco, sugerir). Útil pra prevenir duplicatas. Fase futura.
- [ ] **Q5**: Internacionalização (i18n) — copy hardcoded em pt-BR. Quando habilitar i18n, esta página tem 80+ strings pra extrair. Fase 4 dedicada (não bloqueia esta fase).
- [ ] **Q6**: Aba "Saúde" sugere alertas automáticos (email/Slack) quando lag >30 min ou taxa erros >5%. Fase futura "Alerting".
- [ ] **Q7**: Audit log na aba Saúde lista só 50 últimos. Para acima disso, criar rota `/configuracoes/audit?scope=connections` (CTA "Ver todos no log"). Fase futura.
- [ ] **Q8**: Analytics interna do uso da própria UI (qual aba é mais acessada, qual ação dispara mais). Útil pra priorização futura. Fora do escopo.
- [ ] **Q9**: Testes Playwright e2e — opcional Fase 3.5 (após v0.38 LIVE). Decisão pós-LIVE: vale ou só Jest+RTL é suficiente.
- [ ] **Q10**: Screenshot estática do painel Nexus Chat (asset `public/onboarding/nexus-chat-webhook.png`) precisa ser produzida antes do release. Tarefa do plan: capturar de instalação real, anonimizar dados sensíveis.

---

## Apêndice A — Pente fino #1 (24 achados aplicados)

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| A1 | Nome do item de sidebar "Bancos Nexus Chat" não estava justificado — pode confundir vs "Conexões" da aba interna. | UX/Naming | §5.2 ganhou parágrafo de "Naming: por que não 'Conexões'/'Instâncias'/'Bancos de dados'", documentando trade-off. |
| A2 | Spec não dizia o que acontece com `/configuracoes/jobs` após reorg (link quebrado para bookmarks?). | UX | §5.3 adicionada: redirect 308 permanente para `/configuracoes/conexoes?tab=jobs`. |
| A3 | Tab "Tempo real": número 500 itens de cap não tinha justificativa. Pode estourar memória? | Performance | §8.4 e §21 explicitaram: 500 cobre >95% dos casos; FIFO ring buffer; virtualizer renderiza só 12-15 itens visíveis. |
| A4 | "Wizard step 3 secret só aparece uma vez" — e se user fecha por engano? Spec não tinha resposta. | UX/Segurança | §11.7 adicionada: AlertDialog "Descartar progresso?" se dados preenchidos; aviso explícito no step 3 (banner amarelo); CTA `rotateWebhookSecret` regerador disponível separadamente. |
| A5 | Mobile breakpoint não estava definido. `<md`? `<lg`? | UX/Responsive | §7.6 e §21 explicitam `<lg` (1024px) com justificativa (7 colunas exigem largura). |
| A6 | "Aba Tempo real — métricas com TanStack Query OU Server Actions" — escolha não decidida. | Tech | §6 (4.1.6) e §21 decidiram: Server Actions cacheadas (`unstable_cache` / `React.cache`) — não introduzir TanStack Query nesta fase. |
| A7 | "Stream virtualizado padrão `/relatorios/conversas`" — não detalhava qual lib. | Tech | §8.4 detalhou `@tanstack/react-virtual` com props específicas. |
| A8 | KPI cards: "trend" mencionado mas não definido como calcular. | Spec | §8.2 ganhou tabela com source query e trend reference de cada KPI. |
| A9 | Acessibilidade Tabs ARIA — keyboard nav L/R não estava no spec. | A11y | §6.2 e §14 adicionaram setas L/R, Home/End. |
| A10 | "Focus management ao trocar de aba" sem detalhe. | A11y | §6.2 e §14: foco move para `Tabs.Panel` com aria-live polite. |
| A11 | Soft delete bloqueado modal não definia foco inicial. | A11y/UX | §7.5: foco inicial em "Fechar"/"Cancelar" (não-destrutivo) por WCAG. |
| A12 | Test connection feedback visual sem timing definido. | UX | §4.1.4 e §7.3: Loader2 → CheckCircle/XCircle 2.5s, toast com `Conectado em XXXms`. |
| A13 | "Ações inline com tooltips" sem dizer qual primitive. | Tech | §7.3: base-ui `Tooltip` com `delayDuration={700}`. |
| A14 | "Audit log mostrar última edição" sem especificar formato/source query. | Spec | §7.4: query `audit_logs WHERE targetType='nexus_chat_connection' AND targetId={id} ORDER BY created_at DESC LIMIT 1`; format `Editado por {nome} em {data}`. |
| A15 | Aba Saúde: "lag por connection" sem definir source. | Spec | §10.2: `MAX(chatwoot_facts_meta.last_refresh_at) - now()` filtrado por `connectionId`. |
| A16 | Aba Saúde: "taxa de erros 24h" sem definir fórmula. | Spec | §10.2: `(COUNT FILTER hmac_valid=false OR error_message NOT NULL) / NULLIF(COUNT, 0) * 100`. |
| A17 | Wizard step 2 "auto-suggest display_name" — fonte? | Spec | §11.4: query `chatwoot_accounts.name` no pool da connection escolhida; timeout 5s; fallback vazio. |
| A18 | "Imagem ilustrativa" no Wizard step 3 sem caminho. | Asset | §11.5 e Q10 §22: `public/onboarding/nexus-chat-webhook.png` (TODO produzir asset). |
| A19 | Naming inconsistente entre "tipo evento" / "event_type" / "kind". | Spec | Padronizado para "tipo evento" na UI (pt-BR), `event_type` no schema. |
| A20 | Cor semântica "trend" KPI: para latência, "up" é ruim — precisa cor especial. | UX | §8.2 tabela: cor up varia por métrica (eventos: emerald; latência: rose). |
| A21 | "Pause/play do stream" sem definir o que acontece com eventos durante pause. | UX | §12.4: SSE continua recebendo, eventos vão pra buffer secundário "pendentes" com badge "{N} novos eventos". |
| A22 | Aba Jobs "Housekeeping" sem definir regra do que limpa. | Spec | §9.1: limpa `webhook_events` >24h (data antiga vai pra audit log se relevante; webhook_events é tabela de log raw). |
| A23 | Stepper visual em mobile: pode não caber 4 labels horizontais. | UX/Responsive | §11.2: em `<sm`, mostra só números (sem labels). |
| A24 | Test connection do Wizard step 1: spec não dizia se valida antes de avançar. | UX | §11.3 e §11.8 explicitaram: "Próximo desabilitado até connection escolhida ou nova criada+testada com sucesso". |

---

## Apêndice B — Pente fino #2 (22 achados aplicados)

Análise mais profunda buscando contradições internas, edge cases, dependências esquecidas e decisões não justificadas.

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| B1 | `Tabs.Panel` motion-safe animação é só `fade-in-0`, mas spec diz "animação slide-in-from-right" no Wizard. Inconsistência. | Documentação | Distinção clara: aba (fade), Wizard (slide). §6.2 mantém fade; §11.1 mantém slide. |
| B2 | Spec não diz como o filterNav (`src/lib/constants/nav.ts`) é injetado em produção — precisa rebuild ou hot-reload? | Tech/Operacional | §5.1: arquivo é constante TypeScript estática; mudança exige redeploy. Deploy gradual é seguro (filterNav reage a `superAdminOnly`). |
| B3 | Aba Saúde audit log filtrado por `action LIKE 'connection.%'` — Postgres LIKE é ok mas índice? | Performance | §20 risco "audit log query lenta" + mitigação: index existente em `audit_logs(action, created_at desc)` cobre LIKE com prefixo `connection.%`. |
| B4 | KPI "Heartbeat" só faz sentido por connection — agregado é confuso. | UX | §8.2: heartbeat tem comportamento per-connection. KPI card mostra worst case (connection com `MAX(received_at)` mais antigo). |
| B5 | SSE `?event_types=` ainda não existe (Fase 2 ou nova?) — spec ambígua. | Spec | §13: "SSE endpoint (existe Fase 2): `/api/events` ganha filtros opcionais nesta Fase 3". Adicionado como evolução. |
| B6 | `getRealtimeTabData({ since })` retorna `lastEvents[]` mas o stream é via SSE — duplicação? | Tech | §13: `lastEvents[]` é seed inicial (últimos 50 eventos) ao montar a aba; SSE complementa em tempo real após. Sem duplicação real. |
| B7 | "URL `?tab=`" — qual aba se user passar `?tab=invalido`? | UX | §6.2 explicitado: fallback `conexoes` se ausente ou inválido. |
| B8 | Wizard step 3 — usuário copia URL mas não Secret e segue. Não dá pra recuperar. Spec menciona mas sem fluxo. | UX | §11.5 e §11.7: banner amarelo enfático; AlertDialog "Concluir antes de salvar secret?" se user clica Próximo sem ter copiado (`copyTrack` state). |
| B9 | "Auto-sugere display_name via `chatwoot_accounts.name`" — se super_admin não tem acesso ao banco do Chatwoot, falha. Mas é super_admin global — deveria ter. | Spec | OK, super_admin global tem acesso ao pool. Mas `chatwoot_accounts.name` pode não existir em algumas instalações Chatwoot legadas — fallback null, user digita manualmente. §11.4 já cobre. |
| B10 | "Wizard fecha sem salvar progresso" — `beforeunload` listener pode irritar user que só queria sair. | UX | §20 mitigação: `beforeunload` SÓ entre step 1-2 (antes de Server Action criar binding); steps 3-4 já têm side-effect persistido. |
| B11 | Stream filtros multi-select: como mostrar "Todas" como default? | UX | §8.5: estado vazio na URL = "Todas" (não filtra). User explicitamente seleciona connections individuais para filtrar. |
| B12 | `connectionId` cores estáveis — fórmula hash? | Spec | §8.3: hash determinístico do `connection.id` (UUID) → modulo 5 → palette de 5 cores acessíveis. Documentar cores no design system MASTER. |
| B13 | Mobile cards lista vertical — 100 connections vira scroll infinito? | UX | §20: hard limit 100 connections (Fase 1) cobre. Combobox/search no header da aba Conexões para >20 (fase futura). |
| B14 | Aba Tempo real KPI "Erros HMAC 24h" mostra contagem — mas se for 0, é "✓" verde. Como diferenciar zero de "ainda não calculado"? | UX | §8.2: empty state "—" no card se `webhook_events` 0 nas últimas 24h; "0 ✓" só quando há eventos e nenhum erro. |
| B15 | Wizard step 4 link `/usuarios?company={bindingId}` — UAA aponta para `chatwoot_account_id`, não `bindingId`. Filtro quebra. | Tech/Spec | §19 e Q1: link funciona quando UAA→UBA refactor for feito (TODO Q1 Fase 1 §22). Por agora, link leva para `/usuarios?account={chatwootAccountId}` (compat com UAA atual). Atualizar URL no plan da implementação. |
| B16 | "Pause/play" do stream tem botão visível, mas em mobile o header pode ficar cheio. | UX/Responsive | §8.1 e §8.4: em `<sm`, botão Pause vai pra dropdown menu de overflow (Lucide `MoreVertical`). |
| B17 | Aba Saúde card "lag por connection" usa `MAX(last_refresh_at) - now()` — pode ser negativo se relógio do worker estiver à frente. | Tech | §10.2: `GREATEST(0, EXTRACT(EPOCH FROM (now() - last_refresh_at)))`. Doc de comportamento. |
| B18 | "Skeleton durante fetch" — qual altura? Sem layout shift exige altura igual ao conteúdo final. | UX/Performance | §12.1 explicitou: skeleton table = 5 rows `h-12`; KPI cards = mesmo `rounded-2xl p-4`; chart = `h-48`. |
| B19 | Acessibilidade tab order: tab indo de `Tabs.List` para `Tabs.Panel` é correto, mas e dentro do panel? | A11y | §14: dentro do panel, tab order natural (sequencial DOM). Foco vai pro próximo elemento focável (CTA, primeira ação inline). |
| B20 | Testes spec lista RTL + Jest — projeto usa `@testing-library/react` ou `@testing-library/dom`? | Tech | Padrão do projeto (verificado): `@testing-library/react` + jest-environment-jsdom. §16.2 alinhado. |
| B21 | "Bundle ≤120KB gz" — meta ambiciosa? Recharts sozinho pesa ~80KB. | Performance | §17 e §21: code splitting por aba (next/dynamic). Aba Tempo real e Saúde lazy-loaded; bundle inicial só Conexões. |
| B22 | Sidebar reorg: "manter ordem" ambíguo. Posição exata? | Documentação | §5.1 explicitou: "entre 'Configurações' e 'Perfil'" no array `NAV_ITEMS`. |

---

## Apêndice C — Convenções de naming desta fase

| Camada | Padrão | Exemplo |
|---|---|---|
| Path/diretório UI nova | kebab-case sob `nexus-chat/` | `src/components/settings/nexus-chat/jobs-tab.tsx` |
| Componente React | PascalCase | `ConexoesTab`, `OnboardingWizard`, `RealtimeStream` |
| Server Action | camelCase verbo descritivo | `getConnectionsTabData`, `runWebhookEventsHousekeeping` |
| Audit `action` (Fase 1, mantido) | dotted lowercase | `connection.create`, `binding.update` |
| URL query `tab` values | kebab-case lowercase | `conexoes`, `tempo-real`, `jobs`, `saude` |
| Eventos SSE | namespace:action | `webhook:received`, `facts:refreshed` (Fase 2) |
| Copy UI (pt-BR) | Sentence case | "Bancos Nexus Chat", "Onboardar empresa" |

UI/copy/menus: **sempre "Nexus Chat"**, NUNCA "Chatwoot" (regra absoluta CLAUDE.md).

---

**Próximos passos após aprovação desta v3:**

1. João aprova esta spec.
2. Plan v1→v2→v3 (próxima sessão) via `superpowers:writing-plans`.
3. Implementação via `superpowers:subagent-driven-development` com `ui-ux-pro-max:ui-ux-pro-max` em toda task UI (regra absoluta).
4. Verificação via `superpowers:verification-before-completion`.
5. Code review via `superpowers:requesting-code-review`.
6. Release v0.38.0 via `superpowers:finishing-a-development-branch`.
