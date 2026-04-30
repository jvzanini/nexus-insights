# Nexus Insights — v0.8.0 — Conversas Poderoso (v3 — final)

> **Status:** v3 — final, pronta para o plan
> **Data:** 2026-04-30
> **Autor:** Claude (modo autônomo total — autorizado por João Vitor)
> **Topic:** Redesign completo da tela `/relatorios/conversas` com query builder em E/OU + grupos, painel de ordenação em cadeia com Apply, drill-down inline, sticky toolbar+header, fix de bugs de ordenação null + dropdowns + period search, status feminino + cores ajustadas, etiquetas filtráveis, escala tipográfica +1 step.

---

## Histórico (v1 → v2 → v3)

- **v1** — proposta inicial cobrindo R1–R10 com base nos prints e na descrição falada do João.
- **v2 — pente fino #1** — encontrou: (a) inconsistência entre "modal centralizado" e o uso atual de `Sheet` lateral (decisão: introduzir `<Dialog>` centralizado novo, deixar `Sheet` para drill-downs e outros casos); (b) ambiguidade em "fonte +1" (definido: bump no root 16→17px + promoções pontuais de `text-xs`→`text-sm` na tabela); (c) regra de ordenação null→primeiro/último não estava simétrica (definido: null sempre tratado como "valor mínimo" — simétrico em asc/desc); (d) faltava reset de scroll ao trocar página ou aplicar filtros; (e) faltava telemetria/teste para os bugs do dropdown e period search; (f) escopo dos atributos no drill-down precisava cap (definido: até 30 chips, com expandir).
- **v3 — pente fino #2 (mais profundo)** — encontrou: (a) URL state não cobre `conditionGroup` (definido: serializar em base64url num query param `q` separado, com cap de 4kB); (b) interação entre legacy multi-selects (status/inboxIds/etc) e novo query builder (decisão: **migrar tudo** para o query builder, mantendo um modo "Simples" para usuários casuais); (c) impacto na query SQL (a `ConditionGroup` é avaliada **client-side** em `applyConditions`; não vai pro Postgres — mantém arquitetura atual e simplifica); (d) accessibility do drill-down: `<details>`/`<summary>` é mais semântico que botão custom — usar; (e) sticky header em scroll horizontal precisa `position: sticky` no `<thead>` + container scroll com `overflow-x-auto`; (f) z-index conflitos com Toast/Tour (definido: scale 0/10/20/40/100/1000; sticky toolbar = 30, sticky thead = 20, modal = 100, toast = 1000); (g) faltava decisão de o que persistir no localStorage (definido: visibleCols, pageSize, sortStack, conditionGroup, drillDownExpandAll). v3 adiciona R11 (a11y consolidada), R12 (telemetria/testes) e §10 (riscos + plano de rollback).

---

## 1. Contexto

A tela `/relatorios/conversas` é a peça central do Nexus Insights — é por onde o time da Matrix Fitness investiga conversas individuais. Hoje (v0.7.0) ela tem:

- **Toolbar de filtros** (`AdvancedFilters`) com período + busca + chip que abre `<FiltersDrawer>` (Sheet lateral) com 5 multi-selects (Caixa de entrada, Departamento, Atendente, Status, Prioridade).
- **Tabela** (`ConversasTable`, ~1029 linhas) com ordenação multi-coluna via shift+click no header, persistência localStorage, page size 50/100/Todos, columns toggle, mobile cards.
- **Status badges** com palavras no masculino, cores não otimizadas.
- **Etiquetas (labels)** exibidas como chips neutros, sem filtro.
- **Atributos** truncados com reticências.
- **Bug** crítico em `nullableNumberCompare`: `null` vai para o final em asc, mas o usuário espera tracinho ("não aplicável") como o **menor tempo** (primeiro em asc).
- **Bugs de UX** reportados nos prints: dropdown "Por página" às vezes não responde; busca dentro do calendário do period selector não funciona; cabeçalho da tabela não fica sticky ao rolar.

O usuário pediu "tornar este relatório incrível, fácil de usar, leve, com poder real". Disse explicitamente:

1. Filtros condicionais com **E/OU** entre condições e **grupos** de filtros.
2. **Modal centralizado** (não lateral) para filtros, com layout interativo bonito.
3. **Painel de ordenação** em cadeia, com botão Aplicar.
4. **Drill-down inline** ao clicar na linha (chevron expandir) — colunas WhatsApp/Documento/Etiquetas/Atributos saem da grid e vão pro detalhe.
5. **Sticky** no toolbar de filtros e no cabeçalho da tabela.
6. **Fonte global** levemente maior.
7. **Status feminino:** "Aberta", "Resolvida", "Pendente", "Adiada".
8. **Cores status:** Aberta=amarelo (manter), Resolvida=azul claro, Pendente=roxo (manter), Adiada=cinza claro.
9. **Filtrar por etiquetas**, renomeando "Labels"→"Etiquetas".
10. **Bug ordenação tracinhos** — corrigir.
11. **Bugs de UX dos dropdowns e period selector** — corrigir.
12. **Loader** durante apply quando necessário.

Princípio guia: "**poderoso, leve, fácil**". A skill `ui-ux-pro-max` foi consultada (Quick Reference §1–§9 aplicadas; ver §8 a11y).

### Princípios

