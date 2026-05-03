# Conversas Fixes v0.29.0 — Plan (v3 final)

> 3 fixes pontuais reportados pelo João via screenshots após v0.27/v0.28 LIVE. Status: v3 final (passou por pente fino #1 com 22 achados + pente fino #2 com 6 achados).

**Goal:** corrigir X duplo no input de busca, X chips Filtros/Ordenação grandes/pesados, e colunas truncando texto.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 · base-ui.

---

## §0. Histórico double-check

### Pente fino #1 (v1 → v2) — 22 achados

1. F2 hover override: `hover:text-destructive` supera `text-muted-foreground` idle. ✓
2. F2 test regex frágil — substituir por checks simples (exact match patterns).
3. F2 size h-4 + offset `-right-1 -top-1` (era `-right-1.5 -top-1.5` com h-5).
4. F3 whitespace-normal multi-line — `measureElement` virtualizer já remede dinamicamente.
5. F3 colgroup com tableLayout: fixed contém wrap dentro da largura.
6. F3 remove `max-w-[Xpx]` redundante (substituído por colgroup).
7. F3 manter `text-sm`/`text-xs` por coluna como hoje.
8. F3 manter `title={name}` (ajuda screen readers).
9. F3 widths generosos pra reduzir wrap em casos comuns (240/180/160/200 px).
10. F1 `display: none` + `appearance: none` defensive layering.
11. F1 input search global afeta outros inputs (consistência aceita).
12. F2 sem bg idle reduz affordance — mitigação: cursor-pointer + aria-label + hover claro.
13. F2 transition + motion-safe animate-in mantém na transição count 0→1.
14. F3 break-words preserva unidades hifenadas (vs break-all que quebra qualquer char).
15. F3 mobile cards aplicam mesma mudança (consistência).
16. F1 CSS append no fim do `@layer base` em globals.css.
17. F2 `border-transparent` ou sem border idle — escolha: sem border (mais discreto).
18. F2 ícone interno `<X h-2.5 w-2.5>` proporcional a h-4.
19. F3 test smoke verifica `whitespace-normal` no className (jsdom não roda Tailwind).
20. F3 longos 40+ chars com 200px wrappam em 2-3 linhas — aceitável.
21. F2 atualizar test antigo que esperava `bg-destructive/15` idle — agora só no hover.
22. F2 sem alteração no aria-label (continua "Limpar todos os filtros" / "Limpar ordenação").

### Pente fino #2 (v2 → v3) — 6 achados

1. **F2 simplifica testes:** evita regex complexa com look-ahead — separa em asserts simples (`toMatch(/text-muted-foreground/)` no idle, `toMatch(/hover:text-destructive/)` no hover).
2. **F3 cell `text-foreground` para name vs `text-muted-foreground` para inbox/team/assignee** — mantém hierarquia visual.
3. **F1 ordering CSS rules:** `-webkit-` antes de `appearance` standard.
4. **F2 transition-colors** no className — incluir explicitamente para suavidade do hover.
5. **F3 `align: top` nas cells multi-line** — quando uma row tem 1 cell wrap mas outras single-line, alinhamento default é `middle` (parece desencaixado). Adicionar `align-top` na `<TableCell>` ou via CSS.
6. **F3 `align="top"` shadcn `<TableCell>`** — verificar se aceita prop. Senão usar className `align-top`.

---

## §1. Decisões finais

### F1. CSS global — esconder X nativo

Append em `src/app/globals.css` no fim:
```css
/* Esconde o X nativo do browser em <input type="search"> — usamos botão X
 * custom no canto direito (advanced-filters.tsx). Evita o X duplo
 * reportado pelo super_admin v0.28. */
input[type="search"]::-webkit-search-cancel-button,
input[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
```

### F2. X chips Filtros/Ordenação — discreto idle + hover vermelho + menor

`src/components/reports/advanced-filters.tsx` linhas 478, 506. Substituir className do `<button>` X em ambos os chips:

```tsx
className="absolute -right-1 -top-1 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
```

Ícone interno: `<X className="h-2.5 w-2.5" aria-hidden="true" />`.

### F3. Colunas Estado/Departamento/Atendente sem truncate

`src/components/reports/conversas-table.tsx`:

1. `COLUMN_WIDTHS` aumenta:
```ts
const COLUMN_WIDTHS: Record<string, string> = {
  expand: "40px",
  display_id: "80px",
  name: "240px",       // era 220
  document: "160px",
  inbox: "180px",      // era 140 (Estado)
  team: "160px",       // era 140 (Departamento)
  assignee: "200px",   // era 140 (Atendente)
  status: "120px",
  priority: "120px",
  waiting_seconds: "160px",
  open_seconds: "170px",
  created_at: "160px",
  last_activity_at: "180px",
};
```

2. Cells (desktop linhas 273-364, mobile linhas 970-1023) — trocar `block max-w-[Xpx] truncate` por `block whitespace-normal break-words`. 4 colunas afetadas (name, inbox, team, assignee), 8 lugares total.

3. `<TableCell>` ou wrapper divs nessas cells ganham `align-top` pra alinhamento consistente com cells single-line:
   - Verificar se `<TableCell>` shadcn aceita `align="top"` prop. Se não, usar className `align-top`.

---

## §2. Tasks

### Task 1 (F1): CSS global esconde X nativo

- [ ] Edit `src/app/globals.css` — append no fim (após o último `}` do `@layer base`):

```css
/* Esconde o X nativo do browser em <input type="search"> — usamos botão X
 * custom no canto direito (advanced-filters.tsx). Evita o X duplo
 * reportado pelo super_admin v0.28. */
input[type="search"]::-webkit-search-cancel-button,
input[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
```

- [ ] typecheck.
- [ ] Commit:
  ```bash
  git add src/app/globals.css
  git commit -m "fix(ui): F1 v0.29 — esconde X nativo do input[type=search] (evita X duplo)

  Bug reportado pelo João: input de busca em /relatorios/conversas mostrava
  dois X simultâneos — o X nativo macOS/Webkit + o X custom violet (h-5)
  que adicionei na v0.27 pra ter clear acessível.

  Fix: CSS global oculta ::-webkit-search-cancel-button + ::-webkit-search-decoration
  via -webkit-appearance: none + appearance: none + display: none. Aplicado
  em todos os <input type=\"search\"> da plataforma (consistência)."
  ```

### Task 2 (F2): X chips Filtros/Ordenação discreto idle + hover vermelho + menor

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill — mencione: "T2 X chips Filtros/Ordenação: idle discreto cinza igual ao X do search input (text-muted-foreground sem bg sem border), hover ganha vermelho fosco (bg-destructive/15 + text-destructive); tamanho diminuído sutilmente (h-4 + X h-2.5 — era h-5 + X h-3 da v0.27); offset ajustado pra h-4 (-right-1 -top-1)."

- [ ] **Failing tests** — atualiza `src/components/reports/__tests__/advanced-filters-x-style.test.tsx`. Substituir test "X dos chips ... fosco" pelo seguinte (asserts simples, sem regex complexa):

```tsx
it("X dos chips Filtros e Ordenação: idle discreto + hover destrutivo + h-4 (v0.29)", () => {
  render(<AdvancedFilters {...propsWithFiltersAndSort} />);
  const xFilters = screen.getByRole("button", { name: /Limpar todos os filtros/i });
  const xSort = screen.getByRole("button", { name: /Limpar ordenação/i });
  for (const el of [xFilters, xSort]) {
    const cls = el.getAttribute("class") ?? "";
    // Tamanho menor (h-4 vs h-5 da v0.27)
    expect(cls).toMatch(/h-4 w-4/);
    expect(cls).not.toMatch(/h-5 w-5/);
    // Idle discreto: text-muted-foreground, sem bg-destructive/border
    expect(cls).toMatch(/text-muted-foreground/);
    expect(cls).not.toMatch(/border-destructive/);
    // Hover destrutivo: bg-destructive/15 + text-destructive
    expect(cls).toMatch(/hover:bg-destructive\/15/);
    expect(cls).toMatch(/hover:text-destructive/);
    // Sem ring/scale exagerados da v0.25
    expect(cls).not.toMatch(/hover:ring-2/);
    expect(cls).not.toMatch(/hover:scale-110/);
    expect(cls).not.toMatch(/hover:text-white/);
  }
});
```

- [ ] Run test → expect FAIL.

- [ ] Edit `src/components/reports/advanced-filters.tsx` linhas 478 e 506 — substituir className em ambos os botões X:

```tsx
className="absolute -right-1 -top-1 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
```

E ícone interno em ambos:
```tsx
<X className="h-2.5 w-2.5" aria-hidden="true" />
```

- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
  ```bash
  git add src/components/reports/advanced-filters.tsx src/components/reports/__tests__/advanced-filters-x-style.test.tsx
  git commit -m "feat(conversas): F2 v0.29 — X chips Filtros/Ordenação discreto idle + hover vermelho + menor (h-4)

  João pediu comportamento igual ao X do search input: idle discreto cinza
  (sem bg, sem border, só o ícone) + hover vermelho fosco. Tamanho diminuído
  sutilmente (h-4 + X h-2.5 — era h-5 + X h-3 da v0.27).

  Antes: bg-destructive/15 + text-destructive + border-destructive/40 idle
  (chamava atenção demais permanente).
  Depois: text-muted-foreground idle (discreto) → hover:bg-destructive/15 +
  hover:text-destructive (vermelho fosco aparece no hover). Offset ajustado
  pra h-4 (-right-1 -top-1).

  Mantém: cursor-pointer, focus-visible:ring, motion-safe animate-in, aria-label."
  ```

### Task 3 (F3): Colunas Estado/Departamento/Atendente sem truncate

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill — mencione: "T3 colunas tabela conversas: trocar truncate por whitespace-normal break-words em Estado/Departamento/Atendente/Nome (texto completo, multi-line quando necessário). Aumentar COLUMN_WIDTHS pra reduzir wrap em casos comuns (180/160/200/240). Cells multi-line ganham align-top pra alinhamento consistente com cells single-line. Virtualizer measureElement (já existente) recalcula altura dinâmica."

- [ ] Edit `COLUMN_WIDTHS` em `conversas-table.tsx`:

```ts
const COLUMN_WIDTHS: Record<string, string> = {
  expand: "40px",
  display_id: "80px",
  name: "240px",       // 220→240
  document: "160px",
  inbox: "180px",      // 140→180 (Estado)
  team: "160px",       // 140→160 (Departamento)
  assignee: "200px",   // 140→200 (Atendente)
  status: "120px",
  priority: "120px",
  waiting_seconds: "160px",
  open_seconds: "170px",
  created_at: "160px",
  last_activity_at: "180px",
};
```

- [ ] Edit cells (desktop, 4 lugares):
  - **name** (linha ~273-279): troca className `block max-w-[220px] truncate text-sm font-medium text-foreground` por `block whitespace-normal break-words text-sm font-medium text-foreground`.
  - **inbox** (linha ~314-321): `block max-w-[160px] truncate text-xs text-muted-foreground` → `block whitespace-normal break-words text-xs text-muted-foreground`.
  - **team** (linha ~336-342): mesma troca.
  - **assignee** (linha ~358-364): mesma troca.

- [ ] Edit cells (mobile cards, 4 lugares — linhas ~970-1023): mesma troca.

- [ ] Cells da tabela ganham `align-top` (verificar `<TableCell>` shadcn):
  - Em `src/components/ui/table.tsx`, ver se `<TableCell>` tem `align` prop ou aceita `className` propagado. Se sim, adicionar className na `<TableCell>` que envolve essas cells, OU usar `align-top` no `<span>` interno.
  - Solução prática: adicionar `align-top` no `<TableCell>` JSX mais próximo de cada render render (ou className do span interno).

- [ ] **Smoke test** em `src/components/reports/__tests__/conversas-table.test.tsx`:

```tsx
it("colunas Estado/Departamento/Atendente NÃO truncam (v0.29)", () => {
  const longRow = {
    ...baseRow,
    inbox: { id: 1, name: "Distrito Federal Brasília Capital Nacional" },
    team: { id: 1, name: "Departamento de Atendimento Comercial" },
    assignee: { id: 1, name: "Maria Eduarda Carvalho Silva Santos" },
  };
  const { container } = render(<ConversasTable {...baseProps} initialRows={[longRow]} />);
  const wraps = container.querySelectorAll(".whitespace-normal");
  expect(wraps.length).toBeGreaterThan(0);
  // Não há mais .truncate nas cells de inbox/team/assignee
  const truncatedInBody = container.querySelectorAll("tbody .truncate");
  expect(truncatedInBody.length).toBe(0);
});
```

- [ ] Run tests → expect PASS (smoke + tests existentes).
- [ ] typecheck clean.
- [ ] Commit:
  ```bash
  git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
  git commit -m "feat(conversas): F3 v0.29 — colunas Estado/Departamento/Atendente sem truncate (whitespace-normal + larguras maiores)

  Bug reportado pelo João: colunas Estado/Departamento/Atendente cortavam
  texto com '...' em vez de mostrar nome completo. Causa: max-w-[160px] +
  truncate (white-space: nowrap) no className das cells.

  Fix: trocar truncate por whitespace-normal break-words; remover max-w
  (substituído pelo colgroup); aumentar COLUMN_WIDTHS — name 220→240,
  inbox 140→180 (Estado), team 140→160 (Departamento), assignee 140→200
  (Atendente). Cells viram multi-line quando texto longo; align-top
  alinha consistente com cells single-line; virtualizer measureElement
  recalcula altura dinâmica.

  Aplicado em desktop + mobile (8 lugares total)."
  ```

### Task 4: Release v0.29.0

- [ ] Bump `package.json`: 0.28.0 → 0.29.0.
- [ ] CHANGELOG entry v0.29.
- [ ] STATUS.md no topo.
- [ ] typecheck full + tests scope.
- [ ] Commit release.
- [ ] Push origin main.
- [ ] `gh workflow run "Portainer fix..."` --field app_version=v0.29.0.
- [ ] Monitor /api/health.

---

## §3. Riscos & Rollback

| Risco | Mitigação |
|---|---|
| F3 wrap multi-line aumenta altura das rows; estimateSize=48 inicial errado | `measureElement` (linha 705 atual) já remede dinamicamente. |
| F1 CSS global afeta outros inputs `type="search"` | Comportamento desejado (consistência). |
| F2 sem bg idle reduz affordance | Cursor-pointer + aria-label + hover claro mitigam. |
| F3 textos muito longos (40+ chars) wrappam em 3+ linhas | Aceito conforme João — "valores apareçam por completo". |

Rollback: `git revert <SHA release>` + push + portainer-fix com `app_version=v0.28.0`.

---

## §4. Self-Review v3 final

- [x] 3 fixes cobertos com 4 commits granulares + release.
- [x] TDD em F2 e F3 (F1 é CSS-only, smoke visual).
- [x] ui-ux-pro-max em F2 e F3.
- [x] CHANGELOG entry inclui as 3 mudanças.
- [x] STATUS.md release v0.29 no topo.
- [x] Coordenação multi-agente verificada (sem outros active).
- [x] Test asserts simplificados (sem regex com look-ahead).
- [x] align-top nas cells multi-line para alinhamento consistente.
