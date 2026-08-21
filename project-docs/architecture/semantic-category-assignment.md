# Category assignment admission boundary

Category assignment is a separate aggregate from category-definition and
target-definition editing. It must not be implemented as a direct update to a
single `budgeted` field.

## Recovered stock client path

The deployed stock Web runtime establishes the following single-category
assignment path:

1. Module `44710` computes an assignment value and invokes
   `MonthlySubCategoryBudgetEditor.setAssignedAmount`.
2. Module `39168` updates the monthly-category budget, then calls
   `MonthlyBudgetEditor.moveMoneyBetweenMonthlySubCategoryBudgets` when the
   assignment changed.
3. Module `58984` creates an immutable money-movement entity from a null source
   monthly-category budget to the selected monthly-category budget. A direct
   assignment uses source `manual_assign`.
4. The same local change set contains the updated monthly-category budget and
   the money movement. A money-movement group is created for multi-category
   operations, not for the captured single-category path.

The recovered Web entity definitions agree with the iOS 26.30 serializer
inventory:

- monthly-category budget wire fields: `id`, `is_tombstone`, `budgeted`,
  `goal_snoozed_at`, `entities_monthly_budget_id`, and
  `entities_subcategory_id`;
- money-movement wire fields: `id`, `is_tombstone`, `amount`,
  `from_entities_monthly_subcategory_budget_id`,
  `to_entities_monthly_subcategory_budget_id`,
  `entities_money_movement_group_id`, `source`, `note`,
  `performed_by_user_id`, `move_started_at`, and `move_accepted_at`.

This is stock-client behavior recovered from deployed code. The project-owned
canonical command preserves the aggregate and stable identities while keeping
Web field names at the protocol adapter boundary.

## Captured server and readback facts

TARGET-001 proves that assigning 100000 milliunits to the monthly target:

- advanced server knowledge from 109 to 113;
- persisted `budgeted = 100000`;
- produced `balance = 100000`, `goal_overall_funded = 100000`,
  `goal_under_funded = 0`, `goal_overall_outflows = 0`, and
  `goal_percentage_complete = 100`;
- rendered `Funded`; and
- reached stock iOS unchanged.

The target lifecycle and status-edge evidence also proves the subsequent cash
spending, refund, and credit-spending calculation states. It does not retain a
complete redacted request/response entity envelope for the initial assignment.

ASSIGNMENT-001 additionally captures a direct assignment from zero to 1000
milliunits. The request contains exactly one monthly-category row and one
ungrouped `manual_assign` movement. The acknowledgement:

- advances device knowledge by 2 and server knowledge by 2;
- preserves the two source identities;
- supplies the movement acceptance timestamp;
- returns current/next monthly and monthly-category calculations; and
- renders assigned 1000, activity 0, and available 1000.

An exact browser-level `Network.replayXHR` of the same request preserves the
canonical rows but advances server knowledge by 1. It retains device knowledge
2 and the original movement acceptance timestamp. The captured client request
identifier is therefore not treated as a generic server idempotency key. The
adapter admits exactly the observed two-knowledge-behind replay boundary and
fails closed outside it.

## Implemented boundary

The implementation now consists of:

1. a strict schema-44 assignment/replay parser;
2. a typed assignment aggregate and immutable canonical money movement;
3. an atomic PostgreSQL monthly-budget update plus movement insert;
4. current/next category, monthly-budget, and Ready-to-Assign projections for
   the captured state; and
5. backfill projection of accepted money movements.

Multi-category movement groups, negative assignment changes, moving money
between categories, future-month assignment, and arbitrary replay patterns
remain unsupported until separately captured. Target definition support
remains separate; additional funded/spent/overspent states still depend on
their categorized transaction evidence.
