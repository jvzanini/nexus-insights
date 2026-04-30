# Nexus Insights — v0.10.4 — Conversas: scroll interno + page size + remover WhatsApp/Atributos (v3 — final)

> **Status:** v3 — final
> **Data:** 2026-04-30
> **Autor:** Claude (modo autônomo total — autorizado por João Vitor)
> **Topic:** Hotfix da tela `/relatorios/conversas` após v0.10.3: page header + toolbar + thead realmente fixos (só rows rolam — scroll INTERNO da tabela), remover colunas WhatsApp e Atributos definitivamente, page size simplificado (100 + Todos) com infinite scroll automático.

---

## Histórico (v1 → v2 → v3)

- **v1** — proposta inicial cobrindo R1–R3 com base no feedback.
- **v2 — pente fino #1** — questões: (a) "scroll interno da tabela" pode quebrar acessibilidade do scroll-keyboard; (b) IntersectionObserver para infinite scroll precisa cleanup; (c) altura da tabela com `calc(100dvh - X)` pode falhar se o page-header tiver altura variável; (d) remover colunas precisa ser limpeza completa (COLUMNS array, ColumnsToggle, MIGRATED_TO_DRILL_DOWN obsoleto, types).
- **v3 — pente fino #2** — corrigiu: (a) usar `dvh` (viewport dinâmica) em vez de `vh` para mobile; (b) sentinela invisível abaixo da última linha em vez de attach IntersectionObserver na linha — evita re-attach a cada render; (c) `--toolbar-h` + `--page-header-h` ambos via useLayoutEffect, container scroll calculado via `calc(100dvh - var(--page-header-h) - var(--toolbar-h) - 32px)`; (d) deletar `phone` e `custom_attributes` do array `COLUMNS`, deletar de `MIGRATED_TO_DRILL_DOWN` (não é mais relevante), do `<ConditionalFilters>` campos (WhatsApp como string ainda permanece — é diferente da coluna), do `<SortRuleOption>` SORT_OPTIONS (já que coluna sumiu, não sortable); (e) page size dropdown bug — verificar refetch real ao trocar opção.

---

## 1. Contexto

A v0.10.3 entregou toolbar arredondado + sticky thead com useLayoutEffect, mas ainda há bugs:

1. **Sticky com gosto ruim** — page header (Conversas / Lista detalhada...) e toolbar continuam **rolando junto** com a tabela. O usuário queria que eles ficassem **realmente** fixos: só as linhas da tabela rolam internamente. Aproveitar a tela inteira pra ler conversas.
2. **Page size dropdown bugado** — usuário seleciona "100 por página" mas a tabela continua mostrando 50. O dropdown está atualizando o valor visual mas não disparando refetch confiavelmente, OU o valor "100" está sendo persistido e a próxima query usa o valor antigo.
3. **Page size com 3 opções confunde** — "50 por página", "100 por página", "Todos" — o usuário só usa 2 (100 e Todos). Reduzir.
4. **Sem infinite scroll** — quando "100 por página", o usuário precisa clicar "Carregar mais" no fim. Substituir por scroll automático (IntersectionObserver).
5. **Colunas WhatsApp e Atributos ainda existem** — o `<ColumnsToggle>` lista elas, e o usuário ainda pode marcá-las. O usuário pediu pra **remover** completamente — não esconder, deletar do código. Esses dados continuam disponíveis no drill-down (que já mostra).

### Princípios

1. **Layout fixo, conteúdo rola** — header + toolbar + thead estáticos; só `<tbody>` rola.
2. **YAGNI** — eliminar a opção "50 por página" (ninguém usa).
3. **Sem interação manual desnecessária** — substituir botão "Carregar mais" por infinite scroll automático.
4. **Deletar > esconder** — colunas removidas do código (não só do default visible).

---

## 2. Escopo

### 2.1 In-scope (3 requisitos)

| ID | Resumo |
|----|--------|
| **R1** | **Scroll interno**: container da tabela com altura calculada via `calc(100dvh - var(--page-header-h) - var(--toolbar-h) - 32px)` e `overflow-y-auto`. Page header (`<PageHeader>`) + toolbar de filtros (`<AdvancedFilters>`) + `<thead>` da tabela ficam estáticos no escopo da página; só o `<tbody>` rola. Footer (Carregar mais — substituído por sentinela) também fica fixo no rodapé da tabela. |
| **R2** | **Page size + infinite scroll**: opções reduzidas para `["100", "all"]`. Default `100`. Quando `100`, sentinela invisível no fim da lista dispara `loadMore()` via IntersectionObserver (sem botão manual). Quando `all`, fetch único até MAX_LIMIT (10000). Bug do dropdown corrigido — selecionar "Todos" agora refetcha de fato. |
| **R3** | **Remover colunas WhatsApp + Atributos** — deletar do array `COLUMNS` em `<ConversasTable>`. Limpa `MIGRATED_TO_DRILL_DOWN` (obsoleto), `SORT_OPTIONS` em `<AdvancedFilters>` (`phone`), e qualquer outra referência. Esses dados continuam exclusivamente no drill-down (`<ConversaDrillDown>`). |

