import { v4 as uuidv4 } from 'uuid';

import * as asyncStorage from '#platform/server/asyncStorage';

export async function getSemanticDeviceId(): Promise<string> {
  const existing = await asyncStorage.getItem('semantic-device-id');
  if (existing) {
    return existing;
  }
  const created = uuidv4();
  await asyncStorage.setItem('semantic-device-id', created);
  return created;
}
