# Conversas Fixes v0.27.0 — Plan v2 (deltas sobre v1)

> Após pente fino #1 sobre v1: 22 achados reais aplicados. v2 lista APENAS os deltas; consultar `-v1.md` para o contexto completo das tasks.

## §0. Achados pente fino #1 (v1 → v2)

1. **F2 render `EllipsisDropdown` ranges:** explicitar lógica por idx — quando há 1 ellipsis (edge case): `[2..N-1]`. Quando há 2 ellipsis (atual no meio): idx esquerda → `[2..page-1]`, idx direita → `[page+1..N-1]`.
2. **F2 `rangeToPages`:** confirma restauração da função (foi deletada em T6 v0.25).
3. **F2 tests existentes:** atualizar (não deletar) com novos `expect(...)` esperando `"ellipsis"`. Smoke do EllipsisDropdown render.
4. **F3 lupa color:** usar `data-search-icon` no `<Search>` para o test querySelector (lucide aceita data-attrs).
5. **F3 X aria-label "Limpar busca":** evita conflito com X dos chips ("Limpar todos os filtros").
6. **F4 não remover `phoneVariants`/`documentVariants`:** continuam alimentando o haystack com formatos. Só remove a heurística digits-only.
7. **F4 test "11 98765-4321":** atualizar para esperar `toHaveLength(0)` (substring com parens entre não bate). Documentar comportamento esperado.
8. **F4 test "5511987654321"** continua passando porque digits raw está no haystack.
9. **F4 test "98765-4321"** continua passando porque é substring contígua do `formatPhone` output.
10. **F5 contraste WCAG:** `text-destructive` direto (sem `dark:`) sobre `bg-destructive/15` — Tailwind destrutivo é vermelho com luminância ~50%; WCAG 2.1 AA atinge ~4.5:1 com bg low-opacity. OK.
11. **F6 Calendar DayButton:** adicionar AMBOS `disabled:cursor-not-allowed aria-disabled:cursor-not-allowed` (react-day-picker varia entre os 2).
12. **F7 colgroup com keys dinâmicas:** quando user oculta coluna via ColumnsToggle, colgroup recalcula (filter por `orderedColumns`). OK.
13. **F7 `expand` column** tem `defaultOrder: -1` — confirma inclusão em orderedColumns.
14. **F7 textos longos vazam:** `truncate` + `title` HTML já existem nas cells. OK.
15. **F8 + F9 manter juntas:** ambas tocam `conversas-tour.ts`. Commit único.
16. **F9 escopo "Chatwoot" → "Nexus Chat":** apenas em `/relatorios/conversas` UI:
    - `conversas-table.tsx:184-185` (OpenIdLink title + aria-label).
    - `conversas-tour.ts` (open-action title + description).
    - `open-in-chatwoot.tsx` aria-label (componente usado por mensagens-nao-respondidas + dashboard/no-response — escopo broader, mas a string user-facing visível é só "Abrir" — só aria muda).
    - **DEIXA pra release dedicada:** `chatwoot-urls-card.tsx`, `audits-table.tsx`, `user-form-dialog.tsx`, `login-branding.tsx`, `stale-banner.tsx`. Justificativa: escopo distinto + decisões de branding (audit logs históricos não devem mudar retroativamente; login branding precisa decisão).
17. **F1 + F2 separar tasks:** F1 é one-liner (page-client constant); F2 é refator de paginação (algoritmo + EllipsisDropdown). Manter como T1 e T2 separados (commits granulares).
18. **F1 `PAGE_SIZE_CLIENT 1000`:** ConversasTable já tem virtualizer (overscan 8); 1000 rows hidratadas é fine (não renderiza todos simultaneamente).
19. **F3 `data-state` ou attr custom:** `data-search-icon` é mais explícito que CSS attr selector. OK escolha.
20. **F4 test novo "3380 vs 3803":** prioritário — é o bug reportado pelo João. Garantir que está no test set.
21. **F7 width 1080px (soma)** — orderedColumns visível default tem ~10 colunas: 80+220+140+140+140+120+120+160+170+160+180 = 1630px. Cabe em 1920px desktop. Em 1280px aciona scroll horizontal. Aceitável (já tem overflow-x-auto no parent).
22. **§5 Risco F4 "telefones com máscara arbitrária":** documentar no CHANGELOG entry.

## §1. Deltas do plan (aplicar sobre v1)

### Task 2 (F2) — refinamentos

`<EllipsisDropdown>` ranges por idx:

```tsx
{items.map((it, idx) => {
  if (it === "ellipsis") {
    let start = 2;
    let end = totalPages - 1;
    const ellipsisCount = items.filter((i) => i === "ellipsis").length;
    if (ellipsisCount === 2) {
      // [1, "ellipsis", page, "ellipsis", N]
      // idx 1 → esquerda; idx 3 → direita
      if (idx === 1) {
        start = 2;
        end = page - 1;
      } else {
        start = page + 1;
        end = totalPages - 1;
      }
    }
    // Se ellipsisCount === 1 (atual=1 ou N), range é [2..N-1] (já default).
    return (
      <EllipsisDropdown
        key={`e${idx}`}
        pages={rangeToPages(start, end)}
        onSelect={onPageChange}
      />
    );
  }
  // ... resto idêntico ao v1
})}
```

### Task 4 (F4) — testes precisos

Atualizar:

```ts
// REMOVE caso "11 98765-4321" matches "+55 (11) 98765-4321" (não bate mais).
// Substituir por:
it("phone com máscara diferente do haystack NÃO bate (parens entre)", () => {
  // Comportamento intencional após v0.27: match respeita ordem dos caracteres.
  expect(matchSearchClient([baseRow], "11 98765-4321")).toHaveLength(0);
});

// MANTÉM:
it("digits raw bate", () => {
  expect(matchSearchClient([baseRow], "5511987654321")).toHaveLength(1);
});
it("substring contígua do formato bate", () => {
  expect(matchSearchClient([baseRow], "98765-4321")).toHaveLength(1);
});

// ADICIONA (regressão fixada):
it("'3380' NÃO bate em row com display_id 3803 (caracteres iguais ordem diferente)", () => {
  const r = { ...baseRow, display_id: 3803, contact: { ...baseRow.contact, phone_number: null, identifier: null } };
  expect(matchSearchClient([r], "3380")).toHaveLength(0);
});
```

### Task 6 (F6) — calendar com 2 attrs

```tsx
className={cn(
  "cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
  // ... resto
)}
```

### Task 8 (F9) — escopo limitado

Renomear apenas em:
- `src/components/reports/conversas-table.tsx:184-185`
- `src/lib/tours/conversas-tour.ts:97-99`
- `src/components/reports/open-in-chatwoot.tsx:18` (aria-label)

NÃO mexer em: `chatwoot-urls-card`, `audits-table`, `user-form-dialog`, `login-branding`, `stale-banner` (release dedicada futura).

## §2. Mudança no §6 Self-review v1

Substituir checklist por:
- [ ] F1-F9 cobertos com 8 commits granulares + 1 release.
- [ ] TDD em F2, F3, F4, F5.
- [ ] ui-ux-pro-max invocada em F3, F5, F7.
- [ ] CHANGELOG entry inclui aviso "match respeita ordem dos caracteres" (impacta busca de telefones com máscaras divergentes).
- [ ] STATUS.md release v0.27.0 no topo.
- [ ] "Chatwoot" → "Nexus Chat" só em 3 arquivos do escopo `/relatorios/conversas`.

## §3. Pronto pra pente fino #2

Próximo passo: revisão mais profunda de v2 → v3 final (`-design.md`).
