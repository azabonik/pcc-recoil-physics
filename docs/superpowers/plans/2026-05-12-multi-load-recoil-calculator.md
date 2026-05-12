# Multi-load Free Recoil Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/components/RecoilCalculator.astro` with a multi-load comparison version (up to 4 cards, per-load gun weight, hash-encoded shareable state, comparison strip with proportional bars for PF / V_gun / energy).

**Architecture:** Single Astro component, vanilla TS hoisted script, no new dependencies. A pure `computeLoad()` function holds the math; a controller closure owns a `loads[]` array and routes every mutation through `renderCard` + `renderComparison` + `syncHash`. Cards are cloned from an inert `<template>` element on add. Hash is written via `history.replaceState`.

**Tech Stack:** Astro 5.x · TypeScript · vanilla DOM. No framework. No test runner (manual smoke tests).

**Spec:** [`docs/superpowers/specs/2026-05-12-multi-load-recoil-calculator-design.md`](../specs/2026-05-12-multi-load-recoil-calculator-design.md)

**Branch:** `multi-load-recoil-calculator` (already created off `main`; spec already committed as `46b5efa`).

**Critical conventions (CLAUDE.md):**
- **NO em dashes (—, U+2014).** Anywhere. In code, comments, strings, prose, frontmatter. Use comma, colon, semicolon, parentheses, or period. En dashes (–) are OK for numeric ranges.
- Before any commit, run: `grep -rn $'\u2014' --include='*.astro' --include='*.mdx' --include='*.ts' --include='*.css' src/ | grep -v node_modules` (zsh `$'\u2014'` expands to the em-dash character). Must return zero lines.
- **No `innerHTML` for DOM construction.** Use `document.createElement` + `textContent` / `appendChild`. A pre-commit security hook will reject `.innerHTML =` writes. The strings we'd insert are static and safe, but the hook treats `innerHTML` as a smell regardless.

---

## File Structure

- **Modified:** `src/components/RecoilCalculator.astro`, replaced contents (markup + hoisted TS script + scoped styles).
- **Modified:** `src/content/articles/recoil-calculator.mdx`, two frontmatter lines tweaked. Import line unchanged.
- **No new files.** No new dependencies.

Everything lives inside the single `.astro` component. The hoisted script block contains three logical units (`computeLoad`, `renderCard`, `Controller`) but they're all in the same file.

---

## Task 1: Extract `computeLoad()` as a pure function (refactor, no behavior change)

This task changes nothing visible. Goal: prove the math can be lifted out of the DOM-binding `compute()` function without breaking the calculator. Sets the foundation for every later task to call the same math.

**Files:**
- Modify: `src/components/RecoilCalculator.astro:150-256` (the `<script>` block)

- [ ] **Step 1: Read the existing file**

Open `src/components/RecoilCalculator.astro` and locate the `<script>` block starting at line 150. The function `compute()` at lines 205-249 mixes input parsing, math, and DOM writes. We're extracting only the math.

- [ ] **Step 2: Add type aliases and `computeLoad()` above `function setup(root)`**

Insert this code immediately after `type Bands = 'green' | 'amber' | 'red';` (which is line 151 today):

```ts
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
    gasBand: Bands;
  };

  function bandFor(f: number): Bands {
    if (f <= 1.2) return 'green';
    if (f <= 1.6) return 'amber';
    return 'red';
  }

  function isValid(i: LoadInputs): boolean {
    return (
      Number.isFinite(i.bullet) && i.bullet > 0 &&
      Number.isFinite(i.velocity) && i.velocity > 0 &&
      Number.isFinite(i.charge) && i.charge >= 0 &&
      Number.isFinite(i.f) && i.f > 0 &&
      Number.isFinite(i.gun) && i.gun > 0
    );
  }

  function computeLoad(i: LoadInputs): LoadOutputs {
    const pf = (i.bullet * i.velocity) / 1000;
    const bulletMomentum = i.bullet * i.velocity;
    const vGas = i.f * i.velocity;
    const gasMomentum = i.charge * vGas;
    const totalMomentum = bulletMomentum + gasMomentum;
    const gunGrains = i.gun * 7000;
    const vGun = totalMomentum / gunGrains;
    const energy = (i.gun * vGun * vGun) / 64.348;
    const bulletPct = (bulletMomentum / totalMomentum) * 100;
    const gasPct = 100 - bulletPct;
    return {
      pf, bulletMomentum, vGas, gasMomentum, totalMomentum,
      vGun, energy, bulletPct, gasPct, gasBand: bandFor(i.f),
    };
  }
```

- [ ] **Step 3: Rewrite `compute()` inside `setup()` to call `computeLoad`**

Replace the body of the `compute()` function (lines 205-249 today). Find:

```ts
    function compute() {
      const bullet = parseFloat(inputs.bullet.value);
      const velocity = parseFloat(inputs.velocity.value);
      const charge = parseFloat(inputs.charge.value);
      const f = parseFloat(inputs.f.value);
      const gunLbs = parseFloat(inputs.gun.value);

      if (![bullet, velocity, charge, f, gunLbs].every(Number.isFinite) || bullet <= 0 || velocity <= 0 || gunLbs <= 0) {
        clear();
        return;
      }

      const pf = (bullet * velocity) / 1000;
      // ... rest of math and DOM writes ...
    }
```

Replace with:

```ts
    function compute() {
      const li: LoadInputs = {
        bullet:   parseFloat(inputs.bullet.value),
        velocity: parseFloat(inputs.velocity.value),
        charge:   parseFloat(inputs.charge.value),
        f:        parseFloat(inputs.f.value),
        gun:      parseFloat(inputs.gun.value),
      };

      if (!isValid(li)) {
        clear();
        return;
      }

      const o = computeLoad(li);

      outputs.pf.textContent             = fmt(o.pf, 1);
      outputs.bulletMomentum.textContent = fmt(o.bulletMomentum);
      outputs.gasVelocity.textContent    = fmt(o.vGas);
      outputs.gasMomentum.textContent    = fmt(o.gasMomentum);
      outputs.totalMomentum.textContent  = fmt(o.totalMomentum);
      outputs.vGun.textContent           = fmt(o.vGun, 2);
      outputs.energy.textContent         = fmt(o.energy, 2);
      outputs.bulletPct.textContent      = fmt(o.bulletPct, 1) + '%';
      outputs.gasPct.textContent         = fmt(o.gasPct, 1) + '%';

      bars.bullet.style.flex = `0 0 ${o.bulletPct}%`;
      bars.gas.style.flex    = `0 0 ${o.gasPct}%`;

      gasBandTargets.forEach((el) => el.dataset.gasBand = o.gasBand);
      const bandLbl =
        o.gasBand === 'green' ? '(low gas push)' :
        o.gasBand === 'amber' ? '(mid gas push)' :
                                '(high gas push)';
      outputs.gasBand.textContent = bandLbl;
    }
```

