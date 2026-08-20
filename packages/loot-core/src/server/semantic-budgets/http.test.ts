import { fetch } from '#platform/server/fetch';
import { PostError } from '#server/errors';

import { createSemanticRequest } from './http';

vi.mock('#platform/server/fetch', () => ({ fetch: vi.fn() }));

const mockedFetch = vi.mocked(fetch);

async function capturePostError(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error('Expected request to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(PostError);
    return error as PostError;
  }
}

describe('semantic budget HTTP boundary', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('sends authentication, device identity, and idempotency headers', async () => {
    mockedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'ok', data: { budget_id: 'budget-1' } }),
        { status: 201 },
      ),
    );
    const request = createSemanticRequest({
      baseUrl: 'https://budget.test/base',
      token: 'secret-token',
      deviceId: 'device-1',
    });

    await expect(
      request('budgets', {
        method: 'POST',
        body: { name: 'Plan' },
        idempotencyKey: 'command-1',
      }),
    ).resolves.toEqual({ budget_id: 'budget-1' });

    expect(mockedFetch).toHaveBeenCalledWith(
      new URL('https://budget.test/semantic/v1/budgets'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Plan' }),
        headers: expect.objectContaining({
          'X-Actual-Token': 'secret-token',
          'X-Semantic-Device-Id': 'device-1',
          'Idempotency-Key': 'command-1',
        }),
      }),
    );
  });

  it('turns a structured server rejection into a stable boundary error', async () => {
    mockedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'error', reason: 'IDEMPOTENCY_CONFLICT' }),
        { status: 409 },
      ),
    );
    const request = createSemanticRequest({
      baseUrl: 'https://budget.test',
      token: 'token',
      deviceId: 'device',
    });

    const error = await capturePostError(
      request('budgets', {
        method: 'POST',
        idempotencyKey: 'reused',
      }),
    );

    expect(error.reason).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects malformed response envelopes', async () => {
    mockedFetch.mockResolvedValue(new Response('not-json', { status: 200 }));
    const request = createSemanticRequest({
      baseUrl: 'https://budget.test',
      token: 'token',
      deviceId: 'device',
    });

    const error = await capturePostError(request('catalog'));
    expect(error.reason).toBe('parse-json');
  });
});
