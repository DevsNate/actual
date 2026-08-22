import { isDeepStrictEqual } from "node:util";

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalOrdinaryPayeeMutation,
  CanonicalOrdinaryTransactionMutation,
} from "@actual-app/semantic-core";

import { buildStockBudgetEmptyDelta } from "./stock-budget-bootstrap";
import { projectStockBudgetCalculations } from "./stock-budget-calculation-projection";
import { projectStockRequestEntity } from "./stock-budget-projection";
import { isRecord } from "./stock-operation";
import { normalizeCapturedCheckingTransactionAmounts } from "./stock-transaction-normalization";

const PAYEE_KEYS = [
  "auto_fill_amount",
  "auto_fill_amount_enabled",
  "auto_fill_memo",
  "auto_fill_memo_enabled",
  "auto_fill_subcategory_enabled",
  "auto_fill_subcategory_id",
  "auto_fill_user_defined_subcategory_id",
  "enabled",
  "entities_account_id",
  "id",
  "internal_name",
  "is_tombstone",
  "name",
  "rename_on_import_enabled",
] as const;

const TRANSACTION_KEYS = [
  "accepted",
  "amount",
  "cash_amount",
  "check_number",
  "cleared",
  "credit_amount",
  "credit_amount_adjusted",
  "date",
  "date_entered_from_schedule",
  "debt_transaction_type",
  "entities_account_id",
  "entities_payee_id",
  "entities_scheduled_transaction_id",
  "entities_subcategory_id",
  "flag",
  "id",
  "imported_date",
  "imported_payee",
  "is_tombstone",
  "matched_transaction_id",
  "memo",
  "original_imported_payee",
  "provider_cleansed_payee",
  "source",
  "subcategory_credit_amount_preceding",
  "transfer_account_id",
  "transfer_subtransaction_id",
  "transfer_transaction_id",
  "ynab_id",
] as const;

type StockOrdinaryMutationBase = {
  changes: BudgetChangeSetCommand["changes"];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number;
  serverKnowledgeAdvance: 1 | 2;
};

export type StockOrdinaryMutation =
  | (StockOrdinaryMutationBase & {
      mutation: CanonicalOrdinaryTransactionMutation;
      mutationDomain: "transaction";
    })
  | (StockOrdinaryMutationBase & {
      mutation: CanonicalOrdinaryPayeeMutation;
      mutationDomain: "payee";
    });

export function parseStockOrdinaryMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  return (
    parseCreateWithoutPayee(changedEntities, snapshot) ??
    parseCreateWithPayee(changedEntities, snapshot) ??
    parseTransactionEdit(changedEntities, snapshot) ??
    parseTransactionDelete(changedEntities, snapshot) ??
    parseReferencedPayeeDelete(changedEntities, snapshot) ??
    parsePayeeMutation(changedEntities, snapshot)
  );
}

function parseCreateWithoutPayee(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  if (!hasExactKeys(changedEntities, ["be_transaction_groups"])) return null;
  const group = exactlyOneRecord(changedEntities.be_transaction_groups);
  const transactionRow =
    group && isRecord(group.be_transaction) ? group.be_transaction : null;
  if (
    !group ||
    !transactionRow ||
    group.id !== transactionRow.id ||
    group.be_subtransactions !== null ||
    !isNewOrdinaryTransaction(transactionRow, null) ||
    snapshot.entities.some((entity) => entity.entityId === transactionRow.id) ||
    !liveEntity(
      snapshot,
      "be_accounts",
      String(transactionRow.entities_account_id),
    )
  ) {
    return null;
  }

  const transaction = transactionEntity(snapshot, transactionRow);
  const augmented = {
    ...snapshot,
    entities: [...snapshot.entities, transaction],
  };
  return {
    mutationDomain: "transaction",
    mutation: {
      kind: "create",
      transaction: canonicalTransaction(snapshot.budgetId, transaction),
    },
    changes: [transaction],
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      ...calculationDelta(snapshot, augmented),
      be_transactions: [projectStockRequestEntity(transaction)],
    },
    expectedDeviceAdvance: 1,
    serverKnowledgeAdvance: 1,
  };
}