1. **Poder sem complexidade visível** — query builder Notion-style com defaults conservadores: começa em modo "Simples" (1 grupo AND), expande para "Avançado" (grupos OR, condições por campo) sob demanda.
2. **Apply explícito** — alterações em filtros/ordenação ficam em rascunho até clicar Aplicar (cumpre `state-clarity`, evita refetch ansioso).
3. **Reusar primitivos do projeto** — `<Dialog>` (base-ui), `<ConditionalFilters>`, `<DrillDownSheet>` e `applyConditions` já existem; aproveitar e estender em vez de reinventar.
4. **Sem regressões** — toda persistência atual (cols, page size, sort) continua válida; URL state retrocompatível.
5. **A11y por default** — focus traps, aria-sort, aria-expanded, escape routes, reduced-motion respeitado.
6. **Spacing 4/8** — toda densidade segue 4px/8px tokens.

---

## 2. Escopo

### 2.1 In-scope (12 requisitos)

| ID | Resumo |
|----|--------|
| **R1** | `<Toolbar>` reorganizado: período + busca + dois CTAs centrais — **Filtros (N)** e **Ordenação (N)** — substituem o chip único atual |
| **R2** | `<FiltersDialog>` centralizado — query builder com modo Simples (1 grupo AND) e Avançado (grupos OR/AND aninhados em 1 nível); 9 campos filtráveis (caixa, departamento, atendente, status, prioridade, **etiquetas**, sem resposta há, aberta há, busca livre) |
| **R3** | `<SortingDialog>` — painel de ordenação em cadeia com lista ordenável (mover ↑↓), Asc/Desc, remover, Adicionar critério, Aplicar/Limpar |
| **R4** | **Drill-down inline** — primeira coluna vira chevron + indicador; click expande linha mostrando WhatsApp completo, documento, etiquetas full, atributos completos (até 30, com "Ver mais"), datas, ações |
| **R5** | **Sticky** — `<Toolbar>` (filtros) com `position: sticky; top: 0`; `<thead>` da tabela com `position: sticky; top: var(--toolbar-h)`; z-index disciplinado |
| **R6** | **Fix bug ordenação null** — null tratado como "valor mínimo" simétrico (asc: null primeiro; desc: null último); aplica em `waiting_seconds`, `open_seconds`, `priority`, qualquer comparador numérico nullable |
| **R7** | **Status feminino + cores** — "Em aberto"→"Aberta" (amber, manter), "Resolvido"→"Resolvida" (sky/azul claro), "Pendente"→"Pendente" (violet, manter), "Adiado"→"Adiada" (slate, novo cinza claro). Atualizar badge, drawer, chips, opções, filtros, mobile cards |
| **R8** | **Etiquetas filtráveis** — adicionar campo `labelIds` na FilterState; expor multi-select buscável no FiltersDialog; renomear coluna "Labels"→"Etiquetas" e header de filtro idem |
| **R9** | **Tipografia +1 step** — root html `font-size: 16.25px` (≈ +1.5%) + promoções pontuais (`text-xs`→`text-[13px]` em valores da tabela, `text-[10px]`→`text-[11px]` em uppercase labels). Mantém harmonia tipográfica do design system |
| **R10** | **Fix bugs UX** — period search (calendário): arrumar `react-day-picker` para responder ao clique inicial; `<CustomSelect>`: corrigir corrida que ignora segundo click ao reabrir; arrumar dropdown "Por página" para refetch confiável |
| **R11** | **A11y + i18n** — aria-sort, aria-expanded, role=region, focus trap em modais, ESC fecha, reduced-motion, skip links na tabela, telas de leitor de tela coerentes; copy 100% pt-BR no feminino quando aplicável |
| **R12** | **Telemetria/testes** — testes de unidade do `nullableNumberCompare` e `applyConditions`; smoke test E2E (Playwright) cobrindo: abrir filtros, criar grupo OR, aplicar, ordenar por waiting_seconds, drill-down de uma linha, mudar page size; testes de regressão dos bugs reportados |

### 2.2 Out-of-scope

- Filtros condicionais aplicados **server-side** (Postgres) — o `applyConditions` continua client-side sobre as N rows carregadas; mover a lógica para SQL é evolução futura quando rows passarem de 5k.
- Salvar combinações de filtros como "presets" / "saved views" (futuro v0.9 ou v1.0).
- Drag-and-drop nativo no `<SortingDialog>` (apenas botões ↑/↓ — equivalente UX, simpler implementation).
- Internacionalização para outros idiomas além de pt-BR.
- Agrupamento de linhas por coluna (`GroupableTable`) — fora do escopo desta versão.
- Export CSV — ficou no backlog do v0.8.0 brainstorm e fica fora desta release.
- Refatorar `ConversasTable` em arquivos menores — só split necessário para suportar drill-down e nova toolbar; refactor amplo fica para v0.9.

---

## 3. Decisões de design

### 3.1 [R1] Toolbar reorganizado

#### Hoje (v0.7.0)

```
┌──────────────────────────────────────────────────────┐
│ Período:  [Hoje][Semana][Mês][Personalizado]         │
│ [Buscar....] [🎚 Filtros · 3]                         │
│ [chips aplicados...] [Limpar tudo]                    │
└──────────────────────────────────────────────────────┘
```

#### Decisão final v0.8.0

```
┌──────────────────────────────────────────────────────┐
│ Período:  [Hoje][Semana][Mês][Personalizado]         │
│ [Buscar....]  [▾ Filtros · 3]  [↕ Ordenação · 2]     │
│ [chips de filtros aplicados] [chips de ordem]         │
└──────────────────────────────────────────────────────┘
   ↑ posição sticky top:0, z-30, blur backdrop
```

