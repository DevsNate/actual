import { fetch } from '#platform/server/fetch';
import { PostError } from '#server/errors';

type SemanticEnvelope<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; reason: string };

type SemanticRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
};

export type SemanticRequest = <T>(
  path: string,
  options?: SemanticRequestOptions,
) => Promise<T>;

export function createSemanticRequest({
  baseUrl,
  token,
  deviceId,
}: {
  baseUrl: string;
  token: string;
  deviceId: string;
}): SemanticRequest {
  return async <T>(path: string, options: SemanticRequestOptions = {}) => {
    let response: Response;
    try {
      response = await fetch(new URL(path, semanticBaseUrl(baseUrl)), {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Actual-Token': token,
          'X-Semantic-Device-Id': deviceId,
          ...(options.idempotencyKey
            ? { 'Idempotency-Key': options.idempotencyKey }
            : {}),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new PostError('network-failure', undefined, { cause: error });
    }

    const text = await response.text();
    const envelope = parseEnvelope<T>(text);
    if (!response.ok || envelope.status === 'error') {
      throw new PostError(
        envelope.status === 'error'
          ? envelope.reason
          : `semantic-http-${response.status}`,
      );
    }
    return envelope.data;
  };
}

function semanticBaseUrl(baseUrl: string) {
  return new URL('/semantic/v1/', baseUrl);
}

function parseEnvelope<T>(text: string): SemanticEnvelope<T> {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      'status' in value &&
      (value.status === 'ok' || value.status === 'error')
    ) {
      return value as SemanticEnvelope<T>;
    }
  } catch {
    // Converted to a stable boundary error below.
  }
  throw new PostError('parse-json', { meta: text });
}
