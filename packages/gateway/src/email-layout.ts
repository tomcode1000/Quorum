/**
 * The one email layout every Quorum message uses.
 *
 * Email clients ignore stylesheets and most layout CSS, so this is the old way:
 * nested tables, inline styles, and nothing a client is known to drop. The look
 * is the site's: the navy ink, the one blue, white cards on a pale ground, and the
 * wordmark at the top.
 */

const INK = '#0f1b35'
const INK_2 = '#33415c'
const INK_3 = '#5b6b85'
const INK_4 = '#8a97b0'
const ACCENT = '#1f6feb'
const GROUND = '#f4f7fc'
const BORDER = '#e6ecf5'
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type EmailContent = {
  /** Shown in the inbox beside the subject, and nowhere else. */
  preheader: string
  eyebrow: string
  heading: string
  /** Paragraphs, as HTML. */
  body: string[]
  button?: { label: string; href: string }
  /** A small boxed detail under the button, such as an invite code. */
  detail?: { label: string; value: string }
  /** Numbered steps. */
  steps?: { title: string; text: string }[]
  /** The quiet line at the bottom of the card. */
  footnote?: string
}

export function renderEmail(content: EmailContent): string {
  const button = content.button
    ? `<tr><td style="padding:8px 0 4px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${ACCENT}"><a href="${content.button.href}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(content.button.label)} &rarr;</a></td></tr></table></td></tr>`
    : ''
  const detail = content.detail
    ? `<tr><td style="padding:20px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};border:1px solid ${BORDER};border-radius:10px"><tr><td style="padding:14px 18px;font-family:${FONT};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${INK_4};font-weight:600">${escapeHtml(content.detail.label)}</td><td align="right" style="padding:14px 18px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:16px;font-weight:700;letter-spacing:.06em;color:${INK}">${escapeHtml(content.detail.value)}</td></tr></table></td></tr>`
    : ''
  const steps = content.steps?.length
    ? `<tr><td style="padding:28px 0 0;border-top:1px solid ${BORDER}"></td></tr>
      <tr><td style="padding:0 0 12px;font-family:${FONT};font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:${INK}">What happens next</td></tr>
      ${content.steps
        .map(
          (step, i) => `<tr><td style="padding:0 0 14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" style="padding:1px 14px 0 0"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:#eaf2fe;color:${ACCENT};font-family:${FONT};font-size:12px;font-weight:700;text-align:center">${i + 1}</div></td>
        <td style="font-family:${FONT};font-size:14px;line-height:1.55;color:${INK_3}"><b style="color:${INK};font-weight:600">${escapeHtml(step.title)}</b><br/>${escapeHtml(step.text)}</td>
      </tr></table></td></tr>`,
        )
        .join('')}`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light only"/><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:${GROUND}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND}"><tr><td align="center" style="padding:36px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 22px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:30px;height:30px;border-radius:9px;background:${INK};text-align:center;vertical-align:middle"><div style="width:12px;height:12px;margin:0 auto;border:3px solid #ffffff;border-radius:3px"></div></td>
        <td style="padding-left:10px;font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-.02em;color:${INK}">Quorum</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:40px 40px 34px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 12px;font-family:${FONT};font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${ACCENT}">${escapeHtml(content.eyebrow)}</td></tr>
        <tr><td style="padding:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-.025em;color:${INK}">${escapeHtml(content.heading)}</td></tr>
        ${content.body.map((p) => `<tr><td style="padding:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK_2}">${p}</td></tr>`).join('')}
        ${button}
        ${detail}
        ${steps}
        ${content.footnote ? `<tr><td style="padding:18px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${INK_4}">${content.footnote}</td></tr>` : ''}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 16px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_4}">
      Quorum &middot; the human fallback layer for autonomous agents<br/>
      You are receiving this because you joined the Quorum waitlist.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}