### 2.2 Out-of-scope

- Virtualização de lista (precisaria de react-window/tanstack-virtual; "Todos" cap em 10000 mantém perf aceitável).
- Persistir scroll position entre navegações.
- Skeleton durante infinite scroll (loader inline já basta).
- Mudar comportamento do drill-down ao rolar (mantém expansão como está).
- Tocar em qualquer coisa do v0.11.0 (visibilidade de relatórios + LLM catalog) — outro agente está nisso.

---

## 3. Decisões de design

### 3.1 [R1] Scroll interno da tabela

#### Estrutura

```
<PageShell>            ← max-w 1600px, sem scroll próprio
  <PageHeader/>        ← fluido no topo (altura medida → --page-header-h)
  <ConversasPageClient>
    <AdvancedFilters/> ← sticky? Não — agora "fluid" também (não sticky).
                         Sticky deixaria o usuário rolar o page header pra fora
                         do viewport, o que não é o que o João pediu.
                         Solução: page-header e toolbar ambos no fluxo;
                         a tabela limita altura via dvh.
    <ConversasTable/>  ← container com altura calculada via:
                         max-h: calc(100dvh - var(--page-header-h) - var(--toolbar-h) - 32px)
                         Scroll interno aqui.
  </ConversasPageClient>
</PageShell>
```

#### Como medir alturas

- `<PageHeader>` recebe um `ref` em um `useLayoutEffect` que mede `getBoundingClientRect().height` e seta `--page-header-h` em `document.documentElement.style`. ResizeObserver mantém atualizado.
- `<AdvancedFilters>` já mede e seta `--toolbar-h`.
- Container da tabela usa `style={{ maxHeight: "calc(100dvh - var(--page-header-h, 96px) - var(--toolbar-h, 200px) - 32px)" }}` no wrapper que tem `overflow-y-auto`.

#### Layout final

```tsx
<div className="rounded-2xl border border-border bg-card overflow-hidden">
  {/* Toolbar interno (X conversas, Colunas, Page size) — fixo no topo do card */}
  <div className="border-b border-border/60 px-3 py-2.5">
    <ToolbarInterno/>
  </div>

  {/* Container scroll com thead sticky */}
  <div
    className="overflow-y-auto overflow-x-auto"
    style={{
      maxHeight:
        "calc(100dvh - var(--page-header-h, 96px) - var(--toolbar-h, 200px) - 32px)",
    }}
  >
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_rgb(var(--border)_/_0.6)]">
        ...
      </TableHeader>
      <TableBody>
        ...rows...
        <SentinelaInfiniteScroll/>  {/* só renderiza quando há cursor */}
      </TableBody>
    </Table>
  </div>

  {/* Footer com erro/empty (carregar mais sumiu — virou infinite scroll) */}
  {error ? <FooterErro/> : null}
</div>
```

- Sticky thead agora usa `top: 0` simples (não mais `var(--toolbar-h)`) porque o scroll é INTERNO ao container — o thead se prende no topo desse container.
- `--toolbar-h` e `--page-header-h` permanecem como CSS vars no `<html>` para o cálculo de altura do container.

#### Decisão sobre toolbar sticky vs fluid

O João disse: "ele só mexe as linhas da tabela. Ele mantém a estrutura dessa tela de relatório de conversa, mas ele, à medida que eu scrollar a tela, que eu rolar a tela, ele vai só rolar as linhas do relatório."

Isso descreve **scroll interno**. Page header e toolbar ficam no fluxo natural ACIMA da tabela; o page como um todo NÃO rola (max-h no body? Não — só na tabela). O resultado: usuário vê toolbar sempre, e quando rola dentro da tabela, só rows passam.

Removo `position: sticky` do toolbar (já que ele agora vive no fluxo natural acima da tabela limitada). O cálculo de altura da tabela via dvh mantém ela ocupando o espaço restante.

### 3.2 [R2] Page size + infinite scroll

