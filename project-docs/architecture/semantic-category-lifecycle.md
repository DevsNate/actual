# Canonical category lifecycle

The CATEGORY-001 evidence admits one narrow category lifecycle: create an
untargeted ordinary category, rename it, move it between existing groups, hide,
unhide, and delete it while unused. The server also owns the derived next-month
row and monthly-category calculations.

## Boundary

`stock-category-lifecycle.ts` validates complete schema-44 source rows and
converts them into one typed `CanonicalCategoryMutation`. Protocol relationship
aliases are normalized only at this adapter boundary. Canonical storage never
uses `be_*` names.

The PostgreSQL model separates:

- category-group references;
- category definitions; and
- per-month category budgeting facts.

The compatibility projection and exact replay receipt commit in the same
transaction as those canonical rows. Category creation advances device
knowledge by two source rows even though the server persists a third,
server-derived next-month row. Move advances device knowledge by two according
to the capture while changing one category definition. Neither case infers the
client cursor from the number of persisted projection rows.

## Fail-closed limits

- Only ordinary `DFT` categories with empty target fields are admitted.
- Creation requires one known live group and the current and next budget month.
- Update permits only captured name, group/sort, and hidden-state changes.
- Deletion requires exactly two live monthly rows and no live transaction,
  split, or schedule reference.
- Targets, assignments, group lifecycle, and deletion of referenced categories
  remain separate slices.

Ordinary payee creation is intentionally not implemented here. PAYEE-001 proves
that the tested UI creates a new ordinary payee atomically with an ordinary
transaction, so that command belongs to the ordinary-transaction aggregate.
