import * as asyncStorage from '#platform/server/asyncStorage';

import { getSemanticDeviceId } from './identity';

vi.mock('#platform/server/asyncStorage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

describe('semantic device identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses the durable identity', async () => {
    vi.mocked(asyncStorage.getItem).mockResolvedValue('existing-device');

    await expect(getSemanticDeviceId()).resolves.toBe('existing-device');
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('creates and persists an identity once when missing', async () => {
    vi.mocked(asyncStorage.getItem).mockResolvedValue(undefined);

    const deviceId = await getSemanticDeviceId();

    expect(deviceId).toBeTruthy();
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'semantic-device-id',
      deviceId,
    );
  });
});