Note: the local `function band(f)` at lines 191-195 is now dead code (replaced by module-level `bandFor`). Delete it.

- [ ] **Step 4: Verify build still passes and visual output is unchanged**

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

```bash
npm run dev
```

Open `http://localhost:4321/articles/recoil-calculator/`. With default inputs (124 / 1050 / 4.0 / 1.5 / 7.5) verify these exact outputs:

- Power Factor: `130.2`
- Bullet momentum: `130,200`
- Gas exit speed: `1,575`
- Gas momentum: `6,300`
- Total recoil momentum: `136,500`
- Recoil velocity: `2.60` fps
- Free recoil energy: `0.79` ft·lb
- Bullet: `95.4%` / Gas: `4.6%`

Stop the dev server (Ctrl+C).

- [ ] **Step 5: Verify no em dashes were introduced**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Extract computeLoad as a pure function (no behavior change)

Lift the math out of the DOM-binding compute() into a module-level
computeLoad(inputs) -> outputs function. Same arithmetic, same defaults,
same UI. Sets up the multi-load refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Move card markup into a `<template>` and extract `renderCard()`

Goal: still a single card, but the card markup lives in an inert `<template>` and gets cloned into a `<ol data-loads>` list on initial render. Still no add/remove buttons. After this task the visible UI is identical to today; the architecture is ready for multi-card.

**Files:**
- Modify: `src/components/RecoilCalculator.astro` (markup, script, styles)

- [ ] **Step 1: Restructure the markup**

Replace the `<section class="recoil-calc" data-recoil-calc>...</section>` block (lines 5-148 today) with this. The card body (`recoil-calc-body`) and bullet/gas bar (`recoil-calc-bar`) move inside a `<template>`. The header, an empty `<ol>`, and the three `<details>` disclosures stay in the rendered DOM.

```astro
<section class="recoil-calc" data-recoil-calc>
  <div class="recoil-calc-head">
    <div class="recoil-calc-kicker">Try your own load</div>
    <h3>Free recoil calculator</h3>
    <p>
      Plug in your bullet weight, muzzle velocity, charge, gas factor, and gun
      weight. Computes Power Factor, the bullet/gas momentum split, free-recoil
      velocity (V<sub>gun</sub>), and free-recoil energy. Math runs in your browser;
      no data leaves the page.
    </p>
  </div>

  <ol class="recoil-calc-loads" data-loads aria-label="Cartridge loads"></ol>

  <div class="recoil-calc-notes">
    <details open>
      <summary>About the gas factor</summary>
      <p>
        The gas factor <em>f</em> multiplies muzzle velocity to estimate how fast the gas
        column itself exits. Rough anchors: <strong>≈ 1.0</strong> for fast powder
        fully expanded in a long barrel · <strong>≈ 1.5</strong> SAAMI handgun default
        · <strong>≈ 1.75</strong> SAAMI rifle default · <strong>≈ 1.8</strong> for
        slow powder still pressurized at the muzzle. The gas bar shifts green → amber →
        red as the factor rises: it visualizes how much of your recoil is gas push,
        not bullet push.
      </p>
    </details>

    <details>
      <summary>Where's "burn rate"?</summary>
      <p>
        It's already in the calculator: just split across two inputs, because burn rate
        affects recoil through two independent quantities the equation cares about:
        <strong>charge weight</strong> (mass of powder burned) and the
        <strong>gas factor</strong> (how fast that mass exits the muzzle). Fast powders
        need less charge AND finish burning early enough that gas has room to expand,
        lowering the gas factor. Slow powders need more charge AND are still pressurized
        at the muzzle, raising it. There's no single "burn rate" knob because the
        equation doesn't have one: moving from a fast powder to a slow one means
        dialing both inputs in the same direction.
      </p>
    </details>

    <details>
      <summary>What about OAL, position sensitivity, and case volume?</summary>
      <p>
        These don't appear because free recoil is purely a momentum calculation:
        mass × velocity, summed for bullet and gas, divided by gun mass. Seating
        depth, case capacity (Federal vs. Starline vs. Win), powder column orientation,
        primer choice: these change <strong>peak pressure, ignition consistency,
        and standard deviation</strong>, not the first-order recoil momentum coming out
        the back. A 4.0 gr charge produces 4.0 × V<sub>gas</sub> of gas momentum
        regardless of which end of the case it ignited from. They matter enormously for
        load development (9mm is uniquely sensitive: ~8–15% pressure rise per 0.010″
        deeper at near-max charges, per the SAAMI-acknowledged small case volume) but
        they're a different question from "how hard does the gun kick." Use a reloading
        manual and a chronograph for those; use this calculator for the recoil math once
        you've validated the load.
      </p>
    </details>
  </div>
</section>

<template data-load-template>
  <li class="recoil-calc-card" data-load>
    <div class="recoil-calc-card-head">
      <h4 class="recoil-calc-card-label" data-load-label>Load A</h4>
    </div>
    <div class="recoil-calc-body">
      <div class="recoil-calc-inputs">
        <label class="rc-row">
          <span class="rc-lbl">Bullet weight</span>
          <input type="number" data-field="bullet" value="124" min="60" max="200" step="1" inputmode="decimal" />
          <span class="rc-unit">gr</span>
        </label>
        <label class="rc-row">
          <span class="rc-lbl">Muzzle velocity</span>
          <input type="number" data-field="velocity" value="1050" min="500" max="2500" step="1" inputmode="decimal" />
          <span class="rc-unit">fps</span>
        </label>
        <label class="rc-row">
          <span class="rc-lbl">Powder charge</span>
          <input type="number" data-field="charge" value="4.0" min="1" max="10" step="0.1" inputmode="decimal" />
          <span class="rc-unit">gr</span>
        </label>
        <label class="rc-row">
          <span class="rc-lbl">Gas factor (<em>f</em>)</span>
          <input type="number" data-field="f" value="1.5" min="1.0" max="2.0" step="0.05" inputmode="decimal" />
          <span class="rc-unit">×</span>
        </label>
        <label class="rc-row">
          <span class="rc-lbl">Gun weight</span>
          <input type="number" data-field="gun" value="7.5" min="1.5" max="15" step="0.1" inputmode="decimal" />
          <span class="rc-unit">lb</span>
        </label>
      </div>

      <div class="recoil-calc-out" aria-live="polite" aria-atomic="false" aria-label="Calculator results">
        <div class="rc-out-row">
          <span class="rc-out-lbl">Power Factor</span>
          <span class="rc-out-val" data-output="pf">…</span>
          <span class="rc-out-unit">PF</span>
        </div>
        <div class="rc-out-row">
          <span class="rc-out-lbl">Bullet momentum</span>
          <span class="rc-out-val" data-output="bullet-momentum">…</span>
          <span class="rc-out-unit">gr·fps</span>
        </div>
        <div class="rc-out-row">
          <span class="rc-out-lbl">Gas exit speed (V<sub>gas</sub>)</span>
          <span class="rc-out-val" data-output="gas-velocity">…</span>
          <span class="rc-out-unit">fps</span>
        </div>
        <div class="rc-out-row">
          <span class="rc-out-lbl">Gas momentum</span>
          <span class="rc-out-val" data-output="gas-momentum">…</span>
          <span class="rc-out-unit">gr·fps</span>
        </div>
        <div class="rc-out-row total">
          <span class="rc-out-lbl">Total recoil momentum</span>
          <span class="rc-out-val" data-output="total-momentum">…</span>
          <span class="rc-out-unit">gr·fps</span>
        </div>
        <div class="rc-out-row primary">
          <span class="rc-out-lbl">Recoil velocity (V<sub>gun</sub>)</span>
          <span class="rc-out-val" data-output="v-gun">…</span>
          <span class="rc-out-unit">fps</span>
        </div>
        <div class="rc-out-row primary">
          <span class="rc-out-lbl">Free recoil energy</span>
          <span class="rc-out-val" data-output="energy">…</span>
          <span class="rc-out-unit">ft·lb</span>
        </div>
      </div>
    </div>

    <div class="recoil-calc-bar">
      <div class="rc-bar-label">
        <span class="bar-legend-bullet">
          Bullet <span data-output="bullet-pct">…</span>
        </span>
        <span class="bar-legend-gas" data-gas-band="green">
          Gas <span data-output="gas-pct">…</span>
          <span class="bar-legend-band" data-output="gas-band">…</span>
        </span>
      </div>
      <div class="rc-bar-track">
        <div class="rc-bar-bullet" data-bar="bullet"></div>
        <div class="rc-bar-gas" data-bar="gas" data-gas-band="green"></div>
      </div>
    </div>
  </li>
</template>
```

