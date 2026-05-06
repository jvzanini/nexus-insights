import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Mapa de redirects para a consolidação 12 → 5 super-relatórios (B8).
 * Cada entrada antiga aponta para a tab correspondente do novo super-relatório.
 *
 * Formato: rota antiga → rota nova (com query string opcional preservada).
 * O lookup abaixo preserva a query original e injeta a tab adicional.
 */
const REDIRECT_MAP: Record<string, string> = {
  "/relatorios/status-conversas": "/relatorios/visao-geral?tab=status",
  "/relatorios/volumetria": "/relatorios/visao-geral?tab=volumetria",
  "/relatorios/tempos-resposta": "/relatorios/performance?tab=tempos",
  "/relatorios/sla": "/relatorios/performance?tab=sla",
  "/relatorios/csat": "/relatorios/performance?tab=csat",
  "/relatorios/ranking-atendentes": "/relatorios/equipe?tab=ranking",
  "/relatorios/por-departamento": "/relatorios/equipe?tab=departamento",
  "/relatorios/por-estado": "/relatorios/distribuicao?tab=estado",
  "/relatorios/leads-recebidos": "/relatorios/origem-ia?tab=leads",
  "/relatorios/matrix-ia": "/relatorios/origem-ia?tab=matrix",
};

export default auth(async (req) => {
  const { nextUrl, auth: session } = req;

  const target = REDIRECT_MAP[nextUrl.pathname];
  if (target) {
    const url = nextUrl.clone();
    const [pathname, query = ""] = target.split("?");
    url.pathname = pathname;
    // Preserva query original (period, custom_start, custom_end, etc.) e
    // injeta os params do destino (ex.: ?tab=sla) por cima.
    for (const [k, v] of new URLSearchParams(query)) {
      url.searchParams.set(k, v);
    }
    return NextResponse.redirect(url, 302);
  }

  const isPublic =
    nextUrl.pathname === "/login" ||
    nextUrl.pathname === "/forgot-password" ||
    nextUrl.pathname === "/reset-password" ||
    nextUrl.pathname === "/verify-email" ||
    nextUrl.pathname.startsWith("/api/auth/") ||
    nextUrl.pathname.startsWith("/api/health") ||
    nextUrl.pathname.startsWith("/api/nex/calibrate");

  if (isPublic) return;

  if (!session) {
    const url = new URL(
      `/login?callbackUrl=${encodeURIComponent(nextUrl.pathname)}`,
      nextUrl,
    );
    return Response.redirect(url);
  }

  if (
    (session.user as any)?.mustChangePassword &&
    !nextUrl.pathname.startsWith("/perfil/trocar-senha")
  ) {
    return Response.redirect(new URL("/perfil/trocar-senha", nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
