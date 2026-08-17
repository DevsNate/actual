export type PrincipalId = string;

export type AuthenticatedPrincipal = {
  id: PrincipalId;
  loginName: string;
  displayName: string;
  role: string;
};

export type AuthenticationErrorCode =
  | 'invalid-session'
  | 'expired-session'
  | 'invalid-principal';

export class AuthenticationError extends Error {
  readonly code: AuthenticationErrorCode;

  constructor(code: AuthenticationErrorCode, message: string) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}