Key markup changes vs today:
- `data-input="bullet"` becomes `data-field="bullet"` (read by field name).
- The card is wrapped in `<li class="recoil-calc-card" data-load>` with a `<h4 data-load-label>` header.
- Markup uses `<template data-load-template>` so it's inert until cloned.

- [ ] **Step 2: Rewrite the script block to use the template + renderCard**

Replace the entire `<script>` block (lines 150-256 today) with this. Note: it uses `document.createElement` + `textContent` exclusively, no `innerHTML`.

```astro
<script>
  type Bands = 'green' | 'amber' | 'red';

  type LoadInputs = {
    bullet: number;
    velocity: number;
    charge: number;
    f: number;
    gun: number;
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
    gasBand: Bands;
  };

  const FIELDS: (keyof LoadInputs)[] = ['bullet', 'velocity', 'charge', 'f', 'gun'];

  const DEFAULT_LOAD: LoadInputs = {
    bullet: 124, velocity: 1050, charge: 4.0, f: 1.5, gun: 7.5,
  };

  function bandFor(f: number): Bands {
    if (f <= 1.2) return 'green';
    if (f <= 1.6) return 'amber';
    return 'red';
  }

  function isValid(i: LoadInputs): boolean {
    return (
      Number.isFinite(i.bullet)   && i.bullet   > 0 &&
      Number.isFinite(i.velocity) && i.velocity > 0 &&
      Number.isFinite(i.charge)   && i.charge   >= 0 &&
      Number.isFinite(i.f)        && i.f        > 0 &&
      Number.isFinite(i.gun)      && i.gun      > 0
    );
  }

  function computeLoad(i: LoadInputs): LoadOutputs {
    const pf = (i.bullet * i.velocity) / 1000;
    const bulletMomentum = i.bullet * i.velocity;
    const vGas = i.f * i.velocity;
    const gasMomentum = i.charge * vGas;
    const totalMomentum = bulletMomentum + gasMomentum;
    const gunGrains = i.gun * 7000;
    const vGun = totalMomentum / gunGrains;
    const energy = (i.gun * vGun * vGun) / 64.348;
    const bulletPct = (bulletMomentum / totalMomentum) * 100;
    const gasPct = 100 - bulletPct;
    return {
      pf, bulletMomentum, vGas, gasMomentum, totalMomentum,
      vGun, energy, bulletPct, gasPct, gasBand: bandFor(i.f),
    };
  }

  const fmt = (n: number, d = 0) =>
    Number.isFinite(n)
      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
      : '…';

  function bandLabelText(b: Bands): string {
    return b === 'green' ? '(low gas push)' :
           b === 'amber' ? '(mid gas push)' :
                          '(high gas push)';
  }

  function readCard(card: HTMLElement): LoadInputs {
    const v = (name: keyof LoadInputs) =>
      parseFloat((card.querySelector(`[data-field="${name}"]`) as HTMLInputElement).value);
    return {
      bullet: v('bullet'), velocity: v('velocity'), charge: v('charge'),
      f: v('f'), gun: v('gun'),
    };
  }

  function blankCard(card: HTMLElement) {
    card.querySelectorAll<HTMLElement>('[data-output]').forEach((el) => {
      el.textContent = '…';
    });
    (card.querySelector('[data-bar="bullet"]') as HTMLElement).style.flex = '0 0 50%';
    (card.querySelector('[data-bar="gas"]')    as HTMLElement).style.flex = '0 0 50%';
  }

  function renderCard(card: HTMLElement, o: LoadOutputs | null) {
    if (o === null) { blankCard(card); return; }

    const set = (name: string, text: string) => {
      const el = card.querySelector(`[data-output="${name}"]`);
      if (el) el.textContent = text;
    };
    set('pf',              fmt(o.pf, 1));
    set('bullet-momentum', fmt(o.bulletMomentum));
    set('gas-velocity',    fmt(o.vGas));
    set('gas-momentum',    fmt(o.gasMomentum));
    set('total-momentum',  fmt(o.totalMomentum));
    set('v-gun',           fmt(o.vGun, 2));
    set('energy',          fmt(o.energy, 2));
    set('bullet-pct',      fmt(o.bulletPct, 1) + '%');
    set('gas-pct',         fmt(o.gasPct, 1) + '%');
    set('gas-band',        bandLabelText(o.gasBand));

    (card.querySelector('[data-bar="bullet"]') as HTMLElement).style.flex = `0 0 ${o.bulletPct}%`;
    (card.querySelector('[data-bar="gas"]')    as HTMLElement).style.flex = `0 0 ${o.gasPct}%`;
    card.querySelectorAll<HTMLElement>('[data-gas-band]').forEach((el) => {
      el.dataset.gasBand = o.gasBand;
    });
  }

  function letterFor(i: number): string {
    return String.fromCharCode(65 + i); // 0 -> 'A', 1 -> 'B', ...
  }

  function setup(root: HTMLElement) {
    const list = root.querySelector('[data-loads]') as HTMLOListElement;
    const tpl  = document.querySelector('[data-load-template]') as HTMLTemplateElement;

    const loads: LoadInputs[] = [{ ...DEFAULT_LOAD }];
    const cards: HTMLElement[] = [];

    function relabel() {
      cards.forEach((card, i) => {
        const lbl = card.querySelector('[data-load-label]');
        if (lbl) lbl.textContent = `Load ${letterFor(i)}`;
      });
    }

    function recomputeAt(i: number) {
      const load = loads[i];
      const out = isValid(load) ? computeLoad(load) : null;
      renderCard(cards[i], out);
    }

    function attachInputListeners(card: HTMLElement) {
      FIELDS.forEach((field) => {
        const el = card.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
        el.addEventListener('input', () => {
          const i = cards.indexOf(card);
          if (i < 0) return;
          loads[i] = readCard(card);
          recomputeAt(i);
        });
      });
    }

    function createCard(initial: LoadInputs): HTMLElement {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      const card = frag.querySelector('[data-load]') as HTMLElement;
      FIELDS.forEach((field) => {
        const el = card.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
        el.value = String(initial[field]);
      });
      attachInputListeners(card);
      return card;
    }

    function init() {
      loads.forEach((load) => {
        const card = createCard(load);
        cards.push(card);
        list.appendChild(card);
      });
      relabel();
      cards.forEach((_, i) => recomputeAt(i));
    }

    init();
  }

  document.querySelectorAll<HTMLElement>('[data-recoil-calc]').forEach(setup);
</script>
```

