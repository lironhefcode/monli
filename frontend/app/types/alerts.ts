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
  responsibleTeam: string | null;
  // Resource's displayed name when the alert opened; later renames don't change it.
  hostName: string;
  // Can be undone; each change is recorded as an AlertComment.
  acknowledged: boolean;
  target: { id: number; name: string };
  metric: { id: number; metricKey: string; unit: string | null };
  // The interface that breached, for per-device metrics.
  interface: { id: number; kind: string; name: string } | null;
}

export type AlertAction = "ack" | "unack" | "resolve";

// Item from GET /alerts/:id/comments, oldest first.
export interface AlertComment {
  id: number;
  action: AlertAction;
  body: string | null;
  // Null until UI sign-in exists.
  author: string | null;
  createdAt: string;
}
