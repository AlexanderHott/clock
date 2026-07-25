# Updating Array State in Zustand Without Unnecessary React Renders

Research date: 2026-07-24

Scope: current Zustand v5 behavior, with source links pinned to Zustand `v5.0.14` where implementation details matter, plus current official React documentation. This repository currently declares Zustand `^5.0.14`, React `^19.2.7`, and React Compiler `1.0.0`.

## Short Answer

Use immutable store actions and preserve every unchanged item's object reference. Subscribe the list owner to the collection or, for finer isolation, to a shallow-compared list of IDs; let each row subscribe to exactly its item. Use `useShallow` only when a selector intentionally constructs an object or array that can be shallow-equal to its prior output. It cannot suppress an append because an append changes the array's shallow contents. `createWithEqualityFn(..., shallow)` has the same fundamental limit and is usually unnecessary when atomic selectors or selective `useShallow` calls suffice.

Zustand does not prescribe arrays versus normalized `{ ids, byId }` state. Normalization is an architectural choice that makes per-ID lookup and reference preservation more explicit, not an official Zustand requirement. React Compiler can prevent cascading child renders and memoize render-time calculations, but it does not change Zustand selector equality, repair mutation, make an unstable external-store snapshot stable, or prevent a component from rendering when its selected snapshot actually changed.

## 1. Immutable Array Updates in Store Actions

### Official guidance and behavior

Zustand says state must be updated immutably. Its `set` function shallow-merges at the store's top level, but nested values such as arrays and their item objects must be replaced as needed. The array-specific API documentation explicitly recommends spread, `concat`, `filter`, `slice`, `map`, `toSpliced`, `toSorted`, and `toReversed`, and says to avoid mutating methods such as `push`, `splice`, `reverse`, and `sort` on stored arrays. [Z1] [Z2]

Use updater functions when the next array depends on the current array:

```ts
type Item = { id: string; label: string; done: boolean };

type Store = {
  items: Item[];
  append: (item: Item) => void;
  update: (id: string, patch: Partial<Item>) => void;
  remove: (id: string) => void;
};

const useItemsStore = create<Store>()((set) => ({
  items: [],
  append: (item) =>
    set((state) => ({
      items: [...state.items, item],
    })),
  update: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  remove: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
}));
```

The important detail in `update` is `: item`: unchanged entries retain their old object references. React's official array-state guide demonstrates the same pattern: create a new outer array, create a new object only for the changed entry, and return the original object for every unchanged entry. [R1]

### Architectural inference

Reference preservation is not only an immutability concern; it is the basis of granular subscriptions. If an unchanged row selects its item object and the action returns that exact object, `Object.is(previousItem, nextItem)` remains true and no store-driven row render is needed. Cloning every item on every update is immutable but defeats that optimization.

## 2. Selector Patterns for Lists and Individual Items

### Official guidance and behavior

Zustand recommends selectors for computed subscriptions. With the standard v5 `create`, selector results are snapshots passed through React's `useSyncExternalStore`; React compares snapshots with `Object.is` and renders when the selected result changes. Zustand's implementation directly uses `useSyncExternalStore`, and React requires repeated reads of an unchanged snapshot to return the same value. [Z3] [R2]

Atomic selectors are the default starting point:

```ts
const items = useItemsStore((state) => state.items);
const append = useItemsStore((state) => state.append);
```

Selecting the stored `items` array is stable while unrelated state changes, so `useShallow` adds no value in that case. An immutable append creates a new array, so the list component correctly renders to display the new row.

Inline selectors are acceptable. A Zustand maintainer clarified that, since Zustand v4 uses `useSyncExternalStore`, selectors do not need to be memoized merely because they are declared inside a component; extracting one is at most a premature micro-optimization for almost all cases. Memoization is still relevant when avoiding an expensive derived calculation, which is a different concern. [Z4]

### Architectural inference: simple list

For ordinary list sizes, start with the direct array subscription and stable item props:

```tsx
function ItemList() {
  const items = useItemsStore((state) => state.items);

  return items.map((item) => <ItemRow key={item.id} item={item} />);
}

function ItemRow({ item }: { item: Item }) {
  return <div>{item.label}</div>;
}
```

An append must render `ItemList`. Existing `ItemRow` components can avoid cascading renders when their props remain referentially equal: React Compiler normally supplies the equivalent component/JSX memoization; without the compiler, `memo(ItemRow)` is the explicit equivalent. A row's stable `key` preserves its identity during reconciliation but, by itself, does not memoize the row render. React documents these as separate mechanisms. [R3] [R4]

### Architectural inference: IDs in the parent, item in each row

When item edits are frequent or rows are expensive, move the item subscription into each row:

