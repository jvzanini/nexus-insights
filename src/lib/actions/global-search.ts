"use server";

import { auth } from "@/auth";
import { pgPool } from "@/lib/pg-pool";
import { getKnownAccounts } from "@/lib/tenant";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";

export interface SearchResult {
  type: "company" | "user" | "page";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
  iconKey?: string;
}

export interface GlobalSearchResponse {
  empresas: SearchResult[];
  usuarios: SearchResult[];
  paginas: SearchResult[];
  total: number;
}

const PAGES: ReadonlyArray<{
  title: string;
  href: string;
  iconKey: string;
  superAdminOnly?: boolean;
  adminOrAbove?: boolean;
}> = [
  { title: "Dashboard", href: "/dashboard", iconKey: "LayoutDashboard" },
  { title: "Conversas", href: "/relatorios/conversas", iconKey: "MessageSquare" },
  {
    title: "Mensagens não respondidas",
    href: "/relatorios/mensagens-nao-respondidas",
    iconKey: "MailWarning",
  },
  { title: "Visão Geral", href: "/relatorios/visao-geral", iconKey: "BarChart3" },
  { title: "Performance", href: "/relatorios/performance", iconKey: "Zap" },
  { title: "Equipe", href: "/relatorios/equipe", iconKey: "Users" },
  { title: "Distribuição", href: "/relatorios/distribuicao", iconKey: "Map" },
  { title: "Origem & IA", href: "/relatorios/origem-ia", iconKey: "Sparkles" },
  {
    title: "Usuários",
    href: "/usuarios",
    iconKey: "Users",
    adminOrAbove: true,
  },
  {
    title: "Configurações",
    href: "/configuracoes",
    iconKey: "Settings",
    superAdminOnly: true,
  },
  {
    title: "Consumo IA",
    href: "/configuracoes/consumo",
    iconKey: "Sparkles",
    superAdminOnly: true,
  },
  { title: "Meu Perfil", href: "/perfil", iconKey: "UserCog" },
];

const EMPTY: GlobalSearchResponse = {
  empresas: [],
  usuarios: [],
  paginas: [],
  total: 0,
};

export async function globalSearch(
  query: string,
): Promise<GlobalSearchResponse> {
  const session = await auth();
  if (!session?.user) return EMPTY;

  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return EMPTY;

  const role = (session.user as { platformRole?: PlatformRole }).platformRole;
  const isAdminOrAbove = role === "super_admin" || role === "admin";

  // Empresas (contas Chatwoot conhecidas)
  let empresas: SearchResult[] = [];
  try {
    const accounts = await getKnownAccounts();
    empresas = accounts
      .filter((a) => a.name.toLowerCase().includes(trimmed))
      .slice(0, 8)
      .map((a) => ({
        type: "company" as const,
        id: String(a.id),
        title: a.name,
        subtitle: `conta ${a.id}`,
        href: `/dashboard?account=${a.id}`,
        iconKey: "Building2",
      }));
  } catch {
    empresas = [];
  }

  // Usuários (apenas para super_admin/admin)
  let usuarios: SearchResult[] = [];
  if (isAdminOrAbove) {
    try {
      const r = await pgPool.query<{
        id: string;
        name: string;
        email: string;
        platform_role: PlatformRole;
      }>(
        `SELECT id, name, email, platform_role
           FROM users
          WHERE LOWER(name) LIKE $1 OR LOWER(email) LIKE $1
          ORDER BY name ASC
          LIMIT 5`,
        [`%${trimmed}%`],
      );
      usuarios = r.rows.map((u) => ({
        type: "user" as const,
        id: u.id,
        title: u.name,
        subtitle: u.email,
        href: `/usuarios?highlight=${u.id}`,
        badge: PLATFORM_ROLE_LABELS[u.platform_role] ?? u.platform_role,
        iconKey: "User",
      }));
    } catch {
      usuarios = [];
    }
  }

  // Páginas (filtro por título + permissão)
  const paginas: SearchResult[] = PAGES.filter((p) => {
    if (p.superAdminOnly && role !== "super_admin") return false;
    if (p.adminOrAbove && !isAdminOrAbove && role !== "manager") return false;
    return p.title.toLowerCase().includes(trimmed);
  }).map((p) => ({
    type: "page" as const,
    id: p.href,
    title: p.title,
    href: p.href,
    iconKey: p.iconKey,
  }));

  return {
    empresas,
    usuarios,
    paginas,
    total: empresas.length + usuarios.length + paginas.length,
  };
}
