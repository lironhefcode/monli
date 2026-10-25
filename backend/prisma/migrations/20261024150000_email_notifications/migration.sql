-- AlterTable
ALTER TABLE "webhooks" RENAME COLUMN "url" TO "destination";

-- CreateTable
CREATE TABLE "webhook_recipients" (
    "webhook_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "webhook_recipients_pkey" PRIMARY KEY ("webhook_id","user_id")
);

-- CreateTable
CREATE TABLE "email_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "smtp_url" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "webhook_recipients" ADD CONSTRAINT "webhook_recipients_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_recipients" ADD CONSTRAINT "webhook_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
