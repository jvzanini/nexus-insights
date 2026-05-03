"use client";

// AdvancedFilters — toolbar sticky com Período + Busca + 2 chips de modal:
// "Filtros · N" (FiltersDialog Simples/Avançado) e "Ordenação · N"
// (SortingDialog).
//
// O toolbar mede sua própria altura via ResizeObserver e expõe `--toolbar-h`
// como CSS var no <html>, consumida pelo `sticky thead` da tabela em
// `top-[var(--toolbar-h,132px)]`.
//
// ui-ux-pro-max: primary-action (1 CTA por área), progressive-disclosure,
// state-clarity (chip pulsante quando há pending), spacing-scale 4/8.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Filter, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportButton } from "@/components/reports/export-button";
import { PeriodPills } from "@/components/reports/period-pills";
import { useFilterTransition } from "@/components/reports/filter-transition";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { FiltersDialog } from "@/components/reports/filters-dialog";
import {
  PresetsPopover,
} from "@/components/reports/presets-popover";
import { QuickFiltersPopover } from "@/components/reports/quick-filters-popover";
import {
  SortingDialog,
  type SortRule,
  type SortRuleOption,
} from "@/components/reports/sorting-dialog";
import {
  EMPTY_FILTER_STATE,
  diffFilterStates,
  isFilterStateEqual,
  serializeFilterState,
  type FilterState,
} from "@/lib/reports/filter-state";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import type { PeriodKey as CanonicalPeriodKey } from "@/lib/datetime-core";
import {
  isPeriodKey,
  type PeriodKey as ExtendedPeriodKey,
} from "@/lib/reports/period";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import type { QuickFilterKey } from "@/lib/reports/quick-filters";
import type {
  FilterPreset,
  UseFilterPresets,
} from "@/lib/hooks/use-filter-presets";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type { MetaItem };

