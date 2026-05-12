# Multi-load Free Recoil Calculator

**Date:** 2026-05-12
**Status:** Approved for implementation
**Scope:** Replace `src/components/RecoilCalculator.astro` with a multi-load comparison version. No new pages, no new dependencies.

## Goal

Let users compare up to four cartridge load + platform combinations side by side, computing Power Factor, V_gun, free-recoil energy, and the bullet/gas momentum split for each load, plus a comparison strip that puts the headline metrics next to each other with proportional bars.

Each "load" is a fully self-contained cartridge + gun combination (per-load gun weight). This supports comparing different platforms together with their respective loads (e.g., "my PCC + 124 gr" vs. "my 2011 + 147 gr") in one view.

## Non-goals

- No preset-loads dropdown.
- No CSV / clipboard export. The URL hash is the share affordance.
- No chart library or canvas drawing. Bars are flex divs, matching the existing bullet/gas bar.
- No localStorage persistence. Hash is the only persistence layer.
- No "reset to defaults" button. Reload the page or clear the hash.
- No baseline-selector / delta view. Possible future follow-up; explicitly out of scope here.
- No new test framework. Manual smoke-test checklist in the PR.

## User-visible behavior

### First-visit experience

One card. Identical visual shape to today's calculator: inputs on the left, outputs on the right, bullet/gas split bar below. No comparison strip visible. The "Add load" button is visible; the card has no remove (×) button until a second card exists.

### Adding loads

A `+ Add load` button below the cards. Clicking it appends a new card whose inputs are a copy of the **last** card (so the natural workflow "tweak one input from the previous load" is one keystroke). Capped at four. When count reaches 4 the button is disabled with `aria-label="Add a load (maximum 4 reached)"`.

When the second card appears, the comparison strip becomes visible.

### Removing loads

Each card shows a remove (×) button in its header when `count >= 2`. Clicking it removes that card. The remaining cards keep their input values but re-letter (Load A, Load B, …). The comparison strip re-renders or disappears when count drops to 1.

### Labeling

Auto-letter by position: Load A, Load B, Load C, Load D. No user-editable name field. Labels re-letter on add/remove.

### Comparison strip

Visible when `loads.length >= 2`. Three rows: **Power Factor**, **V_gun (fps)**, **Free recoil energy (ft·lb)**. Each row contains one segment per load (label "A"/"B"/…, value, horizontal bar). Bar widths are normalized to the max value across loads in that row (largest bar = full track width, others scaled proportionally). The bullet/gas split is *not* in the comparison strip; it stays inside each card.

A load with invalid inputs shows `…` in its slot (matching the existing placeholder convention) and is excluded from the row's bar normalization.

### URL hash state

The current state of the calculator serializes to `window.location.hash`. Format:

```
#a=147,880,3.0,1.4,7.5&b=124,1050,4.0,1.5,7.5
```

Five comma-separated numbers per load (bullet gr, velocity fps, charge gr, gas factor f, gun lb). Named slots `a`, `b`, `c`, `d` by position. Written via `history.replaceState` so navigation history isn't polluted. Read once on page load; no `hashchange` listener (avoids feedback loops).

Sharing is by copying the URL bar. No share button.

### Footer notes

The three existing `<details>` disclosures ("About the gas factor", "Where's burn rate?", "What about OAL, position sensitivity, and case volume?") move outside any per-card area and live once at the bottom of the calculator. Content unchanged.

## Architecture

### File scope

- **Rewritten:** `src/components/RecoilCalculator.astro`
- **Minor edit:** `src/content/articles/recoil-calculator.mdx`. The `headerSubtitle` and `description` frontmatter gain a mention of multi-load comparison; the `<RecoilCalculator />` import line is unchanged.
- No new files. No new dependencies.

### DOM structure

```
<section data-recoil-calc>
  <header>                   <!-- title, intro paragraph -->
  <ol data-loads>            <!-- ordered list of <li data-load data-load-index="N"> cards -->
  <button data-add>          <!-- "+ Add load" -->
  <section data-cmp hidden>  <!-- comparison strip; toggled visible when count >= 2 -->
  <footer>                   <!-- three <details> disclosures (unchanged content) -->
</section>
<template data-load-template>
  <!-- one card's markup: header (label + remove button), inputs row, outputs row, bullet/gas bar -->
</template>
```

The `<template>` element is inert until cloned with `template.content.cloneNode(true)`. This lets the card markup live alongside the calculator's other DOM but not render until `addLoad()` clones it.

### Script units (inside the hoisted `<script>` block)

