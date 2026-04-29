import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const APP_SETTINGS_DEFAULTS: Array<{
  key: string;
  value: unknown;
  category: string;
  description?: string;
}> = [
  {
    key: "polling.live_seconds",
    value: 30,
    category: "polling",
    description: "Intervalo de atualização dos painéis ao vivo (segundos).",
  },
  {
    key: "polling.historical_seconds",
    value: 300,
    category: "polling",
    description: "Intervalo de atualização dos painéis históricos (segundos).",
  },
  {
    key: "polling.refresh_button_enabled",
    value: true,
    category: "polling",
    description: "Mostrar/esconder o botão 'Atualizar agora' nos relatórios.",
  },
  {
    key: "realtime.sse_enabled",
    value: true,
    category: "realtime",
    description: "Habilitar canal SSE para atualizações em tempo real.",
  },
  {
    key: "feature_flags.matrix_ia_visible_to_super_admin_only",
    value: true,
    category: "visibility",
    description: "Exibir relatório do inbox Matrix IA apenas para super admin.",
  },
  {
    key: "feature_flags.exclude_matrix_ia_globally",
    value: true,
    category: "visibility",
    description:
      "Excluir conversas do inbox Matrix IA das métricas globais por padrão.",
  },
  {
    key: "feature_flags.csat_enabled",
    value: true,
    category: "modules",
    description: "Exibir relatório de CSAT (placeholder se não houver dados).",
  },
  {
    key: "feature_flags.sla_enabled",
    value: true,
    category: "modules",
    description: "Exibir relatório de SLA (placeholder se não houver dados).",
  },
  {
    key: "audit.retention_days",
    value: 90,
    category: "audit",
    description: "Dias de retenção dos logs de auditoria.",
  },
  {
    key: "reports.max_period_days",
    value: 365,
    category: "reports",
    description: "Período máximo permitido em filtros de relatórios (dias).",
  },
  {
    key: "chatwoot.deeplink_base",
    value: "https://chatwoot.znsolucoes.com.br",
    category: "chatwoot",
    description: "Domínio do Chatwoot para deep-links em conversas.",
  },
];

const KNOWN_ACCOUNTS: Array<{ id: number; name: string }> = [
  { id: 9, name: "Matrix Fitness Group" },
  { id: 2, name: "Invest Soluções" },
];

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "[seed] ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios para criar o owner.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      isActive: true,
      isOwner: true,
      platformRole: "super_admin",
      mustChangePassword: false,
    },
    create: {
      email,
      password: passwordHash,
      name,
      platformRole: "super_admin",
      isOwner: true,
      isActive: true,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      emailVerifiedAt: new Date(),
      theme: "dark",
    },
  });

  for (const account of KNOWN_ACCOUNTS) {
    await prisma.userAccountAccess.upsert({
      where: {
        userId_chatwootAccountId: {
          userId: owner.id,
          chatwootAccountId: account.id,
        },
      },
      update: { chatwootAccountName: account.name },
      create: {
        userId: owner.id,
        chatwootAccountId: account.id,
        chatwootAccountName: account.name,
        grantedById: owner.id,
      },
    });
  }

  for (const setting of APP_SETTINGS_DEFAULTS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value as never,
        category: setting.category,
        description: setting.description,
      },
    });
  }

  console.log(
    `[seed] owner=${owner.email}, accounts=${KNOWN_ACCOUNTS.length}, settings=${APP_SETTINGS_DEFAULTS.length}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