function parseCreateWithPayee(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  if (!hasExactKeys(changedEntities, ["be_payees", "be_transaction_groups"])) {
    return null;
  }
  const payeeRow = exactlyOneRecord(changedEntities.be_payees);
  const group = exactlyOneRecord(changedEntities.be_transaction_groups);
  const transactionRow =
    group && isRecord(group.be_transaction) ? group.be_transaction : null;
  if (
    !payeeRow ||
    !group ||
    !transactionRow ||
    group.id !== transactionRow.id ||
    group.be_subtransactions !== null ||
    !isNewOrdinaryPayee(payeeRow, transactionRow.entities_subcategory_id) ||
    !isNewOrdinaryTransaction(
      transactionRow,
      String(payeeRow.id),
      transactionRow.entities_subcategory_id,
    ) ||
    snapshot.entities.some((entity) =>
      [payeeRow.id, transactionRow.id].includes(entity.entityId),
    ) ||
    !liveEntity(
      snapshot,
      "be_accounts",
      String(transactionRow.entities_account_id),
    ) ||
    !isLiveOptionalCategory(snapshot, transactionRow.entities_subcategory_id)
  ) {
    return null;
  }

  const payee = payeeEntity(snapshot, payeeRow);
  const transaction = transactionEntity(snapshot, transactionRow);
  const augmented = {
    ...snapshot,
    entities: [...snapshot.entities, payee, transaction],
  };
  const empty = buildStockBudgetEmptyDelta(snapshot);
  return {
    mutationDomain: "transaction",
    mutation: {
      kind: "create-with-payee",
      payee: {
        id: payee.entityId,
        budgetId: snapshot.budgetId,
        name: requireString(payee.payload.name),
        isEnabled: requireBoolean(payee.payload.enabled),
        autoFillCategoryId: optionalString(payee.payload.autoFillSubCategoryId),
        autoFillUserDefinedCategoryId: optionalString(
          payee.payload.autoFillUserDefinedSubcategoryId,
        ),
        autoFillMemo: optionalString(payee.payload.autoFillMemo),
        autoFillAmount: requireInteger(payee.payload.autoFillAmount),
        autoFillCategoryEnabled: requireBoolean(
          payee.payload.autoFillSubCategoryEnabled,
        ),
        autoFillMemoEnabled: requireBoolean(payee.payload.autoFillMemoEnabled),
        autoFillAmountEnabled: requireBoolean(
          payee.payload.autoFillAmountEnabled,
        ),
        renameOnImportEnabled: requireBoolean(
          payee.payload.renameOnImportEnabled,
        ),
        internalName: optionalString(payee.payload.internalName),
      },
      transaction: canonicalTransaction(snapshot.budgetId, transaction),
    },
    changes: [payee, transaction],
    changedEntities: {
      ...empty,
      ...calculationDelta(snapshot, augmented),
      be_transactions: [projectStockRequestEntity(transaction)],
    },
    expectedDeviceAdvance:
      transactionRow.entities_subcategory_id === null ? 2 : 3,
    serverKnowledgeAdvance: 2,
  };
}

function parseTransactionEdit(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  if (!hasExactKeys(changedEntities, ["be_transaction_groups"])) return null;
  const group = exactlyOneRecord(changedEntities.be_transaction_groups);
  const row =
    group && isRecord(group.be_transaction) ? group.be_transaction : null;
  if (
    !group ||
    !row ||
    group.id !== row.id ||
    group.be_subtransactions !== null ||
    typeof row.id !== "string"
  ) {
    return null;
  }
  const current = liveEntity(snapshot, "be_transactions", row.id);
  if (!current || !isCanonicalOrdinaryEntity(current)) return null;
  const expected = projectStockRequestEntity(current);
  const changed = changedKeys(expected, row).sort();
  if (
    !(
      isDeepStrictEqual(changed, ["amount"]) ||
      isDeepStrictEqual(changed, ["amount", "memo"])
    ) ||
    row.cash_amount !== expected.amount ||
    !Number.isSafeInteger(row.amount) ||
    row.amount === 0 ||
    (row.memo !== null && typeof row.memo !== "string") ||
    !isDeepStrictEqual(row, {
      ...expected,
      amount: row.amount,
      cash_amount: expected.amount,
      memo: row.memo,
    })
  ) {
    return null;
  }
  const edited = transactionEntity(snapshot, row);
  const augmented = {
    ...snapshot,
    entities: snapshot.entities.map((entity) =>
      entity === current ? edited : entity,
    ),
  };
  return {
    mutationDomain: "transaction",
    mutation: {
      kind: "edit",
      expected: canonicalTransaction(snapshot.budgetId, current),
      transaction: canonicalTransaction(snapshot.budgetId, edited),
    },
    changes: [edited],
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      ...calculationDelta(snapshot, augmented),
      be_transactions: [projectStockRequestEntity(edited)],
    },
    expectedDeviceAdvance: changed.length,
    serverKnowledgeAdvance: 2,
  };
}

