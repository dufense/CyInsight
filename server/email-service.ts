import nodemailer from "nodemailer";
import type { EmailConfiguration } from "@shared/schema";

interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

interface SendResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

async function sendViaSendGrid(config: any, options: EmailOptions): Promise<SendResult> {
  const apiKey = config.apiKey;
  if (!apiKey) return { success: false, error: "SendGrid API key not configured" };

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: options.to.map(email => ({ email })) }],
        from: { email: options.from || config.fromEmail, name: options.fromName || config.fromName || "SecureOps" },
        subject: options.subject,
        content: [{ type: "text/html", value: options.html }],
      }),
    });

    if (response.ok || response.status === 202) {
      return { success: true, messageId: response.headers.get("x-message-id") || "sent" };
    }

    const errorBody = await response.text();
    return { success: false, error: `SendGrid error (${response.status}): ${errorBody}` };
  } catch (err: any) {
    return { success: false, error: `SendGrid send failed: ${err.message}` };
  }
}

async function sendViaSMTP(config: any, options: EmailOptions): Promise<SendResult> {
  try {
    const transportConfig: any = {
      host: config.host,
      port: parseInt(config.port || "587"),
      secure: config.secure === true || config.port === "465",
      auth: {
        user: config.username || config.email,
        pass: config.password,
      },
    };

    if (!transportConfig.secure && transportConfig.port === 587) {
      transportConfig.requireTLS = true;
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const info = await transporter.sendMail({
      from: `"${options.fromName || config.fromName || "SecureOps"}" <${options.from || config.fromEmail || config.email}>`,
      to: options.to.join(", "),
      subject: options.subject,
      html: options.html,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    return { success: false, error: `SMTP send failed: ${err.message}` };
  }
}

async function sendViaOffice365(config: any, options: EmailOptions): Promise<SendResult> {
  return sendViaSMTP(
    {
      host: "smtp.office365.com",
      port: "587",
      secure: false,
      email: config.email,
      username: config.email,
      password: config.password,
      fromEmail: config.fromEmail || config.email,
      fromName: config.fromName,
    },
    options
  );
}

async function sendViaGoogleWorkspace(config: any, options: EmailOptions): Promise<SendResult> {
  return sendViaSMTP(
    {
      host: "smtp.gmail.com",
      port: "587",
      secure: false,
      email: config.email,
      username: config.email,
      password: config.password,
      fromEmail: config.fromEmail || config.email,
      fromName: config.fromName,
    },
    options
  );
}

export async function sendEmail(
  emailConfig: EmailConfiguration,
  options: EmailOptions
): Promise<SendResult> {
  const config = emailConfig.config as any;
  const finalOptions: EmailOptions = {
    ...options,
    from: options.from || emailConfig.fromEmail,
    fromName: options.fromName || emailConfig.fromName || "SecureOps",
  };

  console.log(`[Email] Sending via ${emailConfig.provider} to ${options.to.join(", ")}`);

  switch (emailConfig.provider) {
    case "sendgrid":
      return sendViaSendGrid(config, finalOptions);
    case "office365":
      return sendViaOffice365(config, finalOptions);
    case "google_workspace":
      return sendViaGoogleWorkspace(config, finalOptions);
    case "smtp":
      return sendViaSMTP(config, finalOptions);
    default:
      return { success: false, error: `Unknown email provider: ${emailConfig.provider}` };
  }
}

export async function sendTestEmail(emailConfig: EmailConfiguration): Promise<SendResult> {
  return sendEmail(emailConfig, {
    to: [emailConfig.fromEmail],
    subject: "SecureOps - Email Configuration Test",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0;">SecureOps Email Test</h2>
        </div>
        <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 16px;">Your email configuration is working correctly.</p>
          <p style="color: #6b7280; font-size: 14px;">Provider: <strong>${emailConfig.provider}</strong></p>
          <p style="color: #6b7280; font-size: 14px;">From: <strong>${emailConfig.fromEmail}</strong></p>
          <p style="color: #6b7280; font-size: 14px;">Time: <strong>${new Date().toISOString()}</strong></p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">This is a test email from SecureOps MSSP Platform</p>
        </div>
      </div>
    `,
  });
}
