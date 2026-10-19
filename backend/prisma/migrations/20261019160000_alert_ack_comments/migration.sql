-- Ack becomes a flag that can be undone; every ack, unack and manual resolve
-- is kept as a timed comment instead of the single first-response fields.
ALTER TABLE "alerts" ADD COLUMN "acknowledged" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "alert_comments" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "body" TEXT,
    "author" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alert_comments_action_check" CHECK ("action" IN ('ack', 'unack', 'resolve'))
);

CREATE INDEX "idx_alert_comments_alert" ON "alert_comments"("alert_id", "created_at");

ALTER TABLE "alert_comments" ADD CONSTRAINT "alert_comments_alert_id_fkey"
    FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing acks and resolve notes over before dropping their columns.
UPDATE "alerts" SET "acknowledged" = true WHERE "first_response_at" IS NOT NULL;

INSERT INTO "alert_comments" ("alert_id", "action", "body", "author", "created_at")
SELECT "id", 'ack', "first_response_note", "first_response_by", "first_response_at"
FROM "alerts" WHERE "first_response_at" IS NOT NULL;

INSERT INTO "alert_comments" ("alert_id", "action", "body", "created_at")
SELECT "id", 'resolve', "resolution_note", COALESCE("resolved_at", CURRENT_TIMESTAMP)
FROM "alerts" WHERE "resolution_note" IS NOT NULL;

ALTER TABLE "alerts"
    DROP COLUMN "first_response_at",
    DROP COLUMN "first_response_by",
    DROP COLUMN "first_response_note",
    DROP COLUMN "resolution_note";