- **Dois CTAs gêmeos em destaque**: `Filtros · N` e `Ordenação · N`. Cada um abre seu próprio Dialog centralizado. Visual com primary outline + badge contagem.
- Botões com altura `h-10` (40px) e `px-4`, contraste suficiente em dark/light, bordas `border-violet-500/40` quando há valor aplicado.
- Quando há **draft pendente** (rascunho não aplicado), o CTA mostra um dot violet pulsante + tooltip "N pendente(s) — clique para revisar".
- Chips aplicados (compactos): cada grupo de filtro vira um chip resumo; ordenação vira chip "Status ↑ · Atendente ↓" agregado. Ambos clicáveis para reabrir o respectivo Dialog. X em cada chip remove só aquele grupo.
- **Sticky** com `position: sticky; top: 0` + `backdrop-blur-md bg-card/95`. Borda inferior só aparece quando rolagem > 8px (via `IntersectionObserver` ou simples `useScroll` com threshold).
- Mobile (< 640px): CTAs ficam empilhados em duas linhas; chips quebram em flex-wrap.

### 3.2 [R2] `<FiltersDialog>` centralizado

#### Layout

```
┌─────────────────────────────────────── Dialog 920px ──┐
│  Filtros avançados                              [X]    │
│  ─────────────────────────────────────────────         │
│                                                        │
│  [● Simples]  [○ Avançado]                             │
│  ─────────────────────────────────────────────         │
│                                                        │
│  Modo Simples (default):                                │
│  ┌─ Caixa de entrada [▾ X selecionados ▾]            │
│  ├─ Departamento     [▾ X selecionados ▾]            │
│  ├─ Atendente        [▾ X selecionados ▾]            │
│  ├─ Status           [▾ X selecionados ▾]            │
│  ├─ Prioridade       [▾ X selecionados ▾]            │
│  ├─ Etiquetas        [▾ X selecionados ▾]            │
│  └─ Tempo sem resposta ≥ [____] min/hr/dia            │
│                                                        │
│  Modo Avançado:                                        │
│  ┌─ Combinador: ◉ TODOS (E)  ○ QUALQUER (OU)         │
│  │   ┌ Status        ▾ é igual a ▾ [Aberta ▾]    [X] │
│  │   ┌ Tempo s/ resp ▾ ≥          ▾ [4 hr      ]  [X] │
│  │   ┌+ Adicionar condição                            │
│  │   ┌+ Adicionar grupo                               │
│  └────────────────────────────────────────────         │
│                                                        │
│  ─────────────────────────────────────────────         │
│  [Limpar tudo]                  [Cancelar]  [Aplicar 3]│
└────────────────────────────────────────────────────────┘
```

#### Decisões

- Implementação base: `<Dialog>` da base-ui, novo wrapper `<FiltersDialog>` em `src/components/reports/filters-dialog.tsx`.
- **Modo Simples** = 1 grupo AND com 7 multi-selects nativos (mesma UX do drawer atual, sem operadores). Suficiente para 90% dos usuários.
- **Modo Avançado** = `<ConditionalFilters>` reusado (já existe em `src/components/ui/conditional-filters.tsx`). 9 campos:
  - **Caixa de entrada** (multi_select)
  - **Departamento** (multi_select)
  - **Atendente** (multi_select)
  - **Status** (select)
  - **Prioridade** (select)
  - **Etiquetas** (multi_select)
  - **Sem resposta há** (number, em segundos — UI exibe min/hr/dia)
  - **Aberta há** (number)
  - **Busca livre** (string, contains/starts_with em nome/whatsapp/documento)
- **Toggle Simples ↔ Avançado** preserva valores: ao ir para Avançado, monta o `ConditionGroup` com combinator AND e 1 condição `field=campo, operator=in, value=ids` por grupo aplicado. Ao voltar para Simples, **só funciona se o grupo for AND-of-AND-equivalents** (operadores apenas `eq/in`); se o usuário tiver criado algo mais complexo, volta com confirmação ("simplificar pode perder X condições").
- **Apply explícito**: rascunho local não escapa do Dialog até clicar `Aplicar`. ESC ou clique fora pede confirmação se houver mudanças não aplicadas.
- **Loader**: o botão Aplicar mostra `<Loader2 spin>` enquanto a tabela refetcha (transition pendente do React).
- **Acessibilidade**: focus trap nativo do `<Dialog>` da base-ui, `aria-modal=true`, ESC fecha, primeira focável = combinator pill, último = botão Aplicar (foco logical).
- **Animação** (cumpre `modal-motion`): fade + scale 0.95→1 em 200ms ease-out na entrada; reverse 140ms na saída. Respeita `prefers-reduced-motion`.

### 3.3 [R3] `<SortingDialog>` — painel de ordenação

#### Layout

```
┌─────────────── Dialog 560px ────────────────┐
│  Ordenação                              [X]  │
│  ─────────────────────────────────────────   │
│                                              │
│  ↕ Ordenar por (1ª)                          │
│  [Status        ▾]  [Asc ↑] [Desc ↓]   [X]  │
│                                              │
│  ↕ Ordenar por (2ª)                          │
│  [Sem resp há   ▾]  [Asc ↑] [Desc ↓]   [X]  │
│                       ↑ ↓ (mover)            │
│                                              │
│  [+ Adicionar critério]                      │
│                                              │
│  ─────────────────────────────────────────   │
│  [Limpar]              [Cancelar] [Aplicar]  │
└──────────────────────────────────────────────┘
```

#### Decisões

