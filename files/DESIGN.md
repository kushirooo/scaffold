# RAF Consult Project Management System — MARS
## Design System Documentation

| Field | Value |
|---|---|
| name | raf-consult-project-management-system-mars |
| version | 1.1.0 |
| status | grounded in Figma PDF snapshot; motion, shadow and z-index still inferred |
| source file | RAF Consult Project Management System - MARS |
| snapshot | 10 frames: 1 marketing site (1440 × 6280) and 9 app frames (1920 wide) |
| revised at | 2026-11-06 |
| owner | Design Systems |
| accessibility target | WCAG 2.2 AA |

---

## 0. Source Status & How to Read This Document

Version 1.0.0 was reconstructed without any design data and used a Tailwind-style blue palette. **That palette does not appear in your Figma frames.** This version replaces it with values measured from the PDF snapshot.

**How values were obtained**
- **Colors:** sampled from vector fills and rendered pixels, so hex codes are exact as rendered.
- **Type sizes:** read from the text layer of each frame.
- **Geometry (sizes, radii, gaps):** measured from vector shapes on the 1920 px app frames (1 unit = 1 px).
- **Font families:** the PDF embeds glyph outlines without family names, so families were identified visually and must be verified.

| Marker | Meaning |
|---|---|
| ✅ Extracted | Measured directly from the Figma snapshot |
| 🔶 Inferred | Proposed to fill a gap the Figma file does not cover |
| ❗ Verify | Identified visually or ambiguous; confirm in Figma |

**What changed from 1.0.0**
- Primary color is now deep navy `#08086F`, not blue `#2563EB`. The canvas is pale blue-white `#F5F7FF`.
- Three type families are in use (sans, monospace, serif italic), not one.
- Cards use 24px radii and the sidebar is a floating navy rail; both were absent from 1.0.0.
- Components and screen patterns are documented from the actual frames.
- A new section (§6) lists inconsistencies found in the Figma file.
- Success, warning and neutral extended scales from 1.0.0 are **retired** unless re-confirmed (see §2.1).

---

## 1. Context and Goals

**Product:** RAF Consult Project Management System — MARS
**Surfaces:** secure client and staff portal (login, dashboard, projects, users and teams) plus a public marketing site.
**Audience:** project managers, site engineers, clients and administrators of a civil, structural and geotechnical consultancy.
**Design intent:** calm, institutional and engineering-grade. Deep navy on a pale canvas, monospace for data labels, and serif italic for editorial headlines.

**Goals**
1. One token set governs color, type, space, radius and motion.
2. Every interactive component defines default, hover, focus-visible, active, disabled, loading and error states (the Figma file currently shows only default and selected).
3. WCAG 2.2 AA is a release gate.
4. Engineers and agents produce the same UI from the same tokens.

**Non-goals**
- A full dark theme. The password-recovery modal uses a dark surface, which is documented as a component variant (§3.11), not a theme.

---

## 2. Design Tokens and Foundations

### 2.1 Color Tokens

#### Brand and surfaces (✅ Extracted)

| Token | Hex | Where it appears |
|---|---|---|
| `color-brand-navy` | `#08086F` | Sidebar rail, primary buttons, avatar, active project pill, progress fill, login panel, marketing hero |
| `color-brand-navy-raised` | `#131375` | Raised tiles on navy (nav items, welcome tile) |
| `color-bg-canvas` | `#F5F7FF` | App page background, login right panel |
| `color-bg-surface` | `#FFFFFF` | Cards, panels, inputs, header |
| `color-bg-section-alt` | `#F0F3F8` | Alternating section background on the marketing site |
| `color-bg-footer` | `#101C36` | Dark band on the marketing site |
| `color-bg-dark-surface` | `#0D1630` | Password-recovery modal |
| `color-bg-dark-raised` | `#19213A` | Icon circle inside the dark modal |
| `color-action-blue` | `#2545E1` | Primary button on dark surfaces |
| `color-blue-900` | `#1E3A8A` | Icon glyphs and the modal icon-circle border |

#### Neutrals, borders and text (✅ Extracted unless noted)

