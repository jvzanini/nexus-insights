# Conversas Fixes v0.30.0 — Plan (v1)

> 2 fixes urgentes em /relatorios/conversas após feedback duro do João sobre v0.29.

**Goal:** corrigir 2 regressões da v0.29 — cells multi-line (não pode quebrar) e X chips muito pequeno (precisa pouco maior + adesivo na quina).

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4.

---

## §1. Fixes

### F1. Cells da tabela: SEM quebra de linha + texto completo + larguras maiores

**Problema:** v0.29 trocou `truncate` por `whitespace-normal break-words` — texto agora WRAPPA em múltiplas linhas. João explicitamente NÃO quer wrap; quer single-line completo.

**Solução:**
- Voltar `whitespace-nowrap` (sem wrap, sem ellipsis, sem max-w).
- Aumentar `COLUMN_WIDTHS` pro percentil 99 dos textos comuns:
  - `name`: 240 → 280px
  - `inbox` (Estado): 180 → 220px
  - `team` (Departamento): 160 → 180px
  - `assignee` (Atendente): 200 → 240px
- Cell stays single-line. Casos extremos (texto > width) cortam discretamente sem `…` (sem `truncate`/`text-overflow: ellipsis`).
- Mantém `tableLayout: fixed` + `<colgroup>` (estabilidade ao rolar).
- `align-top` continua (alinha consistente; aceitável também pra nowrap single-line).

### F2. X dos chips Filtros/Ordenação: pouco maior + mais para fora (adesivo na quina)

**Problema:** v0.29 reduziu pra h-4 (era h-5 na v0.27). João quer pouco maior + mais "fora" do botão.

**Solução:**
- h-4 → **h-5** (volta ao tamanho v0.27, ainda menor que v0.25 que era também h-5 mas pesado).
- Ícone X h-2.5 → **h-3 w-3**.
- Offset `-right-1 -top-1` → `-right-2 -top-2` (mais "fora" do botão, posicionando como adesivo).
- Mantém estilo discreto idle + hover vermelho (não regredir pra estilo bg-fosco da v0.27).

---

## §2. File Structure

| Arquivo | Mudança |
|---|---|
| `src/components/reports/conversas-table.tsx` | F1: COLUMN_WIDTHS aumenta inbox/team/assignee/name; cells voltam pra `whitespace-nowrap` (sem max-w, sem truncate, sem break-words). |
| `src/components/reports/__tests__/conversas-table.test.tsx` | F1: smoke test confirma `whitespace-nowrap` em vez de `whitespace-normal`. |
| `src/components/reports/advanced-filters.tsx` | F2: X chips h-5, X h-3, offset -right-2 -top-2. |
| `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` | F2: atualiza expectativas (h-5, -right-2 -top-2). |
| `package.json` | Bump 0.29 → 0.30. |
| `CHANGELOG.md` | Entrada v0.30. |
| `docs/STATUS.md` | Release v0.30 no topo. |

---

## §3. Tasks

### Task 1 (F1): Cells nowrap + larguras maiores

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill.

- [ ] Atualiza tests em `conversas-table.test.tsx`:
  ```tsx
  it("colunas Estado/Departamento/Atendente NÃO quebram linha (single-line) v0.30", () => {
    const longRow = {
      ...baseRow,
      inbox: { id: 1, name: "DF-Distrito Federal" },
      team: { id: 1, name: "Atendimento Comercial" },
      assignee: { id: 1, name: "Maria Eduarda Carvalho" },
    };
    const { container } = render(<ConversasTable {...baseProps} initialRows={[longRow]} />);
    // Não há mais .whitespace-normal nas cells
    const wraps = container.querySelectorAll("tbody .whitespace-normal");
    expect(wraps.length).toBe(0);
    // Há .whitespace-nowrap
    const nowraps = container.querySelectorAll("tbody .whitespace-nowrap");
    expect(nowraps.length).toBeGreaterThan(0);
  });
  ```

