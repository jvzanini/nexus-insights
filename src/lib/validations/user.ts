import { z } from "zod";

export const PlatformRoleEnum = z.enum([
  "super_admin",
  "admin",
  "manager",
  "viewer",
]);

export const CreateUserInput = z.object({
  name: z.string().min(2, "Nome obrigatório").max(120),
  email: z.string().email("E-mail inválido").transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Senha deve ter ao menos 8 caracteres")
    .max(72)
    .optional(),
  platformRole: PlatformRoleEnum,
  accountIds: z.array(z.number().int().positive()).default([]),
  teamIds: z.array(z.number().int().positive()).default([]),
  sendWelcomeEmail: z.boolean().default(true),
});
export type CreateUserInputT = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  platformRole: PlatformRoleEnum.optional(),
  accountIds: z.array(z.number().int().positive()).optional(),
  teamIds: z.array(z.number().int().positive()).optional(),
});
export type UpdateUserInputT = z.infer<typeof UpdateUserInput>;