// Critérios de ordenação disponíveis na tabela de conversas — espelha as
// colunas com `compareFn` definidos em <ConversasTable>. WhatsApp foi
// removido junto com a coluna em v0.10.4 (continua disponível só no
// drill-down).
export const SORT_OPTIONS: SortRuleOption[] = [
  { key: "display_id", label: "#" },
  { key: "name", label: "Nome" },
  { key: "document", label: "Documento" },
  { key: "inbox", label: "Estado" },
  { key: "team", label: "Departamento" },
  { key: "assignee", label: "Atendente" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Prioridade" },
  { key: "waiting_seconds", label: "Sem resposta há" },
  { key: "open_seconds", label: "Aberta há" },
  { key: "created_at", label: "Criado em" },
  { key: "last_activity_at", label: "Última atualização" },
];

export interface AdvancedFiltersProps {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  /** Etiquetas (labels) da conta — usadas tanto no modo Simples como no Avançado. */
  labels: MetaItem[];
  initial: FilterState;
  /** Conta ativa — usada para limitar o calendário ao primeiro registro do banco. */
  accountId?: number;
  /** Stack de critérios de ordenação. Cabeada bidirecionalmente com a tabela. */
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
  /** Atalhos rápidos ativos (transient). */
  quickFilters: Set<QuickFilterKey>;
  onToggleQuick: (key: QuickFilterKey) => void;
  onRemoveQuick: (key: QuickFilterKey) => void;
  /** Mapping User Nexus → user Chatwoot. Null oculta atalho "Minhas". */
  currentChatwootUserId: number | null;
  /** API de presets (CRUD localStorage) cabeada do parent. */
  presetsApi: UseFilterPresets;
  /** Aplicar preset: chamado depois de updates internos do `<AdvancedFilters>`. */
  onApplyPreset: (preset: FilterPreset) => void;
  /** Abrir o `<PresetsDialog>` de gerenciamento. */
  onOpenPresetsManager: () => void;
  /** Filters aplicados (incluindo search), passados ao `<ExportButton>`. */
  appliedReportFilters: ReportFilters;
  /** Quantidade de linhas atualmente mostradas — disable do export quando 0. */
  tableRowCount: number;
  /**
   * v0.25: busca client-side instantânea (UI). Estado vive em
   * `<ConversasPageClient>`; aqui ela é apenas exibida e propagada.
   */
  searchClient: string;
  onSearchClientChange: (next: string) => void;
}

export function AdvancedFilters({
  inboxes,
  teams,
  assignees,
  labels,
  initial,
  accountId,
  sortStack,
  onSortStackChange,
  quickFilters,
  onToggleQuick,
  onRemoveQuick,
  currentChatwootUserId,
  presetsApi,
  onApplyPreset,
  onOpenPresetsManager,
  appliedReportFilters,
  tableRowCount,
  searchClient,
  onSearchClientChange,
}: AdvancedFiltersProps) {
  const router = useRouter();
  const { startTransition } = useFilterTransition();

  const [draft, setDraft] = useState<FilterState>(initial);
  const [applied, setApplied] = useState<FilterState>(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortingOpen, setSortingOpen] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);

  // Mede a altura do toolbar e exporta como `--toolbar-h` no <html>. O thead
  // sticky da tabela usa esse valor como `top: var(--toolbar-h, fallback)`.
  // useLayoutEffect garante que a CSS var é setada SÍNCRONO antes do paint —
  // sem isso, o thead aparecia "pulando" pra baixo na primeira renderização
  // porque o fallback (132px) era diferente da altura real medida depois.
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    // Set inicial síncrono — evita flash com fallback.
    document.documentElement.style.setProperty(
      "--toolbar-h",
      `${Math.ceil(el.getBoundingClientRect().height)}px`,
    );
    const ro = new ResizeObserver((entries) => {
      const h = Math.ceil(entries[0]?.contentRect.height ?? 0);
      document.documentElement.style.setProperty("--toolbar-h", `${h}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // v0.19: separa search do "pending banner". Banner conta apenas filtros
  // não-search; search vira "pending" via hint sutil abaixo do input.
  const withoutSearch = (s: FilterState): FilterState => ({
    ...s,
    search: undefined,
  });
  const pendingDiffExSearch = useMemo(
    () => diffFilterStates(withoutSearch(draft), withoutSearch(applied)),
    [draft, applied],
  );
  const hasPendingNonSearch = pendingDiffExSearch > 0;

  const appliedCount = useMemo(
    () =>
      applied.inboxIds.length +
      applied.teamIds.length +
      applied.assigneeIds.length +
      applied.statuses.length +
      applied.priorities.length +
      applied.labelIds.length +
      (applied.mode === "advanced" &&
      applied.conditionGroup?.conditions?.length
        ? 1
        : 0),
    [applied],
  );

  const sortCount = sortStack.length;

  const pushUrl = useCallback(
    (state: FilterState) => {
      // Filtros mudaram — sempre voltar pra página 1.
      // (T8 v0.19: page só é preservada via handlePageChange em ConversasPageClient.)
      const stateWithoutPage: FilterState = { ...state, page: undefined };
      const qs = serializeFilterState(stateWithoutPage).toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?");
      });
    },
    [router, startTransition],
  );

  // Period aplica direto: muda draft + applied + URL num só clique.
  const handlePeriodChange = useCallback(
    (
      period: ExtendedPeriodKey,
      customRange?: { start: string; end: string },
    ) => {
      const canonical: CanonicalPeriodKey = isPeriodKey(period)
        ? period
        : "hoje";
      const next: FilterState = {
        ...draft,
        period: canonical,
        customRange: canonical === "custom" ? customRange : undefined,
      };
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [draft, pushUrl],
  );

  const handleApply = useCallback(() => {
    if (isFilterStateEqual(draft, applied)) return;
    setApplied(draft);
    pushUrl(draft);
  }, [draft, applied, pushUrl]);

  const handleReset = useCallback(() => {
    setDraft(EMPTY_FILTER_STATE);
    setApplied(EMPTY_FILTER_STATE);
    pushUrl(EMPTY_FILTER_STATE);
  }, [pushUrl]);

  // T15 v0.23: X adesivo do chip Filtros — limpa SOMENTE filtros (caixa de
  // entrada, departamento, atendente, status, prioridade, etiquetas, grupo
  // avançado) preservando search, period, customRange, mode e page.
  const handleResetFiltersOnly = useCallback(() => {
    const next: FilterState = {
      ...applied,
      inboxIds: [],
      teamIds: [],
      assigneeIds: [],
      statuses: [],
      priorities: [],
      labelIds: [],
      conditionGroup: undefined,
    };
    setApplied(next);
    setDraft(next);
    pushUrl(next);
  }, [applied, pushUrl]);

  // Aplicar do dialog: promove draft → applied e atualiza URL.
  const handleDialogApply = useCallback(
    (next: FilterState) => {
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [pushUrl],
  );

  // Aplicar um preset: replica o handleDialogApply para o FilterState
  // gravado, dispara onSortStackChange para a stack salva e notifica o
  // parent (que pode fechar o `<PresetsDialog>` se estiver aberto).
  const handleApplyPresetInternal = useCallback(
    (preset: FilterPreset) => {
      setDraft(preset.state);
      setApplied(preset.state);
      pushUrl(preset.state);
      onSortStackChange(preset.sortStack);
      onApplyPreset(preset);
    },
    [pushUrl, onSortStackChange, onApplyPreset],
  );

  const handleCreatePreset = useCallback(
    (name: string) => {
      presetsApi.create(name, applied, sortStack);
    },
    [presetsApi, applied, sortStack],
  );

  // Remove a seleção inteira de um grupo (chip X) e aplica imediatamente.
  const handleRemoveGroup = useCallback(
    (key: keyof FilterState) => {
      const next: FilterState = { ...applied };
      switch (key) {
        case "inboxIds":
          next.inboxIds = [];
          break;
        case "teamIds":
          next.teamIds = [];
          break;
        case "assigneeIds":
          next.assigneeIds = [];
          break;
        case "statuses":
          next.statuses = [];
          break;
        case "priorities":
          next.priorities = [];
          break;
        case "labelIds":
          next.labelIds = [];
          break;
        default:
          return;
      }
      setApplied(next);
      setDraft(next);
      pushUrl(next);
    },
    [applied, pushUrl],
  );

  // v0.19 T12: remove individual via popover de chip +N.
  const handleRemoveOne = useCallback(
    (key: keyof FilterState, id: number) => {
      const next: FilterState = { ...applied };
      switch (key) {
        case "inboxIds":
          next.inboxIds = applied.inboxIds.filter((x) => x !== id);
          break;
        case "teamIds":
          next.teamIds = applied.teamIds.filter((x) => x !== id);
          break;
        case "assigneeIds":
          next.assigneeIds = applied.assigneeIds.filter((x) => x !== id);
          break;
        case "labelIds":
          next.labelIds = applied.labelIds.filter((x) => x !== id);
          break;
        case "statuses":
          next.statuses = applied.statuses.filter((x) => x !== id);
          break;
        case "priorities":
          next.priorities = applied.priorities.filter((x) => x !== id);
          break;
        default:
          return;
      }
      setApplied(next);
      setDraft(next);
      pushUrl(next);
    },
    [applied, pushUrl],
  );

  return (
    <section
      ref={sectionRef}
      role="toolbar"
      aria-label="Filtros avançados"
      data-toolbar="conversas"
      className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      {/* Linha 1 — Período */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Período
        </span>
        <div data-tour="period">
          <PeriodPills
            value={draft.period}
            customRange={draft.customRange}
            onChange={handlePeriodChange}
            accountId={accountId}
          />
        </div>
      </div>

      {/* Linha 2 — Busca + chip Filtros + chip Ordenação */}
      <div className="flex flex-wrap items-center gap-2">
        <div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
          <Search
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
              searchClient.trim() !== "" ? "text-violet-500" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchClient}
            onChange={(e) => onSearchClientChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // preventDefault evita comportamento UA-default (Safari Mac
                // limpa input em Esc) — queremos consistência cross-browser
                // delegando o clear ao callback.
                e.preventDefault();
                onSearchClientChange("");
              }
            }}
            placeholder="Buscar..."
            aria-label="Buscar conversas"
            className={cn(
              "h-10 cursor-text pl-9",
              searchClient.trim() !== "" ? "pr-9" : "pr-3",
            )}
          />
          {searchClient.trim() !== "" ? (
            <button
              type="button"
              onClick={() => onSearchClientChange("")}
              aria-label="Limpar busca"
              title="Limpar busca"
              className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <PresetsPopover
          presets={presetsApi.presets}
          isAtCap={presetsApi.isAtCap}
          onApply={handleApplyPresetInternal}
          onCreate={handleCreatePreset}
          onOpenManager={onOpenPresetsManager}
          validateName={(n) => presetsApi.validateName(n)}
        />

        <div data-tour="atalhos">
          <QuickFiltersPopover
            active={quickFilters}
            onToggle={onToggleQuick}
            currentChatwootUserId={currentChatwootUserId}
          />
        </div>

        <div className="relative inline-block">
          <Button
            data-tour="filters-chip"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(true)}
            aria-label={`Abrir filtros${
              appliedCount > 0 ? ` (${appliedCount} aplicados)` : ""
            }`}
            className={cn(
              "relative h-10 px-4",
              appliedCount > 0 && "border-violet-500/40 text-foreground",
            )}
          >
            <Filter aria-hidden="true" />
            Filtros
            {appliedCount > 0 ? (
              <Badge
                variant="default"
                className="ml-1 h-5 min-w-5 px-1.5 tabular-nums"
              >
                {appliedCount}
              </Badge>
            ) : null}
            {hasPendingNonSearch ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
              />
            ) : null}
          </Button>
          {appliedCount > 0 ? (
            <button
              type="button"
              onClick={handleResetFiltersOnly}
              aria-label="Limpar todos os filtros"
              className="absolute -right-2 -top-2 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="relative inline-block">
          <Button
            data-tour="sorting-chip"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSortingOpen(true)}
            aria-label={`Abrir ordenação${
              sortCount > 0 ? ` (${sortCount} critérios)` : ""
            }`}
            className={cn(
              "relative h-10 px-4",
              sortCount > 0 && "border-violet-500/40 text-foreground",
            )}
          >
            <ArrowUpDown aria-hidden="true" />
            Ordenação
            {sortCount > 0 ? (
              <Badge
                variant="default"
                className="ml-1 h-5 min-w-5 px-1.5 tabular-nums"
              >
                {sortCount}
              </Badge>
            ) : null}
          </Button>
          {sortCount > 0 ? (
            <button
              type="button"
              onClick={() => onSortStackChange([])}
              aria-label="Limpar ordenação"
              className="absolute -right-2 -top-2 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <ExportButton
          filters={appliedReportFilters}
          accountId={accountId ?? 9}
          rowCount={tableRowCount}
          searchClientActive={searchClient.trim() !== ""}
        />
      </div>

      {/* Linha 3 — Chips aplicados (filtros + ordenação + atalhos, condicional) */}
      <AppliedFiltersChips
        meta={{ inboxes, teams, assignees, labels }}
        applied={applied}
        onRemove={handleRemoveGroup}
        onRemoveOne={handleRemoveOne}
        onClearAll={handleReset}
        sortStack={sortStack}
        sortOptions={SORT_OPTIONS}
        onRemoveSort={(key) =>
          onSortStackChange(sortStack.filter((r) => r.key !== key))
        }
        onClearAllSort={() => onSortStackChange([])}
        quickFilters={quickFilters}
        onRemoveQuick={onRemoveQuick}
      />

      {/* Linha 4 — Banner pending (condicional, exclui search) */}
      {hasPendingNonSearch ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-foreground">
            <strong className="font-semibold">{pendingDiffExSearch}</strong>{" "}
            {pendingDiffExSearch === 1
              ? "filtro pendente"
              : "filtros pendentes"}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleApply}
            className="h-auto px-1 py-0 font-semibold text-primary"
          >
            Aplicar agora
          </Button>
        </div>
      ) : null}

      <FiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        applied={applied}
        onApply={handleDialogApply}
        onClear={handleReset}
        inboxes={inboxes}
        teams={teams}
        assignees={assignees}
        labels={labels}
      />

      <SortingDialog
        open={sortingOpen}
        onOpenChange={setSortingOpen}
        applied={sortStack}
        options={SORT_OPTIONS}
        onApply={onSortStackChange}
        onClear={() => onSortStackChange([])}
      />
    </section>
  );
}

export default AdvancedFilters;