```tsx
import { useShallow } from "zustand/react/shallow";

function ItemList() {
  const ids = useItemsStore(useShallow((state) => state.items.map((item) => item.id)));

  return ids.map((id) => <ItemRow key={id} id={id} />);
}

function ItemRow({ id }: { id: string }) {
  const item = useItemsStore((state) => state.items.find((candidate) => candidate.id === id));

  if (!item) return null;
  return <div>{item.label}</div>;
}
```

Expected behavior when actions preserve references:

| Update                        | List owner                              | Existing unaffected row                              | Changed row                         |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| Unrelated store field         | skips                                   | skips                                                | n/a                                 |
| Edit one item, same IDs/order | skips because ID array is shallow-equal | selected object is identical, so skips               | selected object changed, so renders |
| Append item                   | renders because IDs changed             | selected object is identical; no store-driven render | new row mounts                      |
| Remove/reorder                | renders because IDs/order changed       | selected object can remain identical                 | removed row unmounts                |

There are two qualifications:

- Array lookup with `find` is O(n) whenever a row selector is evaluated. Zustand's store notifies subscribers on state replacement, after which selection/equality decides whether React needs a render; avoiding renders does not imply zero selector work. Zustand's store source shows listeners being notified after a changed root state. [Z5]
- Without React Compiler or explicit `memo`, a render of the list owner can still cascade into existing rows even when a row's own Zustand snapshot did not change. A Zustand-maintained discussion identifies parent rendering as the cause of such child renders and `memo` as the remedy. [Z6]

## 3. `useShallow`, `createWithEqualityFn`, and Appends

### Official guidance and behavior

The normal v5 store uses `Object.is`. Zustand documents `useShallow` for selectors that compute a fresh object or array whose top-level entries can nevertheless be equal to the previous result. `useShallow` runs the selector, shallow-compares its result with the prior result, and returns the prior reference when equal. [Z7] [Z8]

```ts
const ids = useItemsStore(useShallow((state) => state.items.map((item) => item.id)));
```

This prevents a render when another item field changes but the IDs and their order remain the same.

`createWithEqualityFn` is the v5 API for a store-wide default or per-call custom equality function. It lives in `zustand/traditional`, relies on `useSyncExternalStoreWithSelector`, and requires the `use-sync-external-store` package. The v5 migration guide presents selective `useShallow` as the alternative when shallow equality is the need. [Z9] [Z10]

```ts
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";

const useItemsStore = createWithEqualityFn<Store>()(creator, shallow);
```

### Why neither suppresses an append

Zustand's `shallow` implementation compares arrays as iterable entries and returns false if their sizes differ or any indexed value differs by `Object.is`. Therefore `[a, b]` and `[a, b, c]` are not shallow-equal, even though `a` and `b` retain their references. An append must produce a changed selector snapshot so the component responsible for rendering collection membership can add the new row. [Z11]

Consequences:

- `useItemsStore((state) => state.items)` renders on append by `Object.is`.
- `useItemsStore(useShallow((state) => state.items))` also renders on append because length/content changed.
- A store created with default `shallow` also renders that subscriber on append.
- `useShallow` does help a derived `ids` selector skip item-field edits where IDs/order did not change.
- `useShallow` does help a copied array selector skip unrelated store updates when every returned element is the same reference, although selecting the stored array directly is simpler.

The last five points are direct deductions from the documented APIs and linked implementation, rather than an additional official prescription.

## 4. Arrays Versus Normalized `ids` / `byId`

### Official position

Zustand describes itself as unopinionated. It does not officially prescribe either an entity array or normalized entity state. A proposal to add a normalized entity adapter was explicitly left by the maintainer to third-party-library territory rather than adopted as a Zustand pattern/API. [Z12] [Z13]

Therefore, "Zustand requires normalization for render performance" is not sourced official guidance.

### Architectural inference

Normalization makes the fine-grained pattern cheaper and more explicit:

```ts
type Store = {
  ids: string[]
  byId: Record<string, Item>
  append: (item: Item) => void
  update: (id: string, patch: Partial<Item>) => void
}

const useItemsStore = create<Store>()((set) => ({
  ids: [],
  byId: {},
  append: (item) => set((state) => ({
    ids: [...state.ids, item.id],
    byId: { ...state.byId, [item.id]: item },
  })),
  update: (id, patch) => set((state) => ({
    byId: {
      ...state.byId,
      [id]: { ...state.byId[id], ...patch },
    },
  })),
}))

function ItemList() {
  const ids = useItemsStore((state) => state.ids)
  return ids.map((id) => <ItemRow key={id} id={id} />)
}

function ItemRow({ id }: { id: string }) {
  const item = useItemsStore((state) => state.byId[id])
  return item ? <div>{item.label}</div> : null
}
```