#### Opções

```ts
const PAGE_SIZE_OPTIONS = [
  { value: "100", label: "100 por página" },
  { value: "all", label: "Todos" },
];
```

Default: `"100"`. Migração transparente: quem tem `"50"` em localStorage → vira `"100"` na primeira leitura.

#### Bug do dropdown

Investigação — `handlePageSizeChange` (`src/components/reports/conversas-table.tsx`) hoje:

```ts
const handlePageSizeChange = (next: string) => {
  if (next !== "50" && next !== "100" && next !== "all") return;
  if (next === pageSize) return;
  setPageSize(next);
  setError(null);
  const limit = PAGE_SIZE_LIMITS[next];
  startTransition(async () => {
    const result = await fetchConversas({ filters, cursor: null, accountId, limit });
    if (result.error) { setError(result.error); return; }
    setRows(result.rows);
    setCursor(next === "all" ? null : result.nextCursor);
  });
};
```

Bug suspeito: o `useEffect` que sincroniza `rows`/`cursor` com `initialRows`/`initialCursor` (adicionado em v0.9.1) **sobrescreve** o resultado de `handlePageSizeChange` quando `initialRows` permanece o mesmo (que é o caso — refetch usa `fetchConversas` direto, não passa por server). Mas o `useEffect` só dispara quando a referência de `initialRows` muda; `setRows` no transition cria nova referência local, não toca `initialRows`. Logo o useEffect não dispara — não é esse o bug.

Hipótese 2: **`PAGE_SIZE_LIMITS` ou `setPageSize` async** — `setPageSize` (do `useLocalStorageState`) provavelmente persiste async; mas `limit` é calculado na hora antes da chamada. OK.

Hipótese 3 (mais provável): no `handleApply`/`handleDialogApply` ou similar, depois de mudar filtros, há um refetch que **ignora pageSize atual** e usa default 50.

Investigar e corrigir. Possível fix simples: garantir que TODA chamada a `fetchConversas` (inclusive em `loadMore`) use `PAGE_SIZE_LIMITS[pageSize]`.

#### Infinite scroll

Componente sentinela:

```tsx
function InfiniteScrollSentinel({
  onIntersect,
  disabled,
}: {
  onIntersect: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled, onIntersect]);
  return (
    <tr ref={ref} aria-hidden="true">
      <td colSpan={99} className="h-1" />
    </tr>
  );
}
```

- Usa `rootMargin: "200px"` para começar a carregar antes do usuário chegar no fim.
- `disabled` quando `!cursor || pending` para evitar fetches duplicados.
- Fallback: footer com botão "Carregar mais" mantido APENAS quando o IntersectionObserver não funciona (jsdom, browsers muito antigos). Detectar via `typeof IntersectionObserver === "undefined"`.

### 3.3 [R3] Remover colunas WhatsApp + Atributos

#### Mudanças concretas

1. `src/components/reports/conversas-table.tsx`:
   - Deletar do array `COLUMNS` os objetos com `key: "phone"` e `key: "custom_attributes"`.
   - Deletar `getPhoneDisplay` (não usado mais — drill-down usa diretamente `formatPhone`).
   - Deletar `AttributeChips` (substituído pelo drill-down).
   - Deletar `formatAttrValue` (idem).
   - Atualizar `MIGRATED_TO_DRILL_DOWN` ou remover — não há mais migration porque não há mais coluna pra remover.
   - Limpar imports não usados.

2. `src/components/reports/advanced-filters.tsx`:
   - Remover `{ key: "phone", label: "WhatsApp" }` do array `SORT_OPTIONS`.

3. `src/components/reports/filters-dialog.tsx`:
   - **NÃO remover** `contact.phone_number` do query builder — é busca por valor (string), não coluna. Mantém.

4. `src/lib/hooks/use-migrated-local-storage.ts`:
   - Sem mudanças. Migration vXm sai obsoleta — mas mantém a função porque outros componentes podem usar no futuro.

5. Testes:
   - Atualizar `applied-filters-chips.test.tsx`, etc, se referenciarem `phone`.

#### Por que ainda existe `phone` no drill-down?

Drill-down (`<ConversaDrillDown>`) usa `row.contact.phone_number` direto via `formatPhone` para exibir o WhatsApp completo. Esse caminho não toca colunas — é um campo do detalhe.

---

## 4. Modelo de dados

### 4.1 LocalStorage

