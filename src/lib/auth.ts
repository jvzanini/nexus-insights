import { auth } from "@/auth";
import type { PlatformRole, Theme } from "@/generated/prisma";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  mustChangePassword: boolean;
  avatarUrl: string | null;
  theme: Theme;
  accountIds: number[];
  teamIds: number[];
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as Record<string, unknown>;
  return {
    id: (user.id as string) ?? "",
    name: (user.name as string) ?? "",
    email: (user.email as string) ?? "",
    platformRole: (user.platformRole as PlatformRole) ?? "viewer",
    isOwner: (user.isOwner as boolean) ?? false,
    mustChangePassword: (user.mustChangePassword as boolean) ?? false,
    avatarUrl: (user.avatarUrl as string | null) ?? null,
    theme: (user.theme as Theme) ?? "dark",
    accountIds: (user.accountIds as number[]) ?? [],
    teamIds: (user.teamIds as number[]) ?? [],
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}
