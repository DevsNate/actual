import {
  normalizeCapturedCheckingSubtransactionAmounts,
  normalizeCapturedCheckingTransactionAmounts,
  normalizeCapturedReciprocalTransferAmounts,
} from './stock-transaction-normalization';

describe('captured stock transaction normalization boundary', () => {
  test('normalizes admitted checking ordinary and split amounts to signed cash', () => {
    expect(normalizeCapturedCheckingTransactionAmounts(-1000)).toEqual({
      amount: -1000,
      cashAmount: -1000,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
    });
    expect(normalizeCapturedCheckingSubtransactionAmounts(500)).toEqual({
      amount: 500,
      cashAmount: 500,
      creditAmount: 0,
    });
  });

  test('normalizes captured reciprocal legs by account type', () => {
    expect(
      normalizeCapturedReciprocalTransferAmounts(-12340, 'Checking'),
    ).toEqual({
      amount: -12340,
      cashAmount: -12340,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
    });
    expect(
      normalizeCapturedReciprocalTransferAmounts(12340, 'CreditCard'),
    ).toEqual({
      amount: 12340,
      cashAmount: 0,
      creditAmount: 12340,
      creditAmountAdjusted: 12340,
      subcategoryCreditAmountPreceding: 0,
    });
  });

  test('fails closed outside the admitted integer amount shapes', () => {
    expect(() => normalizeCapturedCheckingTransactionAmounts(0)).toThrow();
    expect(() =>
      normalizeCapturedReciprocalTransferAmounts(1.5, 'Checking'),
    ).toThrow();
    expect(() =>
      normalizeCapturedReciprocalTransferAmounts(1000, 'Loan'),
    ).toThrow('Captured transfer account type is unsupported');
    expect(() =>
      normalizeCapturedCheckingSubtransactionAmounts('1000'),
    ).toThrow();
  });
});
