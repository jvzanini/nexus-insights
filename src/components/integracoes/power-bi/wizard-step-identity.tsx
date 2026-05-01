"use client";

/**
 * WizardStep1 — Identificação do perfil.
 *
 * - Input "Nome" (max 60, regex live `^[A-Za-z0-9 _\-]+$`).
 * - Textarea "Descrição" (max 280, opcional).
 * - Preview readonly do username PostgreSQL: `pbi_<slug>______` (slug
 *   derivado do nome — lower-case + sanitizado; o sufixo de 6 hex é
 *   gerado pelo servidor, então mostramos placeholder).
 *
 * Foco automático no input "Nome" no mount (autoFocus) — útil para
 * acessibilidade keyboard-first.
 */

import { useId } from "react";
import { Hash, Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { deriveSlug, type WizardFormData } from "./wizard-types";

interface Props {
  data: WizardFormData;
  onChange: (next: Partial<WizardFormData>) => void;
  error?: string | null;
  disabled?: boolean;
}

const NAME_MAX = 60;
const DESC_MAX = 280;
const NAME_REGEX = /^[A-Za-z0-9 _\-]*$/;

export function WizardStepIdentity({
  data,
  onChange,
  error,
  disabled,
}: Props) {
  const nameId = useId();
  const descId = useId();
  const slugId = useId();

  const slug = deriveSlug(data.name);
  const slugPreview = slug ? `pbi_${slug}_______` : "pbi_<slug>_______";

  function handleNameChange(value: string) {
    // Filtra caracteres inválidos live — UX evita typing inválido.
    if (!NAME_REGEX.test(value)) return;
    if (value.length > NAME_MAX) return;
    onChange({ name: value });
  }

  function handleDescChange(value: string) {
    if (value.length > DESC_MAX) return;
    onChange({ description: value });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Identificação
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dê um nome claro pro perfil. Usado em logs e na lista.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={nameId}>
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input
          id={nameId}
          data-testid="wizard-name-input"
          value={data.name}
          onChange={(e) => handleNameChange(e.currentTarget.value)}
          placeholder="ex: Diretoria, Marketing-Geral"
          autoFocus
          autoComplete="off"
          maxLength={NAME_MAX}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${nameId}-error` : undefined}
          className="h-10"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>3-60 caracteres · letras, números, espaço, _ ou -</span>
          <span className="tabular-nums">
            {data.name.length}/{NAME_MAX}
          </span>
        </div>
        {error ? (
          <p
            id={`${nameId}-error`}
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={descId}>Descrição (opcional)</Label>
        <Textarea
          id={descId}
          data-testid="wizard-description-input"
          value={data.description}
          onChange={(e) => handleDescChange(e.currentTarget.value)}
          placeholder="ex: Acesso somente para o time de diretoria, dados consolidados."
          maxLength={DESC_MAX}
          disabled={disabled}
          className="min-h-[72px]"
        />
        <div className="flex justify-end text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {data.description.length}/{DESC_MAX}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={slugId} className="gap-2 text-muted-foreground">
          <Hash className="h-3.5 w-3.5" aria-hidden="true" />
          Usuário PostgreSQL (gerado automaticamente)
        </Label>
        <div
          id={slugId}
          data-testid="wizard-slug-preview"
          className={cn(
            "flex h-10 items-center rounded-lg border border-dashed border-border bg-muted/30 px-3 font-mono text-sm",
            slug ? "text-foreground" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {slugPreview}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
          O sufixo de 6 caracteres é gerado pelo servidor para evitar
          colisões. Não pode ser alterado depois.
        </p>
      </div>
    </div>
  );
}