| Token | Hex | Where it appears |
|---|---|---|
| `color-border-default` | `#B4BCDB` | Pill, card and input outlines (drawn as 1px lines) |
| `color-divider` | `#E8E8E8` | Header divider |
| `color-divider-soft` | `#DBDBDB` | Secondary dividers |
| `color-text-primary` | `#000000` | Headings and data on the dashboard ❗ pure black |
| `color-text-secondary` | `#334155` | AI summary text, form text |
| `color-text-muted` | `#5E687B` | Marketing secondary text |
| `color-text-placeholder` | `#94A3B8` | Form placeholders (fails contrast, see §7) |
| `color-text-on-navy` | `#FFFFFF` | Text on navy surfaces |
| `color-text-on-dark` | `#CED0D5` | Body text in the dark modal |

#### Status and feedback

| Token | Hex | Where it appears |
|---|---|---|
| `color-status-completed-bg` | `#7FCBA7` | Completed badge fill ✅ |
| `color-status-completed-dot` | `#009951` | Completed badge dot ✅ |
| `color-status-tender-bg` | `#FCB3AD` | Tender stage badge fill ✅ |
| `color-status-tender-dot` | `#C00F0C` | Tender stage badge dot ✅ |
| `color-danger` | `#CA3E3C` | Delete icon buttons ✅ |
| `color-danger-subtle` | `#FEF2F2` | Restricted-data banner ✅ |
| `color-danger-text` | `#991B1B` | Banner text ✅ |
| `color-chart-done` | `#0097B2` | Timeline "Done" bars (sample data) ✅ |
| `color-chart-progress` | `#518CC8` | Timeline "On Progress" bars (sample data) ✅ |
| `color-warning` | `#D97706` | No warning color exists in Figma (notifications use an emoji) 🔶 |

#### Off-system colors found in the Create Project form (❗ Verify)

| Hex | Where it appears |
|---|---|
| `#6366F1` | Step number circles and the Create Project button (Tailwind indigo-500, not brand navy) |
| `#F8FAFC`, `#E2E8F0`, `#334155`, `#94A3B8` | Slate neutrals for dropzone, toggle, field text (Tailwind slate) |
| `#38378B` | Users & Teams avatar tiles and action buttons (a second, lighter navy) |

**Usage rules**
- `color-brand-navy` is the only primary action color. Do not use a second brand hue.
- Status is always icon or dot plus text, never color alone.
- Use semantic tokens in component code, never raw hex.

### 2.2 Typography Tokens

| Family token | Family | Used for |
|---|---|---|
| `font-sans` | Inter ❗ | Page titles, buttons, card titles, body, forms |
| `font-mono` | IBM Plex Mono ❗ | Brand tagline, nav labels, dashboard card titles and values, key-value metadata, status badges, AI summaries |
| `font-display` | Crimson-style serif, italic ❗ (Crimson Pro or Crimson Text) | Login headline, "Intelligence in Construction", modal title, "Welcome Back" |

#### App type scale (✅ sizes extracted; roles read from the frames)

| Size | Family and weight | Role |
|---|---|---|
| 74px | Display, italic and bold | Login right-panel hero |
| 48px | Display (login heading); Mono bold (dashboard stat values) | Hero heading, KPI value |
| 36px | Display italic (modal title); Sans (dashboard "Your Overview") | Modal title, dashboard heading |
| 32px | Sans, light | Page title in the header (Dashboard, Projects, Users & Teams) |
| 28px | Mono bold | Panel titles (Project Health, Notifications) |
| 24px | Mono bold (KPI labels); Sans semibold (project card titles, form title) | Card and section titles |
| 23px | Sans semibold | Brand wordmark "Raf Consult" |
| 20px | Sans semibold | User names, avatar initials |
| 16px | Sans or mono, regular | Body, labels, search, nav labels, badges |
| 14px | Sans or mono, regular | Secondary body, metadata, notification text, compact buttons |
| 13px | Sans, medium | Form field labels |
| 12px | Sans | Step numbers, helper text |
| 11px | Sans | "Optional" pill |
| 9px | Mono | Brand tagline |

