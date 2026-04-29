import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Mapa pronto para consolidação futura. Ative chave por chave conforme cada
 * dashboard novo (operacao / atendentes / distribuicao / origem-resultado)
 * for criado. Por enquanto, deixamos vazio para não quebrar pages existentes.
 *
 * Formato: rota antiga → rota nova (com query string opcional preservada).
 * O lookup já está cabeado abaixo, então ativar é só adicionar a entrada.
 */
const REDIRECT_MAP: Record<string, string> = {};

export default auth(async (req) => {
  const { nextUrl, auth: session } = req;

  const target = REDIRECT_MAP[nextUrl.pathname];
  if (target) {
    const url = nextUrl.clone();
    const [pathname, query = ""] = target.split("?");
    url.pathname = pathname;
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
    nextUrl.pathname.startsWith("/api/health");

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