- Componente novo `<SortingDialog>` em `src/components/reports/sorting-dialog.tsx`.
- Lista ordenável com botões ↑/↓ (drag-and-drop fica para v1.0). Cada item é `{ key, direction }`. Click em "Asc/Desc" alterna o sentido daquele critério.
- **Indicação na tabela**: cabeçalho mostra ícone ↑/↓ + número de ordem (1, 2, 3) quando há múltiplos critérios — **mantém o visual atual**, mas o usuário pode optar por usar só o Dialog.
- **Atalho rápido**: click no header da coluna continua aplicando ordenação (cycle null→asc→desc→null) — substitui a sortStack inteira; shift+click adiciona/alterna na pilha. **Não removemos** este atalho — usuário avançado já o conhece. Mas o painel é o caminho **principal** anunciado.
- **Apply explícito** dentro do Dialog: rascunho local; X fecha sem aplicar com confirmação se houver mudanças.
- **Tooltip explicativo** próximo ao botão "Ordenação" (icone ?): "Click no cabeçalho da coluna ordena rapidamente. Use este painel para combinações de múltiplos critérios."
- Botão "Adicionar critério" lista apenas campos sortable que ainda não estão na cadeia.

### 3.4 [R4] Drill-down inline expansível

#### Layout

```
Tabela enxuta (10 colunas):
┌─┬─────┬──────────────┬──────────┬──────────┬───────────┬──────────┬─────────┬──────────┬────────┐
│▸│  #  │ Nome         │ Estado   │ Departam │ Atendente │ Status   │ Priorid │ Sem resp │ Aberta │
├─┼─────┼──────────────┼──────────┼──────────┼───────────┼──────────┼─────────┼──────────┼────────┤
│▾│#8653│ Fernando T.. │ MG       │ Atendim  │ João S.   │ Aberta   │ Alta    │ 2h 15m   │ —      │
└─┴─────┴──────────────┴──────────┴──────────┴───────────┴──────────┴─────────┴──────────┴────────┘
                          ↓ ao clicar:
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ Detalhes da conversa #8653                                                │
   │                                                                            │
   │  Contato                                                                   │
   │  Nome:      Fernando Thelmo Andrade Marques                               │
   │  WhatsApp:  +55 (31) 99984-5112                                            │
   │  Documento: 123.456.789-00                                                 │
   │                                                                            │
   │  Etiquetas (3)                                                             │
   │  [VIP] [Renovação] [Plano Anual]                                           │
   │                                                                            │
   │  Atributos (12)                                                            │
   │  wpp_id:           553199845112                                            │
   │  status_atendim:   Template: Pendência financeira                          │
   │  origem:           Campanha Black Friday                                   │
   │  ...  [Ver mais (8)]                                                       │
   │                                                                            │
   │  Tempos                                                                    │
   │  Criada em:        23/04/2026 14:32                                        │
   │  Última atividade: 28/04/2026 09:15                                        │
   │                                                                            │
   │                                  [Abrir no Chatwoot ↗]                     │
   └──────────────────────────────────────────────────────────────────────────┘
```

#### Decisões

- **Trigger**: chevron na **primeira coluna** + linha inteira clicável. Hover mostra cursor pointer.
- **Implementação**: usar `<details>`/`<summary>` aninhado em `<tr>`? Não — quebra semântica de tabela. Em vez disso, usar `<tr>` "trigger" + `<tr>` "body" (com `colSpan={N}`) controlados por React state `expandedIds: Set<number>`. `aria-expanded` e `aria-controls` no trigger; `role="region"` + `aria-labelledby` no body.
- **Persistência**: `expandedIds` **não persiste** entre sessões (volátil) para não confundir o usuário ao reabrir. Botão **"Expandir tudo"** / **"Recolher tudo"** opcional na toolbar interna da tabela.
- **Conteúdo**: 4 sub-seções (Contato, Etiquetas, Atributos, Tempos) + ações (Abrir no Chatwoot). Layout grid 2 colunas em desktop, 1 em mobile.
- **Atributos**: até 30 chips visíveis; "Ver mais (N)" expande inline; cada chip mostra `chave: valor` completo (sem reticências). Valores muito longos (>120 chars) com `<pre>` colapsável.
- **Animação**: altura 0→auto via `motion.div` (Framer Motion já no projeto); 240ms ease-out; respeita `prefers-reduced-motion` (instant).
- **Colunas que migram para drill-down (escondidas por default da tabela enxuta)**:
  - WhatsApp (estava em coluna)
  - Documento
  - Etiquetas
  - Atributos
  - Criado em
  - Última atualização
- **Colunas mantidas na grid**:
  - Chevron (drill-down trigger) | # | Nome | Estado (caixa) | Departamento | Atendente | Status | Prioridade | Sem resposta há | Aberta há | Ações
- O **`ColumnsToggle`** continua existindo: usuário pode "puxar de volta" qualquer coluna da grid se quiser.
- **Mobile**: primeiro card já mostra contato + ações; click em chevron abre seção secundária (etiquetas+atributos+tempos).

### 3.5 [R5] Sticky toolbar + sticky thead

#### Hoje
- Toolbar de filtros: scrolla com a página; usuário precisa rolar tudo de volta para mexer.
- `<thead>` da tabela: scrolla; usuário perde referência das colunas.

#### Decisão final

```css
/* Toolbar */
.reports-toolbar {
  position: sticky;
  top: 0; /* sob o page-header — page-header continua scrollando */
  z-index: 30;
  background: rgb(var(--card) / 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgb(var(--border));
}

/* Tabela */
.conversas-table-container {
  overflow-x: auto; /* scroll horizontal só no body */
}
.conversas-table thead {
  position: sticky;
  top: var(--toolbar-h, 132px); /* ajustado dinamicamente via ResizeObserver */
  z-index: 20;
  background: rgb(var(--card));
}
```

- `--toolbar-h` calculado em runtime via `ResizeObserver` no toolbar; aplicado em CSS var no container da tabela. Robusto a mudanças de breakpoint, drafts pending, número de chips.
- Z-index disciplinado (CSS vars em globals.css):
  - `--z-toolbar: 30`
  - `--z-table-thead: 20`
  - `--z-modal: 100`
  - `--z-toast: 1000`
