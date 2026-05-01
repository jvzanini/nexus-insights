"use client";

/**
 * CredentialsRevealDialog — Dialog one-time/protegido que mostra as
 * credenciais de conexão Power BI.
 *
 * Modos:
 *  - **Criação**: `plainPassword` chega via prop. Mostrado inline assim
 *    que abre. Aviso visível: "salve essa senha agora".
 *  - **Pós-criação**: `plainPassword` é null. Botão "Mostrar senha
 *    completa" chama `revealPasswordAction(id)` (rate-limited 5/dia).
 *
 * Conteúdo do bloco copiável (multi-linha):
 *   Host:    <env público OU "configurar no .env">
 *   Porta:   5432
 *   Banco:   nexus_insights
 *   Usuário: <pgUsername>
 *   Senha:   <plain ou ••••<last4>>
 *
 * Segurança:
 *  - Ao fechar (onOpenChange(false)), senha é limpa do state local.
 *  - Reveal é audit-logged (server action) — UI só consome.
 *  - Botão "Copiar credenciais" usa Clipboard API com fallback a textarea.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { revealPasswordAction } from "@/lib/actions/integrations-power-bi";
import { cn } from "@/lib/utils";

interface ProfileShape {
  id: string;
  name: string;
  pgUsername: string;
  passwordLast4: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileShape | null;
  /** Quando provido (modo criação), mostra inline imediatamente. */
  plainPassword?: string | null;
  /** Override do host público (default: env NEXT_PUBLIC_INTEGRATION_DB_HOST). */
  hostOverride?: string | null;
}

const DB_PORT = 5432;
const DB_NAME = "nexus_insights";

function getPublicHost(override?: string | null): string {
  if (override && override.length > 0) return override;
  // Acessível em client (NEXT_PUBLIC_*) — caso contrário fallback explícito.
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_INTEGRATION_DB_HOST
      : undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return "configurar no .env (NEXT_PUBLIC_INTEGRATION_DB_HOST)";
}

