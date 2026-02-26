// ============================================================
// OOH Email Templates – beautiful HTML for sales outreach
// 3 types: cold outreach, follow-up, customer nurture
// Variables use {{VARIABLE}} syntax
// ============================================================

export type EmailTemplateType = "cold" | "followup" | "customer";

export interface EmailTemplateVars {
  recipientName: string;       // "Lars Hansen" or "Lars"
  companyName: string;         // "Café Noir"
  senderName: string;          // "Mads"
  senderTitle: string;         // "OOH Specialist"
  senderCompany: string;       // "Hyde Media"
  senderEmail: string;         // "mads@hydemedia.dk"
  senderPhone?: string;        // "+45 12 34 56 78"
  bodyText: string;            // Main AI-generated body (HTML-safe paragraphs)
  subject: string;             // email subject line
  ctaText?: string;            // "Book et møde" / "Svar på denne mail"
  ctaUrl?: string;             // calendar link
}

// ── Shared HTML wrapper (header + footer + signature) ────────────────────

function buildEmailHtml(vars: EmailTemplateVars, bodyHtml: string): string {
  const logoColor = "#1e3a5f";
  const accentColor = "#2563eb";
  const phone = vars.senderPhone ? `<br>${vars.senderPhone}` : "";
  const cta = vars.ctaUrl
    ? `<tr><td align="center" style="padding:24px 0 8px">
        <a href="${vars.ctaUrl}" style="background:${accentColor};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;display:inline-block">
          ${vars.ctaText || "Book et møde"}
        </a>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${vars.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:${logoColor};border-radius:8px 8px 0 0;padding:20px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px">${vars.senderCompany}</span>
                  <span style="color:#93c5fd;font-size:13px;margin-left:8px">OOH Media</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 32px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${bodyHtml}
              ${cta}
            </table>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:2px solid ${accentColor};border-radius:0 0 8px 8px;padding:20px 32px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:16px;vertical-align:top">
                  <div style="width:44px;height:44px;background:${logoColor};border-radius:50%;display:flex;align-items:center;justify-content:center">
                    <span style="color:#fff;font-weight:800;font-size:18px">${vars.senderName.charAt(0)}</span>
                  </div>
                </td>
                <td style="vertical-align:top">
                  <p style="margin:0;font-weight:700;color:#1e293b;font-size:14px">${vars.senderName}</p>
                  <p style="margin:2px 0 0;color:#64748b;font-size:12px">${vars.senderTitle} · ${vars.senderCompany}</p>
                  <p style="margin:4px 0 0;font-size:12px">
                    <a href="mailto:${vars.senderEmail}" style="color:${accentColor};text-decoration:none">${vars.senderEmail}</a>${phone}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Legal footer -->
        <tr>
          <td style="padding:16px 0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:11px">
              Du modtager denne mail fordi ${vars.companyName} er en potentiel samarbejdspartner.<br>
              <a href="mailto:${vars.senderEmail}?subject=Afmeld" style="color:#94a3b8">Afmeld</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Cold outreach template ────────────────────────────────────────────────

function buildColdBodyHtml(vars: EmailTemplateVars): string {
  const greeting = `<tr><td style="padding-bottom:20px">
    <p style="margin:0;font-size:16px;color:#1e293b">Hej ${vars.recipientName},</p>
  </td></tr>`;

  const body = `<tr><td style="color:#334155;font-size:15px;line-height:1.7;padding-bottom:20px">
    ${vars.bodyText}
  </td></tr>`;

  return greeting + body;
}

// ── Follow-up template ────────────────────────────────────────────────────

function buildFollowupBodyHtml(vars: EmailTemplateVars): string {
  const badge = `<tr><td style="padding-bottom:16px">
    <span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px">
      Opfølgning
    </span>
  </td></tr>`;

  const greeting = `<tr><td style="padding-bottom:20px">
    <p style="margin:0;font-size:16px;color:#1e293b">Hej ${vars.recipientName},</p>
  </td></tr>`;

  const body = `<tr><td style="color:#334155;font-size:15px;line-height:1.7;padding-bottom:20px">
    ${vars.bodyText}
  </td></tr>`;

  return badge + greeting + body;
}

// ── Customer nurture template ─────────────────────────────────────────────

function buildCustomerBodyHtml(vars: EmailTemplateVars): string {
  const badge = `<tr><td style="padding-bottom:16px">
    <span style="background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px">
      Til eksisterende kunde
    </span>
  </td></tr>`;

  const greeting = `<tr><td style="padding-bottom:20px">
    <p style="margin:0;font-size:16px;color:#1e293b">Hej ${vars.recipientName},</p>
  </td></tr>`;

  const body = `<tr><td style="color:#334155;font-size:15px;line-height:1.7;padding-bottom:20px">
    ${vars.bodyText}
  </td></tr>`;

  return badge + greeting + body;
}

// ── Public API ────────────────────────────────────────────────────────────

export function buildEmailFromTemplate(type: EmailTemplateType, vars: EmailTemplateVars): string {
  let bodyHtml: string;
  switch (type) {
    case "cold":     bodyHtml = buildColdBodyHtml(vars); break;
    case "followup": bodyHtml = buildFollowupBodyHtml(vars); break;
    case "customer": bodyHtml = buildCustomerBodyHtml(vars); break;
    default:         bodyHtml = buildColdBodyHtml(vars);
  }
  return buildEmailHtml(vars, bodyHtml);
}

// ── Default subject lines ─────────────────────────────────────────────────

export function defaultSubject(type: EmailTemplateType, companyName: string): string {
  switch (type) {
    case "cold":     return `${companyName} – OOH reklame der forstærker jeres digitale indsats`;
    case "followup": return `Re: ${companyName} – kort opfølgning`;
    case "customer": return `Nyt OOH-format til ${companyName}`;
    default:         return `${companyName} – Hyde Media`;
  }
}
