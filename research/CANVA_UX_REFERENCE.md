# Canva as the UX reference for the canvas editor (owner direction)

> Owner direction, 2026-11-16: "using Canva as the UI/UX reference for the canvas editor would be key. Icons, and editing buttons and controls as well." Based on three owner-supplied screenshots of Canva's editor (not stored in the repo: they contain a client's event artwork). This is a research note for the GUI mockup rounds (see [../docs/ROADMAP.md](../docs/ROADMAP.md)), not a decision.

## Ground rule
Canva is a reference for **interaction patterns and clarity**, not a look to copy. Template Studio keeps its own original visual identity: no Canva branding, logo, gradient header, icon set, colours or wording. We copy *why it is easy*, not *what it looks like*.

## Patterns observed (and why they help a non-designer)
1. **Left rail: every icon has a text label** (Templates, Elements, Text, Brand, Uploads, Tools, Projects, Background…), large hit areas, the active item shown in colour. Nothing has to be guessed or hovered.
2. **A panel opens beside the rail** for the chosen category and can be collapsed with a visible chevron. It starts with search, then ONE big primary action in colour ("Add a text box"), then ready-made choices shown as **previews of the result** (Heading / Subheading / Body rendered in their own size), then categories as **large, colour-coded tiles with labels** (Shapes, Graphics, Photos, Frames, Grids…).
3. **Contextual toolbar floating above the canvas** that changes with what is selected, using **words, not just icons** (Edit, Replace, Flip, Position, Animate). Icon-only buttons are reserved for well-known actions (copy style, comment, delete), and delete sits at the end.
4. **A small per-page toolbar right above the artboard** (hide, lock, duplicate, delete, add page): actions on the page live next to the page.
5. **Top bar = document level:** home, File, Resize, the editing mode, the document title, and the outcome actions as prominent buttons on the right ("Print…", "Share").
6. **Calm workspace:** lots of space, a light neutral background around the artboard, one accent colour for selection (thin outline, round corner handles, pill-shaped side handles).

## What this could mean for Template Studio (to explore in mockups, not decided)
- Rail with labels: **Photos** (photo slots), **Text**, **Elements** (shapes, graphics), **Uploads**, **Background**, **Colours** (event palette), **Layers**.
- Photo-slot panel: one big "Add photo slot" button; layout presets shown as previews (1, 3, 4 photos…).
- Contextual bar for a photo slot, in words: **Frame**, **Reposition photo**, **Photo number**, **Sample photos: On/Off**. Sample photos would then be a visible, labelled switch, never a hidden mode (the owner's first-test confusion).
- Contextual bar for text: font, size, colour, **Align**, **Position**; for images: **Replace**, **Crop**, **Position**.
- Top right: **Export** as the prominent outcome button (later "Export for DSLR Booth").
- Colour-coding by element kind (photo slots / text / artwork / canvas), consistent between the rail, the Layers panel and the canvas.
- A light theme option (Canva is light; Template Studio is dark today) to evaluate in round 1.

## Open questions for the mockup rounds
- Light vs dark default, or both.
- How much of the current Properties panel moves into the contextual toolbar vs stays in a side panel.
- Single page only (Template Studio has one design per project) — the per-page toolbar becomes an artboard toolbar.
