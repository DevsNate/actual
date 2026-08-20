import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';

export function projectStockUser(
  principal: AuthenticatedPrincipal,
  now = new Date(),
) {
  const timestamp = now.toISOString();
  return {
    id: principal.id,
    email: principal.loginName,
    first_name: principal.displayName,
    username: null,
    family_id: principal.id,
    family_role: 'plan_manager',
    annual_subscription_price: 0,
    created_at: timestamp,
    initial_budget_template: '',
    initial_intention: '',
    is_referral_program_available: false,
    is_subscribed: true,
    is_tombstone: false,
    required_privacy_policy_version: '4-26',
    self_reported_source: null,
    sign_in_count: 1,
    trial_days_remaining: 0,
    trial_expires_on: timestamp,
  };
}

export function projectStockPrivacyAgreement(
  principal: AuthenticatedPrincipal,
  acceptedAt = new Date(0),
) {
  const timestamp = acceptedAt.toISOString();
  return {
    id: `privacy-agreement:${principal.id}:4-26`,
    version: '4-26',
    source: 'signup',
    client_agreed_at: timestamp,
    server_received_at: timestamp,
  };
}
