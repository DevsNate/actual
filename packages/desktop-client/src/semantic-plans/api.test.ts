import { createSemanticPlanApi } from './api';

describe('semantic plan UI API', () => {
  const sendCommand = vi.fn().mockResolvedValue({});
  const allocateCommandId = vi.fn(() => 'command-1');
  const api = createSemanticPlanApi({ sendCommand, allocateCommandId });

  beforeEach(() => vi.clearAllMocks());

  it('keeps reads on the worker message bus', async () => {
    await api.readCatalog();
    await api.readPlan('plan/1');

    expect(sendCommand).toHaveBeenNthCalledWith(1, 'semantic-plan-catalog');
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'semantic-plan-read', {
      planId: 'plan/1',
    });
  });

  it('gives each user command one idempotency identity', async () => {
    const formats = {
      currencyFormat: { isoCode: 'USD' },
      dateFormat: { format: 'MM/dd/yyyy' },
    };
    await api.createPlan('Plan', formats);
    await api.renamePlan('plan-1', 'Renamed');
    await api.deletePlan('plan-1');

    expect(allocateCommandId).toHaveBeenCalledTimes(3);
    expect(sendCommand).toHaveBeenNthCalledWith(1, 'semantic-plan-create', {
      name: 'Plan',
      formats,
      idempotencyKey: 'command-1',
    });
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'semantic-plan-rename', {
      planId: 'plan-1',
      name: 'Renamed',
      idempotencyKey: 'command-1',
    });
    expect(sendCommand).toHaveBeenNthCalledWith(3, 'semantic-plan-delete', {
      planId: 'plan-1',
      idempotencyKey: 'command-1',
    });
  });
});