function buildBlock(opts: {
  host: string;
  user: string;
  password: string;
}): string {
  const lines = [
    `Host:    ${opts.host}`,
    `Porta:   ${DB_PORT}`,
    `Banco:   ${DB_NAME}`,
    `Usuário: ${opts.user}`,
    `Senha:   ${opts.password}`,
    `SSL:     obrigatório (TLS)`,
  ];
  return lines.join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback abaixo
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CredentialsRevealDialog({
  open,
  onOpenChange,
  profile,
  plainPassword: initialPlain,
  hostOverride,
}: Props) {
  const labelId = useId();

  // Senha plain só vive enquanto o dialog está aberto. Ao fechar,
  // limpamos para evitar vazamento via DevTools.
  const [plainPassword, setPlainPassword] = useState<string | null>(
    initialPlain ?? null,
  );
  const [showPassword, setShowPassword] = useState<boolean>(
    Boolean(initialPlain),
  );
  const [isRevealing, startReveal] = useTransition();
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync com prop initialPlain ao reabrir (criação reusa instance via key).
  // Reset on close é crítico de segurança (senha em memória), justificando
  // a violação do react-hooks/set-state-in-effect.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setPlainPassword(initialPlain ?? null);
      setShowPassword(Boolean(initialPlain));
      setCopied(false);
    } else {
      // hard reset on close — senha NUNCA deve persistir.
      setPlainPassword(null);
      setShowPassword(false);
      setCopied(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initialPlain]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  if (!profile) {
    return null;
  }

  const host = getPublicHost(hostOverride);
  const passwordVisible =
    showPassword && plainPassword ? plainPassword : null;
  const passwordDisplay = passwordVisible
    ? passwordVisible
    : `••••••••${profile.passwordLast4}`;

  function handleReveal() {
    if (!profile) return;
    startReveal(async () => {
      const result = await revealPasswordAction(profile.id);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Falha ao revelar senha.");
        return;
      }
      setPlainPassword(result.data.password);
      setShowPassword(true);
      toast.success("Senha revelada — registrada no audit log.");
    });
  }

  function handleHide() {
    setShowPassword(false);
    // Mantém plainPassword em memória pra permitir re-toggle sem novo audit?
    // Política: NÃO. Quem ocultou deve revelar de novo (paga audit).
    setPlainPassword(null);
  }

  async function handleCopyAll() {
    if (!plainPassword || !profile) {
      toast.error(
        "Revele a senha antes de copiar (necessário para uso real).",
      );
      return;
    }
    const block = buildBlock({
      host,
      user: profile.pgUsername,
      password: plainPassword,
    });
    const ok = await copyText(block);
    if (!ok) {
      toast.error("Falha ao copiar — tente manualmente.");
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2200);
    toast.success("Credenciais copiadas para a área de transferência.");
  }

  async function handleCopyField(value: string, label: string) {
    const ok = await copyText(value);
    if (ok) toast.success(`${label} copiado.`);
    else toast.error(`Falha ao copiar ${label.toLowerCase()}.`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-labelledby={labelId}>
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle id={labelId}>
                {initialPlain
                  ? "Perfil criado com sucesso"
                  : "Credenciais do perfil"}
              </DialogTitle>
              <DialogDescription>
                {profile.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Aviso só na criação (plain inline). */}
        {initialPlain ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
          >
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-snug">
              Salve essa senha agora. Você poderá revelá-la depois, mas isso
              fica registrado no audit log do perfil.
            </p>
          </div>
        ) : null}

        {/* Bloco de credenciais */}
        <dl className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <Field
            label="Host"
            value={host}
            mono
            onCopy={() => handleCopyField(host, "Host")}
          />
          <Field
            label="Porta"
            value={String(DB_PORT)}
            mono
            onCopy={() => handleCopyField(String(DB_PORT), "Porta")}
          />
          <Field
            label="Banco"
            value={DB_NAME}
            mono
            onCopy={() => handleCopyField(DB_NAME, "Banco")}
          />
          <Field
            label="Usuário"
            value={profile.pgUsername}
            mono
            onCopy={() => handleCopyField(profile.pgUsername, "Usuário")}
          />
          <div className="flex items-start gap-2">
            <dt className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
              Senha
            </dt>
            <dd className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <code
                  data-testid="creds-password"
                  className={cn(
                    "flex-1 min-w-0 truncate rounded-md bg-background px-2 py-1.5 font-mono text-[12px] border border-border",
                    !passwordVisible && "tracking-widest",
                  )}
                >
                  {passwordDisplay}
                </code>
                {passwordVisible ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={handleHide}
                    aria-label="Ocultar senha"
                    title="Ocultar"
                  >
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleReveal}
                    disabled={isRevealing}
                    data-testid="creds-reveal-btn"
                    title="Mostrar senha (registra no audit log)"
                  >
                    {isRevealing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Mostrar senha completa
                  </Button>
                )}
                {passwordVisible ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      handleCopyField(passwordVisible, "Senha")
                    }
                    aria-label="Copiar senha"
                    title="Copiar"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </dd>
          </div>
        </dl>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <KeyRound className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
          Conexão TLS obrigatória. Power BI Desktop: Get Data → PostgreSQL →
          marque &quot;Encrypt Connection&quot;.
        </p>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={handleCopyAll}
            disabled={!plainPassword}
            title={
              !plainPassword
                ? "Revele a senha antes de copiar"
                : "Copia bloco multi-linha pronto pra colar"
            }
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copiado" : "Copiar credenciais"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}

function Field({ label, value, mono, onCopy }: FieldProps) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
        {label}
      </dt>
      <dd className="flex-1 min-w-0 flex items-center gap-1.5">
        <code
          className={cn(
            "flex-1 min-w-0 truncate rounded-md bg-background px-2 py-1.5 text-[12px] border border-border",
            mono && "font-mono",
          )}
          title={value}
        >
          {value}
        </code>
        {onCopy ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onCopy}
            aria-label={`Copiar ${label}`}
            title="Copiar"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </dd>
    </div>
  );
}
