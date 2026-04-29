import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { PlatformRole, Theme } from "@/generated/prisma/client";

interface Credentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  mustChangePassword: boolean;
  avatarUrl: string | null;
  theme: Theme;
  accountIds: number[];
  teamIds: number[];
}

export async function authorizeCredentials(
  credentials: Credentials,
  ipAddress: string,
): Promise<AuthUser | null> {
  const { email, password } = credentials;
  if (!email || !password) return null;

  const rateLimit = await checkLoginRateLimit(email, ipAddress);
  if (!rateLimit.allowed) {
    throw new Error(
      "Muitas tentativas de login. Tente novamente em 15 minutos.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      platformRole: true,
      isOwner: true,
      isActive: true,
      mustChangePassword: true,
      avatarUrl: true,
      theme: true,
    },
  });

  if (!user || !user.isActive) {
    logAudit({
      userId: user?.id,
      action: "login_failed",
      ipAddress,
      details: { email, reason: !user ? "user_not_found" : "inactive" },
    });
    return null;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    logAudit({
      userId: user.id,
      action: "login_failed",
      ipAddress,
      details: { email, reason: "invalid_password" },
    });
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
  });

  logAudit({
    userId: user.id,
    action: "login_succeeded",
    ipAddress,
    details: { email },
  });

  const [accountAccess, teamAccess] = await Promise.all([
    prisma.userAccountAccess.findMany({
      where: { userId: user.id },
      select: { chatwootAccountId: true },
    }),
    prisma.userTeamAccess.findMany({
      where: { userId: user.id },
      select: { chatwootTeamId: true },
    }),
  ]);

  const accountIds: number[] = Array.from(
    new Set(accountAccess.map((a: { chatwootAccountId: number }) => a.chatwootAccountId)),
  );
  const teamIds: number[] = Array.from(
    new Set(teamAccess.map((t: { chatwootTeamId: number }) => t.chatwootTeamId)),
  );

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    isOwner: user.isOwner,
    mustChangePassword: user.mustChangePassword,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
    accountIds,
    teamIds,
  };
}

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];
const PUBLIC_PREFIXES = ["/api/auth/", "/api/health"];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