The marketing site uses a looser 19-step scale (9 to 74px). Treat the app scale above as canonical and consolidate the marketing scale to match (❗).

**Rules**
- One display-size heading per screen.
- Display serif is for brand and editorial moments only, never for data or form labels.
- Monospace carries data (numbers, IDs, metadata); do not use it for paragraphs longer than two lines.
- Body text minimum is 14px; 9 to 12px is for supporting metadata only.
- Numbers use tabular figures.

### 2.3 Layout and Spacing (✅ measured on the 1920px frames)

| Item | Value |
|---|---|
| App frame | 1920px wide |
| Sidebar (collapsed) | 72px wide, 10px inset from the frame edge, 24px radius |
| Sidebar item tile | 42 × 44px, 10px radius, 54px pitch |
| Brand logo box | 70 × 58px |
| Content left edge | 137px; content width 1733px |
| Header | Page title (32px), search, bell, settings tool, 44 × 44px avatar |
| User card grid | 3 columns, cards 571 × 202px, 10px horizontal gap, 30px vertical gap |
| Project card | 1733 × 440px |
| Form container | 1753px wide, 24px padding |
| Form field row | 48px tall; two-column gap 17px; textarea 120px tall |
| Progress bar row | 48px tall, 22px between rows |

**Observed gaps (10, 17, 22, 24, 30) are not on a consistent grid.** Proposed snap to the scale below (🔶):

| Token | px |
|---|---|
| `space-1` | 4 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-6` | 24 |
| `space-8` | 32 |
| `space-12` | 48 |

### 2.4 Radius Tokens (✅ measured)

| Token | Value | Used on |
|---|---|---|
| `radius-sm` | 8px | Inputs, buttons, form rows |
| `radius-md` | 10px | Sidebar tiles, header avatar |
| `radius-lg` | 16px | Form container |
| `radius-xl` | 20px | User avatar tiles |
| `radius-2xl` | 24px | Cards, sidebar rail, modal, progress bars |
| `radius-full` | 9999px | Pills, badges |

### 2.5 Elevation, Motion, Layering (🔶 Inferred; not present as styles in Figma)

| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 4px 12px rgba(8,8,111,0.08)` | User cards, panels (Figma shows a soft grey shadow ❗) |
| `shadow-modal` | `0 24px 48px rgba(13,22,48,0.20)` | Modal (Figma shows a large soft shadow ❗) |
| `duration-fast` | 120ms | Hover and focus |
| `duration-base` | 200ms | Dropdowns, toasts |
| `duration-slow` | 320ms | Modal enter |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default easing |
| `z-sticky` / `z-dropdown` / `z-modal` / `z-toast` | 10 / 20 / 50 / 60 | Layering |

Animate only opacity and transform, and honor `prefers-reduced-motion`.

### 2.6 Iconography (❗ Verify library)

Outline icons with rounded caps, about 2px stroke at 20 to 24px. They resemble Lucide or Feather: user, layout-grid, briefcase, clipboard, users, trending-up, bell, wrench, settings, search, filter, eye, check, edit, trash, upload-cloud, calendar, lock, plus. Emoji currently stand in for icons in notifications, the AI summary and the welcome tile; replace them (§6).

---

## 3. Component Specifications

### 3.1 App Shell
- **Sidebar, collapsed:** navy rail (`color-brand-navy`), icon tiles 42 × 44px. The active tile is white with a navy icon. Settings gear sits at the bottom.
- **Sidebar, expanded (315px):** logo and tagline, welcome tile (`color-brand-navy-raised`), nav items with icon and mono label (Dashboard, Projects, Tasks, Users & Teams, Reports). The active item is white with navy text.
- **Header:** white, bottom divider `#E8E8E8`. Left: page title (32px sans light). Right: search field, bell, settings tool, avatar.
- **Avatar:** 44 × 44px, navy, 10px radius, initials in white 20px.

### 3.2 Buttons

