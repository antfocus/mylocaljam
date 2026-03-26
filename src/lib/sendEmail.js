/**
 * Email sending utility via Resend
 *
 * Setup:
 *   1. npm install resend
 *   2. Add RESEND_API_KEY to .env.local and Vercel env vars
 *   3. Add RESEND_FROM_EMAIL (e.g., "myLocalJam <notifications@mylocaljam.com>")
 *      — or use Resend's default onboarding domain: "onboarding@resend.dev"
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'myLocalJam <onboarding@resend.dev>';

/**
 * Send an email via Resend's REST API (no npm package needed).
 * Returns { success: true, id } or { success: false, error }.
 */
export async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('[sendEmail] RESEND_API_KEY not set — skipping email');
    return { success: false, error: 'No API key' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[sendEmail] Resend error ${res.status}:`, body);
      return { success: false, error: body };
    }

    const data = await res.json();
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[sendEmail] Failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Build a styled HTML email body for myLocalJam notifications.
 */
export function buildEmailHtml({ title, body, linkUrl, linkLabel = 'View Event' }) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mylocaljam.com';
  const fullLink = linkUrl?.startsWith('/') ? `${baseUrl}${linkUrl}` : (linkUrl || baseUrl);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0D12;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:24px;font-weight:800;color:#E8722A;letter-spacing:-0.5px;">myLocalJam</span>
    </div>
    <div style="background:#1A1A24;border-radius:12px;padding:24px;border:1px solid #2A2A3A;">
      <h2 style="margin:0 0 8px;color:#F0F0F5;font-size:18px;font-weight:700;">${title}</h2>
      <p style="margin:0 0 20px;color:#9898B8;font-size:14px;line-height:1.5;">${body}</p>
      <a href="${fullLink}" style="display:inline-block;padding:12px 28px;background:#E8722A;color:#1C1917;text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
        ${linkLabel}
      </a>
    </div>
    <p style="text-align:center;margin-top:24px;color:#4A4A6A;font-size:11px;">
      You're receiving this because of your notification settings on myLocalJam.<br/>
      <a href="${baseUrl}" style="color:#E8722A;text-decoration:none;">Manage preferences</a>
    </p>
  </div>
</body>
</html>`.trim();
}
