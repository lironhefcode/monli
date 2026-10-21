-- DropIndex
DROP INDEX "idx_readings_target_metric_time";

-- AlterTable
ALTER TABLE "metrics" ADD COLUMN     "device_kind" TEXT;

-- AlterTable
ALTER TABLE "metric_readings" ADD COLUMN     "interface_id" INTEGER;

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "interface_id" INTEGER;

-- CreateTable
CREATE TABLE "target_interfaces" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_interfaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_interfaces_target_id_kind_name_key" ON "target_interfaces"("target_id", "kind", "name");

-- CreateIndex
CREATE INDEX "idx_readings_target_metric_time" ON "metric_readings"("target_id", "metric_id", "interface_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "target_interfaces" ADD CONSTRAINT "target_interfaces_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_readings" ADD CONSTRAINT "metric_readings_interface_id_fkey" FOREIGN KEY ("interface_id") REFERENCES "target_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_interface_id_fkey" FOREIGN KEY ("interface_id") REFERENCES "target_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Disk and network metrics are now measured per device.
UPDATE "metrics" AS m SET "device_kind" = v.kind, "description" = v.description
FROM (VALUES
    ('disk_utilization', 'filesystem', 'Disk space used, per mounted filesystem'),
    ('disk_inode_utilization', 'filesystem', 'Inodes used, per mounted filesystem'),
    ('disk_read_rate', 'disk', 'Bytes read per second, per physical disk'),
    ('disk_write_rate', 'disk', 'Bytes written per second, per physical disk'),
    ('network_receive_rate', 'network', 'Bytes received per second, per network interface'),
    ('network_transmit_rate', 'network', 'Bytes sent per second, per network interface'),
    ('network_error_rate', 'network', 'Receive and transmit errors per second, per network interface')
) AS v(metric_key, kind, description)
WHERE m."metric_key" = v.metric_key;

-- Open alerts on those metrics have no interface, and new readings always
-- name one, so nothing would ever resolve them.
UPDATE "alerts" SET "status" = 'resolved', "resolved_at" = CURRENT_TIMESTAMP
WHERE "status" = 'open'
  AND "metric_id" IN (SELECT "id" FROM "metrics" WHERE "device_kind" IS NOT NULL);
