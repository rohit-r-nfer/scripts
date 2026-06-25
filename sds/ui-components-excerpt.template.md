# SDS — UI module excerpt (WatchMate §8.5)

**Scope:** **One UI module per file** (e.g. LAAC ROI, device placement)—the **`## 8.5.x … module`** block and its **software unit** subsections only (`8.5.x.a`, `8.5.x.b`, … or `8.5.x.1`, `8.5.x.2`, … per your master SDS). **Do not** add a parent **`## 8.5 User Interface Components`** heading, a whole-app module list, or **Overall Software Requirements for User Interface (UI) Components** here; those belong in a separate master §8.5 file if needed. Confirm **which module** to document before authoring. Use **8.5.x** from your outline or **TBD** until fixed.

**Authoring tone:** Write for **clinicians**, **clinical engineering**, and **regulatory** readers: short sentences, everyday words where they are enough, and **shall** lines that state observable behavior. In narrative, prefer **module**, **container component**, and **software unit**; keep hook and store chatter out of **shall** bullets. The module **Purpose** is a **very short** plain-language intro only (see skill **Tone and vocabulary**); do not put implementation detail there. For **Inputs/Outputs**, use the **implemented prop or handler name** in **Property** and a **very short Description** (see tables below). **Implementation Details** must use **multiple paragraphs** of **plain English**—selective, well written (see skill)—not a walkthrough of every function or variable name.

**Product / repo:** tee-laac-ui (fill in package or app name if needed)

**Last updated:** (fill in)

---

## 8.5.x [Module name] module

**Purpose:**

**Very short** intro only—a **few sentences**: what the operator is doing here and what they see, in plain language (skill **Tone and vocabulary** → **Plain language, then precision**). **Do not** add implementation detail, shall lists, or stack catalogs—that comes later.

[Replace with a brief paragraph.]

**Software Requirements:**

**Format:** Each line starts with **`•`** (circle bullet)—**not** `-`. Put a **blank line** between each **`• The software shall …`** line (match login / ROI excerpts).

• [Primary shall statements for this module only—not every micro-behavior.]

• [Next shall line if needed.]

**Module Structure:**

This module consists of the following software units:

• Unit 8.5.x.a: [First software unit name]
• Unit 8.5.x.b: [Second software unit name]

**Triggered By:** (optional at module level—one line, e.g. navigation to this route)

[Omit this block if your master SDS does not use module-level Triggered By.]

---

## 8.5.x.a [First software unit name]

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

[One sentence.]

**Software Requirements:**

**Format:** **`•`** shall lines only; **blank line** between each (see module example above).

• [Primary shall bullets for this unit—not exhaustive control-by-control rules.]

• [Next shall line if needed.]

**Triggered By:** [One line—how this unit starts, e.g. user click on … button]

[If several distinct triggers, use a blank line after the heading and **•** one-liners per trigger—see skill **Triggered By (per software unit)**.]

**Dependencies:**

- **APIs:**
  - [API name] — [one short phrase]
  - [API name] — [one short phrase]
- **State:** [One concise line, e.g. Redux state for active taskId, view mode (one-pane/two-pane)]

Table 1 – Inputs ([unit name])

**Columns (only these three, per *SDS WatchMate Software* §8.5):** **Property | Type | Description**

**Scope (read the repo—do not invent rows):** **Inputs** = **(1)** props on this unit’s **root** component, **(2)** props on **child** components in this unit’s tree, and **(3)** **arguments or options** passed into **hook calls** from that root or those children. Build the full candidate set from **types and call sites** in code, then put **only crucial** rows in the Markdown table. It is **acceptable** if a prop appears again when you document a **child** as its own unit—**avoid** long duplicate blocks; prefer rows that matter for that unit’s boundary.

**Keep each row minimal.** **Property** = name as in source (**preserve casing**). **Type** = logical or TypeScript-style. **Description** = **fewer than ten words**.

In `.md`, use a **pipe table** (see skill `writing-sds-ui-components`).

Example (style only—each row must exist in **your** codebase):

| Property | Type | Description |
|----------|------|-------------|
| Open | boolean | Whether the sweep protocol modal is open |
| onSweepProtocolModalClose | () => void | Handler to close the sweep protocol modal |
| sweepProtocolModalIsVideoPlaying | boolean | Whether the sweep protocol video is currently playing |

| Property | Type | Description |
|----------|------|-------------|
| | | |

Table 2 – Outputs ([unit name])

**Same columns and brevity.** **Outputs** = **return values** from **hooks** called in this unit’s root **or** in its **child** components (fields or values you care to verify)—**only from code**, **crucial rows only**. **Do not** list **`useSelector`** (react-redux) return values or destructured fields from it; that is **Redux state**—cover under **Dependencies** → **State**. Same **Property | Type | Description** rules.

| Property | Type | Description |
|----------|------|-------------|
| | | |

**Implementation Details:**

Use **several paragraphs** of **plain English**. You do **not** need every detail—only what helps a reader understand the unit—**but write that well**, and **start a new paragraph** when the **topic** changes. Use code names **only** when they disambiguate or tie to verification. (See skill `writing-sds-ui-components`.)

[Replace with multiple paragraphs—quality over completeness.]

**Status Outcomes:**

**Success:**

• [One-line observable success scenario]

**Error:**

• [One-line error scenario—or **N/A (…)** when no unit-specific failure path]

---

## 8.5.x.b [Second software unit name]

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

[One sentence.]

**Software Requirements:**

Same **`•`** + blank-line format as the first unit.

• [Primary shall bullets.]

• [Next shall line if needed.]

**Triggered By:** [One line or **•** list]

**Dependencies:**

- **APIs:**
  - …
- **State:** …

Table 3 – Inputs

Same rules as Table 1: evidence-only, **crucial** rows; root + children + hook call inputs in scope.

| Property | Type | Description |
|----------|------|-------------|
| | | |

Table 4 – Outputs

Same rules as Table 2: hook returns from this unit’s root and children—**crucial** rows only, from code; **exclude** **`useSelector`** returns (see Table 2).

| Property | Type | Description |
|----------|------|-------------|
| | | |

**Implementation Details:**

Same as the first unit: **several paragraphs** of **plain English**, **selective** (not every detail), **well written**; **new paragraph** when the topic shifts; code symbols only when needed.

[Replace with multiple paragraphs—quality over completeness.]

**Status Outcomes:**

**Success:**

• …

**Error:**

• …

---

## Notes

- **Agent:** Confirm **which module or screen** to document before filling this template. One file = one module.
- Duplicate the unit block (`## 8.5.x.<id> …`) per **software unit** (one top-level user-facing capability each—not every small control).
- For a **full** §8.5 master (global “User Interface Components”, all modules, overall UI shalls), use a **separate** file and workflow; this template is **module excerpts only**.
- **Word / Google Docs:** `python3 ~/Projects/scripts/sds/build-sds-docx.py <path-to-your-file>.md`. Reference: **`pandoc-reference-watchmate-sds.docx`** next to that script; pipe tables use the **Grid Table 1 Light** table style via **`docx-table-grid.lua`**; **`docx-indented-code-as-body.lua`** keeps fenceless indented prose from rendering as monospace in Word. No `--toc`.