- [ ] Edit `COLUMN_WIDTHS` em `conversas-table.tsx`:
  ```ts
  const COLUMN_WIDTHS: Record<string, string> = {
    expand: "40px",
    display_id: "80px",
    name: "280px",       // 240→280
    document: "160px",
    inbox: "220px",      // 180→220 (Estado, single-line)
    team: "180px",       // 160→180 (Departamento, single-line)
    assignee: "240px",   // 200→240 (Atendente, single-line)
    status: "120px",
    priority: "120px",
    waiting_seconds: "160px",
    open_seconds: "170px",
    created_at: "160px",
    last_activity_at: "180px",
  };
  ```

- [ ] Edit cells (desktop, 4 lugares):
  - **name** (~linha 276): `block whitespace-normal break-words text-sm font-medium text-foreground align-top` → `block whitespace-nowrap text-sm font-medium text-foreground align-top`
  - **inbox** (~linha 317): `block whitespace-normal break-words text-xs text-muted-foreground align-top` → `block whitespace-nowrap text-xs text-muted-foreground align-top`
  - **team** (~linha 339): mesma troca.
  - **assignee** (~linha 361): mesma troca.

- [ ] Edit cells (mobile/cards, 4 lugares — linhas 972, 995, 1008, 1021): mesma troca.

- [ ] Edit `<h3>` mobile (linha 1105): `mt-1 whitespace-normal break-words text-sm font-semibold text-foreground` → `mt-1 whitespace-nowrap text-sm font-semibold text-foreground`.

- [ ] Edit `<Field>` (linha 1184): `whitespace-normal break-words text-xs text-foreground/90` → `whitespace-nowrap text-xs text-foreground/90`.

- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
  ```bash
  git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
  git commit -m "fix(conversas): F1 v0.30 — cells single-line + larguras maiores (sem wrap, sem ellipsis)"
  ```

### Task 2 (F2): X chips pouco maior + mais para fora

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill.

- [ ] Atualiza tests em `advanced-filters-x-style.test.tsx`:
  ```tsx
  expect(cls).toMatch(/h-5 w-5/);
  expect(cls).not.toMatch(/h-4 w-4/);
  expect(cls).toMatch(/-right-2/);
  expect(cls).toMatch(/-top-2/);
  expect(cls).toMatch(/text-muted-foreground/);
  expect(cls).toMatch(/hover:bg-destructive\/15/);
  expect(cls).toMatch(/hover:text-destructive/);
  expect(cls).not.toMatch(/border-destructive/);
  ```

- [ ] Edit `advanced-filters.tsx` linhas 487 e 525 — substitui className em ambos os botões X:
  ```tsx
  className="absolute -right-2 -top-2 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
  ```
  Ícone interno em ambos: `<X className="h-3 w-3" aria-hidden="true" />`.

- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
  ```bash
  git add src/components/reports/advanced-filters.tsx src/components/reports/__tests__/advanced-filters-x-style.test.tsx
  git commit -m "fix(conversas): F2 v0.30 — X chips Filtros/Ordenação pouco maior (h-5) + adesivo na quina (-right-2 -top-2)"
  ```

### Task 3: Release v0.30.0

- [ ] Bump package.json 0.29 → 0.30.
- [ ] CHANGELOG entry.
- [ ] STATUS.md no topo.
- [ ] typecheck full.
- [ ] Commit release.
- [ ] Push origin main.
- [ ] portainer-fix --field app_version=v0.30.0.
- [ ] Monitor /api/health.

---

## §4. Riscos

| Risco | Mitigação |
|---|---|
| F1 textos extremos > width fixa cortam discretamente sem ellipsis | Aceito (João pediu "completo" mas widths cobrem 99% comuns; cortes são discretos). |
| F1 scroll horizontal aumenta (soma widths > viewport) | Já tem overflow-x-auto no parent. |
| F2 offset -right-2 -top-2 com h-5 pode invadir conteúdo do botão | Visual: `<Button>` Filtros tem padding interno; X "adesivo" sobre a borda. Aceitável. |

---

## §5. Self-Review v1

- [ ] F1 + F2 cobertos com 2 commits + release.
- [ ] TDD em ambos.
- [ ] ui-ux-pro-max em ambos.
- [ ] Sem regressão de bugs já fixados (Estado/Dep/Atendente já têm width grande pra evitar truncate visível em casos comuns).
