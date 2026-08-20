import { action } from '@ember/object';
import RouterService from '@ember/routing/router-service';
import { service } from '@ember/service';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

import type SessionService from '../services/session';

export default class LoginTemplate extends Component {
  @service declare router: RouterService;
  @service declare session: SessionService;

  @tracked password = '';
  @tracked errorMessage = '';
  @tracked submitting = false;

  @action
  updatePassword(event: Event): void {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) {
      this.password = input.value;
    }
  }

  @action
  async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.errorMessage = '';
    this.submitting = true;
    try {
      await this.session.signInWithPassword(this.password);
      this.password = '';
      await this.router.replaceWith('plans');
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Unable to sign in';
    } finally {
      this.submitting = false;
    }
  }

  <template>
    <form class="login-form" {{on "submit" this.submit}}>
      <h1>Sign in</h1>
      <label for="actual-password">Password</label>
      <input
        id="actual-password"
        type="password"
        autocomplete="current-password"
        value={{this.password}}
        {{on "input" this.updatePassword}}
      />
      {{#if this.errorMessage}}
        <p class="form-error" role="alert">{{this.errorMessage}}</p>
      {{/if}}
      <button type="submit" disabled={{this.submitting}}>
        {{if this.submitting "Signing in…" "Sign in"}}
      </button>
    </form>
  </template>
}
