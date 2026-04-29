import { randomInt } from "node:crypto";

const ALPHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"; // sem i, l, o, I, L, O
const DIGITS = "23456789"; // sem 0, 1
const POOL = ALPHA + DIGITS;

export const TEMP_PASSWORD_FORBIDDEN = ["0", "1", "i", "l", "o", "I", "L", "O"];

export function generateTempPassword(length = 8): string {
  if (length < 4) throw new Error("length mínimo 4");
  const chars: string[] = [
    ALPHA[randomInt(ALPHA.length)],
    DIGITS[randomInt(DIGITS.length)],
  ];
  for (let i = 2; i < length; i++) chars.push(POOL[randomInt(POOL.length)]);
  // Fisher-Yates pra descorrelacionar posição
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
