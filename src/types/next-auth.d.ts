import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
      avatarUrl: string | null;
      theme: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    isSuperAdmin: boolean;
    avatarUrl: string | null;
    theme: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    isSuperAdmin: boolean;
    avatarUrl: string | null;
    theme: string;
  }
}
