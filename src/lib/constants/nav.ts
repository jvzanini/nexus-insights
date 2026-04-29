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
      },
      {
        label: "Mensagens não respondidas",
        href: "/relatorios/mensagens-nao-respondidas",
        icon: MessageSquareWarning,
      },
      {
        label: "Status das conversas",
        href: "/relatorios/status-conversas",
        icon: ListChecks,
      },
      {
        label: "Tempos de resposta",
        href: "/relatorios/tempos-resposta",
        icon: Clock,
      },
      {
        label: "SLA",
        href: "/relatorios/sla",
        icon: Shield,
        featureFlag: "feature_flags.sla_enabled",
      },
      { label: "Volumetria", href: "/relatorios/volumetria", icon: BarChart3 },
      {
        label: "Ranking de atendentes",
        href: "/relatorios/ranking-atendentes",
        icon: Trophy,
      },
      {
        label: "Por departamento",
        href: "/relatorios/por-departamento",
        icon: Building2,
      },
      { label: "Por estado", href: "/relatorios/por-estado", icon: Map },
      {
        label: "Leads recebidos",
        href: "/relatorios/leads-recebidos",
        icon: Calendar,
      },
      {
        label: "Matrix IA",
        href: "/relatorios/matrix-ia",
        icon: Bot,
        superAdminOnly: true,
      },
      {
        label: "CSAT",
        href: "/relatorios/csat",
        icon: Smile,
        featureFlag: "feature_flags.csat_enabled",
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
  { label: "Perfil", href: "/perfil", icon: User },
];

export function filterNav(
  items: NavItem[],
  user: { platformRole: PlatformRole; isOwner?: boolean },
  settings: Record<string, unknown> = {},
): NavItem[] {
  return items
    .filter((item) => {
      if (item.superAdminOnly && user.platformRole !== "super_admin") {
        return false;
      }
      if (item.visibleTo && !item.visibleTo.includes(user.platformRole)) {
        return false;
      }
      if (item.featureFlag) {
        const flag = settings[item.featureFlag];
        if (flag === false) return false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      children: item.children
        ? filterNav(item.children, user, settings)
        : undefined,
    }));
}
