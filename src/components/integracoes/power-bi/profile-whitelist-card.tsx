"use client";

/**
 * ProfileWhitelistCard — Client Component que lista a whitelist do perfil:
 * tabelas habilitadas + colunas selecionadas + filtros aplicados.
 *
 * É Client porque:
 *  - Botão "Editar whitelist" abre `<ProfileWizardDialog mode="edit">`.
 *  - Wizard exige initial completo (allowedColumns + filters), que já vem
 *    do Server Component pai (page.tsx) via prop `profile: ProfileDetail`.
 *
 * Layout:
 *  - Card com lista vertical (space-y-4).
 *  - Cada entry: label + description + chips violet por coluna + footer com
 *    contagens de filtros (RLS) caso aplicável.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Filter, Pencil } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getCatalogEntry,
  POWER_BI_CATALOG,
} from "@/lib/integrations/power-bi/catalog";
import type { ProfileDetail } from "@/lib/actions/integrations-power-bi";

import { ProfileWizardDialog } from "./profile-wizard-dialog";
import type { WizardFormData } from "./wizard-types";

interface Props {
  profile: ProfileDetail;
}

function isFactTable(name: string): boolean {
  return Object.keys(POWER_BI_CATALOG.facts).includes(name);
}

function toWizardInitial(profile: ProfileDetail): Partial<WizardFormData> {
  const allowedColumns: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(profile.allowedColumns)) {
    allowedColumns[k] = [...v];
  }
  return {
    name: profile.name,
    description: profile.description ?? "",
    allowedTables: [...profile.allowedTables],
    allowedColumns,
    accountIdFilter: profile.accountIdFilter
      ? [...profile.accountIdFilter]
      : null,
    teamIdFilter: profile.teamIdFilter ? [...profile.teamIdFilter] : null,
  };
}

export function ProfileWhitelistCard({ profile }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  const accountFilterCount = profile.accountIdFilter?.length ?? 0;
  const teamFilterCount = profile.teamIdFilter?.length ?? 0;
  const hasAnyFilter = accountFilterCount > 0 || teamFilterCount > 0;

  return (
    <>
      <Card data-testid="profile-whitelist-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Whitelist</CardTitle>
            <p className="text-xs text-muted-foreground">
              {profile.allowedTables.length}{" "}
              {profile.allowedTables.length === 1 ? "tabela" : "tabelas"} ·{" "}
              {hasAnyFilter ? (
                <span className="text-amber-600 dark:text-amber-400">
                  com filtros (RLS)
                </span>
              ) : (
                "sem filtros (todas as contas)"
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="cursor-pointer"
            data-testid="edit-whitelist-button"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Editar whitelist
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {profile.allowedTables.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma tabela habilitada.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="whitelist-tables">
              {profile.allowedTables.map((tableName) => {
                const entry = getCatalogEntry(tableName);
                const cols = profile.allowedColumns[tableName] ?? [];
                const supportsAccountFilter = entry?.hasAccountId ?? false;
                const supportsTeamFilter = entry?.hasTeamId ?? false;
                const isFact = isFactTable(tableName);
                return (
                  <li
                    key={tableName}
                    data-testid={`whitelist-row-${tableName}`}
                    className="rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300"
                      >
                        <Database className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {entry?.label ?? tableName}
                          </p>
                          <span
                            className={
                              isFact
                                ? "inline-flex items-center rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"
                                : "inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
                            }
                          >
                            {isFact ? "Fato" : "Dimensão"}
                          </span>
                          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {tableName}
                          </code>
                        </div>
                        {entry?.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                        ) : null}

                        {cols.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {cols.map((col) => (
                              <span
                                key={col}
                                className="inline-flex items-center rounded-md bg-violet-500/15 px-1.5 py-0.5 font-mono text-[11px] text-violet-700 dark:text-violet-300"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-muted-foreground/70">
                            Sem colunas selecionadas — re-edite a whitelist.
                          </p>
                        )}

                        {supportsAccountFilter && accountFilterCount > 0 ? (
                          <FilterFootnote
                            type="account"
                            ids={profile.accountIdFilter ?? []}
                          />
                        ) : null}
                        {supportsTeamFilter && teamFilterCount > 0 ? (
                          <FilterFootnote
                            type="team"
                            ids={profile.teamIdFilter ?? []}
                          />
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ProfileWizardDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        profileId={profile.id}
        expectedUpdatedAt={profile.updatedAt.toISOString()}
        initial={toWizardInitial(profile)}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}

interface FootnoteProps {
  type: "account" | "team";
  ids: number[];
}

function FilterFootnote({ type, ids }: FootnoteProps) {
  if (ids.length === 0) return null;
  const label = type === "account" ? "contas" : "times";
  const preview = ids.slice(0, 8).join(", ");
  const overflow = ids.length > 8 ? ` (+${ids.length - 8})` : "";
  return (
    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
      <Filter className="h-3 w-3 shrink-0" aria-hidden="true" />
      Filtrado por {label}: {preview}
      {overflow}
    </p>
  );
}