| Key | Antes | Agora |
|-----|-------|-------|
| `conversas-table-page-size` | `"50" \| "100" \| "all"` | `"100" \| "all"` (migra `"50"` → `"100"` na leitura) |
| `conversas-table-cols-v3` | inalterado | inalterado (já não tem phone/custom_attributes por default) |

### 4.2 CSS vars

| Var | Onde | Uso |
|-----|------|-----|
| `--page-header-h` | NOVO | Altura medida do `<PageHeader>` |
| `--toolbar-h` | existente | Altura medida do `<AdvancedFilters>` (mantida — pode reusar futuramente) |

---

## 5. Mudanças de queries / API

Nenhuma. `fetchConversas` já existe com `limit` e `cursor` — apenas o front consome diferente.

---

## 6. Detalhes de UX

- **Loader infinite scroll**: linha sentinela renderiza um pequeno `<Loader2 spin>` + "Carregando..." enquanto `pending` for true.
- **Empty state**: mantido.
- **Erro**: footer reaparece quando há erro com botão "Tentar novamente".
- **Spacing**: 4/8 px tokens.
- **Reduced motion**: `motion-safe:` no animate-in.

---

## 7. Acessibilidade

- WCAG AA mantido.
- Sentinela com `aria-hidden="true"` e `role` natural do `<tr>`.
- Loader inline com `aria-busy="true"` no container.
- Sticky thead com bg opaco (sem texto cortado por baixo).
- Skip link da v0.9.0 mantido.
- Foco do teclado: ao expandir uma linha (drill-down), foco vai pro botão "Abrir no Chatwoot" — comportamento existente.
- Screen reader: `aria-live="polite"` no contador "X conversas" (já existe).

---

## 8. Testes

### Unitários (Jest)

- `src/components/reports/__tests__/conversas-table.test.tsx` (novo ou atualizar) — cobre infinite scroll com IntersectionObserver mockado + fetchConversas mockado.
- Ajustar `applied-filters-chips.test.tsx` se algum caso usa `phone`.

### Smoke local

- `npm run dev`, abrir `/relatorios/conversas`:
  - Confirmar que page header + toolbar não rolam quando se rola a tabela.
  - Confirmar que selecionar "Todos" no dropdown traz mais que 50.
  - Confirmar que com "100" o scroll automático carrega mais ao chegar perto do fim.
  - Confirmar que `<ColumnsToggle>` não lista mais "WhatsApp" nem "Atributos".

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| `100dvh` não funciona em alguns Safari antigos | Fallback `100vh` via Tailwind — `min-h-dvh` aceita ambos |
| IntersectionObserver desabilitado em SSR | Disable inicial no client; só anexa após mount |
| Refetch perde scroll position | Aceito — quando filtra, faz sentido voltar ao topo |
| Outro agente está em v0.11.0 e pode bater no `package.json`/`CHANGELOG` | Coordenação: faço push primeiro como v0.10.4 (hotfix de UX), ele bumpa pra v0.11.0 depois. Sem conflito de arquivos com `claude-visibility-models` (escopo dele = settings, sidebar, llm catalog — não toca conversas-table.tsx) |

### Rollback

- `git revert <release-sha>` + push + redeploy. LocalStorage compat (cols-v3 e page-size já tinham defaults safe).

---

## 10. Apêndice — checklist (para o plan)

- [ ] **R1** — `<PageHeader>` mede altura via useLayoutEffect → `--page-header-h`
- [ ] **R1** — `<AdvancedFilters>` deixa de ser sticky (só fluid)
- [ ] **R1** — `<ConversasTable>` container scroll interno com `max-h` calculado via dvh
- [ ] **R1** — thead sticky `top: 0` interno (não mais `var(--toolbar-h)`)
- [ ] **R2** — `PAGE_SIZE_OPTIONS` reduzido para 2 + migration "50"→"100"
- [ ] **R2** — `<InfiniteScrollSentinel>` com IntersectionObserver
- [ ] **R2** — `loadMore` chamado via sentinela quando `pageSize === "100"`
- [ ] **R2** — Investigar e corrigir bug "100 mostra só 50"
- [ ] **R3** — Deletar coluna `phone` do COLUMNS
- [ ] **R3** — Deletar coluna `custom_attributes` do COLUMNS
- [ ] **R3** — Limpar `getPhoneDisplay`, `AttributeChips`, `formatAttrValue` (não-usados)
- [ ] **R3** — Remover `phone` de `SORT_OPTIONS` em `<AdvancedFilters>`
- [ ] **Bump v0.10.3 → v0.10.4 + CHANGELOG + push + portainer-fix**

---

**Spec final.** Pronta para writing-plans.
