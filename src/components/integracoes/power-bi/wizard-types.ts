/**
 * Tipos compartilhados entre os 4 steps do wizard de perfil Power BI.
 *
 * `WizardFormData` é o estado controlado central — cada step recebe
 * `{data, onChange}` e devolve mutações imutáveis. Validação por step
 * vive no orchestrator (`profile-wizard-dialog.tsx`).
 */

export interface WizardFormData {
  /** Step 1 */
  name: string;
  description: string;
  /** Step 2 — array de table names (catalog keys). */
  allowedTables: string[];
  /** Step 3 — para cada table selecionada, array de col names. */
  allowedColumns: Record<string, string[]>;
  /** Step 4 — null = "todas"; array vazio é tratado como "todas" também. */
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

export const EMPTY_WIZARD_FORM: WizardFormData = {
  name: "",
  description: "",
  allowedTables: [],
  allowedColumns: {},
  accountIdFilter: null,
  teamIdFilter: null,
};

/**
 * Slug derivado pra preview do username (mesma lógica do server action).
 * Lower-case, [^a-z0-9] → _, _+ colapsado, max 30 chars.
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}