- Borda inferior do toolbar **só aparece** quando `scrollY > 8` (subtle elevation cue).
- Header da tabela mantém `bg-card` opaco (não translúcido) — evita scroll content vazar atrás.
- Mobile (< 640px): toolbar continua sticky, mas o cabeçalho da tabela vira card layout (não há `<thead>` para fixar).

### 3.6 [R6] Fix bug ordenação null

#### Hoje (bug)

```ts
function nullableNumberCompare(a, b) {
  if (a === b) return 0;
  if (a == null) return 1;   // null ao FINAL em asc
  if (b == null) return -1;
  return a - b;
}
```

Resultado:
- `asc` (menor primeiro): valores normais primeiro, `null` no final. Mas usuário disse: "tracinho = não está sem resposta = menor tempo possível → deve vir **primeiro** em asc".
- `desc` (maior primeiro): factor=-1, `null` no início — também errado.

#### Decisão

Tratar `null` como "valor mínimo" simétrico — vai sempre para a **ponta de menor valor**:

```ts
/**
 * Comparador numérico que trata null como o menor valor possível.
 * - asc (menor → maior): null vem primeiro, depois valores numéricos crescentes.
 * - desc (maior → menor, factor=-1): valores numéricos decrescentes, null no final.
 *
 * Justificativa de produto: "tracinho" (sem dado) = "0/melhor estado" no contexto
 * de waiting_seconds e open_seconds — uma conversa que não está esperando deve
 * aparecer antes daquelas com 4h de espera quando ordenamos pelo MENOR tempo.
 */
function nullableNumberCompare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;   // null < qualquer número
  if (b == null) return 1;
  return a - b;
}
```

- Aplicar em **todos** os campos numéricos que aceitam null: `waiting_seconds`, `open_seconds`, `priority`.
- Strings nullable (`nullableStringCompare`) mantêm a regra atual ("null no final"), pois "—" em colunas como Departamento/Atendente significa "não atribuído" e o usuário não levantou problema lá. Se vier feedback, ajustamos.
- Adicionar **teste unitário** cobrindo: ambos null, um null um número, dois números, asc, desc.
- Documentar no README do componente que essa convenção é deliberada.

### 3.7 [R7] Status feminino + cores

#### Decisão final (mapa STATUS_MAP em `status-badge.tsx`)

| Código | Hoje (label / cor) | v0.8.0 (label / cor) | Justificativa |
|--------|--------------------|----------------------|---------------|
| 0 | "Em aberto" / amber | **"Aberta"** / amber (manter) | Pediu feminino + cor amarela |
| 1 | "Resolvida" / emerald | **"Resolvida"** / **sky** (azul claro) | Pediu azul claro clássico |
| 2 | "Pendente" / violet | **"Pendente"** / violet (manter) | Pediu manter roxo |
| 3 | "Adiada" / zinc | **"Adiada"** / **slate** (cinza claro suave) | Pediu cinza claro |

#### Tokens exatos

```ts
const STATUS_MAP: Record<number, { label: string; className: string }> = {
  0: { label: "Aberta",    className: "bg-amber-500/15 text-amber-500" },
  1: { label: "Resolvida", className: "bg-sky-500/15 text-sky-500" },
  2: { label: "Pendente",  className: "bg-violet-500/15 text-violet-500" },
  3: { label: "Adiada",    className: "bg-slate-500/15 text-slate-400" },
};
```

#### Verificação contraste (WCAG AA 4.5:1)

