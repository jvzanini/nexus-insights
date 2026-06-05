// Build XLSX puro a partir de ConversaRow[]. Sem chamadas a DB.
// Fonte canônica de status/prioridade em conversas-translations.ts.

import ExcelJS from "exceljs";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import {
  resolveStatusLabel,
  resolvePriorityLabel,
} from "@/lib/chatwoot/conversas-translations";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import { formatDuration } from "@/lib/utils/format-time";

export const MAX_DYNAMIC_ATTR_COLS = 50;

interface BuildArgs {
  rows: ConversaRow[];
}

interface BuildResult {
  buffer: Buffer;
  droppedAttrCount: number;
}

const FIXED_HEADERS = [
  "#",
  "Nome",
  "WhatsApp",
  "Documento",
  "País",
  "Estado/Cidade",
  "Estado",
  "Departamento",
  "Atendente",
  "Status",
  "Prioridade",
  "Etiquetas",
  "Criado em",
  "Última atualização",
  "Sem resposta há",
  "Aberta há",
];

function formatDateTimePtBr(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

function formatDurationOrDash(s: number | null): string {
  if (s == null) return "—";
  return formatDuration(s);
}

function getDocument(contact: ConversaRow["contact"]): string {
  const doc = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return doc?.formatted ?? "—";
}

function getPhone(phone: string | null): string {
  if (!phone) return "—";
  const formatted = formatPhone(phone);
  return formatted || phone || "—";
}

function joinLabels(labels: ConversaRow["labels"]): string {
  if (!labels || labels.length === 0) return "—";
  return labels.map((l) => l.name).join(", ");
}

/**
 * Converte uma chave de custom_attribute em rótulo legível:
 * troca `_`/`-` por espaço, colapsa espaços, trim e aplica Title Case.
 * Ex.: `wpp_id` → "Wpp Id", `status_atendimento` → "Status Atendimento".
 */
export function prettifyAttrKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function attrToCell(value: unknown): string {
  if (value == null || value === "") return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Top-N por frequência das chaves de custom_attributes em rows.
 * Ignora valores null/undefined/"" no count.
 * Tiebreak: ordem alfabética pt-BR.
 * Retorno final é re-ordenado alfabeticamente para estabilidade na UI.
 */
function pickTopAttributeKeys(
  rows: ConversaRow[],
  limit: number,
): { keep: string[]; dropped: number } {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.custom_attributes) continue;
    for (const k of Object.keys(r.custom_attributes)) {
      const v = r.custom_attributes[k];
      if (v === null || v === undefined || v === "") continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const all = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([k]) => k);
  const keep = all.slice(0, limit).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { keep, dropped: Math.max(all.length - keep.length, 0) };
}

export async function buildConversasXlsxBuffer(
  args: BuildArgs,
): Promise<BuildResult> {
  const { rows } = args;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Nexus Insights";
  wb.created = new Date();

  const ws = wb.addWorksheet("Conversas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const { keep: attrKeys, dropped } = pickTopAttributeKeys(
    rows,
    MAX_DYNAMIC_ATTR_COLS,
  );

  const dynamicHeaders = attrKeys.map((k) => `Atributo: ${prettifyAttrKey(k)}`);
  const headers = [...FIXED_HEADERS, ...dynamicHeaders];

  // v0.35 fix: header via addRow direto. Setar `ws.columns = [...]` em ExcelJS
  // combinado com `views: [{ frozen, ySplit: 1 }]` pré-aloca rows fantasma no
  // arquivo final (o Excel renderiza linhas vazias extras). addRow + getColumn
  // mantém o frozen pane sem efeito colateral.
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };

  // Widths individuais (1-based em ExcelJS)
  for (let i = 0; i < headers.length; i++) {
    ws.getColumn(i + 1).width = 18;
  }

  for (const r of rows) {
    const fixed = [
      r.display_id,
      r.contact.name ?? "—",
      getPhone(r.contact.phone_number),
      getDocument(r.contact),
      r.contact.country ?? "—",
      r.contact.estado ?? "—",
      r.inbox.name ?? "—",
      r.team.name ?? "—",
      r.assignee.name ?? "—",
      resolveStatusLabel(r.status),
      resolvePriorityLabel(r.priority),
      joinLabels(r.labels),
      formatDateTimePtBr(r.created_at),
      formatDateTimePtBr(r.last_activity_at),
      formatDurationOrDash(r.waiting_seconds),
      formatDurationOrDash(r.open_seconds),
    ];

    const dynamicValues = attrKeys.map((k) =>
      attrToCell(r.custom_attributes?.[k]),
    );

    ws.addRow([...fixed, ...dynamicValues]);
  }

  // exceljs retorna ExcelJS.Buffer (alias do Buffer do node). O cast via
  // `unknown` evita atrito entre os generics atuais de Buffer<ArrayBufferLike>.
  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  return { buffer, droppedAttrCount: dropped };
}
