import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import type { PlatformRole, Theme } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      platformRole: PlatformRole;
      isOwner: boolean;
      mustChangePassword: boolean;
      avatarUrl: string | null;
      theme: Theme;
      accountIds: number[];
      teamIds: number[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    platformRole?: PlatformRole;
    isOwner?: boolean;
    mustChangePassword?: boolean;
    avatarUrl?: string | null;
    theme?: Theme;
    accountIds?: number[];
    teamIds?: number[];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    platformRole: PlatformRole;
    isOwner: boolean;
    mustChangePassword: boolean;
    avatarUrl: string | null;
    theme: Theme;
    accountIds: number[];
    teamIds: number[];
  }
}