- **Sky-500 sobre sky-500/15** em dark mode (#0ea5e9 sobre rgba(14,165,233,0.15) sobre `#18181b`): contraste do texto vs background efetivo ≈ 5.8:1 ✓
- Light mode (`text-sky-400` resolvido para `#2563eb` via override em globals.css): contraste ≈ 6.2:1 ✓
- **Slate-400 sobre slate-500/15**: ≈ 4.7:1 dark / 5.0:1 light ✓
- Manter overrides de light mode (já existentes em globals.css linhas 122–151).

#### Onde atualizar

1. `src/components/reports/status-badge.tsx` (mapa + STATUS_OPTIONS)
2. `src/components/reports/filters-drawer.tsx` (STATUS_OPTIONS — vai ser substituído pelo FiltersDialog, mas mantém compat se drawer ainda existir)
3. `src/components/reports/applied-filters-chips.tsx` (formatStatusLabel)
4. `src/components/reports/conversas-table.tsx` (mobile cards já usam `<StatusBadge>`)
5. Qualquer hardcoded "Aberto/Resolvido/Adiado" em outros componentes (grep em `src/`)

### 3.8 [R8] Etiquetas filtráveis

#### Estado atual

- Coluna "Labels" existe e mostra chips neutros.
- `FilterState.labelIds` **não existe** — mas `ReportFilters.labelIds` (chatwoot/filters.ts) já existe e tem WHERE clause pronto via `EXISTS (taggings)`.
- `getLabels(accountId)` **não existe** — preciso criar uma query meta-cache para Etiquetas (similar a getTeams/getInboxes).

#### Decisões

1. **Estender `FilterState`**: adicionar `labelIds: number[]`.
2. **Criar `getLabels(accountId)`** em `src/lib/chatwoot/queries/meta-cache.ts`:
   ```sql
   SELECT id, title AS name, color FROM labels
   WHERE account_id = $1
   ORDER BY title ASC
   ```
3. **Cachear** com `meta-cache` pull-through (TTL 600s, invalidate em background).
4. **Carregar na page** (server component): `getLabels(accountId)` paralelo aos demais.
5. **Expor no FiltersDialog**: novo grupo "Etiquetas" com `<MultiSelectCheckbox>` buscável.
6. **Renomear UI**: "Labels"→"Etiquetas" em:
   - Header da coluna (`COLUMNS[].label`)
   - Header de filtro
   - Empty state
   - Tour
   - Mobile cards
   - Comentários e nomes internos PERMANECEM `labels` (compat técnica, evita migração de localStorage/URL).
7. **URL serialization**: novo param `label` (csv de IDs).
8. **Filter chip**: chip "Etiquetas (3)" no toolbar de filtros aplicados.
9. **Operadores condicionais**:
   - "Etiquetas inclui" (operador `in` — match qualquer)
   - "Etiquetas inclui todas" (operador `contains_all` — novo, requer extensão de `apply-conditions`)
   - "Não inclui" (operador `not_in`)

### 3.9 [R9] Tipografia +1 step

#### Hoje
- Root html: 16px (default Tailwind/browser).
- Tabela usa muito `text-xs` (12px).

#### Decisão

1. **Root html**: `font-size: 16.25px` (+1.5%, mantém ritmo do design system sem causar layout shift). Equivale a `1.015625rem` no Tailwind.
   - Aplicado em `globals.css`:
     ```css
     html { font-size: 16.25px; }
     @media (min-width: 1280px) {
       html { font-size: 16.5px; } /* monitor 27" — +3% */
     }
     ```
2. **Promoções pontuais** na tabela de Conversas:
   - Valores das células: `text-xs` (12px) → `text-[13px]`
   - Headers da tabela: `text-xs uppercase` → `text-[13px] uppercase` (mantém peso/spacing)
   - Labels secundárias `text-[10px]` → `text-[11px]`
   - Badges `text-xs` mantidos (já legíveis por terem peso medium e padding)
   - Mobile cards `text-[10px]` → `text-[11px]`
3. **Sem mudança** em:
   - Tipografia do PageHeader (já legível)
   - Sidebar (já legível)
   - Login

#### Verificação
- Após mudança, testar em monitor 27" e MacBook 14" — não deve gerar quebra de layout em colunas estreitas.
- Testar em mobile 375px — line-length ≤ 60 chars mantida.
- Testar `prefers-reduced-motion` e dynamic type (browser zoom 125%/150%).

### 3.10 [R10] Fix bugs de UX

#### Bug 1 — Period selector busca não responde

- **Sintoma**: ao abrir o calendário (Personalizado), os botões de mês/ano às vezes não respondem ao primeiro click.
- **Hipótese (verificar com teste)**: race entre `pickerOpen` state setter e o focus-trap do `<Popover>`/`<Dialog>` da base-ui — mount/unmount em cascata cancela o primeiro click.
- **Investigação**: rodar repro no dev local; coletar console; checar versão de `react-day-picker` (presumido v9 — verificar `package.json`).
- **Fix provável**: garantir que `<Calendar>` só renderize após `pickerOpen=true && minDate fetched`; adicionar key no `<PickerPanel>` para forçar remount limpo. Já existe `key={initialRange?.start}-${end}` — pode estar invalidando indevidamente. Inspecionar.
- **Teste**: smoke E2E que abre o calendário, clica num dia, valida que `onApply` é disparado.

#### Bug 2 — Page size dropdown intermitente

- **Sintoma**: `<CustomSelect>` "50/100/Todos" às vezes não fecha ou ignora seleção; precisa clicar 2x.
- **Hipótese**: o `useEffect` com `mousedown` listener em `custom-select.tsx` linha 43 detecta o próprio click do trigger como "click outside" se o `setOpen(true)` ainda não propagou (timing).
- **Fix provável**: substituir o handler manual por `Popover` da base-ui (já usado em PeriodPills) — primitivo correto, sem race. O `<CustomSelect>` é usado em outros lugares (granularity selector, etc.) — auditar e migrar onde possível, ou criar wrapper compatível.
- **Teste**: smoke E2E que muda page size 50→100→Todos e valida refetch.

#### Bug 3 — Cabeçalho não sticky (já coberto em R5)

#### Outros
- Validar que `<MultiSelectCheckbox>` no novo Dialog responde ao primeiro click (mesmo padrão).
- Conferir que `aria-busy` é setado durante refetch (loader visual).

### 3.11 [R11] A11y consolidada

| Aspecto | Implementação |
|---------|---------------|
| Sticky toolbar | `role="toolbar"` aria-label "Filtros e ordenação" |
| Filters Dialog | `<Dialog>` base-ui (já provê focus trap + aria-modal); título h2 referenciado por aria-labelledby |
| Sorting Dialog | idem; lista usa `role="listbox"` + `aria-orientation="vertical"` |
| Drill-down trigger | `<button aria-expanded aria-controls="drill-{id}">`; ícone com `aria-hidden`; tabela mantém `role="row"` e `<td>` |
| Status badges | já têm texto visível; cores nunca são o único indicador (label sempre presente) — cumpre `color-not-only` |
| Sortable columns | `aria-sort="ascending|descending|none"` no `<th>` (já implementado, manter) |
| Multi-select | role="combobox" + aria-expanded; lista interna role="listbox" |
| ESC | fecha qualquer Dialog aberto |
| Reduced motion | todas as animações respeitam `prefers-reduced-motion: reduce` (Framer `useReducedMotion`, Tailwind `motion-reduce:`) |
| Keyboard nav | Tab/Shift+Tab no Dialog respeitam ordem visual; Enter aplica filtros (já implementado em busca, replicar) |
| Skip link | adicionar `<a href="#table">Pular para a tabela</a>` no início da page para usuários de teclado |

### 3.12 [R12] Telemetria + testes

#### Testes unitários (Jest)

1. `src/lib/utils/__tests__/apply-conditions.test.ts` — adicionar casos para operador novo `contains_all`; testar grupos OR aninhados.
2. `src/lib/utils/__tests__/null-compare.test.ts` (novo) — `nullableNumberCompare(null, null) === 0`, `(null, 5) === -1`, `(5, null) === 1`, `(5, 10) === -5`. Cobrir asc/desc.
3. `src/components/reports/__tests__/status-badge.test.tsx` (novo) — render para cada status; valida label feminino e classNames.
4. `src/lib/reports/__tests__/filter-state.test.ts` — adicionar serialização/deserialização de `labelIds` e `conditionGroup` (base64url).

#### Testes E2E (Playwright — se já existe; se não, criar mínimo)

- Verificar se `playwright.config.ts` ou `e2e/` existe; se não, **fora do escopo** (criar infra E2E é grande). Em vez disso, fazer testes de integração com `@testing-library/react`:
  - Abrir FiltersDialog, criar grupo OR, verificar que `onApply` retorna estrutura correta.
  - Click no chevron de uma linha expande conteúdo; segundo click recolhe.
  - Cycle de ordenação por header (asc → desc → null).
  - Mudança de page size dispara fetch.

#### Telemetria

- Não adicionar tracking externo (Posthog/etc) — projeto não tem.
- Adicionar `console.warn` em casos de degradação (URL muito grande, ConditionGroup que não cabe em 4kB) para futura adoção de telemetria.

---

## 4. Modelo de dados

### 4.1 `FilterState` estendido (`src/lib/reports/filter-state.ts`)

```ts
export interface FilterState {
  period: PeriodKey;
  customRange?: { start: string; end: string };
  // Modo Simples (compat com hoje)
  inboxIds: number[];
  teamIds: number[];
  assigneeIds: number[];
  statuses: number[];
  priorities: number[];
  labelIds: number[];          // NOVO (R8)
  search?: string;
  // Modo Avançado (NOVO — R2)
  conditionGroup?: ConditionGroup; // null/undefined = modo Simples ativo
  // Comportamento
  mode: "simple" | "advanced"; // NOVO — qual painel renderizar; default "simple"
}
```

### 4.2 URL serialization

- Modo Simples: usa parâmetros existentes (`inbox`, `team`, `assignee`, `status`, `priority`, `label`, `q`, `period`, `custom_start`, `custom_end`, `mode=simple`).
- Modo Avançado: serializa `conditionGroup` como JSON → base64url no param `cg`. Cap de 4kB; se exceder, fallback: persiste só em localStorage e mostra warning no Dialog ("filtros muito complexos não cabem na URL — adicione 'Salvar como preset' no v0.9").
- Backward compat: URL antiga (sem `mode`) é deserializada como `mode: "simple"`. Sem mudança visível para usuários atuais.

### 4.3 localStorage

- `conversas-table-cols` (existente) — Set de keys de colunas visíveis
- `conversas-table-page-size` (existente) — "50" | "100" | "all"
- `conversas-table-sort` (existente) — `SortRule[]`
- `conversas-filters-mode` (NOVO) — "simple" | "advanced" — qual painel abrir por default
- `conversas-filters-condition-group` (NOVO) — último grupo avançado salvo (para reabrir o Dialog com o último estado)

---

## 5. Mudanças de queries / API

| Camada | Mudança |
|--------|---------|
| `src/lib/chatwoot/queries/meta-cache.ts` | NOVO `getLabels(accountId)` retornando `MetaItem[]` (id, name, color) |
| `src/lib/actions/reports/conversas.ts` | Aceitar `labelIds` em `ReportFilters` (já existe via filters.ts — só passar adiante) |
| `src/lib/reports/filter-state.ts` | Estender FilterState (§4.1) + serialização (§4.2) |
| `src/app/(protected)/relatorios/conversas/page.tsx` | Carregar `getLabels(accountId)` em paralelo; passar para `<AdvancedFilters>` |
| `src/components/reports/advanced-filters.tsx` | Substituir Drawer por **`<FiltersDialog>`** + **`<SortingDialog>`**; adicionar prop `labels` |
| Component `ConversasTable` | Adicionar drill-down (estado `expandedIds`) + ajustes de colunas + sticky thead |

Nada muda no banco. Não há migrations.

---

## 6. Detalhes de UX (resumo)

- **Animação**: 200ms ease-out em modais; 240ms para drill-down expand; 150ms hover; respeita reduced-motion.
- **Loaders**: skeleton na primeira carga; overlay sutil (opacity 0.6) durante refetch; spinner no botão Aplicar.
- **Empty state**: já existe em `<ConversasTable>` linha 782; manter, melhorar copy: "Nenhuma conversa encontrada para esses filtros. Tente afrouxar critérios ou [Limpar filtros]."
- **Confirm ao descartar mudanças**: `Dialog onOpenChange` intercepta close-while-dirty e mostra inline alert: "Você tem alterações não aplicadas. Descartar?" com [Cancelar] [Descartar].
- **Tour**: estender o tour de Conversas (v0.7.0 tem 9 etapas) para cobrir os novos CTAs Filtros e Ordenação, e o drill-down. 11 etapas no total.
- **Spacing**: tudo em múltiplos de 4px (gap-1 = 4, gap-2 = 8, gap-3 = 12, gap-4 = 16).

---

## 7. Acessibilidade (consolidada)

Ver §3.11. Em resumo:

- WCAG AA 4.5:1 em todos os textos sobre backgrounds tonais.
- Focus visível em todos os interativos (já no projeto via `focus-visible:ring`).
- Keyboard navigation completa: Tab/Shift+Tab em Dialog, Enter para aplicar, ESC para fechar.
- Reduced motion respeitado.
- Screen readers: aria-sort, aria-expanded, aria-modal, aria-controls, role="region" no drill-down.
- Skip link "Pular para tabela" adicionado.

---

## 8. Testes

Ver §3.12. Resumo:

- Unitários: 4 suites novas / atualizadas (`apply-conditions`, `null-compare`, `status-badge`, `filter-state`).
- Integração (testing-library): drill-down expand/collapse, FiltersDialog AND/OR, SortingDialog cadeia.
- Smoke local manual no dev server (build + verificar em browser).

---

## 9. Riscos e plano de mitigação

| Risco | Mitigação |
|-------|-----------|
| Bug fix de ordenação null muda comportamento — usuário acostumado pode estranhar | Documentar no CHANGELOG; primeira página da release notes destaca a mudança |
| URL state grande com ConditionGroup complexo > 4kB | Cap + fallback para localStorage; warning no Dialog. Saved presets ficam para v0.9 |
| Performance de `applyConditions` em 10k rows | Já usa filter linear O(n); para 10k ainda < 30ms. Se virar problema, mover para Postgres |
| Sticky thead com scroll horizontal trava no Safari | Testar e fallback `position: -webkit-sticky` |
| Dialog interception de ESC pode conflitar com outros modais (Tour) | Z-index disciplinado (modal=100, tour=110); base-ui Dialog gerencia stacking |
| Bump de fonte global pode quebrar layouts em outras páginas | Testar todas as 7 telas principais (Visão Geral, Performance, Equipe, Distribuição, Origem & IA, Conversas, Mensagens não respondidas, Config) antes de merge |

### Plano de rollback

- A mudança é puramente de UI/UX (sem migration de dados). Reverter é `git revert` da branch + redeploy.
- Persistência localStorage: as novas chaves (`conversas-filters-mode`, `conversas-filters-condition-group`) são opcionais — ausência delas faz o app cair no default `mode: "simple"`. Sem corrupção possível.
- URL params novos (`label`, `cg`, `mode`) são ignorados pela versão antiga. Backward-friendly.

---

## 10. Apêndice A — referência de cores (consolidada)

### Status

| Status | Label v0.8.0 | Token bg | Token text | Contraste dark | Contraste light |
|--------|--------------|----------|-----------|----------------|-----------------|
| Aberta | "Aberta" | `bg-amber-500/15` | `text-amber-500` | 5.4:1 | 5.6:1 (override -600) |
| Resolvida | "Resolvida" | `bg-sky-500/15` | `text-sky-500` | 5.8:1 | 6.2:1 |
| Pendente | "Pendente" | `bg-violet-500/15` | `text-violet-500` | 5.5:1 | 5.9:1 |
| Adiada | "Adiada" | `bg-slate-500/15` | `text-slate-400` | 4.7:1 | 5.0:1 |

### Prioridade (mantida — informada ao usuário)

| Prioridade | Label | Token bg | Token text |
|------------|-------|----------|-----------|
| Urgente | "Urgente" | `bg-red-500/15` | `text-red-500` (vermelho) |
| Alta | "Alta" | `bg-orange-500/15` | `text-orange-500` (laranja) |
| Média | "Média" | `bg-amber-500/15` | `text-amber-500` (âmbar) |
| Baixa | "Baixa" | `bg-slate-500/15` | `text-slate-400` (cinza) |

> **Nota para João**: hoje as cores de Prioridade são vermelho (Urgente), laranja (Alta), âmbar (Média) e cinza (Baixa). Não foram alteradas nesta release porque você pediu apenas confirmação. Se quiser ajustar, fala que faço.

---

## 11. Apêndice B — campos do query builder

| Campo (key) | Tipo | Operadores |
|-------------|------|------------|
| `inbox` | multi_select | in, not_in |
| `team` | multi_select | in, not_in |
| `assignee` | multi_select | in, not_in |
| `status` | select | eq, neq |
| `priority` | select | eq, neq |
| `label` | multi_select | in, contains_all (novo), not_in |
| `waiting_seconds` | number | gt, gte, lt, lte, eq |
| `open_seconds` | number | gt, gte, lt, lte, eq |
| `name` | string | contains, starts_with, eq |
| `phone` | string | contains, starts_with, eq |
| `document` | string | contains, eq |
| `created_at` | date | gt, gte, lt, lte, eq |

> Nota: `applyConditions` é client-side; opera sobre as rows já carregadas. Período (`created_at`) continua filtrado server-side via `period.start/end` para evitar carregar excesso de rows.

---

## 12. Apêndice C — checklist de implementação (para o plan)

- [ ] **R6 + R7 + R8 metadata + R9** — fixes leves e mudanças de copy (1ª onda, baixo risco)
- [ ] **getLabels query + cache** (R8 dados)
- [ ] **FilterState extension + URL serialization** (R2/R8 estado)
- [ ] **`<FiltersDialog>` Modo Simples** (R2 — paridade com drawer atual + Etiquetas + Sem resposta há / Aberta há)
- [ ] **`<FiltersDialog>` Modo Avançado** (R2 — wrap `<ConditionalFilters>`)
- [ ] **`<SortingDialog>`** (R3)
- [ ] **Drill-down inline** (R4)
- [ ] **Sticky toolbar + thead** (R5)
- [ ] **Bug fixes UX** (R10)
- [ ] **Testes** (R12)
- [ ] **Tour update + CHANGELOG + version bump v0.7.0 → v0.8.0**

---

**Spec final.** Pronta para writing-plans.
