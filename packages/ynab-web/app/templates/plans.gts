import { LinkTo } from '@ember/routing';
import Component from '@glimmer/component';
import type { CatalogSnapshot } from '@actual-app/semantic-core';

type PlansSignature = {
  Args: {
    model: CatalogSnapshot;
  };
};

export default class PlansTemplate extends Component<PlansSignature> {
  <template>
    <header class="plan-header">
      <h1>Open Plan</h1>
    </header>
    <section aria-labelledby="plan-list-heading" class="plan-list">
      <h2 id="plan-list-heading">Your Plans</h2>
      <ul>
        {{#each @model.memberships as |membership|}}
          {{#unless membership.isTombstone}}
            <li>
              <LinkTo @route="plan" @model={{membership.planId}}>
                {{membership.name}}
              </LinkTo>
            </li>
          {{/unless}}
        {{/each}}
      </ul>
    </section>
  </template>
}
