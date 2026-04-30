import {
  Home,
  BarChart3,
  Users,
  Settings,
  User,
  MessageSquare,
  MessageSquareWarning,
  Calendar,
  Clock,
  Trophy,
  Building2,
  Map,
  ListChecks,
  Smile,
  Shield,
  Bot,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlatformRole } from "@/generated/prisma/client";

export type NavSection = "reports" | "admin";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  visibleTo?: PlatformRole[];
  superAdminOnly?: boolean;
  featureFlag?: string;
  children?: NavItem[];
  /**
   * Marca o início de uma seção visual no sidebar (com header).
   * Aplicado apenas em itens de nível raiz.
   */
  section?: NavSection;
  /**
   * Identificador opcional do relatório no catálogo (REPORTS_CATALOG).
   * Quando presente, o item só aparece se a key estiver no conjunto
   * de relatórios habilitados via /configuracoes.
   */
  key?: string;
};

export const SECTION_LABELS: Record<NavSection, string> = {
  reports: "Relatórios",
  admin: "Administração",
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: BarChart3,
    section: "reports",
    children: [
      {
        label: "Conversas",
        href: "/relatorios/conversas",
        icon: MessageSquare,
        key: "conversas",
      },
      {
        label: "Mensagens não respondidas",
        href: "/relatorios/mensagens-nao-respondidas",
        icon: MessageSquareWarning,
        key: "mensagens-nao-respondidas",
      },
      {
        label: "Status das conversas",
        href: "/relatorios/status-conversas",
        icon: ListChecks,
        key: "status-conversas",
      },
      {
        label: "Tempos de resposta",
        href: "/relatorios/tempos-resposta",
        icon: Clock,
        key: "tempos-resposta",
      },
      {
        label: "SLA",
        href: "/relatorios/sla",
        icon: Shield,
        featureFlag: "feature_flags.sla_enabled",
        key: "sla",
      },
      {
        label: "Volumetria",
        href: "/relatorios/volumetria",
        icon: BarChart3,
        key: "volumetria",
      },
      {
        label: "Ranking de atendentes",
        href: "/relatorios/ranking-atendentes",
        icon: Trophy,
        key: "ranking-atendentes",
      },
      {
        label: "Por departamento",
        href: "/relatorios/por-departamento",
        icon: Building2,
        key: "por-departamento",
      },
      {
        label: "Por estado",
        href: "/relatorios/por-estado",
        icon: Map,
        key: "por-estado",
      },
      {
        label: "Leads recebidos",
        href: "/relatorios/leads-recebidos",
        icon: Calendar,
        key: "leads-recebidos",
      },
      {
        label: "Matrix IA",
        href: "/relatorios/matrix-ia",
        icon: Bot,
        superAdminOnly: true,
        key: "matrix-ia",
      },
      {
        label: "CSAT",
        href: "/relatorios/csat",
        icon: Smile,
        featureFlag: "feature_flags.csat_enabled",
        key: "csat",
      },
    ],
  },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    visibleTo: ["super_admin", "admin", "manager"],
    section: "admin",
  },
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: Settings,
    superAdminOnly: true,
  },
  {
    label: "Consumo IA",
    href: "/configuracoes/consumo",
    icon: Sparkles,
    superAdminOnly: true,
    section: "admin",
  },
  { label: "Perfil", href: "/perfil", icon: User },
];

export function filterNav(
  items: NavItem[],
  user: { platformRole: PlatformRole; isOwner?: boolean },
  settings: Record<string, unknown> = {},
  enabledReportKeys?: ReadonlySet<string> | string[],
): NavItem[] {
  const enabledSet =
    enabledReportKeys instanceof Set
      ? enabledReportKeys
      : Array.isArray(enabledReportKeys)
        ? new Set(enabledReportKeys)
        : null;

  const result: NavItem[] = [];
  for (const item of items) {
    if (item.superAdminOnly && user.platformRole !== "super_admin") {
      continue;
    }
    if (item.visibleTo && !item.visibleTo.includes(user.platformRole)) {
      continue;
    }
    if (item.featureFlag) {
      const flag = settings[item.featureFlag];
      if (flag === false) continue;
    }
    if (item.key && enabledSet && !enabledSet.has(item.key)) {
      continue;
    }

    const children = item.children
      ? filterNav(item.children, user, settings, enabledSet ?? undefined)
      : undefined;

    // Se um item-pai possui children e todos foram filtrados, esconde o pai.
    if (item.children && item.children.length > 0 && (!children || children.length === 0)) {
      continue;
    }

    result.push({ ...item, children });
  }
  return result;
}
