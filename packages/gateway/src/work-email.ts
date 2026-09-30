/**
 * The "work is waiting" email, in the product's own design.
 *
 * Built from the worker app's parts: the pale blue ground, a white card with the
 * app's 16px radius and hairline border, the blue brand tile, the uppercase chip
 * over the heading, the full-width primary button and the tinted info panel. Mail
 * clients strip stylesheets and SVG, so it is tables and inline styles only, and
 * the brand mark is drawn in cells rather than as an icon. Colours are the app's
 * light tokens; mail clients do not honour the app's dark mode, so it does not
 * pretend to.
 */

const INK = '#0f1b35'
const INK_3 = '#5b6b85'
const INK_4 = '#8a97b0'
const ACCENT = '#1f6feb'
const WASH = '#eaf2fe'
const GROUND = '#f6f8fc'
const BORDER = '#e6ecf5'
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export type WorkEmail = { subject: string; text: string; html: string }

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function workEmail(input: {
  /** The skill, as the worker app names it: "matching records". */
  skill: string
  wageCents: number
  /** Where the Work screen is. */
  workUrl: string
  /** Where to turn these off. */
  settingsUrl: string
}): WorkEmail {
  const skill = escape(input.skill)
  const wage = money(input.wageCents)
  const subject = `A question is waiting: ${input.skill}`

  const text = [
    `A question about ${input.skill} is waiting for you on Quorum.`,
    '',
    `It pays ${wage}, sent to your own account the moment your answer is accepted.`,
    '',
    `Open Work to answer it: ${input.workUrl}`,
    '',
    'Questions close in under a minute. Keep Work open and the next one comes straight to you.',
    '',
    `You asked to be told at this address. Turn these emails off in Settings: ${input.settingsUrl}`,
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${GROUND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">It pays ${wage}, sent to your own account the moment your answer is accepted.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Brand -->
        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" height="28" style="width:28px;height:28px;background:${ACCENT};border-radius:8px;" align="center" valign="middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="12" height="12" style="width:12px;height:12px;background:#ffffff;border-radius:3px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
                </td>
                <td style="padding-left:10px;font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.035em;color:${INK};">Quorum</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-bottom:18px;">
                  <span style="display:inline-block;padding:6px 10px;border-radius:7px;background:${WASH};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};">Work is waiting</span>
                </td>
              </tr>
              <tr>
                <td style="font-family:${FONT};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.035em;color:${INK};">A question about ${skill} is waiting for you.</td>
              </tr>
              <tr>
                <td style="padding-top:14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_3};">
                  You passed this skill, and too few people who did are online to answer it. It is yours if you get there first.
                </td>
              </tr>

              <!-- Pay -->
              <tr>
                <td style="padding-top:24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BORDER};border-radius:12px;">
                    <tr>
                      <td style="padding:16px 18px;font-family:${FONT};font-size:13px;color:${INK_3};">You are paid</td>
                      <td align="right" style="padding:16px 18px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.03em;color:${INK};">${wage}</td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:0 18px 16px;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${INK_4};">Sent to your own account the moment your answer is accepted. No threshold, no pay day.</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Button -->
              <tr>
                <td style="padding-top:24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="background:${ACCENT};border-radius:12px;">
                        <a href="${escape(input.workUrl)}" style="display:block;padding:17px 20px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Open Work &rarr;</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Info -->
              <tr>
                <td style="padding-top:20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WASH};border-radius:12px;">
                    <tr>
                      <td style="padding:16px 18px;font-family:${FONT};">
                        <div style="font-size:14px;font-weight:600;color:${INK};">Questions close in under a minute</div>
                        <div style="padding-top:5px;font-size:13px;line-height:1.55;color:${INK_3};">Keep Work open and the next one comes straight to you, with no email needed. If this one has closed by the time you arrive, nothing is lost and nothing counts against you.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_4};">
            You asked to be told at this address when work in your skills is waiting. We send at most one of these every ten minutes. <a href="${escape(input.settingsUrl)}" style="color:${ACCENT};text-decoration:none;">Turn them off in Settings</a>.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  return { subject, text, html }
}