- [ ] **Step 3: Add new styles for `.recoil-calc-loads`, `.recoil-calc-card`, and `.recoil-calc-card-head`**

In the `<style>` section, after the `.recoil-calc p { ... }` rule (around line 290 today), insert:

```css
  .recoil-calc-loads {
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .recoil-calc-card {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 18px 20px;
    background: var(--bg-card-alt);
  }
  .recoil-calc-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .recoil-calc-card-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0;
  }
```

Also delete the `margin-bottom: 20px` line from the existing `.recoil-calc-body` rule (the card wrapper now provides spacing). The resulting `.recoil-calc-body` rule should look like:

```css
  .recoil-calc-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
```

- [ ] **Step 4: Verify build and visual output**

```bash
npm run build
```

Expected: build succeeds.

```bash
npm run dev
```

Open `http://localhost:4321/articles/recoil-calculator/`. Verify:

- A single card appears with the heading `LOAD A` at the top.
- Inputs, outputs, and the bullet/gas bar render correctly.
- Default outputs match Task 1 step 4 (PF 130.2, V_gun 2.60 fps, energy 0.79 ft·lb).
- Editing an input updates the outputs live.

Stop the dev server.

- [ ] **Step 5: Verify no em dashes**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Move recoil calculator card into a template + renderCard

Card markup lives in an inert <template>; setup() clones it into the
<ol data-loads> list. Still one card visible. Inputs use data-field
attributes and event delegation; outputs flow through a renderCard
function that takes LoadOutputs or null. No visible behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `addLoad` / `removeLoad` and the Add button (no comparison strip yet)

After this task you can add and remove cards (1–4). The comparison strip and hash state come in later tasks.

**Files:**
- Modify: `src/components/RecoilCalculator.astro`

- [ ] **Step 1: Add the Add-load button and remove-button slot in the markup**

In the section markup, immediately after `</ol>` (the closing of `recoil-calc-loads`) and before `<div class="recoil-calc-notes">`, insert:

```astro
  <div class="recoil-calc-actions">
    <button type="button" class="recoil-calc-add" data-add aria-label="Add a load (currently 1 of 4)">
      + Add load
    </button>
  </div>
```

Inside the `<template data-load-template>`, update `.recoil-calc-card-head` to include a remove button (hidden by default; the controller toggles it):

```astro
    <div class="recoil-calc-card-head">
      <h4 class="recoil-calc-card-label" data-load-label>Load A</h4>
      <button type="button" class="recoil-calc-remove" data-remove hidden aria-label="Remove load">×</button>
    </div>
```

- [ ] **Step 2: Add `MAX_LOADS` constant and `addLoad` / `removeLoad` in the script**

Below the `DEFAULT_LOAD` constant, add:

```ts
  const MAX_LOADS = 4;
```

Replace the body of `setup(root)` from the `createCard` definition through the call to `init()` with this expanded version (it adds the remove-button click handler, `syncControls`, `addLoad`, `removeLoad`, and the Add-button listener):

```ts
    function createCard(initial: LoadInputs): HTMLElement {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      const card = frag.querySelector('[data-load]') as HTMLElement;
      FIELDS.forEach((field) => {
        const el = card.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
        el.value = String(initial[field]);
      });
      const removeBtn = card.querySelector('[data-remove]') as HTMLButtonElement;
      removeBtn.addEventListener('click', () => {
        const i = cards.indexOf(card);
        if (i >= 0) removeLoad(i);
      });
      attachInputListeners(card);
      return card;
    }

    function syncControls() {
      const n = loads.length;
      addBtn.disabled = n >= MAX_LOADS;
      addBtn.setAttribute(
        'aria-label',
        n >= MAX_LOADS
          ? `Add a load (maximum ${MAX_LOADS} reached)`
          : `Add a load (currently ${n} of ${MAX_LOADS})`,
      );
      cards.forEach((card, i) => {
        const r = card.querySelector('[data-remove]') as HTMLButtonElement;
        r.hidden = n < 2;
        r.setAttribute('aria-label', `Remove Load ${letterFor(i)}`);
      });
    }

    function addLoad() {
      if (loads.length >= MAX_LOADS) return;
      const copy: LoadInputs = { ...loads[loads.length - 1] };
      loads.push(copy);
      const card = createCard(copy);
      cards.push(card);
      list.appendChild(card);
      relabel();
      recomputeAt(cards.length - 1);
      syncControls();
    }

    function removeLoad(i: number) {
      if (loads.length <= 1) return;
      loads.splice(i, 1);
      const [card] = cards.splice(i, 1);
      card.remove();
      relabel();
      syncControls();
    }

    const addBtn = root.querySelector('[data-add]') as HTMLButtonElement;
    addBtn.addEventListener('click', addLoad);

    function init() {
      loads.forEach((load) => {
        const card = createCard(load);
        cards.push(card);
        list.appendChild(card);
      });
      relabel();
      syncControls();
      cards.forEach((_, i) => recomputeAt(i));
    }

    init();
```

