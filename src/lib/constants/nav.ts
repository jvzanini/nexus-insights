import {
  Home,
  BarChart3,
  Users,
  Settings,
  User,
  MessageSquare,
  MessageSquareWarning,
  LayoutDashboard,
  Zap,
  UsersRound,
  Map,
  Sparkles,
  Database,
  SlidersHorizontal,
  KeyRound,
  BookOpen,
  TrendingUp,
  Plug,
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
        label: "Visão Geral",
        href: "/relatorios/visao-geral",
        icon: LayoutDashboard,
        key: "visao-geral",
      },
      {
        label: "Performance",
        href: "/relatorios/performance",
        icon: Zap,
        key: "performance",
      },
      {
        label: "Equipe",
        href: "/relatorios/equipe",
        icon: UsersRound,
        key: "equipe",
      },
      {
        label: "Distribuição",
        href: "/relatorios/distribuicao",
        icon: Map,
        key: "distribuicao",
      },
      {
        label: "Origem & IA",
        href: "/relatorios/origem-ia",
        icon: Sparkles,
        key: "origem-ia",
      },
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
    ],
  },
  {
    label: "Agente Nex",
    href: "/agente-nex",
    icon: Sparkles,
    superAdminOnly: true,
    section: "admin",
    children: [
      { label: "Configuração", href: "/agente-nex/configuracao", icon: SlidersHorizontal, superAdminOnly: true },
      { label: "Chaves de API", href: "/agente-nex/chaves", icon: KeyRound, superAdminOnly: true },
      { label: "Prompt", href: "/agente-nex/prompt", icon: BookOpen, superAdminOnly: true },
      { label: "Consumo", href: "/agente-nex/consumo", icon: TrendingUp, superAdminOnly: true },
    ],
  },
  {
    label: "Integrações",
    href: "/integracoes",
    icon: Plug,
    superAdminOnly: true,
    section: "admin",
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
    label: "Bancos de dados",
    href: "/bancos-de-dados",
    icon: Database,
    superAdminOnly: true,
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
