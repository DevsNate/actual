export type SemanticStoreErrorCode =
  | 'DEVICE_KNOWLEDGE_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_OPERATION'
  | 'BUDGET_NOT_FOUND'
  | 'SERVER_KNOWLEDGE_MISMATCH';

export class SemanticStoreError extends Error {
  constructor(
    readonly code: SemanticStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SemanticStoreError';
  }
}
