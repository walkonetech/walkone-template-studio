# Phase 3B editor validation (scripted)

`validate.js` drives the **built** Electron app over the DevTools protocol (`--remote-debugging-port=9350`) with **real mouse and keyboard events** against the production editor (the `#debug` hash installs `window.__wts`, which exposes in-renderer objects only). It is automation, not hand-testing by a person.

Run: `npm run build`; launch `WALKONE_DEV_SAVE_PATH=<tmp>/V.boothproject WALKONE_DEV_OPEN_PATH=<same> npx electron out/main/index.js --remote-debugging-port=9350 --user-data-dir=<tmp>/ud`; then `node research/editor-validation/validate.js`. Native dialogs are answered by the dev-only env overrides (ignored by packaged builds). `results.json` is the recorded macOS run (53/53). Screenshots go to a git-ignored `shots/` folder.
