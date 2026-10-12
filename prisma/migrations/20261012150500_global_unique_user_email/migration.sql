-- DropIndex
DROP INDEX "User_email_idx";

-- DropIndex
DROP INDEX "User_organizationId_email_key";

-- DropIndex
DROP INDEX "User_organizationId_username_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

