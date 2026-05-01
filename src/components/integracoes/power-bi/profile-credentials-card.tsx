"use client";

/**
 * ProfileCredentialsCard — Client Component que apresenta as credenciais
 * de conexão Postgres do perfil Power BI.
 *
 * Conteúdo:
 *  - Grid 2-col: Host (env público), Porta (5432), Banco (nexus_insights),
 *    Usuário (profile.pgUsername), Senha mascarada `••••••••<last4>`.
 *  - Botão "Mostrar senha completa" → chama `revealPasswordAction(id)` (rate
 *    limit 5/dia) e abre `<CredentialsRevealDialog>` com a senha plain.
 *  - Botão "Rotacionar senha" → abre `<RotatePasswordDialog>`.
 *  - Footer: "Conexão TLS obrigatória."
 *
 * O CredentialsRevealDialog também serve para mostrar a senha pós-rotate.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { revealPasswordAction } from "@/lib/actions/integrations-power-bi";
import { cn } from "@/lib/utils";

import { CredentialsRevealDialog } from "./credentials-reveal-dialog";
import { RotatePasswordDialog } from "./rotate-password-dialog";

interface ProfileShape {
  id: string;
  name: string;
  pgUsername: string;
  passwordLast4: string;
}

interface Props {
  profile: ProfileShape;
  hostOverride?: string | null;
}

const DB_PORT = 5432;
const DB_NAME = "nexus_insights";

function getPublicHost(override?: string | null): string {
  if (override && override.length > 0) return override;
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_INTEGRATION_DB_HOST
      : undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return "configurar no .env (NEXT_PUBLIC_INTEGRATION_DB_HOST)";
}

export function ProfileCredentialsCard({ profile, hostOverride }: Props) {
  const router = useRouter();
  const [revealOpen, setRevealOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [rotatedPassword, setRotatedPassword] = useState<string | null>(null);
  const [isRevealing, startReveal] = useTransition();

  const host = getPublicHost(hostOverride);

  function handleReveal() {
    startReveal(async () => {
      const result = await revealPasswordAction(profile.id);
      if (!result.ok || !result.data) {
        toast.error(
          result.error ?? "Limite de revelações ou erro ao revelar senha.",
        );
        return;
      }
      setRevealedPassword(result.data.password);
      setRevealOpen(true);
      toast.success("Senha revelada — registrada no audit log.");
    });
  }

  function handleRevealOpenChange(next: boolean) {
    setRevealOpen(next);
    if (!next) setRevealedPassword(null);
  }

  function handleRotateSuccess(newPassword: string) {
    setRotatedPassword(newPassword);
    setRevealOpen(true);
    router.refresh();
  }

  function handleRotatedClose(next: boolean) {
    setRevealOpen(next);
    if (!next) setRotatedPassword(null);
  }

  // Quando rotated está setado, prioriza ele (post-rotate flow). Senão, reveal.
  const displayedPassword = rotatedPassword ?? revealedPassword;
  const handleDialogOpenChange = rotatedPassword
    ? handleRotatedClose
    : handleRevealOpenChange;

  return (
    <>
      <Card data-testid="profile-credentials-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Credenciais</CardTitle>
            <p className="text-xs text-muted-foreground">
              Use esses dados no Power BI Desktop ou Service.
            </p>
          </div>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300"
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CredentialField label="Host" value={host} mono />
            <CredentialField label="Porta" value={String(DB_PORT)} mono />
            <CredentialField label="Banco" value={DB_NAME} mono />
            <CredentialField label="Usuário" value={profile.pgUsername} mono />
            <div
              className="rounded-lg border border-border/60 bg-muted/30 p-2.5 sm:col-span-2"
              data-testid="masked-password-field"
            >
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Senha
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[12px] tracking-widest">
                  {`••••••••${profile.passwordLast4}`}
                </code>
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReveal}
              disabled={isRevealing}
              className="cursor-pointer"
              data-testid="reveal-password-button"
            >
              {isRevealing ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Mostrar senha completa
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRotateOpen(true)}
              className="cursor-pointer border-amber-500/40 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:border-amber-500/30 dark:text-amber-300 dark:hover:text-amber-200"
              data-testid="rotate-password-button"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Rotacionar senha
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <KeyRound
              className="h-3 w-3 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            Conexão TLS obrigatória.
          </p>
        </CardContent>
      </Card>

      <CredentialsRevealDialog
        open={revealOpen}
        onOpenChange={handleDialogOpenChange}
        profile={profile}
        plainPassword={displayedPassword}
        hostOverride={hostOverride}
      />

      <RotatePasswordDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        profileId={profile.id}
        profileName={profile.name}
        onSuccess={handleRotateSuccess}
      />
    </>
  );
}

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function CredentialField({ label, value, mono }: FieldProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1">
        <code
          className={cn(
            "block truncate rounded-md border border-border bg-background px-2 py-1.5 text-[12px]",
            mono && "font-mono",
          )}
          title={value}
        >
          {value}
        </code>
      </dd>
    </div>
  );
}