| Variant | Background | Label | Size | Used for |
|---|---|---|---|---|
| Primary | `#08086F` | White, 14px | 44 to 48px tall, 8px radius | New Project, Edit, New User, New Team |
| Primary on dark | `#2545E1` | White, 16px semibold | Full width, 8px radius | Continue (modal) |
| Light on navy | `#FFFFFF` | Black, 16px semibold | Full width, 8px radius | Log In |
| Secondary | White with outline | Dark | 44px tall | Cancel |
| Icon, action | `#38378B` ❗ | White icon | About 42px square | Copy, edit (user cards) |
| Icon, danger | `#CA3E3C` | White icon | About 42px square | Delete (user cards) |

**Rules**
- One primary button per view region.
- The Create Project form currently uses indigo `#6366F1` for its primary button; change it to `color-brand-navy` (§6).
- Destructive actions need confirmation or an undo.

### 3.3 Inputs
- Height 48px (login 44 to 46px), radius 8px, white background, 1px outline.
- Labels 13px above the control; placeholder in `color-text-placeholder`.
- Search field: magnifier icon at the right. Filter field: funnel icon at the right.
- Select: chevron at the right. Date: calendar icon at the right. Password: eye toggle.
- **Missing in Figma (🔶 required):** hover, focus-visible (2px navy ring, 2px offset), error, disabled, readonly.

### 3.4 Project Selector Pills
- Pill with 1px `color-border-default`, 16px label. Active pill is filled navy with white text. Used to switch project context on the dashboard.

### 3.5 Cards
- **Stat card:** white, 24px radius, mono bold title (24px) and right-aligned value (48px).
- **Panel:** same surface with a 28px mono bold title (Project Health, Notifications).
- **Project card:** 24px radius; 24px title, status badge, Edit button, key-value metadata in mono 14px, AI summary callout, hero image.
- **User card:** 571 × 202px, 100px avatar tile (`#38378B`, 20px radius), name 20px, mono-style metadata 14px, three stacked action buttons.

### 3.6 Status Badge
- Pill, dot plus mono label. Completed: fill `#7FCBA7`, dot `#009951`. Tender stage: fill `#FCB3AD`, dot `#C00F0C`.
- The label is currently white on a pastel fill, which fails contrast (§7). Use the dark label tokens in §7.

### 3.7 Progress Bar
- Track 900px wide, 48px tall, pill-shaped, navy 1px outline, canvas fill. Fill is `#08086F`. Percentage sits to the right in mono.

### 3.8 Timeline (Gantt)
- Rows with task labels at left and rounded bars on a pale track. Done `#0097B2`, On Progress `#518CC8`. The frame currently carries a **SAMPLE** watermark; the real data model is undefined (❗).

### 3.9 AI Summary Callout
- Bordered box with a robot glyph and mono text in `#334155`. Solid outline on list cards, dashed outline on the detail view. Pick one variant.

### 3.10 Notifications Panel
- Stack of bordered cards with a bold title, a "Project:" line and bullet details, including "AI Insight" and "AI Suggestion" lines.
- Severity is currently an emoji (🚨 ⚠️ 📊 ✅ ✨). Replace with an icon plus label, and use a real severity color for each level.

### 3.11 Confirmation Modal (dark variant)
- 552 × 552px, `#0D1630`, 24px radius, large soft shadow.
- 70px icon circle (`#19213A`, 1px `#1E3A8A`) with a check glyph, serif italic title at 36px, 16px body in `#CED0D5`, full-width `#2545E1` button.
- Standard modal rules apply: focus trap, `Escape` closes, `role="dialog"`, focus returns to the trigger.

### 3.12 Forms (Create Project)
- White container, 16px radius, 24px padding, six numbered sections separated by 1px dividers.
- Section header: numbered circle plus 16px title. Fields are two-column on desktop, full width for description, status and location.
- "Optional" pill (11px) on non-required fields. Restricted-data banner uses `#FEF2F2` with `#991B1B` text and a lock icon.
- Dropzone: dashed outline, upload icon, "PNG, JPG up to 5MB". Toggle for "Publish project".
- Action bar: Cancel (secondary) and Create Project (primary), right-aligned, with helper text at left.

