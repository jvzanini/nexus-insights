/**
 * Gerador de senhas pra perfis de integração Power BI.
 *
 * Charset sem chars ambíguos visualmente (sem 0/O/I/l/1) — facilita o
 * super_admin copiar/colar manualmente caso seja necessário. 32 chars
 * default usando randomBytes do crypto.
 */

import { randomBytes } from "crypto";

export const INTEGRATION_PWD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnopqrstuvwxyz" + "23456789" + "!@#$%";

export function generateIntegrationPassword(length: number = 32): string {
  const bytes = randomBytes(length * 2);
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += INTEGRATION_PWD_CHARSET[bytes[i] % INTEGRATION_PWD_CHARSET.length];
  }
  return pwd;
}

export function getPasswordLast4(pwd: string): string {
  if (pwd.length <= 4) return pwd;
  return pwd.slice(-4);
}
