-- RenameTable
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "refreshToken" RENAME TO "refresh_tokens";

-- RenamePrimaryKey
ALTER INDEX "User_pkey" RENAME TO "users_pkey";
ALTER INDEX "refreshToken_pkey" RENAME TO "refresh_tokens_pkey";

-- RenameIndex
ALTER INDEX "User_name_key" RENAME TO "users_name_key";
ALTER INDEX "User_email_key" RENAME TO "users_email_key";
ALTER INDEX "refreshToken_tokenHash_key" RENAME TO "refresh_tokens_tokenHash_key";
ALTER INDEX "refreshToken_userId_idx" RENAME TO "refresh_tokens_userId_idx";

-- RenameForeignKey
ALTER TABLE "refresh_tokens" RENAME CONSTRAINT "refreshToken_userId_fkey" TO "refresh_tokens_userId_fkey";
