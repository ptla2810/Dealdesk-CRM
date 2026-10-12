import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { verifyCredentials } from "@/server/credentials";
import { buildContext } from "@/server/context";
import { requestPasswordReset, resetPassword } from "@/server/services/password-reset";
import { changePassword, updateUser } from "@/server/services/users";
import { clearRateLimit } from "@/server/rate-limit";
import { createFixture, expectError, PASSWORD, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

describe("login", () => {
  it("accepts email (case-insensitive) or username with the right password", async () => {
    const byEmail = await verifyCredentials("  ADMIN@alpha.test ", PASSWORD);
    expect(byEmail).toMatchObject({ ok: true, user: { id: f.users.admin.id } });
    const byUsername = await verifyCredentials("admin_alpha", PASSWORD);
    expect(byUsername.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: f.users.admin.id } });
    expect(u.lastLoginAt).not.toBeNull();
  });

  it("rejects a wrong password or unknown user with the same generic reason", async () => {
    expect(await verifyCredentials("admin@alpha.test", "wrong")).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyCredentials("nobody@alpha.test", PASSWORD)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyCredentials("", "")).toEqual({ ok: false, reason: "invalid" });
  });

  it("blocks deactivated users", async () => {
    await prisma.user.update({ where: { id: f.users.rep2.id }, data: { isActive: false } });
    expect(await verifyCredentials("reptwo@alpha.test", PASSWORD)).toEqual({ ok: false, reason: "disabled" });
    expect(await buildContext(f.users.rep2.id)).toBeNull();
    await prisma.user.update({ where: { id: f.users.rep2.id }, data: { isActive: true } });
  });

  it("rate-limits repeated failures for an identifier", async () => {
    for (let i = 0; i < 10; i++) await verifyCredentials("manager@alpha.test", "bad");
    expect(await verifyCredentials("manager@alpha.test", PASSWORD)).toEqual({ ok: false, reason: "rate_limited" });
    clearRateLimit("login:manager@alpha.test");
  });
});

describe("sessions", () => {
  it("invalidates sessions whose version is stale (password change / deactivation)", async () => {
    expect(await buildContext(f.users.rep.id, 0)).not.toBeNull();
    await changePassword(f.ctx.rep, { currentPassword: PASSWORD, newPassword: "NewPassw0rd!", confirmPassword: "NewPassw0rd!" });
    expect(await buildContext(f.users.rep.id, 0)).toBeNull();
    expect(await buildContext(f.users.rep.id, 1)).not.toBeNull();
    expect((await verifyCredentials("rep@alpha.test", "NewPassw0rd!")).ok).toBe(true);
  });

  it("rejects a wrong current password", async () => {
    await expectError(changePassword(f.ctx.manager, { currentPassword: "nope", newPassword: "NewPassw0rd!", confirmPassword: "NewPassw0rd!" }), "VALIDATION");
  });

  it("protects the last administrator and the caller's own role", async () => {
    const err = await expectError(updateUser(f.ctx.admin, { id: f.users.admin.id, name: "Admin", roleId: f.roles.SALES_REP!, isActive: true }), "BUSINESS_RULE");
    expect(err).toBeTruthy();
  });
});

describe("password reset", () => {
  it("issues a single-use, expiring token and signs out other sessions", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await requestPasswordReset({ email: "Support@Alpha.test" });
    const line = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("reset-password?token="));
    spy.mockRestore();
    expect(line).toBeDefined();
    const token = new URL(line!.split(": ").pop()!).searchParams.get("token")!;
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: f.users.support.id } });
    expect(stored.tokenHash).not.toBe(token); // only a hash is stored

    await resetPassword({ token, password: "Brand-New-Pass1", confirmPassword: "Brand-New-Pass1" });
    expect((await verifyCredentials("support@alpha.test", "Brand-New-Pass1")).ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: f.users.support.id } });
    expect(u.sessionVersion).toBe(1);
    await expectError(resetPassword({ token, password: "Another-Pass12", confirmPassword: "Another-Pass12" }), "VALIDATION");
  });

  it("does not reveal whether an email exists", async () => {
    await expect(requestPasswordReset({ email: "ghost@nowhere.test" })).resolves.toBeUndefined();
    expect(await prisma.passwordResetToken.count({ where: { user: { email: "ghost@nowhere.test" } } })).toBe(0);
  });

  it("rejects unknown and expired tokens", async () => {
    await expectError(resetPassword({ token: "x".repeat(43), password: "Brand-New-Pass1", confirmPassword: "Brand-New-Pass1" }), "VALIDATION");
    const raw = "expired-token-value-0123456789abcdef";
    await prisma.passwordResetToken.create({
      data: { userId: f.users.manager.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() - 1000) },
    });
    await expectError(resetPassword({ token: raw, password: "Brand-New-Pass1", confirmPassword: "Brand-New-Pass1" }), "VALIDATION");
  });
});
