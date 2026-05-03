# Conversas Fixes v0.29.0 — Plan (v1)

> 3 fixes pontuais reportados pelo João via screenshots após v0.27/v0.28 LIVE.

**Goal:** corrigir X duplo no input search, X chips Filtros/Ordenação muito grandes/pesados, e colunas da tabela truncando texto.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 · base-ui.

---

## §1. Fixes

### F1. X duplo no input de busca → esconde X nativo do browser
- **Problema:** `<input type="search">` mostra X nativo macOS/Webkit + X custom h-5 violet — dois X visíveis.
- **Solução:** CSS global escondendo X nativo:
  ```css
  input[type="search"]::-webkit-search-cancel-button,
  input[type="search"]::-webkit-search-decoration { -webkit-appearance: none; appearance: none; display: none; }
  input[type="search"] { /* IE/Edge legacy */ }
  ```
  Append em `src/app/globals.css` no fim do `@layer base { ... }`.
- **Files:** `src/app/globals.css`.

### F2. X chips Filtros/Ordenação: discreto idle + hover vermelho + tamanho menor
- **Problema:** atual `bg-destructive/15 + text-destructive + border-destructive/40 + h-5` (estilo "bg fosco" que apliquei em v0.27) ainda chama atenção demais idle. João quer comportamento igual ao X do search: discreto cinza idle, vermelho hover, MENOR.
- **Solução:** trocar o className dos 2 botões X (linhas 478, 506 de `advanced-filters.tsx`):
  - Idle: sem bg/border, só `text-muted-foreground` (cinza discreto), `h-4 w-4`, ícone `<X h-2.5 w-2.5>`.
  - Hover: `hover:bg-destructive/15 hover:text-destructive` (vermelho fosco — mantém vermelho do hover).
  - Mantém: `cursor-pointer focus-visible:ring-2 motion-safe:animate-in`.
- **Files:** `src/components/reports/advanced-filters.tsx`, `src/components/reports/__tests__/advanced-filters-x-style.test.tsx`.

### F3. Colunas Estado/Departamento/Atendente sem truncate
- **Problema:** `truncate` corta nomes ("CE-Ceará..." ou "Hevelyn Damacena" cortado).
- **Solução:**
  - Aumentar `COLUMN_WIDTHS` para `inbox`, `team`, `assignee`, `name`:
    - `name`: 220 → 240
    - `inbox` (Estado): 140 → 180
    - `team` (Departamento): 140 → 160
    - `assignee` (Atendente): 140 → 200
  - Trocar `truncate` por `whitespace-normal break-words` no className das cells dessas 4 colunas (lines 276, 317, 339, 361 — desktop; 972, 995, 1008, 1021 — mobile).
  - Remover `max-w-[Xpx]` (substituído pelo colgroup).
  - Resultado: célula multi-line quando texto longo; virtualizer já tem `measureElement` que recalcula altura dinâmica.
- **Files:** `src/components/reports/conversas-table.tsx`.

---

## §2. Tasks

### Task 1 (F1): Esconder X nativo do input search
- [ ] Append em `src/app/globals.css` (no fim, após `@layer base`):
  ```css
  /* Esconde o X nativo do browser em <input type="search"> — usamos um
   * botão X custom no canto direito (advanced-filters.tsx) que evita o X
   * duplo reportado pelo super_admin v0.28. */
  input[type="search"]::-webkit-search-cancel-button,
  input[type="search"]::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
    display: none;
  }
  ```
- [ ] typecheck (CSS não afeta TS).
- [ ] Commit: `fix(ui): F1 v0.29 — esconde X nativo do input[type=search] (evita X duplo)`.

### Task 2 (F2): X chips Filtros/Ordenação discreto + menor
**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill.

- [ ] Tests atualizados em `advanced-filters-x-style.test.tsx`:
  ```ts
  expect(cls).toMatch(/h-4 w-4/);
  expect(cls).toMatch(/text-muted-foreground/);
  expect(cls).toMatch(/hover:bg-destructive\/15/);
  expect(cls).toMatch(/hover:text-destructive/);
  expect(cls).not.toMatch(/^.*\bbg-destructive\/15(?!\b.*hover:)/m); // sem bg-destructive idle
  expect(cls).not.toMatch(/border-destructive\/40/); // sem border idle
  ```
- [ ] Edit lines 478, 506 de `advanced-filters.tsx` — substituir className do `<button>` X:
  ```tsx
  className="absolute -right-1 -top-1 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
  ```
  E ícone interno: `<X className="h-2.5 w-2.5" aria-hidden="true" />`.
- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit: `feat(conversas): F2 v0.29 — X chips Filtros/Ordenação discreto idle + hover vermelho + menor (h-4)`.

### Task 3 (F3): Colunas sem truncate
**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill.

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
- [ ] Edit cells (desktop + mobile, 8 lugares):
  - `name` (linhas 273-279, 970-975): troca `block max-w-[220px] truncate` por `block whitespace-normal break-words`.
  - `inbox` (linhas 314-321, 992-998): troca `block max-w-[160px] truncate` por `block whitespace-normal break-words`.
  - `team` (linhas 336-342, 1005-1010): mesma troca.
  - `assignee` (linhas 358-364, 1018-1023): mesma troca.
- [ ] Smoke test em `conversas-table.test.tsx`:
  ```tsx
  it("colunas Estado/Departamento/Atendente NÃO truncam (v0.29)", () => {
    const longRow = {
      ...baseRow,
      inbox: { id: 1, name: "Distrito Federal Brasília Capital Nacional" },
      team: { id: 1, name: "Departamento de Atendimento Comercial" },
      assignee: { id: 1, name: "Maria Eduarda Carvalho Silva Santos" },
    };
    const { container } = render(<ConversasTable {...baseProps} initialRows={[longRow]} />);
    const cells = container.querySelectorAll(".whitespace-normal");
    expect(cells.length).toBeGreaterThan(0);
  });
  ```
- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit: `feat(conversas): F3 v0.29 — colunas Estado/Departamento/Atendente sem truncate (whitespace-normal + larguras maiores)`.

### Task 4: Release v0.29.0
- [ ] Bump `package.json` 0.28 → 0.29.
- [ ] CHANGELOG entry v0.29.
- [ ] STATUS.md no topo.
- [ ] typecheck full + tests scope.
- [ ] Commit release.
- [ ] Push origin main.
- [ ] `gh workflow run "Portainer fix..."` --field app_version=v0.29.0.
- [ ] Monitor /api/health.

---

## §3. Riscos

| Risco | Mitigação |
|---|---|
| F3 wrap multi-line aumenta altura das rows; virtualizer estimateSize=48 fica errado | `measureElement` já existe (linha 705) — recalcula real height. |
| F1 CSS global pode afetar outros inputs `type="search"` da plataforma | Comportamento desejado (consistência). |
| F2 sem bg idle pode reduzir affordance pra novos usuários | Hover fica vermelho — feedback claro. Tooltip `aria-label` continua. |

---

## §4. Self-Review

- [ ] 3 fixes cobertos com 4 commits granulares + release.
- [ ] TDD em F2 e F3.
- [ ] ui-ux-pro-max em F2 e F3.
- [ ] CHANGELOG entry inclui as 3 mudanças visuais.