- [ ] **Step 3: Add styles for the Add button and remove button**

In the `<style>` block, after the `.recoil-calc-card-label` rule, add:

```css
  .recoil-calc-remove {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    width: 28px;
    height: 28px;
    border-radius: 4px;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .recoil-calc-remove:hover {
    color: var(--text-bright);
    border-color: var(--accent);
  }
  .recoil-calc-remove:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .recoil-calc-actions {
    margin: 0 0 22px;
  }
  .recoil-calc-add {
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--text);
    padding: 10px 18px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .recoil-calc-add:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--accent);
  }
  .recoil-calc-add:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .recoil-calc-add:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
```

- [ ] **Step 4: Verify build and behavior**

```bash
npm run build && npm run dev
```

Open `http://localhost:4321/articles/recoil-calculator/` and verify:

- Page loads with one card. Remove (×) is NOT visible. "+ Add load" is visible.
- Click "+ Add load". Second card appears with inputs matching the first.
- Both cards now show remove (×) buttons.
- Add three more times. By the 4th card the Add button disables.
- Remove the middle card from a 3-card layout. The third card relabels "LOAD C" to "LOAD B".
- Removing down to 1 card hides remove buttons again.

Stop the dev server.

- [ ] **Step 5: Em-dash check**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero.

- [ ] **Step 6: Commit**

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Add multi-card support with add/remove (no comparison strip yet)

Adds the + Add load button (capped at 4) and a per-card remove (x)
button shown when count >= 2. New cards copy the last load's values
so the natural workflow is "tweak one input from the previous load."
Labels re-letter on add/remove.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build the comparison strip (desktop layout)

After this task, when `loads.length >= 2`, a comparison panel appears below the Add button. Three rows (PF, V_gun, Energy) with proportionally-scaled bars. The renderer uses only `createElement` + `textContent` (no `innerHTML`).

**Files:**
- Modify: `src/components/RecoilCalculator.astro`

- [ ] **Step 1: Add the comparison strip markup**

In the rendered section, immediately after the `<div class="recoil-calc-actions">...</div>` block (which contains the Add button), insert:

```astro
  <section class="recoil-calc-cmp" data-cmp hidden aria-live="polite" aria-label="Side-by-side comparison">
    <h4 class="recoil-calc-cmp-title">Comparison</h4>
    <div class="recoil-calc-cmp-body" data-cmp-body></div>
  </section>
```

- [ ] **Step 2: Add the `METRICS` table and `renderComparison` helper**

Above `function setup(root: HTMLElement)`, add:

```ts
  type Metric = { key: 'pf' | 'vGun' | 'energy'; label: string; unit: string; decimals: number };

  const METRICS: Metric[] = [
    { key: 'pf',     label: 'Power Factor',       unit: 'PF',    decimals: 1 },
    { key: 'vGun',   label: 'Recoil velocity',    unit: 'fps',   decimals: 2 },
    { key: 'energy', label: 'Free recoil energy', unit: 'ft·lb', decimals: 2 },
  ];

  function makeEl(tag: string, className?: string, text?: string): HTMLElement {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function renderComparison(body: HTMLElement, outs: (LoadOutputs | null)[]) {
    body.textContent = ''; // clear (textContent='' removes all children safely)

    for (const m of METRICS) {
      const validVals = outs
        .map((o) => (o ? o[m.key] : null))
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const max = validVals.length ? Math.max(...validVals) : 0;

      const row = makeEl('div', 'rc-cmp-row');
      const rowLabel = makeEl('div', 'rc-cmp-row-label', `${m.label} `);
      rowLabel.appendChild(makeEl('span', 'rc-cmp-row-unit', m.unit));
      row.appendChild(rowLabel);

      const bars = makeEl('div', 'rc-cmp-row-bars');

      outs.forEach((o, i) => {
        const value = o ? o[m.key] : null;
        const pct = (value !== null && max > 0) ? (value / max) * 100 : 0;
        const valueText = (value !== null && Number.isFinite(value)) ? fmt(value, m.decimals) : '…';

        const seg = makeEl('div', 'rc-cmp-seg');
        seg.appendChild(makeEl('div', 'rc-cmp-seg-label', letterFor(i)));

        const track = makeEl('div', 'rc-cmp-seg-track');
        const fill = makeEl('div', 'rc-cmp-seg-fill');
        fill.style.width = `${pct}%`;
        track.appendChild(fill);
        seg.appendChild(track);

        seg.appendChild(makeEl('div', 'rc-cmp-seg-value', valueText));
        bars.appendChild(seg);
      });

      row.appendChild(bars);
      body.appendChild(row);
    }
  }
```

- [ ] **Step 3: Wire the comparison strip into the controller pipeline**

Inside `setup(root)`, just above `const addBtn = root.querySelector('[data-add]') as HTMLButtonElement;`, add:

```ts
    const cmp = root.querySelector('[data-cmp]') as HTMLElement;
    const cmpBody = root.querySelector('[data-cmp-body]') as HTMLElement;

    function syncComparison() {
      if (loads.length < 2) {
        cmp.hidden = true;
        return;
      }
      const outs = loads.map((li) => isValid(li) ? computeLoad(li) : null);
      cmp.hidden = false;
      renderComparison(cmpBody, outs);
    }
```

Update `recomputeAt` to call `syncComparison`:

```ts
    function recomputeAt(i: number) {
      const load = loads[i];
      const out = isValid(load) ? computeLoad(load) : null;
      renderCard(cards[i], out);
      syncComparison();
    }
```

Update `removeLoad` to call `syncComparison` after `syncControls`:

