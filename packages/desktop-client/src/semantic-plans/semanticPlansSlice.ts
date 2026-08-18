import type {
  SemanticCatalogSnapshot,
  SemanticPlanSnapshot,
} from '@actual-app/core/server/semantic-plans/types';
import { createSlice } from '@reduxjs/toolkit';

import { createAppAsyncThunk } from '#redux';
import { signOut } from '#users/usersSlice';

import {
  createSemanticPlan as createPlan,
  deleteSemanticPlan as deletePlan,
  readSemanticCatalog,
  readSemanticPlan,
  renameSemanticPlan as renamePlan,
} from './api';

const sliceName = 'semanticPlans';

export const loadSemanticCatalog = createAppAsyncThunk(
  `${sliceName}/loadCatalog`,
  () => readSemanticCatalog(),
);

export const loadSemanticPlan = createAppAsyncThunk(
  `${sliceName}/loadPlan`,
  ({ planId }: { planId: string }) => readSemanticPlan(planId),
);

export const createSemanticPlan = createAppAsyncThunk(
  `${sliceName}/createPlan`,
  async ({
    name,
    formats,
  }: {
    name: string;
    formats: Parameters<typeof createPlan>[1];
  }) => {
    const result = await createPlan(name, formats);
    return { result, catalog: await readSemanticCatalog() };
  },
);

export const renameSemanticPlan = createAppAsyncThunk(
  `${sliceName}/renamePlan`,
  async ({ planId, name }: { planId: string; name: string }) => {
    const result = await renamePlan(planId, name);
    return { result, catalog: await readSemanticCatalog() };
  },
);

export const deleteSemanticPlan = createAppAsyncThunk(
  `${sliceName}/deletePlan`,
  async ({ planId }: { planId: string }) => {
    const result = await deletePlan(planId);
    return { result, catalog: await readSemanticCatalog() };
  },
);

type SemanticPlansState = {
  catalog: SemanticCatalogSnapshot | null;
  plans: Record<string, SemanticPlanSnapshot>;
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
};

const initialState: SemanticPlansState = {
  catalog: null,
  plans: {},
  catalogStatus: 'idle',
};

const semanticPlansSlice = createSlice({
  name: sliceName,
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(loadSemanticCatalog.pending, state => {
        state.catalogStatus = 'loading';
      })
      .addCase(loadSemanticCatalog.fulfilled, (state, action) => {
        state.catalog = action.payload;
        state.catalogStatus = 'ready';
      })
      .addCase(loadSemanticCatalog.rejected, state => {
        state.catalogStatus = 'error';
      })
      .addCase(loadSemanticPlan.fulfilled, (state, action) => {
        state.plans[action.payload.planId] = action.payload;
      })
      .addCase(createSemanticPlan.fulfilled, (state, action) => {
        state.catalog = action.payload.catalog;
        state.catalogStatus = 'ready';
      })
      .addCase(renameSemanticPlan.fulfilled, (state, action) => {
        state.catalog = action.payload.catalog;
        const snapshot = state.plans[action.payload.result.budget_id];
        if (snapshot && action.payload.result.name) {
          snapshot.name = action.payload.result.name;
        }
      })
      .addCase(deleteSemanticPlan.fulfilled, (state, action) => {
        state.catalog = action.payload.catalog;
        delete state.plans[action.payload.result.budget_id];
      })
      .addCase(signOut.fulfilled, () => initialState);
  },
});

export const { name, reducer, getInitialState } = semanticPlansSlice;

export const actions = {
  loadSemanticCatalog,
  loadSemanticPlan,
  createSemanticPlan,
  renameSemanticPlan,
  deleteSemanticPlan,
};
