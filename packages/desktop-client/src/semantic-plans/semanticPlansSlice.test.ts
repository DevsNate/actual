import {
  deleteSemanticPlan,
  getInitialState,
  loadSemanticCatalog,
  loadSemanticPlan,
  reducer,
  renameSemanticPlan,
} from './semanticPlansSlice';

const catalog = {
  knowledge: { principalId: 'user-1', currentServerKnowledge: 2 },
  memberships: [
    {
      id: 'membership-1',
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Plan',
      permissions: 1,
      isTombstone: false,
    },
  ],
};

const plan = {
  planId: 'plan-1',
  budgetVersionId: 'version-1',
  name: 'Plan',
  serverKnowledge: 1,
  currencyFormat: { isoCode: 'USD' },
  dateFormat: { format: 'MM/dd/yyyy' },
  entities: [],
};

describe('semantic plans state', () => {
  it('tracks catalog loading independently from legacy budget files', () => {
    let state = reducer(
      getInitialState(),
      loadSemanticCatalog.pending('request-1', undefined),
    );
    expect(state.catalogStatus).toBe('loading');

    state = reducer(
      state,
      loadSemanticCatalog.fulfilled(catalog, 'request-1', undefined),
    );
    expect(state.catalogStatus).toBe('ready');
    expect(state.catalog).toEqual(catalog);
  });

  it('stores authorized plan snapshots by stable plan identity', () => {
    const state = reducer(
      getInitialState(),
      loadSemanticPlan.fulfilled(plan, 'request-1', { planId: 'plan-1' }),
    );

    expect(state.plans['plan-1']).toEqual(plan);
  });

  it('updates rename projection and removes deleted snapshots', () => {
    let state = reducer(
      getInitialState(),
      loadSemanticPlan.fulfilled(plan, 'request-1', { planId: 'plan-1' }),
    );
    state = reducer(
      state,
      renameSemanticPlan.fulfilled(
        {
          result: {
            budget_id: 'plan-1',
            name: 'Renamed',
            catalog_server_knowledge: 2,
            budget_server_knowledge: 2,
            replayed: false,
          },
          catalog: {
            ...catalog,
            memberships: [{ ...catalog.memberships[0], name: 'Renamed' }],
          },
        },
        'request-2',
        { planId: 'plan-1', name: 'Renamed' },
      ),
    );
    expect(state.plans['plan-1'].name).toBe('Renamed');

    state = reducer(
      state,
      deleteSemanticPlan.fulfilled(
        {
          result: {
            budget_id: 'plan-1',
            deleted: true,
            catalog_server_knowledge: 3,
            budget_server_knowledge: null,
            replayed: false,
          },
          catalog: { ...catalog, memberships: [] },
        },
        'request-3',
        { planId: 'plan-1' },
      ),
    );
    expect(state.plans['plan-1']).toBeUndefined();
  });
});
