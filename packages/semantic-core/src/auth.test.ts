import { AuthenticationError } from './auth';

describe('AuthenticationError', () => {
  it('retains a stable machine-readable code', () => {
    const error = new AuthenticationError(
      'invalid-session',
      'The session is invalid',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AuthenticationError');
    expect(error.code).toBe('invalid-session');
  });
});
