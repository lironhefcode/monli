// Shape of an item from GET /alerts (with target and metric names included).
export interface Alert {
  id: number;
  severity: "warning" | "critical";
  priority: "p1" | "p2" | "p3" | "p4";
  status: "open" | "resolved";
  subject: string;
  description: string | null;
  triggeredValue: number;
  lastValue: number | null;
  lastValueAt: string | null;
  openedAt: string;
  responsibleTeam: string;
  target: { id: number; name: string };
  metric: { id: number; metricKey: string; unit: string | null };
}
