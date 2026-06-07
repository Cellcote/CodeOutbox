// The one branded email shell — the card chrome (masthead + accent rule + body +
// footer) shared by tenant broadcasts (composeMessage) and CodeOutbox's own system
// mail (sign-in / confirm / claim). One shell ⇒ everything looks consistent.

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',Consolas,Menlo,monospace";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

export interface ShellOptions {
  masthead: string; // header HTML (logo img or styled wordmark)
  accent: string; // hex accent for the header rule
  bodyHtml: string; // main content (already HTML)
  footerHtml: string; // small-print footer (already HTML)
  headerBg?: string; // header background; default white (tenant), dark for CodeOutbox
  preheader?: string; // hidden inbox-preview text (plain; escaped here)
  afterCard?: string; // optional HTML below the card (e.g. "Powered by …")
}

export function emailShell(o: ShellOptions): string {
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(o.accent) ? o.accent : "#F59E0B";
  const headerBg = /^#[0-9a-fA-F]{3,8}$/.test(o.headerBg ?? "")
    ? (o.headerBg as string)
    : "#ffffff";
  const pre = o.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(
        o.preheader,
      )}</span>`
    : "";
  return (
    `<div style="background:#f4f4f5;margin:0;padding:0">` +
    pre +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden">` +
    `<tr><td style="background:${headerBg};padding:20px 28px;border-bottom:3px solid ${accent}">${o.masthead}</td></tr>` +
    `<tr><td style="padding:28px;font-family:${SANS};font-size:16px;line-height:1.6;color:#111111">${o.bodyHtml}</td></tr>` +
    `<tr><td style="padding:18px 28px;border-top:1px solid #eeeeee;font-family:${SANS};font-size:12px;color:#999999">${o.footerHtml}</td></tr>` +
    `</table>` +
    (o.afterCard ?? "") +
    `</td></tr></table></div>`
  );
}

// CodeOutbox's own masthead: the amber [↑] wordmark on the dark bar (the "real"
// CodeOutbox brand). Light text, so pair with headerBg "#0A0A0A".
export function codeoutboxMasthead(): string {
  return (
    `<span style="font-family:${MONO};font-size:18px;font-weight:600;color:#fafafa;letter-spacing:-0.5px">` +
    `<span style="color:#F59E0B">[&#8593;]</span> CodeOutbox</span>`
  );
}
