"use client";

/**
 * ProfileWizardDialog — orchestrator do wizard de criação/edição de
 * perfil Power BI (Tasks T14-T18).
 *
 * Modos:
 *  - "create" → submit chama `createProfileAction`. Em sucesso, chama
 *    `onSuccess({ profile, plainPassword })` para o pai abrir o
 *    `CredentialsRevealDialog`.
 *  - "edit"   → submit chama `updateProfileAction(id, data, expectedUpdatedAt)`.
 *    Toast informativo sobre conexões ativas.
 *
 * Estado controlado: `step` (0..3), `formData`, `isSubmitting`, `error`.
 *
 * Dirty check: se isDirty=true e onOpenChange(false), abre confirm.
 *
 * Validação por step:
 *  - 0 (identity): name >= 3 chars
 *  - 1 (tables):   ≥ 1 tabela selecionada
 *  - 2 (columns):  ≥ 1 coluna por tabela (PKs garantem isso)
 *  - 3 (filters):  sempre OK (toggles independentes; arrays vazios viram null)
 */

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createProfileAction,
  updateProfileAction,
  type CreatedProfileResult,
  type ProfileListItem,
} from "@/lib/actions/integrations-power-bi";
import { getCatalogEntry } from "@/lib/integrations/power-bi/catalog";

import { WizardProgressBar, WIZARD_STEPS } from "./wizard-progress-bar";
import { WizardStepIdentity } from "./wizard-step-identity";
import { WizardStepTables } from "./wizard-step-tables";
import { WizardStepColumns } from "./wizard-step-columns";
import { WizardStepFilters } from "./wizard-step-filters";
import {
  EMPTY_WIZARD_FORM,
  type WizardFormData,
} from "./wizard-types";

type Mode = "create" | "edit";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initial?: Partial<WizardFormData>;
}

interface CreateProps extends BaseProps {
  mode: "create";
  onSuccess?: (result: CreatedProfileResult) => void;
}

interface EditProps extends BaseProps {
  mode: "edit";
  profileId: string;
  expectedUpdatedAt: string;
  onSuccess?: (profile: ProfileListItem) => void;
}

export type ProfileWizardDialogProps = CreateProps | EditProps;

function buildInitial(initial?: Partial<WizardFormData>): WizardFormData {
  return {
    ...EMPTY_WIZARD_FORM,
    ...(initial ?? {}),
    allowedTables: initial?.allowedTables ? [...initial.allowedTables] : [],
    allowedColumns: initial?.allowedColumns
      ? Object.fromEntries(
          Object.entries(initial.allowedColumns).map(([k, v]) => [
            k,
            [...v],
          ]),
        )
      : {},
    accountIdFilter:
      initial?.accountIdFilter !== undefined
        ? initial.accountIdFilter
        : null,
    teamIdFilter:
      initial?.teamIdFilter !== undefined ? initial.teamIdFilter : null,
  };
}

function isEqual(a: WizardFormData, b: WizardFormData): boolean {
  if (a.name !== b.name) return false;
  if ((a.description ?? "") !== (b.description ?? "")) return false;
  if (a.allowedTables.length !== b.allowedTables.length) return false;
  const at = [...a.allowedTables].sort();
  const bt = [...b.allowedTables].sort();
  for (let i = 0; i < at.length; i++) if (at[i] !== bt[i]) return false;
  const ak = Object.keys(a.allowedColumns).sort();
  const bk = Object.keys(b.allowedColumns).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    const av = [...(a.allowedColumns[ak[i]] ?? [])].sort();
    const bv = [...(b.allowedColumns[bk[i]] ?? [])].sort();
    if (av.length !== bv.length) return false;
    for (let j = 0; j < av.length; j++) if (av[j] !== bv[j]) return false;
  }
  if (
    JSON.stringify(a.accountIdFilter) !== JSON.stringify(b.accountIdFilter)
  )
    return false;
  if (JSON.stringify(a.teamIdFilter) !== JSON.stringify(b.teamIdFilter))
    return false;
  return true;
}

