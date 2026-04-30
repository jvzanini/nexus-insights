# Nexus Insights — v0.9.2 — Conversas: presets + atalhos rápidos + polimento (v3 — final)

> **Status:** v3 — final, pronta para o plan
> **Data:** 2026-04-30
> **Autor:** Claude (modo autônomo total — autorizado por João Vitor)
> **Topic:** complementos pendentes da v0.9.0/v0.9.1 — filtros salvos como presets, atalhos rápidos de filtro (sem resposta, minhas, não atribuídas), migração de localStorage `cols` (corrige WhatsApp aparecendo na grade pra usuários antigos), e polimento de touch-target em mobile.

---

## Histórico (v1 → v2 → v3)

- **v1** — proposta inicial cobrindo R1–R4 com base em pendências da transcrição do João pós-v0.9.0.
- **v2 — pente fino #1** — corrigiu: (a) ambiguidade do "atalhos de período" — não são atalhos de **período** (já temos Hoje/Semana/Mês/Todos), são atalhos de **filtros operacionais** ortogonais ao período (entendido); (b) presets precisam preservar tanto `FilterState` quanto `sortStack` — escopo único; (c) migration de localStorage tem que ser **idempotente** e detectar versão antiga sem perder colunas custom novas que o usuário marcou; (d) "Atribuídas a mim" depende de mapear `User.chatwoot_user_id` — sem isso, atalho fica invisível ou desabilitado, definido: invisível com tooltip via opção do menu de Configurações futuro; (e) presets compartilhados entre dispositivos exige backend — fora do escopo (localStorage por enquanto).
- **v3 — pente fino #2** — corrigiu: (a) localStorage migration não pode forçar reset duro porque algum usuário pode ter customizado colunas legitimamente; solução: introduzir **um novo key de versão** `conversas-table-cols-v2` que herda a lista anterior **filtrando** as colunas que mudaram default em v0.9.0 (phone, document, labels, custom_attributes, created_at, last_activity_at) — assim, quem tinha customizado mantém suas colunas intencionais, quem só "carregava" defaults antigos volta para os novos; (b) UX dos presets: pensei em popover + lista + CRUD inline; o problema é que CRUD inline polui visualmente; decidido por modal pequeno dedicado (`<PresetsDialog>`) acessado via dropdown com lista de presets favoritos; (c) atalhos rápidos: tentei como toggles inline acima da busca; pra evitar poluir o toolbar (que já tem 4 linhas), virá como **um único combobox "Atalhos"** ao lado dos botões Filtros/Ordenação, oferecendo "Sem resposta", "Não atribuídas", "Minhas" (oculto se não houver mapping); (d) presets devem incluir período? Discussão: "Hoje" como preset salvo é ambíguo (data desliza); decidido: **período é incluído no preset** (custom range também) — usuário verá o período exato no momento de salvar e pode editar depois; e a UI deixa explícito ("Atendimentos urgentes hoje" → ao aplicar, refixa o período "Hoje" mas a data atual é resolvida em runtime).

---

## 1. Contexto

A v0.9.0 entregou query builder + ordenação em cadeia + drill-down + sticky. A v0.9.1 corrigiu bug crítico (`useState(initialRows)` ignorando mudança de período), drill-down minimalista, "Selecionar todos" sempre visível, query builder Avançado compacto, busca encolhida, chips de ordenação no toolbar, sticky thead com shadow. Após v0.9.1, restam 4 pendências do feedback original do João que ainda não foram entregues:

1. **WhatsApp ainda aparece na grade principal** para usuários que vinham da v0.7.0/0.8.0. Causa: `localStorage("conversas-table-cols")` mantém estado antigo onde `phone` estava em `defaultVisible: true`. A v0.9.0 setou `defaultVisible: false`, mas o `useLocalStorageSet` não migra automaticamente.
2. **Filtros salvos (presets)** — pedido explícito: "alguns filtros que eu posso salvar... ele já deixar filtros ali pré-salvos... que apareçam, eu clico e ele apareça uma lista de filtros que eu salvei, que são os meus filtros favoritos". Não foi entregue na v0.9.0/v0.9.1.
3. **Atalhos de filtro rápido** — pedido explícito: "tinha que ter outros atalhos... pra eu poder ver, tipo, os que estão sem resposta". Não foi entregue.
4. **Polimento touch-target** — `Ver mais` no drill-down em h-7 (28px) e X dos chips em 20px estão abaixo do mínimo 44pt para mobile. Bom em desktop, ruim em mobile. Anotado como NICE-TO-HAVE no review de v0.9.1 — vamos atender agora.

