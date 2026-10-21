import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'GlazeFlow <notifications@glazeflow.app>';

/**
 * Escape text for interpolation into an HTML body. Order messages and user
 * names reach this function unescaped, so a raw `<` would let a tenant inject
 * markup into the email that main-company staff read.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail(to: string, subject: string, body: string) {
  if (!resend) {
    console.log(`[DEV EMAIL] to=${to} subject=${subject}`);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: `<div style="font-family: sans-serif; max-width: 560px; margin: auto;">
        <h2 style="color:#1d4ed8;">${escapeHtml(subject)}</h2>
        <p style="color:#334155; line-height:1.6;">${escapeHtml(body)}</p>
      </div>`,
    });
  } catch (err) {
    console.error('Email failed:', err);
  }
}
