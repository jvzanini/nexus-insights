import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.RESEND_FROM ?? "Nexus Insights <noreply@nexusai360.com>";

function baseTemplate(content: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #09090b; color: #fafafa;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a78bfa); border-radius: 22%; padding: 14px 18px; margin-bottom: 16px;">
          <span style="font-size: 24px; color: white; font-weight: 800;">N</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; color: #fafafa; margin: 0;">Nexus Insights</h1>
        <p style="font-size: 12px; color: #a1a1aa; margin: 4px 0 0;">Relatórios e insights dos atendimentos</p>
      </div>
      ${content}
      <hr style="border: none; border-top: 1px solid #27272a; margin: 24px 0;" />
      <p style="color: #52525b; font-size: 11px; text-align: center;">
        Nexus AI &copy; ${new Date().getFullYear()}. Todos os direitos reservados.
      </p>
    </div>
  `;
}

export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetUrl: string,
) {
  const html = baseTemplate(`
    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 8px;">
      Olá, <strong style="color: #fafafa;">${userName}</strong>.
    </p>
    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova:
    </p>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a78bfa); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
        Redefinir minha senha
      </a>
    </div>
    <p style="color: #71717a; font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
      Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail.
    </p>
  `);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Redefinição de senha — Nexus Insights",
    html,
  });

  if (error) {
    console.error("[sendPasswordResetEmail]", error);
    throw new Error("Erro ao enviar e-mail de redefinição");
  }
}

export async function sendEmailChangeVerification(
  to: string,
  userName: string,
  verifyUrl: string,
) {
  const html = baseTemplate(`
    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 8px;">
      Olá, <strong style="color: #fafafa;">${userName}</strong>.
    </p>
    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Você solicitou a alteração do seu e-mail para <strong style="color: #fafafa;">${to}</strong>. Clique no botão abaixo para confirmar:
    </p>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a78bfa); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
        Confirmar novo e-mail
      </a>
    </div>
    <p style="color: #71717a; font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
      Este link expira em <strong>1 hora</strong>. Se você não solicitou essa alteração, ignore este e-mail.
    </p>
  `);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Confirme seu novo e-mail — Nexus Insights",
    html,
  });

  if (error) {
    console.error("[sendEmailChangeVerification]", error);
    throw new Error("Erro ao enviar e-mail de verificação");
  }
}

export async function sendWelcomeEmail(
  to: string,
  userName: string,
  tempPassword: string,
  loginUrl: string,
) {
  const html = baseTemplate(`
    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 8px;">
      Olá, <strong style="color: #fafafa;">${userName}</strong>.
    </p>
    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Sua conta no Nexus Insights foi criada. Acesse com a senha temporária abaixo e troque-a no primeiro login.
    </p>
    <div style="text-align: center; margin-bottom: 16px; padding: 16px; background: #18181b; border: 1px solid #27272a; border-radius: 12px;">
      <p style="color: #a1a1aa; font-size: 11px; margin: 0 0 6px;">SENHA TEMPORÁRIA</p>
      <code style="color: #fafafa; font-size: 16px; letter-spacing: 1px;">${tempPassword}</code>
    </div>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a78bfa); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
        Acessar plataforma
      </a>
    </div>
  `);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Bem-vindo ao Nexus Insights",
    html,
  });

  if (error) {
    console.error("[sendWelcomeEmail]", error);
    throw new Error("Erro ao enviar e-mail de boas-vindas");
  }
}
