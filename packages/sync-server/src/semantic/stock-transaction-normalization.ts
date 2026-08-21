/**
 * Project-owned compatibility boundary for transaction amount normalization
 * observed in the stock captures. These functions deliberately cover only the
 * admitted checking ordinary/split and reciprocal-transfer cases. They are not
 * a general account-type calculation model.
 */

type CapturedTransactionAmounts = {
  amount: number;
  cashAmount: number;
  creditAmount: number;
  creditAmountAdjusted: number;
  subcategoryCreditAmountPreceding: 0;
};

type CapturedSubtransactionAmounts = {
  amount: number;
  cashAmount: number;
  creditAmount: 0;
};

export function normalizeCapturedCheckingTransactionAmounts(
  amount: unknown,
): CapturedTransactionAmounts {
  const signedAmount = requireNonzeroSafeInteger(amount);
  return {
    amount: signedAmount,
    cashAmount: signedAmount,
    creditAmount: 0,
    creditAmountAdjusted: 0,
    subcategoryCreditAmountPreceding: 0,
  };
}

export function normalizeCapturedCheckingSubtransactionAmounts(
  amount: unknown,
): CapturedSubtransactionAmounts {
  const signedAmount = requireSafeInteger(amount);
  return {
    amount: signedAmount,
    cashAmount: signedAmount,
    creditAmount: 0,
  };
}

export function normalizeCapturedReciprocalTransferAmounts(
  amount: unknown,
  accountType: unknown,
): CapturedTransactionAmounts {
  const signedAmount = requireNonzeroSafeInteger(amount);
  if (accountType === 'CreditCard') {
    return {
      amount: signedAmount,
      cashAmount: 0,
      creditAmount: signedAmount,
      creditAmountAdjusted: signedAmount,
      subcategoryCreditAmountPreceding: 0,
    };
  }
  if (accountType !== 'Cash' && accountType !== 'Checking') {
    throw new Error('Captured transfer account type is unsupported');
  }
  return {
    amount: signedAmount,
    cashAmount: signedAmount,
    creditAmount: 0,
    creditAmountAdjusted: 0,
    subcategoryCreditAmountPreceding: 0,
  };
}

function requireNonzeroSafeInteger(value: unknown): number {
  const amount = requireSafeInteger(value);
  if (amount === 0) {
    throw new Error('Captured transaction amount must be nonzero');
  }
  return amount;
}

function requireSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Captured transaction amount must be a safe integer');
  }
  return Number(value);
}
