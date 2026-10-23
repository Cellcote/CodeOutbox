// "jane@gmail.com" → "j•••@gmail.com": enough for someone to recognize their own
// address, not enough to read someone else's (URLs, pages, emails to the owner).
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = String(email).split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

export const MASKED_RE = /^[^@\s•]?•••@[a-z0-9.-]+\.[a-z]{2,}$/i;
