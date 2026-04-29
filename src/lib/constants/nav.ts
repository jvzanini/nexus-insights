import {
  Home,
  BarChart3,
  Users,
  Settings,
  User,
  MessageSquare,
  Calendar,
  Clock,
  Trophy,
  Building2,
  Map,
  ListChecks,
  Smile,
  Shield,
  Bot,
  MailWarning,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlatformRole } from "@/generated/prisma/client";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  visibleTo?: PlatformRole[];
  superAdminOnly?: boolean;
  featureFlag?: string;
  children?: NavItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: BarChart3,
    children: [
      {
        label: "Conversas",
        href: "/relatorios/conversas",
        icon: MessageSquare,
      },
      {
        label: "Mensagens não respondidas",
        href: "/relatorios/mensagens-nao-respondidas",
        icon: MailWarning,
      },
      {
        label: "Leads recebidos",
        href: "/relatorios/leads-recebidos",
        icon: Calendar,
      },
      { label: "Volumetria", href: "/relatorios/volumetria", icon: BarChart3 },
      {
        label: "Tempos de resposta",
        href: "/relatorios/tempos-resposta",
        icon: Clock,
      },
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
        label: "Status das conversas",
        href: "/relatorios/status-conversas",
        icon: ListChecks,
      },
      {
        label: "CSAT",
        href: "/relatorios/csat",
        icon: Smile,
        featureFlag: "feature_flags.csat_enabled",
      },
      {
        label: "SLA",
        href: "/relatorios/sla",
        icon: Shield,
        featureFlag: "feature_flags.sla_enabled",
      },
      {
        label: "Matrix IA",
        href: "/relatorios/matrix-ia",
        icon: Bot,
        superAdminOnly: true,
      },
    ],
  },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    visibleTo: ["super_admin", "admin", "manager"],
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
