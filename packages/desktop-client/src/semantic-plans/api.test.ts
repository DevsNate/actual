import { send } from '@actual-app/core/platform/client/connection';
import { v4 as uuidv4 } from 'uuid';

import {
  createSemanticPlan,
  deleteSemanticPlan,
  readSemanticCatalog,
  readSemanticPlan,
  renameSemanticPlan,
} from './api';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'command-1') }));

describe('semantic plan UI API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(send).mockResolvedValue({});
  });

  it('keeps reads on the worker message bus', async () => {
    await readSemanticCatalog();
    await readSemanticPlan('plan/1');

    expect(send).toHaveBeenNthCalledWith(1, 'semantic-plan-catalog');
    expect(send).toHaveBeenNthCalledWith(2, 'semantic-plan-read', {
      planId: 'plan/1',
    });
  });

  it('gives each user command one idempotency identity', async () => {
    const formats = {
      currencyFormat: { isoCode: 'USD' },
      dateFormat: { format: 'MM/dd/yyyy' },
    };
    await createSemanticPlan('Plan', formats);
    await renameSemanticPlan('plan-1', 'Renamed');
    await deleteSemanticPlan('plan-1');

    expect(uuidv4).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenNthCalledWith(1, 'semantic-plan-create', {
      name: 'Plan',
      formats,
      idempotencyKey: 'command-1',
    });
    expect(send).toHaveBeenNthCalledWith(2, 'semantic-plan-rename', {
      planId: 'plan-1',
      name: 'Renamed',
      idempotencyKey: 'command-1',
    });
    expect(send).toHaveBeenNthCalledWith(3, 'semantic-plan-delete', {
      planId: 'plan-1',
      idempotencyKey: 'command-1',
    });
  });
});