### Princípios

1. **Não inventar feature além do que o João pediu** — presets + atalhos + migration + polimento, mais nada.
2. **Reusar componentes existentes** — `<Dialog>` para `PresetsDialog`, `<Popover>` para o combobox de atalhos.
3. **YAGNI ruthless** — sem sync entre dispositivos (futuro), sem UI de exportar/importar (futuro), sem permissão por role (futuro).
4. **Backward-friendly** — usuários antigos não perdem colunas customizadas legitimamente; usuários novos têm o default correto.
5. **A11y por default** — focus trap, ESC, aria-label, keyboard navigation.

---

## 2. Escopo

### 2.1 In-scope (4 requisitos)

| ID | Resumo |
|----|--------|
| **R1** | Migração localStorage `conversas-table-cols` → `conversas-table-cols-v2` que filtra colunas migradas para drill-down (phone/document/labels/custom_attributes/created_at/last_activity_at) sem zerar customizações legítimas |
| **R2** | **Atalhos rápidos** — combobox "Atalhos" ao lado de Filtros/Ordenação, com 3 atalhos: "Sem resposta" (filtra `waiting_seconds != null`), "Não atribuídas" (`assigneeIds = []` + filtro server-side `assignee_id IS NULL`), "Minhas" (filtra `assigneeIds = [currentUserChatwootId]` se mapping existir; oculta se não) |
| **R3** | **Filtros salvos (presets)** — `<PresetsDialog>` com CRUD: criar (botão "Salvar como preset" no FiltersDialog, ou via dropdown), listar, aplicar (1 click), renomear, excluir. Persistência localStorage `conversas-filter-presets`. Cada preset guarda `FilterState` completo + `sortStack` |
| **R4** | **Polimento touch-target** — "Ver mais" do drill-down em `h-8` mín (32px); X dos chips com padding interno aumentando hit-area efetivo para ~32px |

### 2.2 Out-of-scope

- Sincronização de presets entre dispositivos (precisa backend; talvez v1.0).
- Export/import de presets como JSON.
- Compartilhar preset com outros usuários do mesmo workspace.
- Permissão por role (qualquer logado pode salvar presets próprios).
- Tornar atalhos rápidos editáveis pelo usuário (custom shortcuts) — fora do escopo.
- Suportar atalho "Minhas" sem mapping `User.chatwoot_user_id` (oculto se não houver).
- Refatorar o `<ConversasTable>` ou `<AdvancedFilters>` em arquivos menores — fora do escopo.

---

## 3. Decisões de design

### 3.1 [R1] Migração localStorage `conversas-table-cols`

#### Hoje (problema)

`useLocalStorageSet("conversas-table-cols", DEFAULT_VISIBLE_KEYS)` lê o valor antigo se existir. Em v0.7.0/0.8.0, `phone, document, labels, custom_attributes` tinham `defaultVisible: true`. Esses keys ficaram persistidos. Quando v0.9.0 mudou os defaults, usuários antigos continuam vendo as colunas antigas.

#### Decisão final

1. **Bump da key** — passar de `conversas-table-cols` para `conversas-table-cols-v2`.
2. **Migration one-shot na primeira leitura** — se `v2` não existe e `v1` existe:
   - Lê o set de keys persistidas em v1.
   - Filtra fora as keys que migraram para drill-down em v0.9.0: `phone, document, labels, custom_attributes, created_at, last_activity_at`.
   - Se o resultado fica vazio (raro), usa `DEFAULT_VISIBLE_KEYS`.
   - Salva em v2; remove v1.
3. **Hook genérico** `useMigratedLocalStorageSet(newKey, oldKey, migrate, default)` em `src/lib/hooks/use-migrated-local-storage.ts` para reuso futuro.
4. **Sem flash visível** — migration roda dentro do `useState` initializer (síncrono), não em `useEffect`. Usuários veem layout final correto na primeira pintura.