### 3.13 Image Gallery (Project Detail)
- One large image beside three stacked thumbnails, 8px gaps, rounded corners, left of the metadata and AI summary.

---

## 4. Screen Inventory

| Frame | Size | Purpose |
|---|---|---|
| Marketing site | 1440 × 6280 | Public landing page: hero, expertise, sectors, approach, FAQ, enquiry form, footer |
| Login | 1920 × 1080 | Split layout: navy form panel (660px) and canvas hero panel |
| Password recovery sent | 552 × 552 | Dark confirmation modal |
| Dashboard | 1920 × 1080 | KPI cards, project health bars, notifications |
| Sidebar (expanded) | 315 × 1068 | Expanded navigation |
| Project dashboard | 1920 × 1080 | KPI cards, timeline, notifications |
| Projects list | 1920 × 1188 | Search, filter, project cards |
| Project detail | 1920 × 1080 | Gallery, metadata, AI summary |
| Create Project | 1920 × 1991 | Six-section form |
| Users & Teams | 1920 × 1080 | User card grid |

The marketing site reuses `#08086F` for its hero and uses numbered mono eyebrows (for example "01 / RAF CONSULT"), alternating `#F0F3F8` sections, and a `#101C36` dark band.

---

## 5. States, Content and Tone

**Required states (🔶):** default, hover, focus-visible, active, disabled, loading, error, selected. Figma currently designs only default and selected (active nav tile, active pill).

**Voice:** the brand is confident and editorial ("Track Intelligently Now.", "Intelligence in Construction"). App UI is plain, sentence case and verb-first.

| Rule | Standard |
|---|---|
| Currency | `RM 58,900.99` and `RM 60M` (with a space; Figma mixes `RM58,900.99` and `RM 25 million`) |
| Dates | `DD MMM YYYY`, with the timezone on timestamps |
| Empty states | Always offer the next action |
| Errors | What happened plus how to fix it |
| Search placeholder | "Search…" (Figma shows four dots) |

---

## 6. Inconsistencies and Remediation (found in the Figma file)

| # | Finding | Recommendation |
|---|---|---|
| 1 | Create Project uses indigo `#6366F1` and slate neutrals instead of navy and the brand borders | Re-skin the form with `color-brand-navy`, `color-border-default` and brand text tokens |
| 2 | Three navies in use: `#08086F`, `#38378B` (Users page), `#1E3A8A` | Keep `#08086F` as primary; define `#38378B` and `#1E3A8A` as named secondary tokens or remove |
| 3 | Status badges use white text on pastel fills (1.9:1 and 1.7:1) | Use a dark label (§7) or darken the fill |
| 4 | Placeholder `#94A3B8` on white is 2.56:1 | Darken to at least `#6B7280` |
| 5 | Gaps of 10, 17, 22, 24, 30px are off-grid | Snap to the spacing scale in §2.3 |
| 6 | Form labels at 13px and pills at 11px sit outside the main scale | Move to 14px and 12px |
| 7 | No hover, focus, disabled, error, loading or empty states | Design them for each component |
| 8 | Emoji used as icons (notifications, AI summary, welcome) | Replace with the icon set; emoji render differently per platform |
| 9 | Password recovery says a "new password has been sent" by email | Send a time-limited reset link instead of a password |
| 10 | Placeholder content: SAMPLE watermark, same photo on two projects, "Completed 2017" on a tender-stage project, empty "Total Budget" | Replace with real or clearly marked sample data |
| 11 | No warning, success or info semantic colors exist | Define them (🔶 proposals in §2.1) |
| 12 | No Figma styles or variables, so tokens cannot be extracted automatically | Create local styles and variables (§9) |

---

## 7. Accessibility (WCAG 2.2 AA), recomputed with measured colors

