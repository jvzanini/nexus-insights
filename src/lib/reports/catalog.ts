import {
  MessageSquare,
  MailWarning,
  LayoutDashboard,
  Zap,
  Users,
  Map,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface ReportEntry {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const REPORTS_CATALOG: ReportEntry[] = [
  {
    key: "visao-geral",
    label: "Visão Geral",
    href: "/relatorios/visao-geral",
    icon: LayoutDashboard,
    description: "Status + volumetria geral",
  },
  {
    key: "performance",
    label: "Performance",
    href: "/relatorios/performance",
    icon: Zap,
    description: "Tempos de resposta, SLA e CSAT",
  },
  {
    key: "equipe",
    label: "Equipe",
    href: "/relatorios/equipe",
    icon: Users,
    description: "Ranking de atendentes e departamentos",
  },
  {
    key: "distribuicao",
    label: "Distribuição",
    href: "/relatorios/distribuicao",
    icon: Map,
    description: "Estados, inboxes e horários",
  },
  {
    key: "origem-ia",
    label: "Origem & IA",
    href: "/relatorios/origem-ia",
    icon: Sparkles,
    description: "Leads e Matrix IA",
  },
  {
    key: "conversas",
    label: "Conversas",
    href: "/relatorios/conversas",
    icon: MessageSquare,
    description: "Lista detalhada com filtros avançados",
  },
  {
    key: "mensagens-nao-respondidas",
    label: "Mensagens não respondidas",
    href: "/relatorios/mensagens-nao-respondidas",
    icon: MailWarning,
    description: "Conversas em aberto aguardando resposta",
  },
];

export const ALL_REPORT_KEYS = REPORTS_CATALOG.map((r) => r.key);

export function getReportByKey(key: string): ReportEntry | null {
  return REPORTS_CATALOG.find((r) => r.key === key) ?? null;
}
