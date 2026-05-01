/**
 * ProfileSummaryCard — Server Component que apresenta a visão geral do
 * perfil Power BI (status + meta).
 *
 * Conteúdo:
 *  - Header com `<StatusChip>` + nome do criador.
 *  - Banner amarelo (status=error) com erro de provisionamento + botão
 *    "Repetir provisionamento" delegado ao client (`<ProfileRetryProvisionButton>`).
 *  - Grid 2-col: criado por, criado em, última atualização, last provisioned em.
 *
 * Datas formatadas em pt-BR via Intl.
 */

import { AlertTriangle, Clock, User as UserIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileDetail } from "@/lib/actions/integrations-power-bi";

import { StatusChip } from "./status-chip";
import { ProfileRetryProvisionButton } from "./profile-retry-provision-button";

interface Props {
  profile: ProfileDetail;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "Nunca";
  return dateTimeFormatter.format(value);
}

export function ProfileSummaryCard({ profile }: Props) {
  const createdByLabel = profile.createdBy?.name ?? "Sistema";
  const createdByEmail = profile.createdBy?.email ?? null;

  return (
    <Card data-testid="profile-summary-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Resumo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Estado de provisionamento e metadados do perfil.
          </p>
        </div>
        <StatusChip status={profile.status} />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {profile.status === "error" ? (
          <div
            role="alert"
            data-testid="provisioning-failed-banner"
            className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-start"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300"
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Provisionamento falhou
              </p>
              <p className="text-xs text-amber-700/90 dark:text-amber-300/90">
                A última tentativa de criar o usuário PostgreSQL ou as views
                derivadas terminou em erro. Power BI não conseguirá conectar
                até que isso seja resolvido.
              </p>
              {profile.lastProvisionError ? (
                <pre
                  className="mt-2 max-h-40 overflow-auto rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 font-mono text-[11px] leading-snug text-amber-900 dark:text-amber-200 whitespace-pre-wrap"
                  data-testid="provisioning-error-message"
                >
                  {profile.lastProvisionError}
                </pre>
              ) : null}
            </div>
            <ProfileRetryProvisionButton
              profileId={profile.id}
              expectedUpdatedAt={profile.updatedAt.toISOString()}
              payload={{
                name: profile.name,
                description: profile.description ?? null,
                allowedTables: [...profile.allowedTables],
                allowedColumns: profile.allowedColumns,
                accountIdFilter: profile.accountIdFilter
                  ? [...profile.accountIdFilter]
                  : null,
                teamIdFilter: profile.teamIdFilter
                  ? [...profile.teamIdFilter]
                  : null,
              }}
            />
          </div>
        ) : null}

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryField
            icon={UserIcon}
            label="Criado por"
            value={
              <span className="flex flex-col">
                <span className="font-medium text-foreground">
                  {createdByLabel}
                </span>
                {createdByEmail ? (
                  <span className="text-xs text-muted-foreground">
                    {createdByEmail}
                  </span>
                ) : null}
              </span>
            }
          />
          <SummaryField
            icon={Clock}
            label="Criado em"
            value={formatDateTime(profile.createdAt)}
          />
          <SummaryField
            icon={Clock}
            label="Última atualização"
            value={formatDateTime(profile.updatedAt)}
          />
          <SummaryField
            icon={Clock}
            label="Último provisionamento"
            value={formatDateTime(profile.lastProvisionedAt)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

interface FieldProps {
  icon: typeof Clock;
  label: string;
  value: React.ReactNode;
}

function SummaryField({ icon: Icon, label, value }: FieldProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-sm text-foreground tabular-nums">
          {value}
        </dd>
      </div>
    </div>
  );
}
