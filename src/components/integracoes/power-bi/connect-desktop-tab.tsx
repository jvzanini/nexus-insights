"use client";

/**
 * ConnectDesktopTab — tab Power BI Desktop da Connect page.
 *
 * Conteúdo:
 *  - Tutorial numerado (1–7) com ícones Lucide ao lado de cada passo.
 *  - SnippetBlocks: Server (host:port), Database, User, Password (mascarada).
 *  - Botão "Mostrar senha" → revealPasswordAction → senha plain inline com Copy.
 *  - Footer note sobre TLS workaround.
 *
 * Reveal flow:
 *  - Estado local `revealed` (string | null). Botão "Ocultar" reseta.
 *  - revealPasswordAction é rate-limited (5/dia) e audit-logged no server.
 */

import { useState, useTransition } from "react";
import {
  CheckCircle,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  Server,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { revealPasswordAction } from "@/lib/actions/integrations-power-bi";

import { SnippetBlock } from "./snippet-block";

interface ConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  passwordLast4: string;
}

interface Props {
  profileId: string;
  connectionInfo: ConnectionInfo;
}

interface Step {
  icon: LucideIcon;
  text: string;
}

const STEPS: readonly Step[] = [
  { icon: Download, text: "Abra o Power BI Desktop." },
  { icon: Database, text: "Vá em Get Data → PostgreSQL database." },
  { icon: Server, text: "Server: cole o host:porta abaixo." },
  { icon: FileText, text: "Database: cole o nome do banco abaixo." },
  {
    icon: KeyRound,
    text: "Authentication: Database. User + Password copiados da plataforma.",
  },
  { icon: Lock, text: "Marque 'Encrypt connection' (TLS obrigatório)." },
  {
    icon: CheckCircle,
    text: "No Navigator, selecione as views liberadas e clique Load.",
  },
] as const;

export function ConnectDesktopTab({ profileId, connectionInfo }: Props) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isRevealing, startReveal] = useTransition();

  const masked = `••••••••${connectionInfo.passwordLast4}`;
  const serverValue = `${connectionInfo.host}:${connectionInfo.port}`;

  function handleReveal() {
    startReveal(async () => {
      const result = await revealPasswordAction(profileId);
      if (!result.ok || !result.data) {
        toast.error(
          result.error ?? "Falha ao revelar senha. Verifique o limite diário.",
        );
        return;
      }
      setRevealed(result.data.password);
      toast.success("Senha revelada — registrada no audit log.");
    });
  }

  function handleHide() {
    setRevealed(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tutorial numerado */}
      <ol
        data-testid="connect-desktop-steps"
        className="flex flex-col gap-2.5"
      >
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const num = idx + 1;
          return (
            <li
              key={num}
              data-testid={`connect-desktop-step-${num}`}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[12px] font-semibold text-violet-600 dark:text-violet-300"
              >
                {num}
              </span>
              <Icon
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              />
              <span className="text-sm text-foreground leading-relaxed">
                {step.text}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Snippet blocks de credenciais */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SnippetBlock label="Server" value={serverValue} />
        <SnippetBlock label="Database" value={connectionInfo.database} />
        <SnippetBlock label="User" value={connectionInfo.user} />

        {/* Password com reveal flow */}
        <div className="flex flex-col gap-1.5" data-testid="connect-desktop-password">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Password
            </span>
            {revealed ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleHide}
                className="h-6 cursor-pointer px-2 text-[11px] text-muted-foreground"
              >
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                Ocultar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleReveal}
                disabled={isRevealing}
                data-testid="connect-desktop-reveal"
                className="h-6 cursor-pointer px-2 text-[11px] text-violet-600 hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200"
              >
                {isRevealing ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Eye className="h-3 w-3" aria-hidden="true" />
                )}
                Mostrar senha
              </Button>
            )}
          </div>
          {revealed ? (
            <SnippetBlock value={revealed} />
          ) : (
            <pre
              className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 font-mono text-[12px] tracking-widest text-muted-foreground"
              data-testid="connect-desktop-password-masked"
            >
              {masked}
            </pre>
          )}
        </div>
      </div>

      {/* Footer note TLS workaround */}
      <div
        role="note"
        className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
      >
        <ShieldAlert
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <strong>Windows TLS workaround</strong>: se aparecer erro de TLS no
          Power BI, abra <code className="font-mono text-[11px]">Get Data {">"} PostgreSQL {">"} Advanced</code> e
          desabilite &quot;Encrypt connection&quot; (apenas para teste — em
          produção use Gateway).
        </p>
      </div>
    </div>
  );
}