Benefits inferred from ordinary data-structure and reference semantics:

- Item updates can leave `ids` unchanged, so the list owner skips them with plain `Object.is`; no computed ID array or `useShallow` is needed.
- Row lookup is direct rather than an O(n) `find`.
- Updating one entity can preserve every other entity object's reference.
- Ordering is explicit in `ids` rather than coupled to object storage.

Costs:

- More update code and invariants: `ids` and `byId` must remain synchronized.
- A single small list may not justify the additional structure.
- Deriving `ids.map((id) => byId[id])` creates a fresh array and reintroduces selector-stability concerns if returned directly from a v5 selector.

Pragmatic choice: use an array first when the list is small or simple; normalize when repeated per-ID reads, frequent isolated item updates, or selector cost is measurable. That recommendation is architectural inference, not a Zustand mandate.

## 5. React Compiler: Effects and Limits

### Official guidance and behavior

React Compiler performs build-time memoization. React says it primarily optimizes update performance by skipping cascading child renders and repeated expensive calculations in components/hooks. Current React documentation says new code should usually rely on the compiler rather than adding `useMemo`, `useCallback`, or `memo` by default, while retaining manual memoization when precise control is needed. [R3] [R5]

The compiler relies on React's purity and immutability rules. React explicitly says pure components/hooks and immutable props/state enable correct automatic optimization. [R6]

Zustand's maintainer says Zustand should work with React Compiler without an API or implementation change. A later maintainer note in the same official discussion warns that auto-generated selector accessors not recognized as hooks are not generally recommended with the compiler; conventional `useXxxStore(...)` hook naming/calls are safer. [Z14]

### Architectural inference about the boundary

React Compiler does not replace external-store subscription semantics:

- Zustand's selected value is a `useSyncExternalStore` snapshot.
- React specifies that a changed snapshot, compared by `Object.is`, renders the subscribing component.
- Therefore the compiler cannot correctly skip a render when that component's selected value actually changed.

What it can do is reduce work downstream of that required render. For example, after an append the list owner must see the new IDs/array, but Compiler memoization can reuse unchanged child JSX/components when their inputs are stable. The official Compiler guide specifically describes skipping cascading child renders and reusing list-card JSX. [R2] [R3]

The compiler does **not**:

- make mutable Zustand updates observable;
- change `Object.is` or `shallow` semantics;
- make a v5 selector that returns a fresh snapshot stable;
- turn an appended array into an equal array;
- replace stable React keys;
- share a memoized calculation across separate components/hooks. React explicitly notes that compiler memoization is local rather than shared. [R3]

## 6. Pitfalls

### Fresh selector outputs in Zustand v5

Zustand's v5 migration guide says selector outputs must be stable: a selector that returns a new reference can cause an infinite update loop. This matches React's rule that repeated `getSnapshot` calls must return the same value while the store is unchanged, and React's troubleshooting guidance for the "result of `getSnapshot` should be cached" error. [Z10] [R2]

Avoid a bare fresh object or array selector:

```ts
// Bad in v5: a new array for every snapshot read.
const pair = useItemsStore((state) => [state.items, state.append]);

// Good: atomic selectors.
const items = useItemsStore((state) => state.items);
const append = useItemsStore((state) => state.append);

// Good when grouping is useful.
const pair = useItemsStore(useShallow((state) => [state.items, state.append]));
```

For derived arrays:

```ts
// Stable when the returned IDs are shallow-equal.
const ids = useItemsStore(useShallow((state) => state.items.map((item) => item.id)));
```

`useShallow` only compares one level. Nesting a newly created derived array inside another result still changes that nested element's reference:

```ts
// Still unstable at the outer shallow-comparison level.
useItemsStore(useShallow((state) => [state.status, state.items.map((item) => item.id)]));
```

A Zustand maintainer explains this exact failure mode: `.map` creates a new array; shallow-comparing the mapped array itself works when its entries are stable, but placing that fresh array inside another shallow-compared array does not. [Z15]

### Mutation hides changes

If an item or nested collection is mutated in place, previous and next selectors may observe the same reference, so equality functions cannot detect the historical change. Zustand's maintainer guidance is to update nested objects immutably too. [Z1] [Z16]

### Unnecessary cloning causes changes

This update creates a new object for every row and makes every per-item object selector change:

```ts
items: state.items.map((item) => ({ ...item }));
```

Return original objects for unchanged entries. This is an inference from Zustand/React equality behavior and React's official immutable array example. [R1] [R2]

