// Password-reset email delivery.
// Reads credentials from env vars; works without them in development (prints
// the link to the console instead of refusing to start).
//
// Supported env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS
//   SMTP_FROM  – "from" address  (defaults to noreply@dutytrace.local)
//   APP_URL    – public base URL   (defaults to http://localhost:5173)
//
// Brevo SMTP uses smtp-relay.brevo.com:587 with SMTP_SECURE=false,
// the SMTP login shown in Brevo, and a Brevo SMTP key (not an API key).

import nodemailer from 'nodemailer';
import { env, isProduction } from '../../config/env.js';

const { smtp } = env;
export const appUrl = env.appUrl;

/** Returns true if SMTP is configured well enough to send email. */
export const emailConfigured = () => Boolean(smtp.host && smtp.user && smtp.pass);

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    // Bound SMTP waits so password recovery requests cannot stay open for
    // Nodemailer's multi-minute defaults when the provider/network is stuck.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    dnsTimeout: 10_000,
  });
  return _transporter;
}

/**
 * Sends the password-reset email.
 * Returns { sent: true } on success.
 * Returns { sent: false, devUrl } in development when SMTP is unconfigured.
 * Throws on delivery failure so the reset service can invalidate the token
 * and keep the public response generic.
 */
export async function sendResetEmail({ to, resetUrl }) {
  if (!emailConfigured()) {
    // Development: print the link to the server console only (not a response body).
    if (!isProduction) {
      console.info('\n━━━ DutyTrace dev: password-reset link (not sent via email) ━━━');
      console.info(`  To: ${to}`);
      console.info(`  URL: ${resetUrl}`);
      console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return { sent: false, devUrl: resetUrl };
    }
    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.');
  }

  await getTransporter().sendMail({
    from: smtp.from,
    to,
    subject: 'Reset your DutyTrace password',
    text: [
      'Hello,',
      '',
      'You requested a password reset for your DutyTrace account.',
      'Click the link below within 30 minutes to set a new password:',
      '',
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email — your password has not changed.',
      '',
      '– DutyTrace',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;color:#253746;background:#f4f7fa;padding:32px 0">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden">
        <tr>
          <td style="background:#153B50;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:600;letter-spacing:-.3px">DutyTrace</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 16px;font-size:18px;color:#153B50">Reset your password</h2>
            <p style="margin:0 0 24px;line-height:1.6;color:#555">
              You requested a password reset for your DutyTrace account.
              Click the button below within <strong>30 minutes</strong> to set a new password.
            </p>
            <a href="${resetUrl}"
               style="display:inline-block;padding:12px 28px;background:#007F86;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
              Reset Password
            </a>
            <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
            <p style="margin:0;font-size:12px;color:#aaa">
              If you did not request this, you can safely ignore this email — your password has not changed.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
  return { sent: true };
}

/** Sends a concise risk alert after SMTP confirms handoff. */
export async function sendRiskAlertEmail({ to, title, message, actionUrl, notificationId }) {
  if (!emailConfigured()) throw new Error('SMTP email is not configured.');
  const link = actionUrl ? new URL(actionUrl, appUrl).toString() : null;
  await getTransporter().sendMail({
    from: smtp.from,
    to,
    subject: `DutyTrace alert: ${title}`,
    ...(notificationId ? { messageId: `<dutytrace-${notificationId}@notifications.dutytrace>` } : {}),
    text: [`DutyTrace alert`, '', title, '', message, ...(link ? ['', `Open DutyTrace: ${link}`] : []), '', 'DutyTrace'].join('\n'),
  });
  return { handedOff: true };
}
