# Asset and Integration Strategy

All **Proposed** unless stated. No integration or asset library exists yet. Related: [DATA_MODEL.md](DATA_MODEL.md), [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md), [DECISIONS.md](DECISIONS.md) ADR-007.

## 1. Local asset library
A user-level library on disk (files) with a metadata index (SQLite candidate — scope OPEN, ADR-012). Works fully offline. Users can save frequently used assets; library assets can be browsed, searched, favorited. Library location configurable; backup/export is a future concern.

## 2. Project-specific assets
Stored inside the project package under `assets/`, content-hashed. Using a library asset copies it into the project (keeps projects portable; see DATA_MODEL §5). Project vs library assets are visibly distinct; "Save to Library" promotes a project asset.

## 3. Asset metadata
Filename, category, tags, dominant colors, event type, project usage, source/provider, license notes, favorite, last used, dimensions, hash, created/imported date. AI auto-tagging: **Future Research**, not required initially.

## 4. File formats
PNG, JPG/JPEG, WebP, SVG; PDF where practical (**Needs Validation** — likely rasterize first page only). Unsupported formats are rejected with a clear message.

## 5. SVG handling
SVG is valuable for recolorable ornaments via palette roles. Needs sanitization (strip scripts/external references), and a defined approach to role binding (e.g., mapping designated fills/classes to roles) — **Future Research**. Export to DSLR Booth will rasterize SVG (assumption: format needs raster; **Needs Validation**).

## 6. Raster handling and resolution
Record pixel dimensions on import; compute effective DPI at placed size; preflight warns below a threshold (e.g., <150 effective DPI warn, <100 error — thresholds **Proposed**, tune with real prints). Never upscale silently. Image processing in the main/worker process (Sharp candidate).

## 7. Transparency
Preserve alpha for PNG/WebP/SVG. Preflight verifies whether the target export supports transparency (**Needs Validation** for DSLR Booth). Background must cover canvas or warn.

## 8. Color extraction
Extract dominant colors from logos/images to suggest palette roles; operator confirms. Algorithm choice is Future Research.

## 9. External services
Current sources used manually by owner: Freepik/Magnific ecosystem and Envato Elements (**Confirmed**: owner uses them today). Whether they offer usable APIs, whether subscription terms permit automation, and what each tier allows are all **Unknown / Needs Validation**. Do not assume any API exists.

## 10. Provider adapter model
```
integrations/
  <provider>/       e.g. magnific/, envato/, future-provider/
```
A provider implements narrow capability interfaces (e.g., `search`, `download`, `generate`, `removeBackground`, `upscale`) — only those validated for that provider. The core depends on interfaces, never on a provider SDK. Providers are optional, registered at runtime, and can be disabled. Credentials are stored via OS-secure storage, never in source or project files.

## 11. Offline behavior and provider failures
The editor, library, and export work without network. Provider calls have timeouts, clear error states, retry where safe, and never block editing. A failed or unavailable provider shows a non-blocking message and the manual import path.

## 12. Licensing concerns
Track `source` and `licenseNote` per asset. Subscription licenses (Envato Elements, Freepik) typically attach to a project/registration; templates distributed to other users or marketplaces may require different licensing — **Needs Validation** with each provider's terms before any commercialization. Never bundle third-party assets in the repo without confirmed rights. Bundled fonts/samples must be license-checked.

## 13. Future provider possibilities (all **Future Research**)
- **Magnific/Freepik:** search, generation, background removal, upscaling, editing — only if API access and terms permit.
- **Envato Elements:** likely a manual download/import workflow (e.g., watched download folder, license tagging) unless an API is validated.
- **Other:** local/offline background removal, image generation providers.

## 14. Background removal, image generation, upscaling
Optional, provider-backed or local-model-backed, always producing a *new* asset (non-destructive) with provenance recorded. Not in early phases.

## 15. Search
Local: metadata + tag + color + usage search. External: provider search surfaced in the asset browser as a separate tab, never mixed silently with local assets.

## 16. Manual download/import fallback
Always supported: drag-and-drop files or folder import, with a quick metadata dialog (category, tags, source, license note). This is the baseline workflow for every external service.