| Pair | Ratio | Verdict |
|---|---|---|
| White on `#08086F` | 16.5:1 | ✓ AAA |
| `#08086F` on `#F5F7FF` | 15.4:1 | ✓ AAA |
| `#000000` on `#F5F7FF` | 19.6:1 | ✓ AAA |
| `#334155` on white | 10.4:1 | ✓ AAA |
| `#5E687B` on white | 5.6:1 | ✓ AA |
| White on `#2545E1` | 7.0:1 | ✓ AAA |
| White on `#CA3E3C` | 4.9:1 | ✓ AA |
| `#CED0D5` on `#0D1630` | 11.6:1 | ✓ AAA |
| `#991B1B` on `#FEF2F2` | 7.6:1 | ✓ AAA |
| White on `#6366F1` | 4.5:1 | ⚠ Borderline; passes only by rounding (4.47) |
| `#94A3B8` on white (placeholder) | 2.6:1 | ✗ Fails AA |
| White on `#7FCBA7` (Completed badge) | 1.9:1 | ✗ Fails AA |
| White on `#FCB3AD` (Tender badge) | 1.7:1 | ✗ Fails AA |
| `#B4BCDB` border on `#F5F7FF` | 1.8:1 | ✗ Fails 3:1 for input boundaries; darken input borders |

**Requirements**
- Visible focus ring on every focusable element: 2px navy outline, 2px offset (🔶).
- Targets: 44 × 44px for primary controls, 24px absolute minimum. Sidebar tiles (42 × 44px) are close; make them 44px wide.
- Status is conveyed by icon or dot plus text, never color alone.
- Inputs need programmatic labels, `aria-invalid` and linked error text.
- Respect `prefers-reduced-motion`; usable at 200% zoom and 320px width.
- Progress bars expose a text value and `role="progressbar"`.

---

## 8. Implementation Guidance for Agents

1. Read this file before writing UI.
2. Map every value to a token in §2. If none fits, stop and ask.
3. Use `color-brand-navy` for primary actions and the sidebar. Do not use indigo, Tailwind blue or the v1.0.0 palette.
4. Use sans for UI, mono for data labels and display serif only for brand headlines.
5. Implement all states in §5, including those Figma has not designed.
6. Prefer the components in §3; do not invent new families.
7. If Figma and this document disagree, flag it rather than choosing silently.

Suggested prompt line:

> "Before any UI work, read DESIGN.md. Use only the tokens defined there. Navy `#08086F` is the sole primary color. Flag any value marked ❗ Verify if it blocks the task."

**QA checklist**
- [ ] No raw hex outside token definitions.
- [ ] Spacing, radius and type come from the scales.
- [ ] All states implemented, with a visible focus ring.
- [ ] Contrast passes (§7), including badges and placeholders.
- [ ] Layout works at 320, 768, 1024 and 1920px.
- [ ] Reduced-motion respected.

---

## 9. Figma Remediation Plan

1. Create color styles or variables for every token in §2.1 with the same names.
2. Create text styles for the §2.2 scale with the three family tokens.
3. Create a variable collection for spacing, radius and duration.
4. Create effect styles for `shadow-card` and `shadow-modal`.
5. Convert repeated elements to component sets with variants for state: buttons, inputs, pills, badges, cards, nav items, modal.
6. Fix the §6 items, then publish the library and re-run the extraction to confirm values.

---

## 10. Open Questions (❗ Verify in Figma)

1. Confirm font families: Inter, IBM Plex Mono and the serif (Crimson Pro or Crimson Text), and their weights.
2. Is `#38378B` an intended secondary navy, or a drift from `#08086F`?
3. Is `#000000` the intended text color, or do styles use a near-black?
4. Exact shadow values for cards and the modal.
5. Border colors for inputs on the standard (non-form) screens.
6. Warning, success and info colors for notifications.
7. Icon library and stroke weight.
8. Should the Create Project form be re-skinned to navy, or is indigo intentional?
9. Responsive behavior: only desktop frames exist (1920px and 1440px).
10. Dark mode scope, given the dark modal variant.

---

## 11. Change Log

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-11-06 | Rebuilt from the Figma PDF snapshot: replaced the inferred Tailwind palette with measured navy-based colors; added three-family typography, measured layout and radii, component and screen documentation, an inconsistencies register and recomputed contrast. |
| 1.0.0 | 2026-11-06 | Reconstructed documentation from SKILL.md with inferred values. Superseded. |
