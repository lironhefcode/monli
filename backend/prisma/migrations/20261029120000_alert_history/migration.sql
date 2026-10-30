-- DropIndex
DROP INDEX "idx_alerts_status";

-- DropIndex
DROP INDEX "idx_alerts_target";

-- CreateIndex
CREATE INDEX "idx_alerts_status" ON "alerts"("status", "opened_at");

-- CreateIndex
CREATE INDEX "idx_alerts_target" ON "alerts"("target_id", "opened_at");