#### Teste
- Caso A: `v1=null, v2=null` → retorna `DEFAULT_VISIBLE_KEYS`.
- Caso B: `v1={"phone","name","status"}, v2=null` → migra para `{"name","status"}` (phone removido); v2 salvo; v1 limpo.
- Caso C: `v1={"name"}, v2={"name","priority"}` → ignora v1 (já existe v2); v1 limpo.
- Caso D: `v1=undefined, v2={"name"}` → retorna v2 normal.

### 3.2 [R2] Atalhos rápidos

#### Layout

```
┌──────────────────────────── Toolbar Conversas ────────────────────────────┐
│ Período:  [Hoje][Semana][Mês][Todos][Personalizado]                       │
│ [Buscar...] [⚡ Atalhos ▾] [▾ Filtros · 3] [↕ Ordenação · 2]              │
│ [chips de filtros aplicados] [chips de ordem]                             │
└────────────────────────────────────────────────────────────────────────────┘
                ↑ NOVO botão entre Buscar e Filtros
```

#### Decisões

- Botão `<Popover>` com ícone `Zap` (Lucide) e label "Atalhos". Quando há atalho ativo, mostra badge `1`.
- Conteúdo do Popover: lista vertical de até 3 atalhos:
  - **Sem resposta** — toggle. Quando ativo, aplica filtro condicional `waiting_seconds != null` (operador `gt`, valor `0`) sobre as rows já carregadas (client-side, via conditionGroup adicional). Mantém combinator AND com filtros simples já aplicados.
  - **Não atribuídas** — toggle. Quando ativo, aplica filtro `assignee.id IS NULL` (client-side, via conditionGroup adicional).
  - **Minhas** — toggle. Visível só se `currentUser.chatwoot_user_id != null`. Quando ativo, aplica filtro `assignee.id == currentUser.chatwoot_user_id`.
- Multi-toggle: pode ativar mais de um atalho ao mesmo tempo (ex.: "Sem resposta" + "Minhas") — combinador AND.
- Implementação client-side via `applyConditions` (já existe). Atalhos viram um `ConditionGroup` adicional combinado com `filters.conditionGroup` do modo Avançado via AND.
- **Persistência**: atalhos ativos NÃO são persistidos no localStorage nem na URL — são "modo operacional" do momento. Reload reseta. Justificativa: evita estado pegajoso confuso.
- **Estado visual**: cada item no popover tem checkbox + label + descrição curta. Item ativo: bg muted + check.
- **Chip no toolbar**: quando há atalho ativo, aparece chip "⚡ Sem resposta" (ou similar) com X individual junto aos chips de filtro.

#### Quando "Minhas" oculto

- `currentUser.chatwoot_user_id` vem de `User.chatwoot_user_id` (campo Prisma já existente? Verificar). Se não existir, omite o item da lista. Tooltip no header do popover: "Mais atalhos em breve."
- Mapeamento de user Nexus → user Chatwoot é responsabilidade da página de Configurações > Perfil (futuro). Spec atual só consome.

### 3.3 [R3] Filtros salvos (presets)

#### Modelo

```ts
interface FilterPreset {
  id: string;          // uuid v4 client-side
  name: string;        // "Atendimentos urgentes hoje"
  state: FilterState;  // inclui period, customRange, conditionGroup, mode...
  sortStack: SortRule[];
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
}
```

Persistência: `localStorage["conversas-filter-presets"] = JSON.stringify(FilterPreset[])` (cap 50 presets, suficiente).

#### UX