1. **`computeLoad(inputs: LoadInputs): LoadOutputs`**: pure function. Literal extraction of the math at the current `compute()` function (lines 217-227 of today's file). No DOM, no side effects. Returns `{ pf, bulletMomentum, vGas, gasMomentum, totalMomentum, vGun, energy, bulletPct, gasPct, gasBand }`. The single canonical math implementation; the comparison strip reuses the same outputs.

2. **`renderCard(card: HTMLElement, outputs: LoadOutputs | null)`**: writes one card's output DOM. If `outputs` is `null`, blank that card (the equivalent of today's `clear()`).

3. **`Controller`**: a small module-level closure that owns:
   - `loads: LoadInputs[]`: the source-of-truth array
   - `addLoad()`, `removeLoad(i)`, `updateLoad(i, field, value)` mutation helpers
   - Input event delegation on the `<ol data-loads>` container
   - `syncHash(loads)` writer
   - `renderComparison(outputsList: (LoadOutputs | null)[])` for the strip
   - Add/remove button state management

### Types

```ts
type GasBand = 'green' | 'amber' | 'red';

type LoadInputs = {
  bullet: number;    // grains
  velocity: number;  // fps
  charge: number;    // grains
  f: number;         // gas factor
  gun: number;       // pounds
};

type LoadOutputs = {
  pf: number;
  bulletMomentum: number;
  vGas: number;
  gasMomentum: number;
  totalMomentum: number;
  vGun: number;
  energy: number;
  bulletPct: number;
  gasPct: number;
  gasBand: GasBand;
};
```

## Data flow

Every state mutation routes through one of three helpers, each of which runs the same pipeline:

```
addLoad()  / removeLoad(i)  / updateLoad(i, field, value)
                          ↓
                  mutate `loads[]`
                          ↓
       for each affected card: renderCard(card, computeLoad(load))
                          ↓
            renderComparison(loads.map(computeLoad))
                          ↓
                    syncHash(loads)
                          ↓
              toggle add/remove button states
```

- **`updateLoad`** re-renders only the affected card plus the comparison strip.
- **`addLoad`** appends a copy of `loads[loads.length - 1]` to the array, clones the `<template>` into the DOM, populates the new card's input fields from those copied values, re-letters labels if needed, runs the full pipeline.
- **`removeLoad`** removes the card, re-letters remaining labels, re-renders all remaining cards (in case labels changed), runs the full pipeline.

### Input events

