"use client";

/**
 * WizardStep4 — Filtros (Row-Level Security).
 *
 * Dois toggles independentes:
 *  - "Filtrar por contas" → MultiSelect de accounts (snapshot powerbi.dim_accounts).
 *  - "Filtrar por times"  → MultiSelect de teams (filtrado por accountIdFilter
 *    quando o toggle de contas está ON com seleção).
 *
 * Toggle desabilitado quando nenhuma tabela do step 2 tem RLS aplicável
 * (`hasAccountId` / `hasTeamId`).
 *
 * Estados especiais:
 *  - Loading inicial (fetch das opções).
 *  - Empty state quando snapshot vazio: oferece "Atualizar agora" via
 *    `triggerDimSyncAction`.
 *
 * Estado convencionado: `null` = "todas" (sem filtro). Array vazio só
 * aparece transitoriamente no UI (toggle ON sem seleção); na hora do
 * submit o orchestrator converte [] → null.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Filter, Loader2, RefreshCw, Building2, Users } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  MultiSelectCheckbox,
  type MetaItem,
} from "@/components/ui/multi-select-checkbox";
import { getCatalogEntry } from "@/lib/integrations/power-bi/catalog";
import {
  getAvailableAccountsForFilterAction,
  getAvailableTeamsForFilterAction,
  type AccountOption,
  type TeamOption,
} from "@/lib/actions/integrations-options";
import { triggerDimSyncAction } from "@/lib/actions/integrations-power-bi";
import { cn } from "@/lib/utils";

import type { WizardFormData } from "./wizard-types";

interface Props {
  data: WizardFormData;
  onChange: (next: Partial<WizardFormData>) => void;
  error?: string | null;
  disabled?: boolean;
}

export function WizardStepFilters({
  data,
  onChange,
  error,
  disabled,
}: Props) {
  // Capacidade RLS derivada das tabelas selecionadas no step 2.
  const { canFilterByAccount, canFilterByTeam } = useMemo(() => {
    let acct = false;
    let team = false;
    for (const t of data.allowedTables) {
      const e = getCatalogEntry(t);
      if (e?.hasAccountId) acct = true;
      if (e?.hasTeamId) team = true;
    }
    return { canFilterByAccount: acct, canFilterByTeam: team };
  }, [data.allowedTables]);

  const accountToggle = data.accountIdFilter !== null;
  const teamToggle = data.teamIdFilter !== null;

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [isSyncing, startSync] = useTransition();

  // Carrega accounts no mount (sempre — barato). Justifica setState in effect:
  // é fetch externo, padrão consagrado para data fetching client-side.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingAccounts(true);
    getAvailableAccountsForFilterAction()
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) {
          setAccounts(result.data);
        } else {
          toast.error(result.error ?? "Falha ao carregar contas.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega teams quando o toggle de team está ON ou quando accountIdFilter muda.
  useEffect(() => {
    if (!teamToggle) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingTeams(true);
    getAvailableTeamsForFilterAction(data.accountIdFilter)
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) {
          setTeams(result.data);
        } else {
          toast.error(result.error ?? "Falha ao carregar times.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTeams(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamToggle, data.accountIdFilter]);

  function toggleAccountFilter(checked: boolean) {
    if (checked) {
      onChange({ accountIdFilter: [] });
    } else {
      onChange({ accountIdFilter: null });
      // Se o filtro de contas é desligado e havia teams filtrados,
      // recarregar lista completa de teams (handled pelo useEffect).
    }
  }

  function toggleTeamFilter(checked: boolean) {
    onChange({ teamIdFilter: checked ? [] : null });
  }

  function handleAccountChange(next: number[]) {
    onChange({ accountIdFilter: next });
    // Quando a seleção de accounts muda e o filtro de teams está ON,
    // remove team_ids que não pertencem mais aos accounts selecionados.
    if (teamToggle && data.teamIdFilter && data.teamIdFilter.length > 0) {
      const validAccountIds = new Set(next);
      const stillValidTeams = teams
        .filter((t) => validAccountIds.has(t.account_id))
        .map((t) => t.team_id);
      const validSet = new Set(stillValidTeams);
      const filtered = data.teamIdFilter.filter((id) => validSet.has(id));
      if (filtered.length !== data.teamIdFilter.length) {
        onChange({ teamIdFilter: filtered });
      }
    }
  }

  function handleTeamChange(next: number[]) {
    onChange({ teamIdFilter: next });
  }

  function handleManualSync() {
    startSync(async () => {
      const result = await triggerDimSyncAction();
      if (!result.ok) {
        toast.error(result.error ?? "Falha ao disparar sincronização.");
        return;
      }
      toast.success(
        "Sincronização enfileirada. Aguarde alguns segundos e clique em Recarregar.",
      );
    });
  }

  function handleReloadAccounts() {
    setLoadingAccounts(true);
    getAvailableAccountsForFilterAction()
      .then((result) => {
        if (result.ok && result.data) setAccounts(result.data);
      })
      .finally(() => setLoadingAccounts(false));
  }

  const accountItems: MetaItem[] = accounts.map((a) => ({
    id: a.account_id,
    name: `${a.name} (#${a.account_id})`,
  }));

  const teamItems: MetaItem[] = teams.map((t) => ({
    id: t.team_id,
    name: `${t.name} (#${t.team_id})`,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Filtros de linha (RLS)
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Restrinja quais linhas o Power BI poderá ver. Se desligado, todas
          as linhas das tabelas selecionadas ficam visíveis.
        </p>
      </div>

      {/* Card: filtro por conta */}
      <div
        className={cn(
          "rounded-xl border border-border/60 p-4 transition-colors",
          accountToggle && "bg-violet-500/5 border-violet-500/30",
          !canFilterByAccount && "opacity-60",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Filtrar por contas
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {canFilterByAccount
                  ? "Mostra apenas as linhas das contas selecionadas."
                  : "Nenhuma tabela selecionada tem coluna de conta."}
              </p>
            </div>
          </div>
          <Switch
            data-testid="wizard-toggle-account-filter"
            checked={accountToggle}
            onCheckedChange={toggleAccountFilter}
            disabled={disabled || !canFilterByAccount}
            aria-label="Filtrar por contas"
          />
        </div>

        {accountToggle ? (
          <div className="mt-3 space-y-2">
            {loadingAccounts ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Carregando contas...
              </div>
            ) : accounts.length === 0 ? (
              <EmptySnapshotState
                onRefresh={handleManualSync}
                onReload={handleReloadAccounts}
                isSyncing={isSyncing}
                noun="contas"
              />
            ) : (
              <MultiSelectCheckbox
                label="Contas autorizadas"
                options={accountItems}
                value={data.accountIdFilter ?? []}
                onChange={handleAccountChange}
                searchPlaceholder="Buscar conta..."
              />
            )}
          </div>
        ) : null}
      </div>

      {/* Card: filtro por time */}
      <div
        className={cn(
          "rounded-xl border border-border/60 p-4 transition-colors",
          teamToggle && "bg-violet-500/5 border-violet-500/30",
          !canFilterByTeam && "opacity-60",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Filtrar por times
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {canFilterByTeam
                  ? accountToggle && (data.accountIdFilter?.length ?? 0) > 0
                    ? "Times disponíveis vêm das contas selecionadas acima."
                    : "Mostra apenas as linhas dos times selecionados."
                  : "Nenhuma tabela selecionada tem coluna de time."}
              </p>
            </div>
          </div>
          <Switch
            data-testid="wizard-toggle-team-filter"
            checked={teamToggle}
            onCheckedChange={toggleTeamFilter}
            disabled={disabled || !canFilterByTeam}
            aria-label="Filtrar por times"
          />
        </div>

        {teamToggle ? (
          <div className="mt-3 space-y-2">
            {loadingTeams ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Carregando times...
              </div>
            ) : teams.length === 0 ? (
              <EmptySnapshotState
                onRefresh={handleManualSync}
                onReload={() => {
                  setLoadingTeams(true);
                  getAvailableTeamsForFilterAction(data.accountIdFilter)
                    .then((result) => {
                      if (result.ok && result.data) setTeams(result.data);
                    })
                    .finally(() => setLoadingTeams(false));
                }}
                isSyncing={isSyncing}
                noun="times"
              />
            ) : (
              <MultiSelectCheckbox
                label="Times autorizados"
                options={teamItems}
                value={data.teamIdFilter ?? []}
                onChange={handleTeamChange}
                searchPlaceholder="Buscar time..."
              />
            )}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
          error
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border bg-muted/30 text-muted-foreground",
        )}
        role={error ? "alert" : "status"}
        aria-live="polite"
      >
        <Filter className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="leading-snug">
          {error
            ? error
            : !accountToggle && !teamToggle
              ? "Sem filtros — Power BI verá todas as linhas das tabelas selecionadas."
              : "Filtros aplicados. Quando ligado mas vazio, é tratado como 'todas'."}
        </span>
      </div>
    </div>
  );
}

interface EmptyProps {
  onRefresh: () => void;
  onReload: () => void;
  isSyncing: boolean;
  noun: string;
}

function EmptySnapshotState({ onRefresh, onReload, isSyncing, noun }: EmptyProps) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3">
      <p className="text-xs text-foreground">Sem {noun} ainda no snapshot.</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        O job de sincronização roda a cada 30 min. Você pode disparar agora.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={onRefresh}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          )}
          Atualizar agora
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onReload}
          disabled={isSyncing}
        >
          Recarregar
        </Button>
      </div>
    </div>
  );
}
