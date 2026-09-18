-- CreateTable
CREATE TABLE "metrics" (
    "id" SERIAL NOT NULL,
    "metric_key" TEXT NOT NULL,
    "unit" TEXT,
    "description" TEXT,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_metrics" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "metric_id" INTEGER NOT NULL,
    "report_interval_sec" INTEGER NOT NULL DEFAULT 60,
    "condition" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "consecutive_breaches" INTEGER NOT NULL DEFAULT 1,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "responsible_team" TEXT,
    "alert_subject" TEXT NOT NULL DEFAULT '',
    "alert_description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'p3',

    CONSTRAINT "template_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "targets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ip_address" TEXT,
    "os" TEXT,
    "arch" TEXT,
    "description" TEXT,
    "responsible_team" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "last_seen_at" TIMESTAMP(3),
    "api_key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "target_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_templates" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,

    CONSTRAINT "target_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_metric_overrides" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "metric_id" INTEGER NOT NULL,
    "report_interval_sec" INTEGER,
    "condition" TEXT,
    "threshold" DOUBLE PRECISION,
    "consecutive_breaches" INTEGER,
    "severity" TEXT,
    "responsible_team" TEXT,
    "alert_subject" TEXT,
    "alert_description" TEXT,
    "priority" TEXT,

    CONSTRAINT "target_metric_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_readings" (
    "id" BIGSERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "metric_id" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "metric_id" INTEGER NOT NULL,
    "triggered_value" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "responsible_team" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL,
    "first_response_at" TIMESTAMP(3),
    "first_response_by" TEXT,
    "first_response_note" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metrics_metric_key_key" ON "metrics"("metric_key");

-- CreateIndex
CREATE UNIQUE INDEX "template_metrics_template_id_metric_id_key" ON "template_metrics"("template_id", "metric_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_token_hash_key" ON "enrollment_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "target_templates_target_id_template_id_key" ON "target_templates"("target_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "target_metric_overrides_target_id_metric_id_key" ON "target_metric_overrides"("target_id", "metric_id");

-- CreateIndex
CREATE INDEX "idx_readings_target_metric_time" ON "metric_readings"("target_id", "metric_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_alerts_status" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "idx_alerts_target" ON "alerts"("target_id");

-- AddForeignKey
ALTER TABLE "template_metrics" ADD CONSTRAINT "template_metrics_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_metrics" ADD CONSTRAINT "template_metrics_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_templates" ADD CONSTRAINT "target_templates_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_templates" ADD CONSTRAINT "target_templates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_metric_overrides" ADD CONSTRAINT "target_metric_overrides_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_metric_overrides" ADD CONSTRAINT "target_metric_overrides_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_readings" ADD CONSTRAINT "metric_readings_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_readings" ADD CONSTRAINT "metric_readings_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
