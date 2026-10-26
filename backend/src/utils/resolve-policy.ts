import type { TargetMetricOverride, TemplateMetric } from "@prisma/client";

// Policy fallback chain, narrowest wins: override → target team (team only) →
// template default. Shared by alerting and the UI so both see the same values.
// A customized metric (override) replaces the template's policy as a whole,
// null thresholds included. Only the team falls through: override, then the
// target's team, then the template's.
export function resolvePolicy(
  templateDefault: TemplateMetric,
  override: TargetMetricOverride | null | undefined,
  targetResponsibleTeam: string | null
) {
  const policy = override ?? templateDefault;
  return {
    reportIntervalSec: policy.reportIntervalSec,
    condition: policy.condition,
    warningThreshold: policy.warningThreshold,
    criticalThreshold: policy.criticalThreshold,
    consecutiveBreaches: policy.consecutiveBreaches,
    responsibleTeam:
      override?.responsibleTeam ?? targetResponsibleTeam ?? templateDefault.responsibleTeam,
    alertSubject: policy.alertSubject,
    alertDescription: policy.alertDescription,
    priority: policy.priority,
  };
}
