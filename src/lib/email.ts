import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'GlazeFlow <notifications@glazeflow.app>';

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
        <h2 style="color:#1d4ed8;">${subject}</h2>
        <p style="color:#334155; line-height:1.6;">${body}</p>
      </div>`,
    });
  } catch (err) {
    console.error('Email failed:', err);
  }
}