function parseTransactionDelete(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  if (!hasExactKeys(changedEntities, ["be_transaction_groups"])) return null;
  const group = exactlyOneRecord(changedEntities.be_transaction_groups);
  const row =
    group && isRecord(group.be_transaction) ? group.be_transaction : null;
  if (
    !group ||
    !row ||
    group.id !== row.id ||
    group.be_subtransactions !== null ||
    typeof row.id !== "string"
  ) {
    return null;
  }
  const current = liveEntity(snapshot, "be_transactions", row.id);
  if (
    !current ||
    !isCanonicalOrdinaryEntity(current) ||
    !isDeepStrictEqual(row, {
      ...projectStockRequestEntity(current),
      is_tombstone: true,
    })
  ) {
    return null;
  }
  const tombstone = { ...current, isTombstone: true };
  const augmented = {
    ...snapshot,
    entities: snapshot.entities.map((entity) =>
      entity === current ? tombstone : entity,
    ),
  };
  return {
    mutationDomain: "transaction",
    mutation: {
      kind: "delete",
      budgetId: snapshot.budgetId,
      transactionId: current.entityId,
    },
    changes: [tombstone],
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      ...calculationDelta(snapshot, augmented),
    },
    expectedDeviceAdvance: 1,
    serverKnowledgeAdvance: 2,
  };
}

function parsePayeeMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  if (!hasExactKeys(changedEntities, ["be_payees"])) return null;
  const row = exactlyOneRecord(changedEntities.be_payees);
  if (!row || typeof row.id !== "string" || !hasExactKeys(row, PAYEE_KEYS)) {
    return null;
  }
  const current = liveEntity(snapshot, "be_payees", row.id);
  if (!current || current.payload.accountId !== null) return null;
  const expected = projectStockRequestEntity(current);
  if (row.is_tombstone === true) {
    if (
      !isDeepStrictEqual(row, { ...expected, is_tombstone: true }) ||
      snapshot.entities.some(
        (entity) =>
          entity.entityKind === "be_transactions" &&
          !entity.isTombstone &&
          entity.payload.payeeId === current.entityId,
      )
    ) {
      return null;
    }
    return {
      mutationDomain: "payee",
      mutation: {
        kind: "delete",
        budgetId: snapshot.budgetId,
        payeeId: current.entityId,
      },
      changes: [{ ...current, isTombstone: true }],
      changedEntities: buildStockBudgetEmptyDelta(snapshot),
      expectedDeviceAdvance: 1,
      serverKnowledgeAdvance: 1,
    };
  }
  const changed = changedKeys(expected, row);
  if (
    changed.length !== 1 ||
    changed[0] !== "name" ||
    typeof row.name !== "string" ||
    !row.name.trim()
  ) {
    return null;
  }
  return {
    mutationDomain: "payee",
    mutation: {
      kind: "rename",
      budgetId: snapshot.budgetId,
      payeeId: current.entityId,
      expectedName: requireString(current.payload.name),
      name: row.name.trim(),
    },
    changes: [
      { ...current, payload: { ...current.payload, name: row.name.trim() } },
    ],
    changedEntities: buildStockBudgetEmptyDelta(snapshot),
    expectedDeviceAdvance: 1,
    serverKnowledgeAdvance: 1,
  };
}

