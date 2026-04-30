import {
  MessageSquare,
  MailWarning,
  PieChart,
  Clock,
  Timer,
  Trophy,
  Users,
  Map,
  BarChart3,
  UserPlus,
  Sparkles,
  Smile,
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
    key: "conversas",
    label: "Conversas",
    href: "/relatorios/conversas",
    icon: MessageSquare,
    description: "Lista detalhada de conversas com filtros",
  },
  {
    key: "mensagens-nao-respondidas",
    label: "Mensagens não respondidas",
    href: "/relatorios/mensagens-nao-respondidas",
    icon: MailWarning,
    description: "Conversas em aberto aguardando resposta do time",
  },
  {
    key: "status-conversas",
    label: "Status das Conversas",
    href: "/relatorios/status-conversas",
    icon: PieChart,
    description: "Distribuição por status (open/pending/resolved)",
  },
  {
    key: "tempos-resposta",
    label: "Tempos de Resposta",
    href: "/relatorios/tempos-resposta",
    icon: Clock,
    description: "Análise de first response e resolution time",
  },
  {
    key: "sla",
    label: "SLA",
    href: "/relatorios/sla",
    icon: Timer,
    description: "Cumprimento de SLA",
  },
  {
    key: "ranking-atendentes",
    label: "Ranking de Atendentes",
    href: "/relatorios/ranking-atendentes",
    icon: Trophy,
    description: "Performance comparada de atendentes",
  },
  {
    key: "por-departamento",
    label: "Por Departamento",
    href: "/relatorios/por-departamento",
    icon: Users,
    description: "Métricas agrupadas por team/departamento",
  },
  {
    key: "por-estado",
    label: "Por Estado",
    href: "/relatorios/por-estado",
    icon: Map,
    description: "Distribuição geográfica por inbox",
  },
  {
    key: "volumetria",
    label: "Volumetria",
    href: "/relatorios/volumetria",
    icon: BarChart3,
    description: "Volume de conversas por hora/dia",
  },
  {
    key: "leads-recebidos",
    label: "Leads Recebidos",
    href: "/relatorios/leads-recebidos",
    icon: UserPlus,
    description: "Novos leads/contatos recebidos",
  },
  {
    key: "matrix-ia",
    label: "Matrix IA",
    href: "/relatorios/matrix-ia",
    icon: Sparkles,
    description: "Performance da inbox de IA",
  },
  {
    key: "csat",
    label: "CSAT",
    href: "/relatorios/csat",
    icon: Smile,
    description: "Customer Satisfaction Score",
  },
];

export const ALL_REPORT_KEYS = REPORTS_CATALOG.map((r) => r.key);

export function getReportByKey(key: string): ReportEntry | null {
  return REPORTS_CATALOG.find((r) => r.key === key) ?? null;
}