### Keys and references solve different problems

Use a stable data ID as `key`, not an array index for reorderable collections and not a value generated during rendering. React says keys identify list items across insertions, deletions, and reorders; changing/random keys recreate components and DOM and can lose user input. [R4]

Keys do not stop normal parent-to-child rendering. Stable props plus React Compiler or `memo`, or a component boundary that does not render from its parent update, handle that concern. [R3] [Z6]

### Optimization should follow measurement

React advises using memoization as a performance optimization and profiling before adding complexity. For most small lists, direct immutable arrays and atomic selectors are idiomatic and sufficient. [R5]

## Recommended Decision Sequence

The following is architectural synthesis based on the official behavior above:

1. Store arrays normally and update them immutably.
2. Preserve references for unchanged item objects.
3. Use atomic selectors; do not subscribe to the whole store.
4. Let the list owner select the stored array if its normal renders are inexpensive.
5. If item edits make the list owner expensive, select shallow-compared IDs in the parent and select one item in each row.
6. If repeated array `find` work or collection invariants become material, normalize to `{ ids, byId }`.
7. Use `useShallow` for genuinely computed/grouped selector outputs, not reflexively on every selector.
8. Do not expect `useShallow` or `createWithEqualityFn(shallow)` to suppress appends.
9. With React Compiler, rely on automatic child/value memoization first; retain conventional hook calls and fix selector/reference correctness independently.
10. Verify with the React Profiler in a production build before accepting normalization or custom-equality complexity.

## Sources

All URLs below were fetched successfully during this research. Only official Zustand documentation/source/repository discussions and official React documentation were used.

- **[Z1]** Zustand, "Immutable state and merging": https://zustand.docs.pmnd.rs/learn/guides/immutable-state-and-merging
- **[Z2]** Zustand, `createWithEqualityFn`, "Updating Arrays in State": https://zustand.docs.pmnd.rs/reference/apis/create-with-equality-fn#updating-arrays-in-state
- **[Z3]** Zustand `v5.0.14` React binding source (`useSyncExternalStore`): https://github.com/pmndrs/zustand/blob/v5.0.14/src/react.ts
- **[Z4]** Zustand discussion #387, maintainer clarification on inline selectors and memoized calculations: https://github.com/pmndrs/zustand/discussions/387
- **[Z5]** Zustand `v5.0.14` vanilla store source (state replacement and listener notification): https://github.com/pmndrs/zustand/blob/v5.0.14/src/vanilla.ts
- **[Z6]** Zustand discussion #2642, accepted maintainer answer on parent-driven child renders: https://github.com/pmndrs/zustand/discussions/2642#discussioncomment-10022287
- **[Z7]** Zustand, "Prevent rerenders with useShallow": https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow
- **[Z8]** Zustand `v5.0.14` `useShallow` source: https://github.com/pmndrs/zustand/blob/v5.0.14/src/react/shallow.ts
- **[Z9]** Zustand, `createWithEqualityFn` API: https://zustand.docs.pmnd.rs/reference/apis/create-with-equality-fn
- **[Z10]** Zustand, "How to Migrate to v5 from v4": https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5
- **[Z11]** Zustand `v5.0.14` `shallow` implementation: https://github.com/pmndrs/zustand/blob/v5.0.14/src/vanilla/shallow.ts
- **[Z12]** Zustand official README ("un-opinionated"): https://github.com/pmndrs/zustand/blob/main/README.md
- **[Z13]** Zustand discussion #2402, maintainer response assigning an entity adapter to third-party libraries: https://github.com/pmndrs/zustand/discussions/2402#discussioncomment-10335924
- **[Z14]** Zustand discussion #2562, React Compiler compatibility and later maintainer warning about generated selectors: https://github.com/pmndrs/zustand/discussions/2562
- **[Z15]** Zustand discussion #1936, maintainer explanation that nested `.map` creates a shallow-unequal array: https://github.com/pmndrs/zustand/discussions/1936#discussioncomment-11662384
- **[Z16]** Zustand discussion #1917, accepted maintainer answer requiring immutable nested updates: https://github.com/pmndrs/zustand/discussions/1917#discussioncomment-6351414
- **[R1]** React, "Updating Arrays in State": https://react.dev/learn/updating-arrays-in-state
- **[R2]** React, `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- **[R3]** React, "React Compiler: Introduction": https://react.dev/learn/react-compiler/introduction
- **[R4]** React, "Rendering Lists" (stable keys): https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- **[R5]** React, `useMemo`: https://react.dev/reference/react/useMemo
- **[R6]** React, "Components and Hooks must be pure": https://react.dev/reference/rules/components-and-hooks-must-be-pure