```ts
    function removeLoad(i: number) {
      if (loads.length <= 1) return;
      loads.splice(i, 1);
      const [card] = cards.splice(i, 1);
      card.remove();
      relabel();
      syncControls();
      syncComparison();
    }
```

Update `init` to call `syncComparison` at the end:

```ts
    function init() {
      loads.forEach((load) => {
        const card = createCard(load);
        cards.push(card);
        list.appendChild(card);
      });
      relabel();
      syncControls();
      cards.forEach((_, i) => recomputeAt(i));
      syncComparison();
    }
```

(`addLoad` already calls `recomputeAt` at the end, which now also calls `syncComparison`, so no change needed there.)

- [ ] **Step 4: Add comparison-strip styles (desktop)**

In the `<style>` block, immediately before the `@media (max-width: 760px)` block at the bottom, add:

```css
  .recoil-calc-cmp {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 18px 20px;
    margin: 0 0 20px;
    background: var(--bg-card-alt);
  }
  .recoil-calc-cmp[hidden] { display: none; }
  .recoil-calc-cmp-title {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 14px;
  }
  .recoil-calc-cmp-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .rc-cmp-row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 16px;
    align-items: center;
  }
  .rc-cmp-row-label {
    font-size: 13px;
    color: var(--text);
  }
  .rc-cmp-row-unit {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
    margin-left: 4px;
  }
  .rc-cmp-row-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rc-cmp-seg {
    display: grid;
    grid-template-columns: 18px 1fr 72px;
    gap: 10px;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .rc-cmp-seg-label {
    color: var(--text-dim);
    font-weight: 600;
    text-align: center;
  }
  .rc-cmp-seg-track {
    height: 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .rc-cmp-seg-fill {
    height: 100%;
    background: var(--accent);
    transition: width 180ms ease;
  }
  .rc-cmp-seg-value {
    color: var(--text-bright);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
```

- [ ] **Step 5: Verify build and behavior**

```bash
npm run build && npm run dev
```

Open `http://localhost:4321/articles/recoil-calculator/` and verify:

- Single card: NO comparison strip visible.
- Click "+ Add load". Comparison strip appears below the Add button with three rows (Power Factor, Recoil velocity, Free recoil energy). With both cards identical, both bars in each row are equal full width.
- Change Load B's bullet weight to 147. Bars re-normalize visibly.
- Add a third card; edit so it has the highest energy. Its energy bar should be the widest.
- Remove cards down to one; strip hides again.

Stop the dev server.

- [ ] **Step 6: Em-dash check + commit**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero matches.

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Add comparison strip with proportional bars

Below the Add button, when loads.length >= 2, render a comparison
panel with three rows (PF, V_gun, energy). Each row shows one bar
per load, scaled to the max value across loads in that row, plus
the per-load value. Invalid loads show ... and don't affect bar
normalization. Built with createElement + textContent (no innerHTML).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Mobile-responsive comparison strip

The card body already collapses to a single column at ≤760px via the existing `@media` rule. Only the comparison strip needs mobile-specific layout.

**Files:**
- Modify: `src/components/RecoilCalculator.astro` (styles only)

- [ ] **Step 1: Extend the existing `@media (max-width: 760px)` block**

Find the existing block at the bottom of the `<style>` section. Add rules so the block becomes:

```css
  @media (max-width: 760px) {
    .recoil-calc { padding: 22px 18px; }
    .recoil-calc-body { grid-template-columns: 1fr; gap: 18px; }
    .rc-row { grid-template-columns: 1fr 92px 24px; }
    .rc-out-row { grid-template-columns: 1fr auto 50px; gap: 8px; font-size: 12px; }

    .recoil-calc-card { padding: 16px; }
    .rc-cmp-row {
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .rc-cmp-row-label { font-size: 12px; }
    .rc-cmp-seg { grid-template-columns: 18px 1fr 60px; }
    .recoil-calc-add { width: 100%; }
  }
```

- [ ] **Step 2: Verify mobile layout**

```bash
npm run dev
```

In Chrome DevTools (Cmd+Opt+I), toggle device toolbar (Cmd+Shift+M), set width to 375px.

Open `http://localhost:4321/articles/recoil-calculator/`. Verify:

- Single card body collapses to one column.
- Add a second load. Comparison rows stack: metric label above, segment bars below it (one bar segment per row).
- Add button is full-width.
- Cards have tighter (16px) padding.

Stop the dev server.

- [ ] **Step 3: Em-dash check + commit**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero matches.

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Mobile-responsive comparison strip and card padding

Below 760px, comparison rows stack (label above bars) and the Add
button goes full-width. Card padding tightens slightly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Hash state read/write for shareable URLs

After this task, calculator state lives in the URL hash (`#a=147,880,3.0,1.4,7.5&b=...`). Refresh restores; pasting a URL shares.

**Files:**
- Modify: `src/components/RecoilCalculator.astro` (script only)

- [ ] **Step 1: Add bounds, slot keys, parse, and serialize helpers**

Above `function setup(root: HTMLElement)`, add:

```ts
  const SLOT_KEYS = ['a', 'b', 'c', 'd'] as const;
  type SlotKey = typeof SLOT_KEYS[number];

  const BOUNDS: Record<keyof LoadInputs, [number, number]> = {
    bullet:   [30, 300],
    velocity: [100, 3000],
    charge:   [0.5, 15],
    f:        [0.8, 2.5],
    gun:      [0.5, 25],
  };

  function inBounds(field: keyof LoadInputs, v: number): boolean {
    const [lo, hi] = BOUNDS[field];
    return Number.isFinite(v) && v >= lo && v <= hi;
  }

  function parseSlot(raw: string | null): LoadInputs | null {
    if (!raw) return null;
    const parts = raw.split(',');
    if (parts.length !== 5) return null;
    const [bullet, velocity, charge, f, gun] = parts.map((s) => parseFloat(s));
    if (!inBounds('bullet',   bullet))   return null;
    if (!inBounds('velocity', velocity)) return null;
    if (!inBounds('charge',   charge))   return null;
    if (!inBounds('f',        f))        return null;
    if (!inBounds('gun',      gun))      return null;
    return { bullet, velocity, charge, f, gun };
  }

  function parseHash(hash: string): LoadInputs[] {
    const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!cleaned) return [{ ...DEFAULT_LOAD }];
    const params = new URLSearchParams(cleaned);
    const out: LoadInputs[] = [];
    for (const key of SLOT_KEYS) {
      const parsed = parseSlot(params.get(key));
      if (parsed) out.push(parsed);
    }
    return out.length > 0 ? out : [{ ...DEFAULT_LOAD }];
  }

  function serializeLoads(loads: LoadInputs[]): string {
    const parts: string[] = [];
    loads.slice(0, SLOT_KEYS.length).forEach((load, i) => {
      const v = [load.bullet, load.velocity, load.charge, load.f, load.gun].join(',');
      parts.push(`${SLOT_KEYS[i]}=${v}`);
    });
    return parts.join('&');
  }
```

