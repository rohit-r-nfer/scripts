---
title: "Ui Components Excerpt.template"
lang: en-US
---

# SDS — UI module excerpt (WatchMate §8.5)

**Scope:** **One UI module per file** (e.g. device placement, ROI)—the **`## 8.5.x … module`** block and its **software unit** subsections only (`8.5.x.a`, `8.5.x.b`, … or `8.5.x.1`, `8.5.x.2`, … per your master SDS). **Do not** add a parent **`## 8.5 User Interface Components`** heading, a whole-app module list, or **Overall Software Requirements for User Interface (UI) Components** here; those belong in a separate master §8.5 file if needed. Confirm **which module** to document before authoring. Use **8.5.x** from your outline or **TBD** until fixed.

**Authoring tone:** Write for **clinicians**, **clinical engineering**, and **regulatory** readers: short sentences, everyday words where they are enough, and **shall** lines that state observable behavior. In narrative, prefer **module**, **container component**, and **software unit**; keep symbols for **Dependencies** and **Inputs/Outputs** descriptions, not as the opening words of every shall bullet.

**Product / repo:** (fill in)

**Last updated:** (fill in)

---

## 8.5.x [Module name] module

**Purpose:**

[One short paragraph.]

**Software Requirements:**

• [Primary shall statements for this module only—not every micro-behavior.]

**Module Structure:**

This module consists of the following software units:

• Unit 8.5.x.a: [First software unit name]
• Unit 8.5.x.b: [Second software unit name]

---

## 8.5.x.a [First software unit name]

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

[One sentence.]

**Software Requirements:**

• [Primary shall bullets for this unit—not exhaustive control-by-control rules.]

**Dependencies:**

- **APIs:**
  - [API name] — [one short phrase]
  - [API name] — [one short phrase]
- **State:** [One concise line, e.g. Redux state for active taskId, view mode (one-pane/two-pane)]

Table 1 – Inputs ([unit name])

**Columns (only these three, per *SDS WatchMate Software* §8.5):** **Property | Type | Description**

**Inputs** = props passed to the **root component** for this software unit **and** props passed to **each child component** mounted inside that unit (one combined table). Use **Description** to say which child or surface a row applies to when needed.

In `.md`, use a **pipe table** (see skill `writing-sds-ui-components`).

| Property | Type | Description |
|----------|------|-------------|
| | | |

Table 2 – Outputs ([unit name])

**Same three columns:** **Property | Type | Description**

**Outputs** = what you get from **hooks** used inside this unit’s component tree (returns, handlers, side effects such as navigation or store updates, loading/error state, etc.) **and** meaningful **visual** or user-visible results the unit is responsible for (primary region, modal body, status text, …).

| Property | Type | Description |
|----------|------|-------------|
| | | |

**Implementation Details:**

[How the unit is structured in code, what the user can do (clicks, gestures, flows), loading/error/async behavior, key hooks/effects. A few sentences suffice for a thin unit.]

---

## 8.5.x.b [Second software unit name]

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

[One sentence.]

**Software Requirements:**

• [Primary shall bullets.]

**Dependencies:**

- **APIs:**
  - …
- **State:** …

Table 3 – Inputs

Same rules as Table 1: **Property | Type | Description**; props on root + all children in scope.

| Property | Type | Description |
|----------|------|-------------|
| | | |

Table 4 – Outputs

Same rules as Table 2: hooks + visual outputs.

| Property | Type | Description |
|----------|------|-------------|
| | | |

**Implementation Details:**

…

---

## Notes

- **Agent:** Confirm **which module or screen** to document before filling this template. One file = one module.
- Duplicate the unit block (`## 8.5.x.<id> …`) per **software unit** (one top-level user-facing capability each—not every small control).
- For a **full** §8.5 master (global “User Interface Components”, all modules, overall UI shalls), use a **separate** file and workflow; this template is **module excerpts only**.
- **Word / Google Docs:** `python3 ~/Projects/scripts/sds/build-sds-docx.py <path-to-your-file>.md`. **`pandoc-reference-watchmate-sds.docx`** and **`docx-table-grid.lua`** sit next to that script (Table Grid borders on pipe tables). **No** `--toc`. Full rules: Cursor skill **`writing-sds-ui-components`**.