```
┌──────────────────────────── Toolbar ────────────────────────────┐
│ ... [⭐ Presets ▾] [⚡ Atalhos ▾] [▾ Filtros] [↕ Ordenação]    │
└──────────────────────────────────────────────────────────────────┘

Click em [⭐ Presets ▾]:

┌─ Popover 320px ──┐
│ Meus presets     │
│ ────────────────│
│ ⭐ VIP em aberto │
│ ⭐ Sem resposta  │
│   há mais de 4h  │
│ ⭐ Suporte hoje  │
│ ────────────────│
│ + Salvar atual   │
│ ⚙ Gerenciar     │
└──────────────────┘

Click "⚙ Gerenciar" abre <PresetsDialog>:

┌────── PresetsDialog 560px ──────┐
│ Filtros salvos             [X]  │
│ ─────────────────────────────── │
│ ⭐ VIP em aberto                │
│   Hoje · Status: Aberta · ...   │
│   [▶ Aplicar] [✏ Renomear] [🗑] │
│ ⭐ Sem resposta há mais de 4h   │
│   Hoje · Sem resposta > 14400s  │
│   [▶ Aplicar] [✏ Renomear] [🗑] │
│ ─────────────────────────────── │
│              [+ Novo preset]    │
└─────────────────────────────────┘

Click "+ Salvar atual" no Popover:
- Inline: input "Nome do preset" + Salvar/Cancelar.

Click "Renomear":
- Inline: input substituiu o nome + Salvar/Cancelar.

Click 🗑:
- Confirmação ("Excluir 'X'?") + Excluir/Cancelar.
```

#### Comportamentos

- "Aplicar preset" promove `state` para `applied` + `sortStack` para a tabela; URL atualiza; popover fecha.
- "Salvar atual" pega `applied` (not draft) + `sortStack` atual e cria novo preset.
- Cap 50 presets. Quando atinge, botão "Salvar" desabilitado com tooltip.
- Cap 60 chars no nome. Validação: nome não pode ser vazio nem duplicado.
- Não persiste atalhos rápidos R2 (transient).
- Sem URL state (`preset=` na URL fica para futuro).

#### Acessibilidade

- `<Dialog>` com aria-modal, focus trap, ESC fecha.
- Popover dos presets: `aria-haspopup="menu"`, lista com `role="menu"` + cada item `role="menuitem"`.
- Confirmação de exclusão: `aria-describedby` apontando pra texto do alerta.

### 3.4 [R4] Polimento touch-target

#### Decisões

- "Ver mais" no drill-down: classe `h-8 text-[12px]` (32px) — sobe de 28px.
- X dos chips: padding `p-0.5` ao redor + `h-6 w-6` (24×24) — hit area efetivo ≈ 28px. Aceito para chips compactos em web (mobile mantém min-height 44px no chip inteiro via `min-h-9`).
- Chips: adicionar `min-h-9` (36px altura mínima) para garantir hit area do pai.

---

## 4. Modelo de dados

### 4.1 LocalStorage keys

| Key | Versão | Tipo | Conteúdo |
|-----|--------|------|----------|
| `conversas-table-cols` | v1 (legacy) | `string` (JSON Array) | Lista de keys de colunas visíveis (legacy, será removida) |
| `conversas-table-cols-v2` | v2 (novo) | `string` (JSON Array) | Lista filtrada — sem keys que migraram pra drill-down |
| `conversas-table-page-size` | v1 | `"50" \| "100" \| "all"` | Sem mudança |
| `conversas-table-sort` | v1 | `SortRule[]` (JSON) | Sem mudança |
| `conversas-filters-mode` | v1 | `"simple" \| "advanced"` | Sem mudança |
| `conversas-filters-condition-group` | v1 | `ConditionGroup` (JSON) | Sem mudança |
| `conversas-filter-presets` | v1 (NOVO) | `FilterPreset[]` (JSON) | Lista de presets salvos pelo usuário |

### 4.2 Estado em runtime (`<ConversasPageClient>`)

```ts
const [presets, setPresets] = useLocalStorageState<FilterPreset[]>("conversas-filter-presets", []);
const [quickFilters, setQuickFilters] = useState<QuickFilterKey[]>([]); // não persistido
```

`QuickFilterKey = "no_response" | "unassigned" | "mine"`.

---

## 5. Mudanças de queries / API

Nenhuma mudança server-side. Tudo client-side.

- Filtros rápidos R2 são aplicados via `applyConditions` extra (compõe com `conditionGroup` do modo Avançado).
- Presets R3 só leem/escrevem `localStorage`.
- Migration R1 só lê/escreve `localStorage`.

---

## 6. Detalhes de UX (resumo)