- [ ] **Step 2: Use the parsed hash on init, and write to the hash on mutation**

Inside `setup(root)`, replace the initial `loads` line with:

```ts
    const loads: LoadInputs[] = parseHash(window.location.hash).slice(0, MAX_LOADS);
```

Above `function init()` (still inside `setup`), add:

```ts
    function syncHash() {
      const encoded = serializeLoads(loads);
      const newHash = encoded ? `#${encoded}` : '';
      const url = `${location.pathname}${location.search}${newHash}`;
      history.replaceState(null, '', url);
    }
```

Then call `syncHash()` at the end of `recomputeAt` and `removeLoad`:

```ts
    function recomputeAt(i: number) {
      const load = loads[i];
      const out = isValid(load) ? computeLoad(load) : null;
      renderCard(cards[i], out);
      syncComparison();
      syncHash();
    }

    function removeLoad(i: number) {
      if (loads.length <= 1) return;
      loads.splice(i, 1);
      const [card] = cards.splice(i, 1);
      card.remove();
      relabel();
      syncControls();
      syncComparison();
      syncHash();
    }
```

(`addLoad` ends with a call to `recomputeAt`, which now calls `syncHash` itself, so no change needed.)

Do NOT call `syncHash()` from `init()`. On first load, the hash should stay exactly as the user gave it (or empty if they had no hash). Hash writes happen only on user-triggered mutations.

- [ ] **Step 3: Verify hash behavior**

```bash
npm run build && npm run dev
```

Open `http://localhost:4321/articles/recoil-calculator/`. Verify:

1. **Empty hash on landing.** URL bar shows `…/recoil-calculator/` with no hash.
2. **Hash on edit.** Change bullet weight to 147. URL bar updates to `…/recoil-calculator/#a=147,1050,4,1.5,7.5` (trailing decimals may vary by browser).
3. **Hash on add.** Click "+ Add load". URL bar now has `#a=...&b=...`.
4. **Hash restore.** Copy the URL, open a new tab, paste. Calculator restores with the same values.
5. **Bad hash recovery.** Visit `http://localhost:4321/articles/recoil-calculator/#a=147,880,3.0,1.4,7.5&b=999,99999,99,9,99`. First card restores (147 / 880 / ...); second slot is dropped. One card visible, no comparison strip.
6. **All-bad hash.** Visit `…/recoil-calculator/#a=notanumber`. Falls back to one default card.
7. **Back/forward unaffected.** After making changes, browser back button should NOT step through individual edits (because `replaceState`, not `pushState`).

Stop the dev server.

- [ ] **Step 4: Em-dash check + commit**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero matches.

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Persist calculator state to URL hash for shareable links

Format: #a=bullet,velocity,charge,f,gun&b=... up to slot d. Each
slot validated against per-field bounds; invalid slots drop, all-bad
falls back to default. Written via history.replaceState so navigation
history stays clean. No hashchange listener to avoid feedback loops.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Accessibility polish

The component already has `aria-live` outputs and proper labels. This task adds the remaining pieces: `aria-labelledby` on each card pointing at its label heading, unique IDs per card.

**Files:**
- Modify: `src/components/RecoilCalculator.astro`

- [ ] **Step 1: Wire each card to its label heading via role + aria-labelledby**

In `createCard(initial)`, after the line `FIELDS.forEach((field) => { ... el.value = String(initial[field]); ... })`, insert:

```ts
      const labelEl = card.querySelector('[data-load-label]') as HTMLElement;
      const labelId = `rc-load-${Math.random().toString(36).slice(2, 8)}`;
      labelEl.id = labelId;
      card.setAttribute('role', 'group');
      card.setAttribute('aria-labelledby', labelId);
```

- [ ] **Step 2: Verify accessibility behaviors**

```bash
npm run dev
```

In the browser:

1. Open `http://localhost:4321/articles/recoil-calculator/`.
2. Tab through the calculator: focus should land on each input in order, then the Add button.
3. Press Enter on the Add button. A second card appears. Focus order now includes the remove (×) button of each card before the inputs of that card.
4. Inspect element on a card. Confirm `role="group"` and `aria-labelledby="rc-load-..."`.
5. Inspect the Add button. Confirm `aria-label="Add a load (currently 2 of 4)"`. Add until 4; confirm it changes to `"Add a load (maximum 4 reached)"`.
6. Inspect a remove button. Confirm `aria-label="Remove Load B"` (with the current letter).
7. (Optional) With VoiceOver (Cmd+F5 on macOS), navigate. Each card announces its "Load X" label as its group context; outputs region announces changes as you edit.

Stop the dev server.

- [ ] **Step 3: Em-dash check + commit**

```bash
grep -n $'\u2014' src/components/RecoilCalculator.astro
```

Expected: zero matches.

```bash
git add src/components/RecoilCalculator.astro
git commit -m "$(cat <<'EOF'
Accessibility polish for multi-load calculator

Each card is role=group with aria-labelledby pointing at a unique
load-label heading. Ties cards to their headings so screen readers
announce 'Load A' as the group context for the inputs within.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontmatter copy update on `recoil-calculator.mdx`

**Files:**
- Modify: `src/content/articles/recoil-calculator.mdx:2-9`

- [ ] **Step 1: Update headerSubtitle and description**

Open `src/content/articles/recoil-calculator.mdx`. Replace the `headerSubtitle` and `description` fields with:

```yaml
headerSubtitle: >-
  V_gun, free-recoil energy, and the bullet-vs-gas momentum split for any 9mm
  load. Compare up to four loads side by side. Implements the standard SAAMI /
  Hatcher / NRA momentum equation.
description: >-
  Interactive 9mm free-recoil calculator. Inputs: bullet, PF, charge, gas factor, gun weight. Computes V_gun, free-recoil energy, and momentum split. Compare up to 4 loads.
```

Leave everything else in the file unchanged.

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Em-dash check across the changeset**

```bash
grep -rn $'\u2014' --include='*.md' --include='*.mdx' --include='*.astro' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.css' src/ docs/superpowers/
```

Expected: zero lines.

- [ ] **Step 4: Commit**

```bash
git add src/content/articles/recoil-calculator.mdx
git commit -m "$(cat <<'EOF'
Update calculator article frontmatter to mention multi-load compare

