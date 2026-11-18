/**
 * Small mailbox helpers shared by the transports that need structured headers
 * (Gmail API) and by environment validation, so a display name in `MAIL_FROM`
 * cannot drift from the authorised sender address.
 */

/** Parsed email address and optional display name. */
export interface Mailbox {
  email: string;
  name?: string;
}

/**
 * Removes CR/LF from a value destined for an email header. This is the
 * injection guard: an interpolated value must never be able to start a new
 * header (ADR 0004 failure semantics, extended to Gmail in ADR 0005).
 */
export function stripHeaderNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Parses `"Display Name" <user@example.com>`, `Display Name <user@example.com>`
 * or a bare `user@example.com`. The address is returned trimmed but otherwise
 * unvalidated; callers that need strictness check `email` afterwards.
 */
export function parseMailbox(value: string): Mailbox {
  const trimmed = stripHeaderNewlines(value);
  const angled = /^(.*?)\s*<([^<>]+)>\s*$/.exec(trimmed);

  if (angled) {
    const name = angled[1].trim().replace(/^"|"$/g, '').trim();
    return { email: angled[2].trim(), ...(name ? { name } : {}) };
  }

  return { email: trimmed };
}
