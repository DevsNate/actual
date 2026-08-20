import { createSemanticBudgetApi } from './api';

describe('semantic budget UI API', () => {
  const sendCommand = vi.fn().mockResolvedValue({});
  const allocateCommandId = vi.fn(() => 'command-1');
  const api = createSemanticBudgetApi({ sendCommand, allocateCommandId });

  beforeEach(() => vi.clearAllMocks());

  it('keeps reads on the worker message bus', async () => {
    await api.readCatalog();
    await api.readBudget('budget/1');

    expect(sendCommand).toHaveBeenNthCalledWith(1, 'semantic-budget-catalog');
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'semantic-budget-read', {
      budgetId: 'budget/1',
    });
  });

  it('gives each user command one idempotency identity', async () => {
    const formats = {
      currencyFormat: { isoCode: 'USD' },
      dateFormat: { format: 'MM/dd/yyyy' },
    };
    await api.createBudget('Plan', formats);
    await api.renameBudget('budget-1', 'Renamed');
    await api.deleteBudget('budget-1');

    expect(allocateCommandId).toHaveBeenCalledTimes(3);
    expect(sendCommand).toHaveBeenNthCalledWith(1, 'semantic-budget-create', {
      name: 'Plan',
      formats,
      idempotencyKey: 'command-1',
    });
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'semantic-budget-rename', {
      budgetId: 'budget-1',
      name: 'Renamed',
      idempotencyKey: 'command-1',
    });
    expect(sendCommand).toHaveBeenNthCalledWith(3, 'semantic-budget-delete', {
      budgetId: 'budget-1',
      idempotencyKey: 'command-1',
    });
  });
});
