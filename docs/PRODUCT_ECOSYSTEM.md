# Product Ecosystem: WalkOne Template Studio + WalkOne Booth

_Approved owner direction, recorded 2026-11-17 (ADR-049). **Planning only: nothing in this document is implemented, and WalkOne Booth development is NOT yet approved to start.** This is the one authoritative description of the long-term product and architecture direction; other documents summarise it and link here._

## 1. Two product surfaces, one editor

| | **WalkOne Template Studio** | **WalkOne Booth** |
|---|---|---|
| What | A first-class **standalone** desktop app for designing photo booth templates | The eventual **complete local photo booth platform**, replacing the operator's dependency on dslrBooth |
| Status | Exists (this repository), in active development | Future; not started; requires explicit approval |
| Platforms | Cross-platform where practical (macOS and Windows) | **Windows-first** runtime initially |
| Contains Template Studio? | It *is* Template Studio | Yes: the **same** Template Studio, at full capability, as a module |

**Hybrid decision (ADR-049, Accepted):** Template Studio stays independently runnable **and** is available at full capability inside WalkOne Booth. There is **one** editor implementation (a shared Template Studio core) used by both. A second template editor must never be built.

```
WalkOne Template Studio (standalone desktop app)
│
└──── shared Template Studio core ────┐
                                      │
WalkOne Booth                         │
├── Events                            │
├── Template Studio ◄─────────────────┘
├── Capture
├── Camera
├── Printer
├── Sharing
├── Media
└── Settings
```

## 2. Standalone WalkOne Template Studio
Its original purpose stays valid: a modern, efficient, professional design environment for photo booth templates, so operators never have to use dslrBooth's cumbersome native template editor. It must remain suitable for:
- designing templates away from the booth workstation, on macOS or Windows;
- preparing client templates before an event; proof generation; design revisions;
- exporting production PNGs (and layer packages if reinstated; see §13);
- exporting dslrBooth-compatible packages during the migration period;
- future native WalkOne Booth template export;
- staff who only need template design.

**Template Studio must NOT be reduced to a thin screen that only works when the WalkOne Booth runtime is installed.**

## 3. Template Studio inside WalkOne Booth (future behaviour)
Opened from an event (WalkOne Booth → Event → Template → Open Template Studio), the editor receives the event context automatically, so the operator never re-enters what the event already knows:
- event name and date, client/organization, venue/location;
- selected format and output profile;
- company profile, event branding, logos, event palette;
- the approved design version.

When editing is done: Template Studio → save/update the native template → return to Event Setup → **Event Readiness** validates the template.

**Parity goal:** functional parity between standalone and integrated wherever practical. A template made in standalone Template Studio opens directly in WalkOne Booth **without conversion**; a template edited inside WalkOne Booth stays a normal Template Studio project.

## 4. What the shared core owns
One implementation, used by both surfaces, so nothing can drift:
- the `TemplateProject` domain model (vendor-neutral, ADR-002);
- rendering (canvas, proof and production);
- canvas/editor behaviour, typography, palettes, assets, photo slots, composition;
- preflight and safe-area logic;
- the native WalkOne template format (future);
- the dslrBooth adapter (during the migration).

## 5. Likely future package boundary (CONCEPTUAL ONLY)
Not approved and not to be built now. The current repository is **not** reorganised; extraction happens only when WalkOne Booth development is approved.
```
apps/
  template-studio        standalone shell (today's Electron app)
  walkone-booth          the booth platform shell
packages/
  template-domain        TemplateProject, schemas, print math, composition, validation (today: src/domain)
  template-editor        editor state, commands, canvas/editor UI (today: src/editor, src/canvas, renderer editor)
  template-renderer      proof/production rendering (today: src/canvas/rendering, export render paths)
  template-export        native format, dslrBooth adapter (today: src/export, src/import)
  output-profiles        printer/media/safe-area profiles (v1 exists as src/output/, ADR-053)
  shared-ui              design system components (today: renderer ui/, styles/)
  shared-contracts       IPC/service contracts shared by both shells (today: src/shared)
```
Today's code already keeps these seams (pure domain with no Electron/React, editor state behind injected ports, typed IPC, adapters separate from the domain). New work should preserve them so that extraction is a move, not a rewrite.

