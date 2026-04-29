import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  CHATWOOT_DATABASE_URL: z
    .string()
    .min(1, "CHATWOOT_DATABASE_URL é obrigatória"),
  CHATWOOT_BASE_URL: z
    .string()
    .url()
    .default("https://chatwoot.znsolucoes.com.br"),
  REDIS_URL: z.string().min(1, "REDIS_URL é obrigatória"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET deve ter no mínimo 32 caracteres"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL deve ser uma URL válida"),
  ENCRYPTION_KEY: z
    .string()
    .min(64, "ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z
    .string()
    .default("Nexus Insights <noreply@nexusai360.com>"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().optional(),
  APP_VERSION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Variáveis de ambiente inválidas:",
      result.error.flatten().fieldErrors,
    );
    throw new Error("Variáveis de ambiente inválidas. Verifique o .env.");
  }
  return result.data;
}

export const env = validateEnv();