- **Animação**: presets abrem com fade+scale 200ms; renomear/excluir inline com transition de 150ms.
- **Loaders**: aplicar preset usa `startTransition` igual filtros normais — overlay sutil de 0.6 opacity.
- **Empty state**: PresetsDialog vazio mostra ícone + "Você ainda não salvou nenhum preset. Salve um filtro frequente para acessá-lo rapidamente."
- **Confirm destrutivo**: excluir preset pede confirmação (R8 forms-feedback).
- **Spacing**: 4/8 px tokens em todo o popover/dialog.
- **Tour**: estender o tour com 1 step novo cobrindo o botão "Presets".

---

## 7. Acessibilidade

- WCAG AA 4.5:1 mantido (chips, badges, popover content).
- Focus visible em todos os interativos.
- Keyboard navigation completo nos popovers e Dialog.
- Reduced motion respeitado (Framer `useReducedMotion`).
- `aria-haspopup`, `aria-expanded`, `role="menu"`.
- Skip link já existente da v0.9.0.

---

## 8. Testes

### Unitários (Jest)

- `src/lib/hooks/__tests__/use-migrated-local-storage.test.ts` (novo) — 4 casos da §3.1 (caso A, B, C, D).
- `src/components/reports/__tests__/quick-filters.test.tsx` (novo) — render dos 3 atalhos, multi-toggle, chip aparece.
- `src/components/reports/__tests__/presets-dialog.test.tsx` (novo) — CRUD: criar com nome válido; renomear; excluir com confirm; aplicar.
- `src/lib/hooks/__tests__/use-filter-presets.test.ts` (novo) — hook de gestão de presets (cap 50, validação nome, dedupe).

### Smoke local

- Subir dev server, abrir `/relatorios/conversas`:
  - Confirmar que WhatsApp NÃO aparece na grade por default (mesmo com localStorage antigo simulado).
  - Click "Atalhos" → "Sem resposta" → tabela filtra; chip aparece.
  - Click "+ Salvar atual" → digitar nome → preset salvo; aparece na lista.
  - Click no preset → estado restaurado.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Migration localStorage falha em algum browser exótico | `try/catch` ao redor; fallback para `DEFAULT_VISIBLE_KEYS` se parsing falhar |
| Presets crescem sem cap (cap 50 não basta) | UI mostra contagem `(N/50)`; ao bater 50, botão "Salvar" desabilita com tooltip claro |
| Atalho "Minhas" sem mapping confunde usuário | Item simplesmente oculto; nada visível; sem tooltip enganador |
| Conflito visual entre 3 chips (Atalhos + Filtros + Ordenação) no toolbar mobile | flex-wrap nos chips; mobile (sm-) o popover Atalhos move pra row 3 |
| Aplicar preset com dados antigos (period="hoje") em outra data | Período é resolvido em runtime; "hoje" sempre é hoje. Custom range é literal — ok |

### Rollback

- v0.9.2 é puramente client (sem migration de banco). Reverter é `git revert` da branch + push + redeploy.
- LocalStorage v2 inofensivo se v0.9.2 for revertida — v0.9.1/v0.9.0 ignora a key.
- Presets em localStorage não desaparecem se o app reverter — usuário pode até continuar a versão anterior, eles ficam dormentes.

---

## 10. Apêndice — checklist de implementação (para o plan)

- [ ] **R1** — `useMigratedLocalStorageSet` hook + cobertura de testes
- [ ] **R1** — Trocar `STORAGE_COLS` para `conversas-table-cols-v2` em `<ConversasTable>` usando o novo hook
- [ ] **R2** — `<QuickFiltersPopover>` (Popover + lista + toggles)
- [ ] **R2** — Cabeamento `quickFilters` no `<ConversasPageClient>` + `applyConditions` extra na tabela
- [ ] **R2** — Chip de atalho ativo no `<AppliedFiltersChips>`
- [ ] **R3** — `useFilterPresets` hook (CRUD)
- [ ] **R3** — `<PresetsPopover>` com lista + "+ Salvar" + "⚙ Gerenciar"
- [ ] **R3** — `<PresetsDialog>` (CRUD completo)
- [ ] **R3** — Botão "Salvar como preset" no `<FiltersDialog>` footer (link sutil)
- [ ] **R4** — Bump h-7→h-8 do "Ver mais"; min-h-9 nos chips
- [ ] **Tour** — passo novo "Presets"
- [ ] **CHANGELOG + bump v0.9.1 → v0.9.2 + push**

---

**Spec final.** Pronta para writing-plans.
