import * as nodemailer from "nodemailer";
import { RuntimeError } from "@mdcms/shared";

export type EmailServiceEnv = {
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_FROM?: string;
};

export type SendInviteEmailInput = {
  to: string;
  inviterName: string;
  studioUrl: string;
  token: string;
};

export type EmailTransportFactory = {
  createTransport: (config: {
    host: string;
    port: number;
    secure: boolean;
  }) => {
    sendMail: (opts: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<{ messageId: string }>;
  };
};

export type EmailService = {
  sendInviteEmail: (input: SendInviteEmailInput) => Promise<void>;
};

function renderInviteEmailHtml(input: {
  inviterName: string;
  acceptUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2>You've been invited to MDCMS</h2>
  <p>${input.inviterName} has invited you to join their MDCMS instance.</p>
  <p>
    <a href="${input.acceptUrl}"
       style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 6px;">
      Accept Invitation
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
</body>
</html>`;
}

export function createEmailService(
  env: EmailServiceEnv,
  transport?: EmailTransportFactory,
): EmailService {
  if (!env.SMTP_HOST) {
    throw new RuntimeError({
      code: "EMAIL_NOT_CONFIGURED",
      message:
        "SMTP_HOST is not configured. Email invitations require SMTP settings.",
    });
  }

  const smtpHost = env.SMTP_HOST;
  const smtpPort = env.SMTP_PORT ?? 1025;
  const fromAddress = env.SMTP_FROM ?? `noreply@${smtpHost}`;
  const factory = transport ?? nodemailer;
  const transporter = factory.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
  });

  return {
    async sendInviteEmail(input) {
      const acceptUrl = `${input.studioUrl}/admin/invite/${input.token}`;
      await transporter.sendMail({
        from: fromAddress,
        to: input.to,
        subject: `${input.inviterName} invited you to MDCMS`,
        html: renderInviteEmailHtml({
          inviterName: input.inviterName,
          acceptUrl,
        }),
      });
    },
  };
}
