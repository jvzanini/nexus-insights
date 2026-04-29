"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const RequestSchema = z.object({ email: z.string().email() });

const ResetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type ActionResult = { success: boolean; error?: string };

const TOKEN_TTL_MINUTES = 60;

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  try {
    const parsed = RequestSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "E-mail inválido" };
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, name: true, email: true, isActive: true },
    });

    // Resposta sempre 200 (evita user enumeration)
    if (!user || !user.isActive) {
      return { success: true };
    }

    const rawToken = nanoid(32);
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const url = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail(user.email, user.name, url).catch((err) => {
      console.error("[password-reset] email failed", err);
    });

    await logAudit({
      userId: user.id,
      action: "password_reset_requested",
      details: { email: user.email },
    });

    return { success: true };
  } catch (err) {
    console.error("[password-reset.request]", err);
    return { success: false, error: "Erro ao solicitar redefinição" };
  }
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  try {
    const parsed = ResetSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }

    const tokens = await prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, isActive: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let matched: (typeof tokens)[number] | undefined;
    for (const t of tokens) {
      const ok = await bcrypt.compare(parsed.data.token, t.tokenHash);
      if (ok) {
        matched = t;
        break;
      }
    }

    if (!matched) {
      return { success: false, error: "Token inválido ou expirado" };
    }
    if (!matched.user || !matched.user.isActive) {
      return { success: false, error: "Usuário inativo" };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: matched.userId },
        data: {
          password: passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: matched.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await logAudit({
      userId: matched.userId,
      action: "password_reset_completed",
    });

    return { success: true };
  } catch (err) {
    console.error("[password-reset.reset]", err);
    return { success: false, error: "Erro ao redefinir senha" };
  }
}
