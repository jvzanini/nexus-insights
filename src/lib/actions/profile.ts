"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendEmailChangeVerification } from "@/lib/email";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

const EMAIL_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora
const EMAIL_RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutos

const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  avatarUrl: z.string().nullable().optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
});

const RequestEmailChangeSchema = z.object({
  newEmail: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Senhas não coincidem",
    path: ["confirmPassword"],
  });

export async function updateProfile(input: unknown): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const parsed = UpdateProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: parsed.data,
    });

    await logAudit({ userId: user.id, action: "profile_updated", details: parsed.data });
    return { success: true };
  } catch (err) {
    console.error("[profile.update]", err);
    return { success: false, error: "Erro ao atualizar perfil" };
  }
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const parsed = ChangePasswordSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    if (!dbUser) return { success: false, error: "Usuário não encontrado" };

    const ok = await bcrypt.compare(parsed.data.currentPassword, dbUser.password);
    if (!ok) return { success: false, error: "Senha atual incorreta" };

    const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    await logAudit({ userId: user.id, action: "profile_password_changed" });
    return { success: true };
  } catch (err) {
    console.error("[profile.changePassword]", err);
    return { success: false, error: "Erro ao trocar senha" };
  }
}

export async function requestEmailChange(input: unknown): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const parsed = RequestEmailChangeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }

    const normalizedEmail = parsed.data.newEmail.trim().toLowerCase();

    if (normalizedEmail === user.email.toLowerCase()) {
      return { success: false, error: "O novo e-mail é igual ao atual" };
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true, name: true },
    });
    if (!dbUser) return { success: false, error: "Usuário não encontrado" };

    const valid = await bcrypt.compare(parsed.data.password, dbUser.password);
    if (!valid) return { success: false, error: "Senha incorreta" };

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) return { success: false, error: "Este e-mail já está em uso" };

    // Rate limit por usuário (2 minutos)
    const recent = await prisma.emailChangeToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - EMAIL_RATE_LIMIT_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return { success: false, error: "Aguarde 2 minutos antes de solicitar novamente" };
    }

    // Gera token plain + hash (igual ao padrão de password reset deste projeto)
    const token = nanoid(48);
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + EMAIL_TOKEN_EXPIRY_MS);

    await prisma.emailChangeToken.create({
      data: {
        userId: user.id,
        newEmail: normalizedEmail,
        tokenHash,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://nexusinsights.nexusai360.com";
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

    try {
      await sendEmailChangeVerification(normalizedEmail, dbUser.name, verifyUrl);
    } catch (err) {
      console.error("[profile.requestEmailChange] envio falhou", err);
      return { success: false, error: "Não foi possível enviar o e-mail de verificação" };
    }

    await logAudit({
      userId: user.id,
      action: "email_change_requested",
      details: { newEmail: normalizedEmail },
    });

    return { success: true };
  } catch (err) {
    console.error("[profile.requestEmailChange]", err);
    return { success: false, error: "Erro ao solicitar alteração de e-mail" };
  }
}

export async function confirmEmailChange(token: string): Promise<ActionResult> {
  try {
    if (!token) return { success: false, error: "Token ausente" };

    const tokens = await prisma.emailChangeToken.findMany({
      where: { consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let matched: (typeof tokens)[number] | undefined;
    for (const t of tokens) {
      const ok = await bcrypt.compare(token, t.tokenHash);
      if (ok) {
        matched = t;
        break;
      }
    }
    if (!matched) return { success: false, error: "Token inválido ou expirado" };

    await prisma.$transaction([
      prisma.user.update({
        where: { id: matched.userId },
        data: { email: matched.newEmail, emailVerifiedAt: new Date() },
      }),
      prisma.emailChangeToken.update({
        where: { id: matched.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    await logAudit({
      userId: matched.userId,
      action: "email_change_completed",
      details: { newEmail: matched.newEmail },
    });
    return { success: true };
  } catch (err) {
    console.error("[profile.confirmEmailChange]", err);
    return { success: false, error: "Erro ao confirmar e-mail" };
  }
}
