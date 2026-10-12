import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { checkRateLimit, clearRateLimit } from "./rate-limit";

// A real bcrypt hash of a random value, compared against when the user is unknown
// so response timing does not reveal whether an account exists.
const DUMMY_HASH = "$2b$12$73RsmHm13y4ui5uEp8hmI.oSeMJgiYV./IEnlHlcl2Nf84TlDtu1e";

export type CredentialResult =
  | { ok: true; user: { id: string; email: string; name: string } }
  | { ok: false; reason: "invalid" | "disabled" | "rate_limited" };

/** Verifies an email-or-username + password pair. Used by the Auth.js Credentials provider. */
export async function verifyCredentials(identifierRaw: string, password: string): Promise<CredentialResult> {
  const identifier = identifierRaw.trim().toLowerCase();
  if (!identifier || !password) return { ok: false, reason: "invalid" };
  if (!checkRateLimit(`login:${identifier}`, 10, 15 * 60 * 1000)) return { ok: false, reason: "rate_limited" };

  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { username: identifier }] } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !valid) return { ok: false, reason: "invalid" };
  if (!user.isActive) return { ok: false, reason: "disabled" };

  clearRateLimit(`login:${identifier}`);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, user: { id: user.id, email: user.email, name: user.name } };
}
