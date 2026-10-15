-- Alerts fire even when neither the target nor the template metric names a
-- responsible team; such alerts have no team.
ALTER TABLE "alerts" ALTER COLUMN "responsible_team" DROP NOT NULL;
