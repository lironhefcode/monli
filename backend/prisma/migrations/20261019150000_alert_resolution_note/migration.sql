-- Optional comment left when an alert is resolved manually; null for
-- auto-resolved alerts.
ALTER TABLE "alerts" ADD COLUMN "resolution_note" TEXT;