## 6. WalkOne Booth: long-term scope (future)
Expected areas: Event Manager · Template Studio · Capture Runtime · Camera Service · Rendering Engine · Print Service · Output / Printer Profiles · Sharing Service (SMS, Email, QR / Gallery, Local sharing) · Session Manager · Recovery Queue · Media Library · Operator Dashboard · Guest Experience · Company Profile · Settings / Security · Event Readiness / Preflight · Booth Health.

**Architecture style:** a clean **modular monolith** (one desktop application with explicit internal module boundaries: Events, Templates, Capture, Camera, Rendering, Printing, Sharing, Media, Settings), not microservices. No distributed system inside a booth workstation without a demonstrated need.

**Platform:** Windows-first runtime (camera SDKs, DNP printer drivers, existing booth hardware, current production environment). iPad/tablet may later suit the guest experience, remote control, a companion display or management; the initial runtime is not designed around iPad limits.

**Offline rule:** capture and printing continue without internet. Sharing jobs (SMS, email, gallery) queue and retry independently of the guest capture flow.

## 7. Migration from dslrBooth
1. **Now:** Template Studio → dslrBooth 7.48 export (6B) and dslrBooth → Template Studio import (6D).
2. **Later:** Template Studio → native WalkOne Booth template/runtime package.
3. **When WalkOne Booth is the primary runtime:** dslrBooth compatibility stays as an **adapter / legacy interoperability feature**, never the internal format. `TemplateProject` is never restructured around dslrBooth.

## 8. Native WalkOne template (future contract, not designed)
The long-term runtime contract should allow: Template Studio source project → production/runtime representation → WalkOne Booth Capture Runtime. The runtime representation may differ from the editable `.boothproject`. Its design belongs to future WalkOne Booth architecture work.

## 9. Users and clients
- **Users of both apps:** the owner/operator, internal staff, and booth attendants where appropriate.
- **Event clients never operate Template Studio or WalkOne Booth** and never get editing access. Later they may interact with proof links, approval requests, comments and approval snapshots.

**Versioned event template (future):** template source → proof → client approval → **approved, immutable event revision** → live event. Later edits never silently change the approved revision.