Each input fires `input` (live updates, same as today). The `<ol data-loads>` parent uses event delegation: read the input's `data-field` attribute and walk up to find the parent `data-load-index`, then call `updateLoad(i, field, +value)`. NaN / empty values cause that card's outputs to clear (same behavior as today's invalid-input branch) and the card to be excluded from comparison-strip normalization.

### Initial render

The setup function runs when the hoisted script bundle loads (same pattern as today's `document.querySelectorAll<HTMLElement>('[data-recoil-calc]').forEach(setup)` at the bottom of the script block). For each `[data-recoil-calc]` root:

1. Parse `window.location.hash`. If absent or empty, `loads = [defaultLoad]`.
2. For each parsed load, clone the `<template>`, append to `<ol data-loads>`, populate inputs from the load values.
3. Run the full render pipeline once.

### Hash parsing

```
URLSearchParams(window.location.hash.slice(1))
```

For each of `a`, `b`, `c`, `d`:

- Split on `,`. Must produce exactly 5 numeric tokens. Otherwise drop the slot.
- Validate ranges: bullet ∈ [30, 300], velocity ∈ [100, 3000], charge ∈ [0.5, 15], f ∈ [0.8, 2.5], gun ∈ [0.5, 25]. Out-of-range → drop the slot.
- More than 4 slots present → take first 4, ignore rest.
- All slots dropped → fall back to `[defaultLoad]`.

This makes the calculator robust to a bad paste: the page never breaks, it just falls back to defaults.

### Hash writing

`syncHash(loads)` builds the hash string and calls:

```ts
history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
```

`replaceState` (not `pushState`) so back/forward stays clean.

## Layout

### Desktop (>760px)

- Cards stack vertically inside `<ol data-loads>` with 16px gap between cards.
- Each card preserves today's `grid-template-columns: 1fr 1fr` for the inputs/outputs body.
- Comparison strip: a panel below the add button. Three rows. Each row has a metric label on the left, then horizontal bar segments stretching to the right with the per-load value and label per segment.

### Mobile (≤760px)

- Cards remain stacked.
- Card body collapses to single column via the existing `@media` rule.
- Comparison strip: bars stack vertically within each metric row (label + value above the bar, full-width bars). 4 loads × 3 metrics = at most 12 stacked bar rows, scrollable, readable.

### Card header

Top of each card: `Load A` label (left), `×` remove button (right, only when `count >= 2`). 32×32 px hit target, `aria-label="Remove Load B"` (with the current letter).

## Accessibility

- Each card: `aria-labelledby` references its `Load X` heading.
- Comparison strip: `aria-live="polite"` (matches today's outputs region).
- Remove (×) button: `aria-label="Remove Load <letter>"`.
- Add button: `aria-label="Add a load (currently 2 of 4)"` (updates on count change). Disabled state via `disabled` attribute when count == 4.
- The existing color-band signaling (green/amber/red gas band) keeps its text label in `[data-output="gas-band"]` so it isn't color-only (WCAG 1.4.1 compliance preserved from today).
- Tab order: each card's inputs in order, then add button, then next card. Remove button comes before that card's inputs.

## Edge cases

| Case | Behavior |
| --- | --- |
| Single load | Comparison strip is `hidden`; remove button hidden. Visually identical to today. |
| Invalid inputs in one card | That card's outputs blank, that card's comparison-strip slot shows `…` and is excluded from bar normalization. Other cards unaffected. |
| All loads invalid | Comparison strip stays mounted; every slot shows `…`. No NaN bars. |
| Two loads identical | Comparison bars are equal full-width. Expected. |
| Hash has > 4 slots | First 4 used; rest ignored. |
| Hash slot duplicated | `URLSearchParams.get()` returns first; second dropped. |
| Hash slot out of range | That slot dropped; defaults used in its place. |
| All hash slots invalid | Falls back to `[defaultLoad]`. |
| Browser back/forward | `replaceState` doesn't add history entries; back/forward unaffected. |
| User opens page with no hash | Defaults: one card with `bullet=124, velocity=1050, charge=4.0, f=1.5, gun=7.5`. |

## Testing

No test framework exists in this repo (verified: no `vitest`, `jest`, `playwright` config). Manual smoke-test checklist, included in the PR body and executed before merge:

1. **Defaults render.** Open `/articles/recoil-calculator/` with no hash. One card, sane outputs (PF ≈ 130, V_gun ≈ 5.2 fps, energy ≈ 3.1 ft·lb), no comparison strip.
2. **Add load.** Click `+ Add load`. Second card appears with inputs copied from first. Comparison strip appears with two equal-length bars per metric.
3. **Cap at 4.** Add until 4 cards. Button disables.
4. **Remove middle card.** From 3 cards, remove the middle one. Bottom card re-letters from "Load C" to "Load B". Hash updates to two slots.
5. **Live update.** Edit any input in any card. Only that card's outputs change. Comparison strip re-normalizes.
6. **Hash restore.** Paste a known-good hash URL (`#a=147,880,3.0,1.4,7.5&b=124,1050,4.0,1.5,7.5`). Cards load with exact values.
7. **Bad hash recovery.** Paste a hash with one out-of-range slot (`#a=147,880,3.0,1.4,7.5&b=999,99999,99,9,99`). First slot restores; second falls back to defaults.
8. **Mobile.** DevTools at 375px width. Cards stack, card body collapses to single column, comparison bars stack vertically.

Math correctness is implicitly tested by parity with today's single-load case: with one card and unchanged inputs, every output number must match the current calculator exactly (the `computeLoad()` function is a literal lift of today's math).

## Migration

- New branch `multi-load-recoil-calculator` off `main`.
- One or a few commits as natural splits allow (e.g., math extraction, DOM refactor, comparison strip).
- PR to `main` with the smoke-test checklist in the body.
- No URL change for `/articles/recoil-calculator/`. No new pages. SEO is untouched.
- Frontmatter edit in `recoil-calculator.mdx`:
  - `headerSubtitle`: append "Compare loads side by side."
  - `description`: append "Compare up to 4 loads."
- Cross-references from `pistol-recoil-physics.mdx` and `pcc-recoil-physics.mdx` (which link to `/articles/recoil-calculator/`) still work and still make sense; no edit needed there.

## Open questions

None.

## Future follow-ups (deliberately deferred)

- Unit tests for `computeLoad()` and `parseHash()` (would require adding `vitest` to the repo, in its own PR).
- Baseline-selector for delta view ("Load A = baseline; show Δ% for others"). The data is all there; this is purely a comparison-strip rendering mode.
- Copy-link button as an alternative to copying the URL bar.
