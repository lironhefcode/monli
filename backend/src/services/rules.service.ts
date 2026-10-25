import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { CreateRuleInput, UpdateRuleInput } from "../schemas/notifications.schema.js";
import { HttpError } from "../utils/http-error.js";

const ruleRow = {
  include: { destinations: { select: { destinationId: true } } },
} satisfies Prisma.NotificationRuleDefaultArgs;

type RuleRow = Prisma.NotificationRuleGetPayload<typeof ruleRow>;

// The join rows are flattened to the ids the form edits.
function toRow({ destinations, ...rule }: RuleRow) {
  return { ...rule, destinationIds: destinations.map((link) => link.destinationId) };
}

export async function listRules() {
  const rules = await prisma.notificationRule.findMany({ ...ruleRow, orderBy: { name: "asc" } });
  return rules.map(toRow);
}

async function findRule(ruleId: number) {
  const rule = await prisma.notificationRule.findUnique({ where: { id: ruleId } });
  if (!rule) {
    throw new HttpError(404, "rule not found");
  }
  return rule;
}

// De-duplicated, and each must exist.
async function destinationLinks(destinationIds: number[]) {
  const ids = [...new Set(destinationIds)];
  const found = await prisma.notificationDestination.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(400, "unknown destination");
  return ids.map((destinationId) => ({ destinationId }));
}

// Teams are matched exactly, so duplicates add nothing.
const uniqueTeams = (teams: string[] | undefined) => (teams === undefined ? undefined : [...new Set(teams)]);

export async function createRule(input: CreateRuleInput) {
  const { min_priority, destination_ids, teams, ...fields } = input;
  const rule = await prisma.notificationRule.create({
    ...ruleRow,
    data: {
      ...fields,
      teams: uniqueTeams(teams),
      minPriority: min_priority,
      destinations: { create: await destinationLinks(destination_ids) },
    },
  });
  return toRow(rule);
}

export async function updateRule(ruleId: number, input: UpdateRuleInput) {
  await findRule(ruleId);
  const { min_priority, destination_ids, teams, ...fields } = input;
  const rule = await prisma.notificationRule.update({
    ...ruleRow,
    where: { id: ruleId },
    data: {
      ...fields,
      teams: uniqueTeams(teams),
      minPriority: min_priority,
      destinations:
        destination_ids === undefined
          ? undefined
          : { deleteMany: {}, create: await destinationLinks(destination_ids) },
    },
  });
  return toRow(rule);
}

export async function deleteRule(ruleId: number) {
  await findRule(ruleId);
  await prisma.notificationRule.delete({ where: { id: ruleId } });
}

// Team names in use anywhere, for the rule form's picker (new names can still be typed).
export async function listTeams() {
  const where = { responsibleTeam: { not: null } };
  const select = { responsibleTeam: true } as const;
  const sources = await Promise.all([
    prisma.target.findMany({ where, select, distinct: ["responsibleTeam"] }),
    prisma.templateMetric.findMany({ where, select, distinct: ["responsibleTeam"] }),
    prisma.targetMetricOverride.findMany({ where, select, distinct: ["responsibleTeam"] }),
    prisma.alert.findMany({ where, select, distinct: ["responsibleTeam"] }),
  ]);
  const teams = new Set(sources.flat().map((row) => row.responsibleTeam as string));
  return [...teams].sort((a, b) => a.localeCompare(b));
}
