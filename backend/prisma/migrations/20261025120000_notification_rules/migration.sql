-- DropForeignKey
ALTER TABLE "webhook_recipients" DROP CONSTRAINT "webhook_recipients_user_id_fkey";

-- DropForeignKey
ALTER TABLE "webhook_recipients" DROP CONSTRAINT "webhook_recipients_webhook_id_fkey";

-- DropTable
DROP TABLE "email_settings";

-- DropTable
DROP TABLE "webhook_recipients";

-- DropTable
DROP TABLE "webhooks";

-- CreateTable
CREATE TABLE "notification_destinations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "email_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_delivered_at" TIMESTAMP(3),
    "last_status" INTEGER,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_recipients" (
    "destination_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "destination_recipients_pkey" PRIMARY KEY ("destination_id","user_id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "teams" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_priority" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rule_destinations" (
    "rule_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,

    CONSTRAINT "notification_rule_destinations_pkey" PRIMARY KEY ("rule_id","destination_id")
);

-- CreateTable
CREATE TABLE "email_server" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "security" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "from_address" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_server_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "destination_recipients" ADD CONSTRAINT "destination_recipients_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "notification_destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_recipients" ADD CONSTRAINT "destination_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rule_destinations" ADD CONSTRAINT "notification_rule_destinations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "notification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rule_destinations" ADD CONSTRAINT "notification_rule_destinations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "notification_destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