headerSubtitle and description gain a phrase about comparing up to 4
loads. Article body and import line unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke test and PR

This task is gating: run through the full smoke-test checklist before opening the PR. If anything fails, stop and fix; don't open the PR with a known regression.

**Files:** No code changes (verification + PR).

- [ ] **Step 1: Build and start the dev server**

```bash
npm run build && npm run dev
```

- [ ] **Step 2: Run the 8-step smoke-test checklist from the spec**

Open `http://localhost:4321/articles/recoil-calculator/` and walk through every item:

1. **Defaults render.** No hash. One card. PF ≈ 130.2 · V_gun ≈ 2.60 fps · energy ≈ 0.79 ft·lb. No comparison strip.
2. **Add load.** Click "+ Add load". Second card appears, identical to first. Comparison strip appears with two equal-length bars per metric.
3. **Cap at 4.** Add until 4 cards. The button is visually disabled, click does nothing, `aria-label` reads "Add a load (maximum 4 reached)".
4. **Remove middle card.** From 3 cards, remove the middle one. The third card's label changes from "LOAD C" to "LOAD B". URL hash updates to two slots.
5. **Live update.** Edit any input in any card. Only that card's outputs change. Comparison strip bars re-normalize.
6. **Hash restore.** Visit `http://localhost:4321/articles/recoil-calculator/#a=147,880,3.0,1.4,7.5&b=124,1050,4.0,1.5,7.5`. Cards load with exact values.
7. **Bad hash recovery.** Visit `…/recoil-calculator/#a=147,880,3.0,1.4,7.5&b=999,99999,99,9,99`. Only the first slot restores; second is dropped. One card visible, no comparison strip.
8. **Mobile.** DevTools, 375px. Cards stack, card body collapses to single column, comparison bars stack vertically inside each metric row.

If any step fails, stop and fix the underlying bug. Re-run the failing step plus all dependent steps. Do not move on with a known failure.

- [ ] **Step 3: Final em-dash sweep**

```bash
grep -rn $'\u2014' --include='*.md' --include='*.mdx' --include='*.astro' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.css' . | grep -v node_modules | grep -v dist
```

Expected: zero matches.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin multi-load-recoil-calculator
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "Multi-load free recoil calculator" --body "$(cat <<'EOF'
## Summary

- Replaces the single-load free recoil calculator with a multi-load version (up to 4 cards)
- Per-load gun weight: each card is a fully self-contained cartridge + platform combo
- Comparison strip below the cards shows PF, V_gun, and free recoil energy side by side with proportional bars
- URL hash carries state for shareable links (e.g. `#a=147,880,3.0,1.4,7.5&b=124,1050,4.0,1.5,7.5`)
- No new dependencies; vanilla TS + `<template>` cloning, fits the existing component style

See [spec](docs/superpowers/specs/2026-05-12-multi-load-recoil-calculator-design.md).

## Test plan

- [x] Defaults render: one card, PF 130.2 / V_gun 2.60 / energy 0.79, no comparison strip
- [x] Add load: second card copies first; comparison strip appears
- [x] Cap at 4: Add button disables with correct aria-label
- [x] Remove middle card from 3: bottom card re-letters, hash updates
- [x] Live updates: only affected card recomputes; comparison strip re-normalizes
- [x] Hash restore from known-good URL
- [x] Bad hash recovery: invalid slots dropped, all-bad falls back to defaults
- [x] Mobile (375px): cards stack, body collapses to single column, comparison bars stack
- [x] Zero em dashes anywhere in the changeset

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Verify PR opened**

The `gh pr create` command prints the PR URL. Open it and confirm:

- Title is correct.
- Body renders cleanly.
- All commits on the branch are present.
- CI (if any) is running.

---

## Self-review

**Spec coverage:** Every section of the spec maps to a task:
- "Goal" / "First-visit experience" / "Adding loads" / "Removing loads" → Tasks 2 + 3
- "Labeling" → Task 2 (`relabel()`) + Task 3 (re-letter on add/remove)
- "Comparison strip" → Task 4
- "URL hash state" → Task 6
- "Footer notes preserved" → Task 2 step 1 markup
- Architecture (file scope / DOM / script units / types) → Tasks 1-3
- Data flow pipeline → Tasks 3-6 (`recomputeAt`/`addLoad`/`removeLoad` → `syncComparison` → `syncHash`)
- Hash parsing edge cases → Task 6 step 1 (`parseSlot` validates length + bounds; `parseHash` falls back to default if all slots fail)
- Layout (desktop / mobile / card header) → Tasks 2, 3, 4, 5
- Accessibility → Task 7 + inline aria-labels in Tasks 3, 4
- Edge cases table:
  - Single load hides strip → Task 4 step 3 (`syncComparison` early return)
  - Invalid input blanks card and excludes from normalization → Task 2 (`blankCard`) + Task 4 step 2 (`validVals` filter)
  - 4+ hash slots dropped → Task 6, `SLOT_KEYS.length === 4`
  - Duplicate hash key handled by `URLSearchParams.get()` returning first
  - Back/forward via `replaceState` → Task 6 step 2
- Migration / frontmatter → Task 8
- Smoke tests → Task 9

**Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details", or "similar to Task N". Every code block is complete.

**Type consistency:**
- `LoadInputs` keys (`bullet`, `velocity`, `charge`, `f`, `gun`) match across the type definition, `FIELDS` array, `BOUNDS` record, `parseSlot`, `serializeLoads`, `readCard`, `computeLoad`, and the markup's `data-field` attributes. Verified.
- `LoadOutputs` keys used in `computeLoad`, `renderCard`, and `METRICS` (which references `pf`, `vGun`, `energy`). Consistent.
- `data-output` attribute names match the `set()` calls in `renderCard`: `pf`, `bullet-momentum`, `gas-velocity`, `gas-momentum`, `total-momentum`, `v-gun`, `energy`, `bullet-pct`, `gas-pct`, `gas-band`. Confirmed against template markup in Task 2.
- `Bands` (lowercase) used as `gasBand` value and `data-gas-band` attribute value. Consistent.
- Slot keys `a`/`b`/`c`/`d` defined in `SLOT_KEYS` (Task 6); used both in `parseHash` and `serializeLoads`.
- Function name discipline: `letterFor()` (not `letter()`) used consistently across Tasks 2-7.
