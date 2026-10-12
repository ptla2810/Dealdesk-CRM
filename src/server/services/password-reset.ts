import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import { ValidationError } from "../errors";
import { parseInput } from "../validate";
import { sendEmail, isEmailConfigured } from "../mailer";
import { checkRateLimit } from "../rate-limit";
import { hashPassword } from "./users";
import { APP_NAME, APP_URL } from "@/lib/config";
import { passwordSchema } from "@/lib/validation/settings";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Starts a password reset. Always behaves the same whether or not the email exists,
 * so the endpoint cannot be used to discover accounts.
 */
export async function requestPasswordReset(input: unknown) {
  const { email } = parseInput(z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address") }), input);
  if (!checkRateLimit(`reset:${email}`, 5, 60 * 60 * 1000)) return;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) } }),
  ]);
  const link = `${APP_URL}/reset-password?token=${token}`;
  if (isEmailConfigured()) {
    await sendEmail({
      to: user.email,
      subject: `Reset your ${APP_NAME} password`,
      text: `Hello ${user.name},\n\nUse the link below to set a new password. It expires in 1 hour.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    });
  } else if (process.env.NODE_ENV !== "production") {
    // Development fallback only — never in production.
    console.info(`[password-reset] No SMTP configured. Reset link for ${user.email}: ${link}`);
  } else {
    console.warn("[password-reset] SMTP_URL is not configured; reset email could not be sent.");
  }
}

export async function resetPassword(input: unknown) {
  const data = parseInput(
    z
      .object({ token: z.string().min(20), password: passwordSchema, confirmPassword: z.string() })
      .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" }),
    input,
  );
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(data.token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
    throw new ValidationError({ token: "This reset link is invalid or has expired. Request a new one." }, "This reset link is invalid or has expired.");
  }
  const passwordHash = await hashPassword(data.password);
  await prisma.$transaction(async (tx) => {
    // Mark used atomically so a token cannot be redeemed twice.
    const used = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw new ValidationError({ token: "This reset link has already been used." });
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await tx.auditLog.create({
      data: { organizationId: record.user.organizationId, actorId: record.userId, entityType: "User", entityId: record.userId, action: "password_reset", summary: "Password reset via email link" },
    });
  });
}
