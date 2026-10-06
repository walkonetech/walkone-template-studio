# Canvas spike driver scripts (Phase 3A evidence)

Node scripts that drive the **built** Electron app over the DevTools protocol (`--remote-debugging-port=9340`) using real mouse events, against the spike harness (`#canvas-spike`). They require the dual-engine spike (Fabric + Konva), which exists in git history at commit `2349f7f`; the following cleanup commit removed the Fabric engine, so these scripts only run in full at that commit. Result files here are the recorded output from the macOS run summarized in `../CANVAS_LIBRARY_EVALUATION.md`.

Usage (from the commit that has both engines): `npm run build`, launch `npx electron out/main/index.js --remote-debugging-port=9340 --user-data-dir=<tmp>`, then `node research/canvas-spike/run.js` (selection, drag, resize, rotate, off-canvas, z-order, lock, export), `run2.js` (group, text, snapping, remount, performance), `run3.js` (edge-pixel probes).
