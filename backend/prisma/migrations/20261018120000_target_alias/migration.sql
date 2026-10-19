-- Optional display name for a target. "name" stays the agent's hostname, so
-- re-enrollment still matches the target by hostname + IP.
ALTER TABLE "targets" ADD COLUMN "alias" TEXT;

-- Alerts snapshot the target's display name when they open (like
-- responsible_team), so renaming a target leaves open alerts unchanged.
ALTER TABLE "alerts" ADD COLUMN "host_name" TEXT;
UPDATE "alerts" SET "host_name" = "targets"."name" FROM "targets" WHERE "targets"."id" = "alerts"."target_id";
ALTER TABLE "alerts" ALTER COLUMN "host_name" SET NOT NULL;
