/**
 * Outbound email. Only active when SMTP_URL is configured; otherwise
 * `isEmailConfigured()` is false and callers must not claim delivery.
 */
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_URL);
}

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.SMTP_URL!);
    await transport.sendMail({ from: process.env.EMAIL_FROM || "no-reply@example.com", ...msg });
    return true;
  } catch (err) {
    console.error("[mailer] send failed:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