function parseReferencedPayeeDelete(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockOrdinaryMutation | null {
  if (!hasExactKeys(changedEntities, ["be_payees", "be_transaction_groups"])) {
    return null;
  }
  const payeeRow = exactlyOneRecord(changedEntities.be_payees);
  const group = exactlyOneRecord(changedEntities.be_transaction_groups);
  const transactionRow =
    group && isRecord(group.be_transaction) ? group.be_transaction : null;
  if (
    !payeeRow ||
    !group ||
    !transactionRow ||
    !hasExactKeys(payeeRow, PAYEE_KEYS) ||
    !hasExactKeys(transactionRow, TRANSACTION_KEYS) ||
    group.id !== transactionRow.id ||
    group.be_subtransactions !== null ||
    typeof payeeRow.id !== "string" ||
    typeof transactionRow.id !== "string"
  ) {
    return null;
  }

  const currentPayee = liveEntity(snapshot, "be_payees", payeeRow.id);
  const currentTransaction = liveEntity(
    snapshot,
    "be_transactions",
    transactionRow.id,
  );
  if (
    !currentPayee ||
    currentPayee.payload.accountId !== null ||
    !currentTransaction ||
    !isCanonicalOrdinaryEntity(currentTransaction) ||
    currentTransaction.payload.payeeId !== currentPayee.entityId ||
    !isDeepStrictEqual(payeeRow, {
      ...projectStockRequestEntity(currentPayee),
      is_tombstone: true,
    }) ||
    !isDeepStrictEqual(transactionRow, {
      ...projectStockRequestEntity(currentTransaction),
      entities_payee_id: null,
    }) ||
    snapshot.entities.filter(
      (entity) =>
        entity.entityKind === "be_transactions" &&
        !entity.isTombstone &&
        entity.payload.payeeId === currentPayee.entityId,
    ).length !== 1
  ) {
    return null;
  }

  const transaction = {
    ...currentTransaction,
    payload: { ...currentTransaction.payload, payeeId: null },
  };
  return {
    mutationDomain: "payee",
    mutation: {
      kind: "delete-and-clear-transaction-payee",
      budgetId: snapshot.budgetId,
      payeeId: currentPayee.entityId,
      expectedTransaction: canonicalTransaction(
        snapshot.budgetId,
        currentTransaction,
      ),
      transaction: canonicalTransaction(snapshot.budgetId, transaction),
    },
    changes: [{ ...currentPayee, isTombstone: true }, transaction],
    changedEntities: buildStockBudgetEmptyDelta(snapshot),
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 1,
  };
}

function payeeEntity(
  snapshot: BudgetSnapshot,
  row: Readonly<Record<string, unknown>>,
): BudgetEntity {
  return {
    entityKind: "be_payees",
    entityId: String(row.id),
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: null,
      enabled: row.enabled,
      autoFillSubCategoryId: row.auto_fill_subcategory_id,
      autoFillUserDefinedSubcategoryId:
        row.auto_fill_user_defined_subcategory_id,
      autoFillMemo: row.auto_fill_memo,
      autoFillAmount: row.auto_fill_amount,
      autoFillSubCategoryEnabled: row.auto_fill_subcategory_enabled,
      autoFillMemoEnabled: row.auto_fill_memo_enabled,
      autoFillAmountEnabled: row.auto_fill_amount_enabled,
      renameOnImportEnabled: row.rename_on_import_enabled,
      name: String(row.name).trim(),
      internalName: row.internal_name,
      deviceKnowledge: null,
    },
  };
}

function transactionEntity(
  snapshot: BudgetSnapshot,
  row: Readonly<Record<string, unknown>>,
): BudgetEntity {
  const amounts = normalizeCapturedCheckingTransactionAmounts(row.amount);
  return {
    entityKind: "be_transactions",
    entityId: String(row.id),
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: row.entities_account_id,
      payeeId: row.entities_payee_id,
      subCategoryId: row.entities_subcategory_id,
      scheduledTransactionId: null,
      date: row.date,
      dateEnteredFromSchedule: null,
      ...amounts,
      memo: row.memo,
      cleared: row.cleared,
      accepted: row.accepted,
      checkNumber: row.check_number,
      flag: row.flag,
      transferAccountId: null,
      transferTransactionId: null,
      transferSubtransactionId: null,
      matchedTransactionId: null,
      ynabId: null,
      importedPayee: null,
      importedDate: null,
      originalImportedPayee: null,
      providerCleansedPayee: null,
      source: null,
      debtTransactionType: null,
    },
  };
}

function canonicalTransaction(budgetId: string, entity: BudgetEntity) {
  return {
    id: entity.entityId,
    budgetId,
    accountId: requireString(entity.payload.accountId),
    payeeId: optionalString(entity.payload.payeeId),
    categoryId: optionalString(entity.payload.subCategoryId),
    date: requireDate(entity.payload.date),
    amount: requireInteger(entity.payload.amount),
    memo: optionalString(entity.payload.memo),
    cleared: requireCleared(entity.payload.cleared),
    accepted: requireBoolean(entity.payload.accepted),
    checkNumber: optionalString(entity.payload.checkNumber),
    flag: optionalString(entity.payload.flag),
  };
}

