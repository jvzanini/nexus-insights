"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { changePassword } from "@/lib/actions/profile";

const MIN_LENGTH = 8;

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  disabled?: boolean;
  autoComplete?: string;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  disabled,
  autoComplete,
}: PasswordFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          className="pr-9"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, start] = useTransition();

  const newTooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword !== confirmPassword;

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    confirmPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword &&
    !isPending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    start(async () => {
      const result = await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (result.success) {
        toast.success("Senha alterada com sucesso");
        router.push("/perfil");
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao trocar senha");
      }
    });
  }

  return (
    <Card className="mx-auto w-full max-w-md rounded-2xl border border-border bg-muted/30 p-2">
      <CardContent className="space-y-5 pt-2">
        <form onSubmit={handleSubmit} className="space-y-5">
          <PasswordField
            id="current-password"
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            disabled={isPending}
            autoComplete="current-password"
          />

          <PasswordField
            id="new-password"
            label="Nova senha"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            disabled={isPending}
            autoComplete="new-password"
          />
          {newTooShort ? (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />A nova senha precisa ter pelo
              menos {MIN_LENGTH} caracteres
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Use no mínimo {MIN_LENGTH} caracteres.
            </p>
          )}

          <PasswordField
            id="confirm-password"
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
            disabled={isPending}
            autoComplete="new-password"
          />
          {mismatch ? (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              As senhas não coincidem
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="submit"
              disabled={!canSubmit}
              className="cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-4 w-4" />
              )}
              Trocar senha
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
