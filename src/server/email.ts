/**
 * Transactional email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Optional: without an API key nothing is sent and callers fall back (for example, copyable invite links).
 */
export interface EmailConfig {
  apiKey: string
  from: string
}

export interface EmailMessage {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

export async function sendEmail(config: EmailConfig, message: EmailMessage): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Email failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** A plain, readable layout that works in every mail client. */
export function layout(input: {
  heading: string
  paragraphs: string[]
  cta?: { label: string; href: string }
  footer?: string
}): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:14px;font-weight:600">HG Profit Options</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escape(input.heading)}</h1>
${input.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#404040">${escape(p)}</p>`).join("\n")}
${input.cta ? `<p style="margin:24px 0"><a href="${escape(input.cta.href)}" style="display:inline-block;background:#171717;color:#fafafa;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600">${escape(input.cta.label)}</a></p>` : ""}
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#737373">${escape(input.footer ?? "Educational content, not personalized investment advice.")}</p>
</td></tr></table></td></tr></table></body></html>`
  const text = [
    input.heading,
    "",
    ...input.paragraphs,
    ...(input.cta ? ["", `${input.cta.label}: ${input.cta.href}`] : []),
    "",
    input.footer ?? "Educational content, not personalized investment advice.",
  ].join("\n")
  return { html, text }
}