export function ProfileWizardDialog(props: ProfileWizardDialogProps) {
  const { open, onOpenChange, mode, initial } = props;
  const router = useRouter();

  const initialData = useMemo(() => buildInitial(initial), [initial]);
  const [data, setData] = useState<WizardFormData>(initialData);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // Snapshot captura o initial quando o dialog abre — usado pra dirty check.
  // `useState` ao invés de `useRef` evita lint react-hooks/refs em render.
  const [initialSnapshot, setInitialSnapshot] =
    useState<WizardFormData>(initialData);

  // Reset interno quando o dialog (re)abre. Setting state em effect é
  // necessário para sincronizar com a prop `open` controlada.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setInitialSnapshot(initialData);
    setData(initialData);
    setStep(0);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initialData]);

  const isDirty = useMemo(
    () => !isEqual(data, initialSnapshot),
    [data, initialSnapshot],
  );

  function handleChange(next: Partial<WizardFormData>) {
    setData((prev) => ({ ...prev, ...next }));
    setError(null);
  }

  function handleSetData(updater: SetStateAction<WizardFormData>) {
    setData(updater);
    setError(null);
  }
  void handleSetData; // exposto pra extensões; lint sossega

  function attemptClose(next: boolean) {
    if (isSubmitting) return;
    if (!next && isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(next);
  }

  function confirmDiscardYes() {
    setConfirmDiscardOpen(false);
    onOpenChange(false);
  }

  function validateStep(s: number): string | null {
    if (s === 0) {
      const name = data.name.trim();
      if (name.length < 3) return "Nome deve ter ao menos 3 caracteres.";
      if (!/^[A-Za-z0-9 _\-]+$/.test(name))
        return "Caracteres inválidos no nome.";
      if (name.length > 60) return "Nome muito longo (máx 60).";
      if ((data.description ?? "").length > 280)
        return "Descrição muito longa (máx 280).";
      return null;
    }
    if (s === 1) {
      if (data.allowedTables.length === 0)
        return "Selecione ao menos uma tabela.";
      return null;
    }
    if (s === 2) {
      for (const t of data.allowedTables) {
        const cols = data.allowedColumns[t];
        if (!cols || cols.length === 0)
          return `Selecione ao menos uma coluna em ${t}.`;
      }
      return null;
    }
    return null;
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    if (step < WIZARD_STEPS.length - 1) {
      setStep(step + 1);
      setError(null);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
      setError(null);
    }
  }

  function handleSubmit() {
    // Validação final cruzando todos os steps.
    for (let i = 0; i < WIZARD_STEPS.length; i++) {
      const e = validateStep(i);
      if (e) {
        setStep(i);
        setError(e);
        return;
      }
    }

    // Normaliza filters: garante que PKs estão presentes em allowedColumns
    // e converte arrays vazios em null.
    const allowedColumns: Record<string, string[]> = {};
    for (const t of data.allowedTables) {
      const entry = getCatalogEntry(t);
      if (!entry) continue;
      const current = data.allowedColumns[t] ?? [];
      const merged = Array.from(
        new Set([...current, ...entry.pkColumns]),
      );
      allowedColumns[t] = merged;
    }

    const payload = {
      name: data.name.trim(),
      description: data.description.trim() ? data.description.trim() : null,
      allowedTables: [...data.allowedTables],
      allowedColumns,
      accountIdFilter:
        data.accountIdFilter && data.accountIdFilter.length > 0
          ? data.accountIdFilter
          : null,
      teamIdFilter:
        data.teamIdFilter && data.teamIdFilter.length > 0
          ? data.teamIdFilter
          : null,
    };

    startSubmit(async () => {
      if (props.mode === "create") {
        const result = await createProfileAction(payload);
        if (!result.ok || !result.data) {
          const msg = result.error ?? "Falha ao criar perfil.";
          setError(msg);
          toast.error(msg);
          return;
        }
        toast.success(`Perfil "${payload.name}" criado.`);
        onOpenChange(false);
        props.onSuccess?.(result.data);
        router.refresh();
      } else {
        const result = await updateProfileAction(
          props.profileId,
          payload,
          props.expectedUpdatedAt,
        );
        if (!result.ok || !result.data) {
          const msg = result.error ?? "Falha ao atualizar perfil.";
          setError(msg);
          toast.error(msg);
          return;
        }
        toast.success(
          "Whitelist atualizada. Conexões Power BI ativas continuarão usando o esquema antigo até a próxima refresh.",
        );
        onOpenChange(false);
        props.onSuccess?.(result.data.profile);
        router.refresh();
      }
    });
  }

  const isFinal = step === WIZARD_STEPS.length - 1;
  const submitLabel =
    mode === "create" ? "Criar perfil" : "Salvar alterações";

  return (
    <>
      <Dialog open={open} onOpenChange={attemptClose}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 sm:max-w-3xl"
          showCloseButton={!isSubmitting}
        >
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <DialogHeader>
              <DialogTitle>
                {mode === "create"
                  ? "Novo perfil Power BI"
                  : `Editar perfil — ${data.name || "..."}`}
              </DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? "Configure nome, tabelas, colunas e filtros. As credenciais são geradas ao final."
                  : "Atualize a whitelist (tabelas, colunas, filtros). Username e senha permanecem."}
              </DialogDescription>
            </DialogHeader>

            <WizardProgressBar
              current={step}
              onStepClick={(idx) => setStep(idx)}
            />

            <div className="border-t border-border/60 pt-5">
              {step === 0 ? (
                <WizardStepIdentity
                  data={data}
                  onChange={handleChange}
                  error={error}
                  disabled={isSubmitting}
                />
              ) : null}
              {step === 1 ? (
                <WizardStepTables
                  data={data}
                  onChange={handleChange}
                  error={error}
                  disabled={isSubmitting}
                />
              ) : null}
              {step === 2 ? (
                <WizardStepColumns
                  data={data}
                  onChange={handleChange}
                  error={error}
                  disabled={isSubmitting}
                />
              ) : null}
              {step === 3 ? (
                <WizardStepFilters
                  data={data}
                  onChange={handleChange}
                  error={error}
                  disabled={isSubmitting}
                />
              ) : null}
            </div>
          </div>

          <DialogFooter className="m-0 -mx-0 -mb-0 rounded-b-2xl border-t border-border bg-secondary/50 p-4 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={step === 0 || isSubmitting}
              className="cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => attemptClose(false)}
                disabled={isSubmitting}
                className="cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="cursor-pointer"
                data-testid="wizard-next"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : isFinal ? (
                  <Save className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                )}
                {isFinal ? submitLabel : "Continuar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem mudanças não salvas. Se sair agora, elas serão
              perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              Continuar editando
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDiscardYes}
            >
              Descartar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Re-export para conveniência do consumer.
export type { Dispatch, SetStateAction };
