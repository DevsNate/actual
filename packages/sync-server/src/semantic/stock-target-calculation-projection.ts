/**
 * Project-owned projection of only the target cadences proven by TARGET-001.
 * Unsupported definitions fail closed instead of falling back to an inferred
 * target formula.
 */
import type { BudgetEntity } from '@actual-app/semantic-core';

import type { StockMonthlySubcategoryBudgetCalculation } from './stock-calculation-entities';

export function projectCapturedTargetRows(
  rows: readonly StockMonthlySubcategoryBudgetCalculation[],
  entities: readonly BudgetEntity[],
): readonly StockMonthlySubcategoryBudgetCalculation[] {
  const categories = new Map(
    entities
      .filter(entity => entity.entityKind === 'be_subcategories')
      .map(entity => [entity.entityId, entity]),
  );
  const months = new Map(
    entities
      .filter(entity => entity.entityKind === 'be_monthly_subcategory_budgets')
      .map(entity => [entity.entityId, entity]),
  );
  return rows.map(row => {
    const monthEntity = months.get(
      String(row.entities_monthly_subcategory_budget_id),
    );
    if (!monthEntity)
      throw new Error('Target calculation month is unavailable');
    const category = categories.get(
      requireString(monthEntity.payload.subCategoryId),
    );
    if (!category)
      throw new Error('Target calculation category is unavailable');
    // Bootstrap rows can carry target-template cadence metadata without an
    // activated target. TARGET-001 proves activation only with both fields.
    if (
      category.payload.goalTargetAmount === 0 &&
      category.payload.goalCreatedOn === null
    ) {
      return row;
    }
    if (category.payload.goalType == null) return row;

    const month = requireIsoDate(monthEntity.payload.month);
    const definition = readCapturedDefinition(category.payload);
    const result = calculateCapturedTarget(definition, month);
    return {
      ...row,
      goal_overall_funded: 0,
      goal_overall_outflows: 0,
      goal_under_funded: result.target,
      goal_target: result.target,
      goal_overall_left: result.overallLeft,
      goal_expected_completion: result.expectedCompletion,
      // TARGET-001 did not retain this field for the unfunded definition
      // states, so it remains null until a status projection is admitted.
      goal_percentage_complete: null,
    };
  });
}

type CapturedDefinition = Readonly<{
  createdOn: string;
  amount: number;
  date: string | null;
  cadence: number;
  frequency: number;
  day: number | null;
}>;

function readCapturedDefinition(
  payload: Readonly<Record<string, unknown>>,
): CapturedDefinition {
  if (
    payload.goalType !== 'NEED' ||
    payload.goalNeedsWholeAmount !== true ||
    payload.monthlyFunding !== 0
  ) {
    throw new Error('Unsupported target definition');
  }
  return {
    createdOn: requireIsoDate(payload.goalCreatedOn),
    amount: requirePositiveInteger(payload.goalTargetAmount),
    date:
      payload.goalTargetDate === null
        ? null
        : requireIsoDate(payload.goalTargetDate),
    cadence: requireInteger(payload.goalCadence),
    frequency: requirePositiveInteger(payload.goalCadenceFrequency),
    day: payload.goalDay === null ? null : requireInteger(payload.goalDay),
  };
}

function calculateCapturedTarget(
  definition: CapturedDefinition,
  month: string,
): { target: number; overallLeft: number; expectedCompletion: number } {
  if (
    definition.cadence === 1 &&
    definition.frequency === 1 &&
    definition.date === null &&
    definition.day === null
  ) {
    return {
      target: definition.amount,
      overallLeft: definition.amount,
      expectedCompletion: 1,
    };
  }
  if (
    (definition.cadence === 13 ||
      (definition.cadence === 1 && definition.frequency === 2)) &&
    definition.date !== null &&
    definition.day === null
  ) {
    const remaining = inclusiveMonthDistance(month, definition.date);
    if (remaining < 1 || remaining > 2) {
      throw new Error('Captured dated target is outside its admitted horizon');
    }
    return {
      target: Math.ceil(definition.amount / remaining),
      overallLeft: definition.amount,
      expectedCompletion: remaining,
    };
  }
  if (
    definition.cadence === 2 &&
    definition.frequency === 1 &&
    definition.date === null &&
    definition.day === 6
  ) {
    const occurrences = countWeekdayInMonth(
      month,
      definition.createdOn,
      definition.day,
    );
    const target = definition.amount * occurrences;
    if (!Number.isSafeInteger(target) || occurrences < 1) {
      throw new Error('Captured weekly target has no admitted occurrence');
    }
    return { target, overallLeft: target, expectedCompletion: 1 };
  }
  throw new Error('Unsupported target cadence');
}

function inclusiveMonthDistance(month: string, target: string): number {
  const [year, monthNumber] = monthParts(month);
  const [targetYear, targetMonth] = monthParts(target);
  return (targetYear - year) * 12 + targetMonth - monthNumber + 1;
}

function countWeekdayInMonth(
  month: string,
  createdOn: string,
  weekday: number,
): number {
  const [year, monthNumber] = monthParts(month);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const created = new Date(`${createdOn}T00:00:00.000Z`);
  const cursor = created > start ? created : start;
  const end = new Date(Date.UTC(year, monthNumber, 0));
  let count = 0;
  for (
    const date = new Date(cursor);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (date.getUTCDay() === weekday) count += 1;
  }
  return count;
}

function monthParts(value: string): [number, number] {
  const date = requireIsoDate(value);
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
}

function requireIsoDate(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new Error('Target date must be an ISO calendar date');
  }
  return value;
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value))
    throw new Error('Target field must be an integer');
  return Number(value);
}

function requirePositiveInteger(value: unknown): number {
  const integer = requireInteger(value);
  if (integer <= 0) throw new Error('Target field must be positive');
  return integer;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Target identity is unavailable');
  }
  return value;
}
