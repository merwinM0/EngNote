/**
 * mail.ts - Send emails via Nodemailer using SMTP config from .env
 *
 * Env required when sending is enabled (SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM).
 * - If SMTP_HOST is empty -> dev mode: no email sent, code printed to log.
 * - If SMTP_HOST is set but SMTP_USER/SMTP_PASS are missing -> the transporter
 *   won't be created and a clear warning is logged (prevents the
 *   "Missing credentials for PLAIN" error from Nodemailer).
 */

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
// Accept both standardized (SMTP_USER/SMTP_PASS) and the *_USERNAME/*_PASSWORD
// spellings for convenience/back-compat.
const SMTP_USER = process.env.SMTP_USER ?? process.env.SMTP_USERNAME ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER;
// Optional display name, e.g. SMTP_FROM_NAME="English Reading"
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME ?? "";

let transporter: nodemailer.Transporter | null = null;

function hasCredentials(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST) return null;
  // SMTP host set but creds incomplete -> don't create a transporter, avoid
  // Nodemailer throwing "Missing credentials for PLAIN".
  if (!hasCredentials()) {
    console.warn(
      `⚠ SMTP_HOST 已配置但缺少 SMTP_USER / SMTP_PASS，无法发信。请在 .env 中补全授权码。`
    );
    return null;
  }
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  return transporter;
}

/** 发送一封验证码邮件，返回是否发送成功。 */
export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<boolean> {
  const tr = getTransporter();
  if (!tr) {
    if (process.env.NODE_ENV !== "production" && !SMTP_HOST) console.warn(`Local development verification code: ${code}`);
    return false;
  }
  try {
    await tr.sendMail({
      from: SMTP_FROM_NAME ? { name: SMTP_FROM_NAME, address: SMTP_FROM } : SMTP_FROM,
      to,
      subject: "Your English Reading verification code",
      text: `Your verification code is: ${code}\nIt expires in 5 minutes.`,
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 5 minutes.</p>`,
    });
    return true;
  } catch (err) {
    console.error(`邮件发送失败: ${(err as Error).message}`);
    return false;
  }
}
