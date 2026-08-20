import type {
  SemanticCatalogSnapshot,
  SemanticBudgetSnapshot,
} from '@actual-app/core/server/semantic-budgets/types';
import { createSlice } from '@reduxjs/toolkit';

import { createAppAsyncThunk } from '#redux';
import { signOut } from '#users/usersSlice';

import {
  createSemanticBudget as createBudget,
  deleteSemanticBudget as deleteBudget,
  readSemanticCatalog,
  readSemanticBudget,
  renameSemanticBudget as renameBudget,
} from './api';

const sliceName = 'semanticBudgets';

export const loadSemanticCatalog = createAppAsyncThunk(
  `${sliceName}/loadCatalog`,
  () => readSemanticCatalog(),
);

export const loadSemanticBudget = createAppAsyncThunk(
  `${sliceName}/loadBudget`,
  ({ budgetId }: { budgetId: string }) => readSemanticBudget(budgetId),
);

export const createSemanticBudget = createAppAsyncThunk(
  `${sliceName}/createBudget`,
  async ({
    name,
    formats,
  }: {
    name: string;
    formats: Parameters<typeof createBudget>[1];
  }) => {
    const result = await createBudget(name, formats);
    return { result, catalog: await readSemanticCatalog() };
  },
);

export const renameSemanticBudget = createAppAsyncThunk(
  `${sliceName}/renameBudget`,
  async ({ budgetId, name }: { budgetId: string; name: string }) => {
    const result = await renameBudget(budgetId, name);
    return { result, catalog: await readSemanticCatalog() };
  },
);

export const deleteSemanticBudget = createAppAsyncThunk(
  `${sliceName}/deleteBudget`,
  async ({ budgetId }: { budgetId: string }) => {
    const result = await deleteBudget(budgetId);
    return { result, catalog: await readSemanticCatalog() };
  },
);

type SemanticBudgetsState = {
  catalog: SemanticCatalogSnapshot | null;
  budgets: Record<string, SemanticBudgetSnapshot>;
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
};

const initialState: SemanticBudgetsState = {
  catalog: null,
  budgets: {},
  catalogStatus: 'idle',
};

const semanticBudgetsSlice = createSlice({
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
      .addCase(loadSemanticBudget.fulfilled, (state, action) => {
        state.budgets[action.payload.budgetId] = action.payload;
      })
      .addCase(createSemanticBudget.fulfilled, (state, action) => {
        state.catalog = action.payload.catalog;
        state.catalogStatus = 'ready';
      })
      .addCase(renameSemanticBudget.fulfilled, (state, action) => {
        state.catalog = action.payload.catalog;
        const snapshot = state.budgets[action.payload.result.budget_id];
        if (snapshot && action.payload.result.name) {
          snapshot.name = action.payload.result.name;
        }
      })
      .addCase(deleteSemanticBudget.fulfilled, (state, action) => {
        state.catalog = action.payload.catalog;
        delete state.budgets[action.payload.result.budget_id];
      })
      .addCase(signOut.fulfilled, () => initialState);
  },
});

export const { name, reducer, getInitialState } = semanticBudgetsSlice;

export const actions = {
  loadSemanticCatalog,
  loadSemanticBudget,
  createSemanticBudget,
  renameSemanticBudget,
  deleteSemanticBudget,
};