function isNewOrdinaryPayee(
  row: Readonly<Record<string, unknown>>,
  categoryId: unknown,
): boolean {
  return (
    hasExactKeys(row, PAYEE_KEYS) &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    row.is_tombstone === false &&
    row.entities_account_id === null &&
    row.enabled === true &&
    row.auto_fill_subcategory_id === categoryId &&
    row.auto_fill_user_defined_subcategory_id === null &&
    row.auto_fill_memo === null &&
    row.auto_fill_amount === 0 &&
    row.auto_fill_subcategory_enabled === true &&
    row.auto_fill_memo_enabled === false &&
    row.auto_fill_amount_enabled === false &&
    row.rename_on_import_enabled === true &&
    typeof row.name === "string" &&
    row.name.trim().length > 0 &&
    row.internal_name === null
  );
}

function isNewOrdinaryTransaction(
  row: Readonly<Record<string, unknown>>,
  payeeId: string | null,
  categoryId: unknown = null,
): boolean {
  return (
    hasExactKeys(row, TRANSACTION_KEYS) &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    row.is_tombstone === false &&
    typeof row.entities_account_id === "string" &&
    row.entities_payee_id === payeeId &&
    row.entities_subcategory_id === categoryId &&
    row.entities_scheduled_transaction_id === null &&
    requireDateOrNull(row.date) !== null &&
    row.date_entered_from_schedule === null &&
    Number.isSafeInteger(row.amount) &&
    row.amount !== 0 &&
    row.cash_amount === 0 &&
    row.credit_amount === 0 &&
    row.credit_amount_adjusted === 0 &&
    row.subcategory_credit_amount_preceding === 0 &&
    (row.memo === null || typeof row.memo === "string") &&
    ["Uncleared", "Cleared", "Reconciled"].includes(String(row.cleared)) &&
    row.accepted === true &&
    nullableString(row.check_number) &&
    nullableString(row.flag) &&
    row.transfer_account_id === null &&
    row.transfer_transaction_id === null &&
    row.transfer_subtransaction_id === null &&
    row.matched_transaction_id === null &&
    row.ynab_id === null &&
    row.imported_payee === null &&
    row.imported_date === null &&
    row.original_imported_payee === null &&
    row.provider_cleansed_payee === null &&
    row.source === null &&
    row.debt_transaction_type === null
  );
}

function isLiveOptionalCategory(
  snapshot: BudgetSnapshot,
  categoryId: unknown,
): boolean {
  return (
    categoryId === null ||
    (typeof categoryId === "string" &&
      Boolean(liveEntity(snapshot, "be_subcategories", categoryId)))
  );
}

function isCanonicalOrdinaryEntity(entity: BudgetEntity): boolean {
  return (
    entity.entityKind === "be_transactions" &&
    entity.payload.scheduledTransactionId === null &&
    entity.payload.transferAccountId === null &&
    entity.payload.transferTransactionId === null &&
    entity.payload.transferSubtransactionId === null
  );
}

function calculationDelta(before: BudgetSnapshot, after: BudgetSnapshot) {
  const left = projectStockBudgetCalculations(before);
  const right = projectStockBudgetCalculations(after);
  return Object.fromEntries(
    Object.keys(right).map((key) => {
      const previous = left[key as keyof typeof left];
      const current = right[key as keyof typeof right];
      return [key, isDeepStrictEqual(previous, current) ? [] : current];
    }),
  );
}

function liveEntity(snapshot: BudgetSnapshot, kind: string, id: string) {
  return snapshot.entities.find(
    (entity) =>
      entity.entityKind === kind &&
      entity.entityId === id &&
      !entity.isTombstone,
  );
}

function exactlyOneRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length === 1 && isRecord(value[0])
    ? value[0]
    : null;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function changedKeys(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].filter((key) => !isDeepStrictEqual(left[key], right[key]));
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Expected string");
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return requireString(value);
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw new Error("Expected safe integer");
  return Number(value);
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected boolean");
  return value;
}

function requireDate(value: unknown): string {
  const result = requireDateOrNull(value);
  if (!result) throw new Error("Expected ISO date");
  return result;
}

function requireDateOrNull(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? value
    : null;
}

function requireCleared(
  value: unknown,
): "Uncleared" | "Cleared" | "Reconciled" {
  if (value === "Uncleared" || value === "Cleared" || value === "Reconciled") {
    return value;
  }
  throw new Error("Expected cleared state");
}