## 10. Creation workflows: Design Guide + Full Editor
Template Studio will offer two ways to create, producing the same `TemplateProject`:
- **Design Guide** for first-time or occasional users, heavily guided, steps conditional on earlier answers: Print Size → Event Type → Style → Colors → Photos → Logo → Wording → Company Branding → Layout → Review (detail: [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §0, [UX_SPEC.md](UX_SPEC.md) §0).
- **Full Editor**: the existing Canva-style professional canvas editor for power users.

## 11. Company Profile (future, shared)
One company profile used by standalone Template Studio and WalkOne Booth. Possible fields: company name, logo(s) (light/dark), brand colours, preferred fonts, contact information (website, booking number), default SMS/email branding, default export settings, default output profiles, default event/template branding assets. **Company-level configuration stays separate from template source documents; these fields are not added to `TemplateProject`.** A template may *reference* company elements (e.g. "company logo"), resolved from the profile.

## 12. Output Profiles and safe areas (shared; v1 built in Template Studio, ADR-053)
**Template design ≠ printer finishing.** `TemplateProject` stays vendor-neutral; no DNP- or driver-specific fields are added to it. A future Output Profile system may define: profile name, physical media, safe margins, cut positions (e.g. the 2-inch cut), overscan observations, borderless behaviour and setup guidance. Standalone and integrated Template Studio use the same profiles; the automatic safe-area check (owner requirement) reads the active profile. Phase 6C measurements on the DNP printer are the first input. **First observation (6C Stage 1, DNP DS-RX1 on the test laptop):** dslrBooth sends the two-up sheet as one borderless page; the 2-inch cut is a driver setting (`CUT_2INCH`); predicted trim about 1.6–1.8 mm per outer edge, so keep critical content at least 3 mm from strip edges and the cut until the measurement print is read ([../research/PHASE_6C_RESULTS.md](../research/PHASE_6C_RESULTS.md)).
**v1 (2026-11-18, ADR-053):** the vendor-neutral profile format and the safe-area geometry/checks exist as the pure module `src/output/` (no Electron/React), ready for WalkOne Booth to reuse for Event Readiness and print setup. The bundled DS-RX1 profile is provisional (inferred trim, provisional 3 mm). Selection is a per-computer preference in Template Studio; where WalkOne Booth stores shared profiles is still open (§ open questions).

## 13. Sharing and SMS (WalkOne Booth only, future)
A dedicated **SMS module** in WalkOne Booth's Sharing Service. The operator connects an SMS-capable number they **own or control** through a supported provider (never sender spoofing).
```
SharingService → SmsProvider → TwilioProvider
                             → future provider adapters
```
- **Operator configuration:** provider; authenticated account; provider-authorised sending number; default region/country; message template; event/share URL; branding; test message; retry/delivery settings.
- **States:** Not configured · Authentication required · Number not verified · Ready · Queued · Sending · Delivered · Failed.
- **Credentials:** OS-backed secure credential storage only. Never in `TemplateProject`, event template packages, plain JSON or logs.
- **Compliance:** account for provider/carrier requirements (sender registration, opt-out handling, country-specific rules).
- **Offline:** SMS/email jobs queue and retry independently; capture and printing never wait for them.
- **SMS is not part of Template Studio.**

## 14. Event Readiness (approved, high priority, future)
A pre-launch check screen, for example:
```
Camera    ✓ Connected
Printer   ✓ DNP ready   ✓ Correct media/profile
Template  ✓ Valid       ✓ Safe-area check passed
Sharing   ✓ Internet    ✓ Email   ⚠ SMS not configured
Storage   ✓ Sufficient free space
                                   [ Launch Event ]
```

## 15. Booth Health (future)
An event-day dashboard with operator-useful status only: camera, printer, internet, media/storage, print queue, share queue, last capture, errors, reconnect/retry actions, and media/ribbon status where the hardware APIs permit. No technical noise that does not help the operator.

## 16. Two coordinated tracks
**Template Studio track** (continues now): complete 6C validation and fixes → safe-area / output profiles → Design Guide → asset and company-profile improvements → proof / client approval → installer → standalone polish.

**WalkOne Booth track** (only after explicit approval): architecture and shared contracts → Windows shell → Event Manager → native Template Studio integration → template runtime → test capture simulator → Print Service / output profiles → sharing queue → SMS / email / QR → real camera adapters → guest runtime → operator dashboard → migration away from dslrBooth.

## 17. Open questions (to settle before or during WalkOne Booth architecture work)
1. Repository strategy: one monorepo with `apps/` + `packages/`, or separate repositories sharing published packages; when to extract.
2. How the integrated module is embedded: the same Electron renderer inside the booth shell, or a different shell (affects IPC contracts and ports).
3. The native runtime template format and how it is derived from `.boothproject` (and its versioning against `schemaVersion`).
4. Where Company Profile, Output Profiles and event data live (local store / database; ADR-012 SQLite scope) and how standalone Template Studio reads them without the booth installed.
5. How the standalone app gets event context without WalkOne Booth (manual entry, import of an event file).
6. Approval/proof links for clients require a hosted service, which conflicts with v1's no-cloud rule (ADR-006); the mechanism is undecided.
7. Camera SDK choice(s) and the capture runtime's process model on Windows.
8. Whether the layer-package export returns to the Export dialog (withdrawn in ADR-041 §8; listed again in the owner's standalone duties).
9. Licensing/commercial terms of a dslrBooth replacement and of bundled fonts.
