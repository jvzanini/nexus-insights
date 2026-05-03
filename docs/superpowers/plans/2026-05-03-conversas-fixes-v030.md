# Conversas Fixes v0.30.0 — Plan (v3 final)

> 2 fixes urgentes em /relatorios/conversas após feedback duro do João sobre v0.29.

**Goal:** corrigir 2 regressões da v0.29 — cells multi-line (precisa single-line) e X chips muito pequeno (precisa pouco maior + adesivo na quina).

**Status:** v3 final (passou por pente fino #1 com 15 achados + pente fino #2 com 7 achados).

---

## §0. Histórico double-check

### Pente fino #1 (v1 → v2) — 15 achados (mais críticos)

1. **F1 `overflow-hidden` faltando** — sem ele, texto single-line pode vazar pra coluna vizinha. CRÍTICO.
2. F1 `align-top` adicionado em v0.29 (pra multi-line) — REMOVER agora (single-line cells alinham melhor com `align-middle` default).
3. F1 `<h3>` e `<Field>` mobile aplicam mesma mudança (consistência).
4. F1 cells "Status"/"Prioridade" badges já são single-line (não tocar).
5. F1 cells "Sem resposta há"/"Aberta há" já têm `whitespace-nowrap`.
6. F1 widths novas somam ~2110px desktop — cabe em 1920px com scroll-x mínimo.
7. F1 sem ellipsis (clip default) — corte abrupto na borda.
8. F2 offset `-right-2 -top-2` com h-5 cobre 8px da borda do botão — visualmente "adesivo".
9. F2 z-10 garante X acima do conteúdo do botão.
10. F2 motion-safe animate-in continua relevante (transição count 0→1).
11. F1 `text-overflow: clip` (default) preserva o que cabe sem `...`.
12. F1 com `tableLayout: fixed` + `colgroup` + `whitespace-nowrap`, cell trunca pelo width do col.
13. F2 manter focus-visible:ring + cursor-pointer.
14. F1 algum nome próximo do limite: ex "Maria de Lourdes Silva Carvalho" (30 chars) cabe em 240px se char é ~7.5px. Casos extremos cortam 1-2 chars. Aceitável.
15. F1 botão Filtros + X "adesivo" -right-2: confirma que X não cobre o ícone Filter (`<Filter>` está à esquerda do label, não à direita).

### Pente fino #2 (v2 → v3) — 7 achados

1. **`<TableCell>` shadcn default `overflow: visible`** — confirma necessidade de `overflow-hidden` no span interno.
2. F2 `ring-offset-card` sem efeito sem `bg-card` adjacente — pode simplificar removendo (mas mantém `ring-offset-1` por consistência cross-browser).
3. F1 testes smoke verificam `.whitespace-nowrap` count > 0 em tbody (jsdom OK com classes como atributo).
4. F1 `<h3>` mobile linha 1105 e `<Field>` linha 1184 também ganham `overflow-hidden` (consistência).
5. F1 não tocar status/priority/durations (já single-line).
6. F2 botão Filtros tem padding interno generoso — X em -right-2 / -top-2 não cobre ícone Filter (à esquerda) nem texto.
7. F1 `align-top` removido das cells single-line — sem ele, default `align-middle` centraliza vertical (mais natural).

---

## §1. Decisões finais

### F1. Cells da tabela: SEM quebra de linha + texto completo + larguras maiores

`src/components/reports/conversas-table.tsx`:

1. `COLUMN_WIDTHS` aumenta:
```ts
const COLUMN_WIDTHS: Record<string, string> = {
  expand: "40px",
  display_id: "80px",
  name: "280px",       // 240→280
  document: "160px",
  inbox: "220px",      // 180→220 (Estado)
  team: "180px",       // 160→180 (Departamento)
  assignee: "240px",   // 200→240 (Atendente)
  status: "120px",
  priority: "120px",
  waiting_seconds: "160px",
  open_seconds: "170px",
  created_at: "160px",
  last_activity_at: "180px",
};
```

2. Cells (desktop linhas 276/317/339/361 + mobile 972/995/1008/1021): trocam `block whitespace-normal break-words ... align-top` por `block whitespace-nowrap overflow-hidden ...` (sem `align-top`, sem `break-words`).

3. `<h3>` mobile (linha 1105) e `<Field>` (linha 1184): mesma troca, mantém estilo próprio.

### F2. X chips Filtros/Ordenação: pouco maior + adesivo na quina

`src/components/reports/advanced-filters.tsx` linhas 487, 525:

```tsx
className="absolute -right-2 -top-2 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
```

Ícone interno: `<X className="h-3 w-3" aria-hidden="true" />`.

---

## §2. File Structure

| Arquivo | Mudança |
|---|---|
| `src/components/reports/conversas-table.tsx` | F1: COLUMN_WIDTHS + cells nowrap + overflow-hidden + remove align-top/break-words. |
| `src/components/reports/__tests__/conversas-table.test.tsx` | F1: smoke test atualizado. |
| `src/components/reports/advanced-filters.tsx` | F2: X chips h-5, X h-3, offset -right-2 -top-2. |
| `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` | F2: expectativas atualizadas. |
| `package.json` | Bump 0.29 → 0.30. |
| `CHANGELOG.md` | Entrada v0.30. |
| `docs/STATUS.md` | Release v0.30 no topo. |

---

## §3. Tasks

### Task 1 (F1): Cells single-line + overflow-hidden + larguras maiores

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` — mencione: "T1 cells da tabela conversas: voltar pra whitespace-nowrap (single-line) com overflow-hidden (sem vazar pra coluna vizinha) e remover align-top (default middle melhor pra single-line); aumentar COLUMN_WIDTHS pra acomodar percentil 99 dos textos comuns. Sem ellipsis (clip default)."

- [ ] Atualiza tests em `conversas-table.test.tsx` — substitui o smoke test v0.29:
  ```tsx
  it("colunas Estado/Departamento/Atendente NÃO quebram linha (single-line) v0.30", () => {
    const longRow = {
      ...baseRow,
      inbox: { id: 1, name: "DF-Distrito Federal" },
      team: { id: 1, name: "Atendimento Comercial" },
      assignee: { id: 1, name: "Maria Eduarda Carvalho" },
    };
    const { container } = render(<ConversasTable {...baseProps} initialRows={[longRow]} />);
    // Não há mais .whitespace-normal em cells da tbody (regressão da v0.29)
    const wraps = container.querySelectorAll("tbody .whitespace-normal");
    expect(wraps.length).toBe(0);
    // whitespace-nowrap aplicado
    const nowraps = container.querySelectorAll("tbody .whitespace-nowrap");
    expect(nowraps.length).toBeGreaterThan(0);
  });
  ```

- [ ] Edit `COLUMN_WIDTHS` em `conversas-table.tsx` (linha ~121):
  ```ts
  const COLUMN_WIDTHS: Record<string, string> = {
    expand: "40px",
    display_id: "80px",
    name: "280px",       // v0.30: 240→280 (single-line completo)
    document: "160px",
    inbox: "220px",      // v0.30: 180→220 (Estado, single-line)
    team: "180px",       // v0.30: 160→180 (Departamento, single-line)
    assignee: "240px",   // v0.30: 200→240 (Atendente, single-line)
    status: "120px",
    priority: "120px",
    waiting_seconds: "160px",
    open_seconds: "170px",
    created_at: "160px",
    last_activity_at: "180px",
  };
  ```

- [ ] Edit cells (4 lugares no array `COLUMNS` desktop):
  - **name** (~linha 276): `block whitespace-normal break-words text-sm font-medium text-foreground align-top` → `block whitespace-nowrap overflow-hidden text-sm font-medium text-foreground`
  - **inbox** (~linha 317): `block whitespace-normal break-words text-xs text-muted-foreground align-top` → `block whitespace-nowrap overflow-hidden text-xs text-muted-foreground`
  - **team** (~linha 339): mesma troca.
  - **assignee** (~linha 361): mesma troca.

- [ ] Edit cells mobile (4 lugares — linhas 972, 995, 1008, 1021): mesma troca correspondente.

- [ ] Edit `<h3>` mobile (linha 1105): `mt-1 whitespace-normal break-words text-sm font-semibold text-foreground` → `mt-1 whitespace-nowrap overflow-hidden text-sm font-semibold text-foreground`.

- [ ] Edit `<Field>` (linha 1184): `whitespace-normal break-words text-xs text-foreground/90` → `whitespace-nowrap overflow-hidden text-xs text-foreground/90`.

- [ ] Run `npx jest src/components/reports/__tests__/conversas-table.test.tsx` → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
  ```bash
  git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
  git commit -m "fix(conversas): F1 v0.30 — cells single-line + overflow-hidden + larguras maiores

João reportou que v0.29 bagunçou as cells (whitespace-normal break-words quebrava
em múltiplas linhas — texto multi-line). Pediu single-line + texto completo +
sem mexer em larguras toda hora.

Fix: voltar whitespace-nowrap (single-line) com overflow-hidden (sem vazar pra
coluna vizinha); remove align-top (default middle natural pra single-line);
remove break-words. COLUMN_WIDTHS aumentadas pra cobrir percentil 99 dos
textos comuns: name 240→280, inbox 180→220 (Estado), team 160→180 (Departamento),
assignee 200→240 (Atendente). Sem ellipsis — casos extremos cortam discretamente
(text-overflow clip default). Aplicado em desktop + mobile (8 lugares + h3 + Field)."
  ```

### Task 2 (F2): X chips pouco maior + adesivo na quina

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` — mencione: "T2 X chips Filtros/Ordenação: aumentar de h-4 pra h-5 (pouco maior) + ícone X 2.5→3 + offset -right-1/-top-1 → -right-2/-top-2 (adesivo na quina superior direita do botão, mais 'fora' do botão). Mantém estilo discreto idle + hover vermelho da v0.29."

- [ ] Atualiza tests em `advanced-filters-x-style.test.tsx` — substitui asserts v0.29:
  ```tsx
  it("X dos chips Filtros e Ordenação: pouco maior (h-5) + adesivo (-right-2 -top-2) v0.30", () => {
    render(<AdvancedFilters {...propsWithFiltersAndSort} />);
    const xFilters = screen.getByRole("button", { name: /Limpar todos os filtros/i });
    const xSort = screen.getByRole("button", { name: /Limpar ordenação/i });
    for (const el of [xFilters, xSort]) {
      const cls = el.getAttribute("class") ?? "";
      // Tamanho pouco maior (h-5 vs h-4 da v0.29)
      expect(cls).toMatch(/h-5 w-5/);
      expect(cls).not.toMatch(/h-4 w-4/);
      // Offset mais "fora" (adesivo)
      expect(cls).toMatch(/-right-2/);
      expect(cls).toMatch(/-top-2/);
      expect(cls).not.toMatch(/-right-1\b/); // não pode ser -right-1 sozinho
      // Idle discreto: text-muted-foreground, sem bg-destructive/border idle
      expect(cls).toMatch(/text-muted-foreground/);
      expect(cls).not.toMatch(/border-destructive/);
      // Hover destrutivo: bg-destructive/15 + text-destructive
      expect(cls).toMatch(/hover:bg-destructive\/15/);
      expect(cls).toMatch(/hover:text-destructive/);
    }
  });
  ```

- [ ] Edit `advanced-filters.tsx` linhas 487 e 525 — substitui className em ambos os botões X:
  ```tsx
  className="absolute -right-2 -top-2 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
  ```

- [ ] Edit ícone interno em ambos:
  ```tsx
  <X className="h-3 w-3" aria-hidden="true" />
  ```

- [ ] Run `npx jest src/components/reports/__tests__/advanced-filters-x-style.test.tsx` → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
  ```bash
  git add src/components/reports/advanced-filters.tsx src/components/reports/__tests__/advanced-filters-x-style.test.tsx
  git commit -m "fix(conversas): F2 v0.30 — X chips Filtros/Ordenação pouco maior (h-5) + adesivo na quina (-right-2 -top-2)

João reportou que v0.29 reduziu demais (h-4) e ficou muito pra dentro
do botão. Pediu: pouco maior + mais 'fora' do botão como adesivo na
quina superior direita.

Fix: h-4→h-5 (volta ao tamanho v0.27 mas com estilo discreto da v0.29)
+ ícone X 2.5→3 + offset -right-1/-top-1 → -right-2/-top-2 (mais 'fora'
do botão, posicionando como adesivo). Mantém estilo discreto idle
(text-muted-foreground sem bg/border) + hover vermelho fosco
(bg-destructive/15 + text-destructive)."
  ```

### Task 3: Release v0.30.0

- [ ] Bump `package.json` 0.29 → 0.30.
- [ ] CHANGELOG entry.
- [ ] STATUS.md no topo.
- [ ] typecheck full + tests scope.
- [ ] Commit release.
- [ ] Push origin main.
- [ ] `gh workflow run "Portainer fix..."` --field app_version=v0.30.0.
- [ ] Monitor /api/health.

---

## §4. Riscos & Rollback

| Risco | Mitigação |
|---|---|
| F1 textos > col width cortam discretamente sem ellipsis | Aceito conforme João (widths grandes cobrem 99%). |
| F1 scroll horizontal (~2110px soma) | Já tem overflow-x-auto. |
| F2 X "adesivo" -right-2 -top-2 invade espaço do conteúdo | Visual: padding interno do botão protege; X cobre só borda. |

Rollback: `git revert <SHA release>` + push + portainer-fix com `app_version=v0.29.0`.

---

## §5. Self-Review v3 final

- [x] 2 fixes cobertos com 2 commits + release.
- [x] TDD em ambos.
- [x] ui-ux-pro-max em ambos.
- [x] CHANGELOG entry inclui as 2 mudanças (F1 single-line, F2 adesivo).
- [x] STATUS.md release v0.30 no topo.
- [x] Coordenação multi-agente verificada (sem outros active).
- [x] overflow-hidden adicionado nas cells (P1 do pente fino #1 — crítico).
- [x] align-top removido (P12 — single-line não precisa).
