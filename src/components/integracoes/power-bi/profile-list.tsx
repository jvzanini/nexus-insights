/**
 * ProfileList — Server Component que renderiza a tabela responsiva de
 * perfis Power BI.
 *
 * Colunas:
 *  - Nome + descrição (subtitle)
 *  - Status chip
 *  - # Tabelas
 *  - Filtros resumidos ("Todas", "5 contas", "5c · 3t", etc.)
 *  - Criado em (pt-BR)
 *  - Ações (dropdown)
 *
 * Em mobile (sm:), colapsa colunas secundárias em duas linhas por row.
 */

import { Database } from "lucide-react";

import type { ProfileListItem } from "@/lib/actions/integrations-power-bi";

import { StatusChip } from "./status-chip";
import { ProfileRowActions } from "./profile-row-actions";

interface Props {
  profiles: ProfileListItem[];
  /** allowedColumns por profile.id, opcional. Quando provido, evita
   *  o wizard de edição precisar fazer fetch on-demand. */
  allowedColumnsById?: Record<string, Record<string, string[]>>;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function summarizeFilters(profile: ProfileListItem): string {
  const parts: string[] = [];
  const acct = profile.accountIdFilter?.length ?? 0;
  const tm = profile.teamIdFilter?.length ?? 0;
  if (acct === 0 && tm === 0) return "Todas";
  if (acct > 0)
    parts.push(`${acct} ${acct === 1 ? "conta" : "contas"}`);
  if (tm > 0) parts.push(`${tm} ${tm === 1 ? "time" : "times"}`);
  return parts.join(" · ");
}

export function ProfileList({ profiles, allowedColumnsById }: Props) {
  return (
    <div
      className="overflow-x-auto rounded-2xl border border-border bg-card"
      role="region"
      aria-label="Lista de perfis Power BI"
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              Perfil
            </th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              Status
            </th>
            <th
              scope="col"
              className="hidden px-4 py-2.5 text-left font-medium sm:table-cell"
            >
              Tabelas
            </th>
            <th
              scope="col"
              className="hidden px-4 py-2.5 text-left font-medium md:table-cell"
            >
              Filtros
            </th>
            <th
              scope="col"
              className="hidden px-4 py-2.5 text-left font-medium lg:table-cell"
            >
              Criado em
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {profiles.map((profile) => {
            const tablesCount = profile.allowedTables.length;
            return (
              <tr
                key={profile.id}
                className="group transition-colors hover:bg-muted/20"
                data-testid={`profile-row-${profile.id}`}
              >
                <td className="max-w-[320px] px-4 py-3">
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={profile.name}
                    >
                      {profile.name}
                    </p>
                    {profile.description ? (
                      <p
                        className="truncate text-xs text-muted-foreground mt-0.5"
                        title={profile.description}
                      >
                        {profile.description}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
                        {profile.pgUsername}
                      </p>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3 align-middle">
                  <StatusChip status={profile.status} />
                  {profile.status === "error" && profile.lastProvisionError ? (
                    <p
                      className="mt-1 text-[11px] text-red-600 dark:text-red-400 line-clamp-2 max-w-[280px]"
                      title={profile.lastProvisionError}
                    >
                      {profile.lastProvisionError}
                    </p>
                  ) : null}
                </td>

                <td className="hidden px-4 py-3 align-middle sm:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground tabular-nums">
                    <Database
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {tablesCount}
                  </span>
                </td>

                <td className="hidden px-4 py-3 align-middle md:table-cell">
                  <span className="text-sm text-foreground">
                    {summarizeFilters(profile)}
                  </span>
                </td>

                <td className="hidden px-4 py-3 align-middle lg:table-cell">
                  <time
                    dateTime={profile.createdAt.toISOString()}
                    className="text-sm tabular-nums text-muted-foreground"
                  >
                    {dateFormatter.format(profile.createdAt)}
                  </time>
                </td>

                <td className="px-3 py-3 align-middle text-right">
                  <ProfileRowActions
                    profile={profile}
                    allowedColumns={
                      allowedColumnsById
                        ? allowedColumnsById[profile.id]
                        : undefined
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
