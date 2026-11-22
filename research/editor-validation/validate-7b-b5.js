// Phase 7B B5 scripted validation (automation over the DevTools protocol, NOT human testing): the editor experience
// in the BUILT app. Contextual selection toolbar (actions per selection type, Duplicate, photo number, Event Palette
// dots, hidden in Print Preview / for locked layers / when switched off, contained at 1920×1000, 1426×779 and
// 1087×643); Properties (pinned header, Essentials for text and photo slots, sections closed with summaries, opening a
// section never edits the project, mixed values for several layers, short-height scrolling); Settings (Ctrl/⌘+, and
// File › Settings…, Theme, Button and text size, Interface scale without page zoom, Editor switches, persistence
// across a restart, project untouched); getting-started tips (new blank project only, Hide these tips, stays hidden,
// Settings restores them, not on an imported project); recent cards (format drawn, search, missing file + Locate…);
// the new-text default font (Arial, no missing-font check; saved and imported fonts unchanged); Dark + Compact + 125 %;
// no Sample Photos anywhere; owner screenshots. Uses the committed synthetic dslrBooth fixture; no private fixtures.
// B5.1 adds: Settings focus return (Ctrl/⌘+, → the control that had focus; File › Settings… → the File menu button),
// Locate… → Cancel leaves the missing card, Locate… reconnects that card (one card, reopens), DPR checked within a
// small float tolerance (tolerance.js). Results are written Prettier-formatted (results-writer.js).
// Run: npm run build && node research/editor-validation/validate-7b-b5.js
const fs = require('fs')
const path = require('path')
const { writeResults } = require('./results-writer')
const { dprIs } = require('./tolerance')
const h = require('./harness')
const cdp = require('./cdp')
const { sleep } = h

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
const errors = []
cdp.onEvent = (m) => {
  if (m.method === 'Runtime.exceptionThrown')
    errors.push(
      String(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
      ).slice(0, 300)
    )
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errors.push(
      m.params.args
        .map((a) => a.value ?? a.description)
        .join(' ')
        .slice(0, 300)
    )
}
const shotsDir = path.join(__dirname, 'shots')
fs.mkdirSync(shotsDir, { recursive: true })
const J = (c) => async (expr) => JSON.parse(await c.ev(`JSON.stringify(${expr})`))
const waitFor = async (c, expr, ms = 20000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const S = `__wts.store.getState()`
const PORT = 9631
const LIVE_TEXT = path.join(
  h.root,
  'tests',
  'fixtures',
  'dslrbooth',
  'synthetic',
  'live-text-fixture.zip'
)
const SAMPLE_WORDS = /sample photo|shuffle|reset samples|choose photo|reposition/i

const size = async (c, width, height) => {
  await c.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(500)
}
const shot = async (c, name) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  await sleep(300)
  await c.shot(path.join(shotsDir, `7b-b5-${name}.png`))
}
const escape = (c) => c.key('Escape', { code: 'Escape', vk: 27 })
const doc = (c) =>
  J(c)(
    `(()=>{const s=${S}; return {dirty:s.project!==null&&s.project!==s.savedProject, past:s.history.past.length, json:JSON.stringify(s.project)}})()`
  )
const centre = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`
  )
/** A real pointer click on the element (mouse events through the browser, like a user). */
const realClick = async (c, sel) => {
  const p = await centre(c, sel)
  if (!p) return false
  await c.click(p)
  await sleep(200)
  return true
}
const tb = (c) =>
  J(c)(
    `(()=>{const t=document.querySelector('[data-testid=selection-toolbar]'); if(!t) return null; const r=t.getBoundingClientRect(), hst=document.querySelector('.canvas-host').getBoundingClientRect();
      return {kind:t.dataset.kind, side:t.dataset.side, words:[...t.querySelectorAll('.seltb-item')].map(i=>{const b=i.querySelector('[data-action]'); return b?(b.getAttribute('aria-label')||b.textContent.trim()):''}), actions:[...t.querySelectorAll('[data-action]')].map(b=>b.dataset.action),
        inside:r.left>=hst.left-0.5&&r.top>=hst.top-0.5&&r.right<=hst.right+0.5&&r.bottom<=hst.bottom+0.5, visible:t.style.visibility!=='hidden', w:Math.round(r.width), h:Math.round(r.height)}})()`
  )
const props = (c) =>
  J(c)(
    `(()=>{const p=document.querySelector('.inspector-panel'); if(!p) return null; const e=p.querySelector('[data-essentials]'); const hd=p.querySelector('[data-testid=properties-header]');
      return {head:hd?hd.textContent.trim():null, essentials:e?e.dataset.essentials:null, labels:e?[...e.querySelectorAll('.field-row > label, .essentials-label, .checkbox-row label')].map(l=>l.textContent.trim()):[],
        sections:[...p.querySelectorAll('.psection')].map(s=>({id:s.dataset.section, title:s.querySelector('.psection-title')?.textContent, open:s.querySelector('.psection-toggle').getAttribute('aria-expanded')==='true', summary:s.querySelector('.psection-summary')?.textContent??null}))}})()`
  )
const noHScroll = (c) => c.ev(`document.documentElement.scrollWidth <= innerWidth`)
const newBlankStrip = async (c) => {
  await c.ev(
    `document.getElementById('start-blank') ? document.getElementById('start-blank').click() : 0; 1`
  )
  if (!(await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 3000))) {
    // From the editor: File › New project…
    await c.key('n', { code: 'KeyN', vk: 78, modifiers: h.MOD_BIT })
    await waitFor(c, `!!document.querySelector('[data-testid=new-project-dialog]')`, 5000)
  }
  await c.ev(
    `[...document.querySelectorAll('[data-testid=new-project-dialog] [role=radio]')].find(b=>/2×6/.test(b.textContent)).click(); 1`
  )
  await sleep(150)
  await c.ev(
    `[...document.querySelectorAll('[data-testid=new-project-dialog] footer button')].find(b=>b.textContent.trim()==='Create').click(); 1`
  )
  await waitFor(c, `!!${S}.project && !document.querySelector('[data-testid=new-project-dialog]')`)
  await sleep(600)
}
const openSettings = async (c) => {
  await c.key(',', { code: 'Comma', vk: 188, modifiers: h.MOD_BIT })
  await waitFor(c, `!!document.querySelector('[data-testid=settings-dialog]')`, 4000)
  await sleep(200)
}
const settingsPage = async (c, page) => {
  await realClick(c, `.settings-nav-item[data-page="${page}"]`)
  await sleep(150)
}

;(async () => {
  const work = h.tmpDir('wts-7b-b5-')
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'B5 Editor.boothproject')
  const movedPath = path.join(work, 'moved', 'B5 Editor.boothproject')
  fs.mkdirSync(path.dirname(movedPath), { recursive: true })
  const env = {
    WALKONE_DEV_UNSAVED_CHOICES: 'discard',
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_IMPORT_DSLR_PATH: LIVE_TEXT
  }
  let { proc, c } = await h.launch({ port: PORT, userData: ud, env, size: h.STANDARD_SIZE })
  let appearanceBefore = null
  try {
    await size(c, 1920, 1000)
    // ================================================================ NEW BLANK PROJECT + TIPS
    await newBlankStrip(c)
    const tips0 = await J(c)(
      `(()=>{const t=document.querySelector('[data-testid=first-run-tips]'); if(!t) return null; const r=t.getBoundingClientRect(), hst=document.querySelector('.canvas-host').getBoundingClientRect(); return {steps:[...t.querySelectorAll('.first-run-step')].map(s=>s.dataset.step), inside:r.left>=hst.left&&r.right<=hst.right&&r.top>=hst.top&&r.bottom<=hst.bottom, placement:t.dataset.placement, hide:!!t.querySelector('[data-testid=hide-tips]'), modal:!!t.closest('[aria-modal=true]')}})()`
    )
    const fresh = await doc(c)
    check(
      '15 a new blank project shows the getting-started tips beside the artboard (three steps, Hide these tips, not modal, inside the canvas area)',
      tips0 &&
        tips0.steps.join() === 'photo,text,colors' &&
        tips0.inside &&
        tips0.placement === 'beside' &&
        tips0.hide &&
        !tips0.modal &&
        fresh.past === 0,
      tips0
    )
    await shot(c, '01-first-run-tips')
    // A step's button does the thing (one history entry); the tips themselves never change the project.
    await realClick(c, '[data-tip-action="photo"]')
    await sleep(300)
    const afterTip = await J(c)(
      `({photos:${S}.project.layers.filter(l=>l.type==='photo').length, past:${S}.history.past.length, done:document.querySelector('.first-run-step[data-step=photo]')?.dataset.done??null})`
    )
    check(
      '15b a tip step’s button does exactly that step (Add photo slot: one slot, one history entry) and ticks itself off',
      afterTip.photos === 1 && afterTip.past === 1 && afterTip.done === 'true',
      afterTip
    )
    for (let i = 0; i < 2; i++) await c.ev(`${S}.addNewLayer('photo'); 1`)
    await c.ev(`${S}.addNewLayer('text'); 1`)
    await sleep(500)
    // ================================================================ DEFAULT FONT
    const textId = await c.ev(`${S}.project.layers.find(l=>l.type==='text').id`)
    const fontNew = await J(c)(
      `({family:${S}.project.layers.find(l=>l.id===${JSON.stringify(textId)}).fontFamily, alert:!!document.querySelector('[data-testid=font-missing]'), checks:document.getElementById('checks-button').dataset.state})`
    )
    check(
      '21 new text asks for the cross-platform default font (Arial)',
      fontNew.family === 'Arial',
      fontNew
    )
    check(
      '22 a brand-new text raises no missing-font check (no Properties alert; the Checks button stays Ready)',
      !fontNew.alert && fontNew.checks === 'Ready',
      fontNew
    )
    // The new default renders and exports like any installed font: the exact render (the export path) draws its ink.
    const ink = JSON.parse(
      await c.ev(
        `(async()=>{const l=${S}.project.layers.find(x=>x.id===${JSON.stringify(textId)}); const r=await __wts.renderToDataUrl(); const img=new Image(); img.src=r.dataUrl; await img.decode(); const cv=document.createElement('canvas'); cv.width=r.width; cv.height=r.height; const g=cv.getContext('2d'); g.drawImage(img,0,0); const d=g.getImageData(Math.round(l.x),Math.round(l.y),Math.round(l.width),Math.round(l.height)).data; let n=0; for(let i=0;i<d.length;i+=4){ if(d[i]<60&&d[i+1]<60&&d[i+2]<60) n++ } return JSON.stringify({n, arial:document.fonts.check('16px Arial')})})()`
      )
    )
    check(
      '21b the new default font is installed and the exact render (the export path) draws the new text',
      ink.n > 200 && ink.arial,
      ink
    )
    // ================================================================ SELECTION TOOLBAR
    await c.ev(`${S}.selectLayer(${JSON.stringify(textId)}); 1`)
    await sleep(400)
    const tText = await tb(c)
    check(
      '1 selecting a layer shows the contextual toolbar next to it, inside the canvas area',
      tText && tText.visible && tText.inside && tText.side === 'top',
      tText
    )
    check(
      '2 text actions in words: Edit text · Event colors… (no palette yet) · Arrange · Duplicate · More',
      tText &&
        tText.actions.join() === 'edit-text,colors,arrange,duplicate,more' &&
        tText.words.slice(0, 4).join('|') === 'Edit text|Event colors…|Arrange|Duplicate',
      tText?.words
    )
    await shot(c, '02-text-toolbar-properties')
    // Duplicate through the toolbar = the existing Duplicate (one history step, same size and font, selected copy).
    const beforeDup = await doc(c)
    await realClick(c, '[data-testid=selection-toolbar] [data-action=duplicate]')
    await sleep(400)
    const dup = await J(c)(
      `(()=>{const s=${S}; const src=s.project.layers.find(l=>l.id===${JSON.stringify(textId)}); const sel=s.project.layers.find(l=>l.id===s.selectedIds[0]); return {n:s.project.layers.length, past:s.history.past.length, sel:s.selectedIds.length, same:sel&&sel.id!==src.id&&sel.width===src.width&&sel.height===src.height&&sel.fontFamily===src.fontFamily&&sel.content===src.content, top:s.project.layers.filter(l=>!l.parentId).sort((a,b)=>b.zIndex-a.zIndex)[0].id===sel.id}})()`
    )
    check(
      '2b Duplicate in the toolbar is the existing Duplicate: one new layer on top, same size and font, selected, one history step',
      dup.n === JSON.parse(beforeDup.json).layers.length + 1 &&
        dup.past === beforeDup.past + 1 &&
        dup.sel === 1 &&
        dup.same &&
        dup.top,
      dup
    )
    await c.ev(`${S}.undo(); ${S}.selectLayer(${JSON.stringify(textId)}); 1`)
    await sleep(300)
    // Event Palette dots: the real palette; a dot links the text colour.
    const gold = await c.ev(`${S}.addPaletteColor({role:'accent', name:'Gold', value:'#b39b74'})`)
    await c.ev(`${S}.addPaletteColor({role:'text', name:'Ink', value:'#1f2430'}); 1`)
    await c.ev(`${S}.selectLayer(${JSON.stringify(textId)}); 1`)
    await sleep(300)
    const dots = await J(c)(
      `[...document.querySelectorAll('[data-testid=selection-toolbar] .seltb-dot')].map(d=>d.getAttribute('aria-label'))`
    )
    await realClick(c, `[data-testid=selection-toolbar] .seltb-dot[aria-label^="Gold"]`)
    await sleep(300)
    const linked = await J(c)(
      `({fill:${S}.project.layers.find(l=>l.id===${JSON.stringify(textId)}).fill, checked:document.querySelector('[data-testid=selection-toolbar] .seltb-dot[aria-label^="Gold"]')?.getAttribute('aria-checked')})`
    )
    check(
      '2c Event Palette dots are the project’s real palette colours; a dot links the text colour to that palette entry',
      dots.length === 2 &&
        /^Gold/.test(dots[0]) &&
        linked.fill.kind === 'palette' &&
        linked.fill.paletteColorId === gold &&
        linked.checked === 'true',
      { dots, linked }
    )
    // Photo slot: Photo number stepper · Frame · Arrange · Duplicate · More.
    const photoIds = await J(c)(`${S}.project.layers.filter(l=>l.type==='photo').map(l=>l.id)`)
    await c.ev(`${S}.selectLayer(${JSON.stringify(photoIds[1])}); 1`)
    await sleep(400)
    const tPhoto = await tb(c)
    const pBefore = await c.ev(
      `${S}.project.layers.find(l=>l.id===${JSON.stringify(photoIds[1])}).photoNumber`
    )
    await realClick(c, '[data-testid=selection-toolbar] [aria-label="Next photo number"]')
    await sleep(300)
    const pAfter = await c.ev(
      `${S}.project.layers.find(l=>l.id===${JSON.stringify(photoIds[1])}).photoNumber`
    )
    check(
      '2d photo slot actions: Photo number (− n +) · Frame · Arrange · Duplicate · More; + changes the slot’s photo number',
      tPhoto &&
        tPhoto.actions.join() === 'photo-number,frame,arrange,duplicate,more' &&
        pAfter === pBefore + 1,
      { actions: tPhoto?.actions, pBefore, pAfter }
    )
    await c.ev(`${S}.undo(); 1`)
    await sleep(200)
    await shot(c, '03-photo-toolbar-properties')
    // Several layers: Align · Group · Arrange · Duplicate · More.
    await c.ev(
      `${S}.selectLayer(${JSON.stringify(photoIds[0])}); ${S}.toggleSelection(${JSON.stringify(photoIds[1])}); 1`
    )
    await sleep(400)
    const tMulti = await tb(c)
    await realClick(c, '[data-testid=selection-toolbar] [data-action=align]')
    await sleep(300)
    const alignPop = await c.ev(
      `!!document.querySelector('[data-testid=toolbar-align] [aria-label="Align left"]')`
    )
    await escape(c)
    await sleep(200)
    check(
      '2e several layers: Align (align/distribute popover) · Group · Arrange · Duplicate · More',
      tMulti && tMulti.actions.join() === 'align,group,arrange,duplicate,more' && alignPop,
      { actions: tMulti?.actions, alignPop }
    )
    await shot(c, '04-multi-toolbar-properties')
    // Arrange menu runs the existing stacking commands.
    await c.ev(`${S}.selectLayer(${JSON.stringify(photoIds[0])}); 1`)
    await sleep(300)
    await realClick(c, '[data-testid=selection-toolbar] [data-action=arrange]')
    await sleep(250)
    const arrangeItems = await J(c)(
      `[...document.querySelectorAll('[role=menu] .ui-menuitem .grow')].map(e=>e.textContent)`
    )
    await c.ev(
      `[...document.querySelectorAll('[role=menu] .ui-menuitem')].find(b=>b.textContent.includes('Bring to front')).click(); 1`
    )
    await sleep(300)
    const onTop = await c.ev(
      `(()=>{const t=${S}.project.layers.filter(l=>!l.parentId).sort((a,b)=>b.zIndex-a.zIndex)[0]; return t.id===${JSON.stringify(photoIds[0])}})()`
    )
    check(
      '2f Arrange offers the four stacking commands and Bring to front puts the slot on top',
      arrangeItems.join('|') === 'Bring to front|Bring forward|Send backward|Send to back' && onTop,
      arrangeItems
    )
    await c.ev(`${S}.undo(); 1`)
    // Hidden in Print Preview, for a locked layer, and when switched off.
    await c.ev(`${S}.setViewMode('preview'); 1`)
    await sleep(400)
    const inPreview = await c.ev(`!!document.querySelector('[data-testid=selection-toolbar]')`)
    await c.ev(`${S}.setViewMode('design'); 1`)
    await sleep(400)
    check('3 the toolbar never appears in Print Preview', !inPreview)
    await c.ev(
      `${S}.editLayers([${JSON.stringify(photoIds[2])}], {locked:true}); ${S}.selectLayer(${JSON.stringify(photoIds[2])}); 1`
    )
    await sleep(300)
    const lockedTb = await c.ev(`!!document.querySelector('[data-testid=selection-toolbar]')`)
    const lockedNote = await c.ev(
      `/This layer is locked/.test(document.querySelector('.inspector-panel').textContent)`
    )
    await c.ev(`${S}.undo(); 1`)
    check(
      '3b a locked layer gets no toolbar (Properties says it is locked instead)',
      !lockedTb && lockedNote,
      { lockedTb, lockedNote }
    )
    // ================================================================ PROPERTIES
    await c.ev(`${S}.selectLayer(${JSON.stringify(textId)}); 1`)
    await sleep(300)
    const pText = await props(c)
    check(
      '5 text Properties: pinned header (name + kind), Essentials Content · Font · Style · Color · Align, then closed sections with summaries',
      pText &&
        /Text/.test(pText.head) &&
        pText.essentials === 'text' &&
        ['Content', 'Font', 'Style', 'Color', 'Align'].every((l) => pText.labels.includes(l)) &&
        pText.sections.map((s) => s.title).join('|') ===
          'Position & size|Spacing & box|Appearance|Align to canvas|Layer' &&
        pText.sections.every((s) => !s.open) &&
        /^X \d+ · Y \d+ · \d+ × \d+$/.test(pText.sections[0].summary) &&
        /^Line [\d.]+ · Letter [\d.]+$/.test(pText.sections[1].summary),
      pText
    )
    await c.ev(`${S}.selectLayer(${JSON.stringify(photoIds[0])}); 1`)
    await sleep(300)
    const pPhoto = await props(c)
    const fitRadios = await J(c)(
      `[...document.querySelectorAll('.inspector-panel [role=radiogroup][aria-label="Photo fit"] [role=radio]')].map(b=>b.textContent+':'+b.getAttribute('aria-checked'))`
    )
    check(
      '6 photo slot Properties: header "Photo slot #n"; Essentials Photo number · Fit (Cover/Contain/Stretch) · Frame · Corner radius; no sample section',
      pPhoto &&
        /Photo slot #\d/.test(pPhoto.head) &&
        pPhoto.essentials === 'photo' &&
        ['Photo number', 'Fit', 'Frame'].every((l) => pPhoto.labels.includes(l)) &&
        pPhoto.labels.some((l) => /Corner radius/.test(l)) &&
        fitRadios.join() === 'Cover:true,Contain:false,Stretch:false' &&
        pPhoto.sections.some((s) => s.id === 'frame-details') &&
        !SAMPLE_WORDS.test(JSON.stringify(pPhoto)),
      { pPhoto, fitRadios }
    )
    // Fit through the segmented control: one history step.
    const fitBefore = await doc(c)
    await realClick(
      c,
      '.inspector-panel [role=radiogroup][aria-label="Photo fit"] [role=radio]:nth-child(2)'
    )
    const fitAfter = await J(c)(
      `({fit:${S}.project.layers.find(l=>l.id===${JSON.stringify(photoIds[0])}).fit, past:${S}.history.past.length})`
    )
    check(
      '6b Fit → Contain is a real slot property edit (one history step)',
      fitAfter.fit === 'contain' && fitAfter.past === fitBefore.past + 1,
      fitAfter
    )
    await c.ev(`${S}.undo(); 1`)
    await sleep(200)
    // Opening and closing a section: values shown, nothing edited.
    const beforeToggle = await doc(c)
    await realClick(c, '.inspector-panel [data-section=position] .psection-toggle')
    const opened = await J(c)(
      `({open:document.querySelector('.inspector-panel [data-section=position] .psection-toggle').getAttribute('aria-expanded'), x:!!document.querySelector('.inspector-panel [data-section=position] input')})`
    )
    await realClick(c, '.inspector-panel [data-section=position] .psection-toggle')
    const closed = await c.ev(
      `document.querySelector('.inspector-panel [data-section=position] .psection-toggle').getAttribute('aria-expanded')`
    )
    const afterToggle = await doc(c)
    check(
      '7 a section opens (its fields appear) and closes again',
      opened.open === 'true' && opened.x && closed === 'false',
      { opened, closed }
    )
    check(
      '8 opening or closing a section never edits the project (no Modified change, no history entry)',
      afterToggle.json === beforeToggle.json &&
        afterToggle.past === beforeToggle.past &&
        afterToggle.dirty === beforeToggle.dirty
    )
    // The summary follows the values.
    await c.ev(`${S}.editLayers([${JSON.stringify(photoIds[0])}], {x:321}); 1`)
    await sleep(200)
    const sum = await c.ev(
      `document.querySelector('.inspector-panel [data-section=position] .psection-summary').textContent`
    )
    check(
      '8b a closed section’s summary follows the values ("X 321 · …")',
      /^X 321 · /.test(sum),
      sum
    )
    await c.ev(`${S}.undo(); 1`)
    // Several layers: count, kinds, mixed opacity.
    await c.ev(
      `${S}.editLayers([${JSON.stringify(photoIds[1])}], {opacity:0.5}); ${S}.selectLayer(${JSON.stringify(photoIds[0])}); ${S}.toggleSelection(${JSON.stringify(photoIds[1])}); 1`
    )
    await sleep(300)
    const pMulti = await J(c)(
      `({head:document.querySelector('[data-testid=properties-header]').textContent, opacity:(()=>{const l=[...document.querySelectorAll('.inspector-panel label')].find(x=>/Opacity/.test(x.textContent)); const i=l&&document.getElementById(l.htmlFor); return i?{value:i.value, placeholder:i.placeholder}:null})()})`
    )
    check(
      '8c several layers: "2 layers selected · 2 photo slots"; different opacities show Mixed, not one misleading value',
      /2 layers selected/.test(pMulti.head) &&
        /2 photo slots/.test(pMulti.head) &&
        pMulti.opacity &&
        pMulti.opacity.value === '' &&
        pMulti.opacity.placeholder === 'Mixed',
      pMulti
    )
    await c.ev(`${S}.undo(); 1`)
    // ================================================================ WINDOWS TARGET + MINIMUM
    for (const [w, ht, name] of [
      [1426, 779, 'windows'],
      [1087, 643, 'minimum']
    ]) {
      await size(c, w, ht)
      await c.ev(`${S}.selectLayer(${JSON.stringify(textId)}); 1`)
      await sleep(400)
      await h.showPanel(c, 'properties')
      const t = await tb(c)
      // A layer at the very top of the strip: the toolbar must still stay inside the canvas area.
      await c.ev(
        `${S}.editLayers([${JSON.stringify(photoIds[0])}], {y:0}); ${S}.selectLayer(${JSON.stringify(photoIds[0])}); 1`
      )
      await sleep(400)
      const tTop = await tb(c)
      await c.ev(`${S}.undo(); ${S}.selectLayer(${JSON.stringify(textId)}); 1`)
      await sleep(300)
      check(
        `4 toolbar contained at ${w}×${ht} (${name}), also for a layer at the very top edge; no horizontal scroll`,
        t && t.inside && tTop && tTop.inside && (await noHScroll(c)),
        { t, tTop }
      )
      // Properties at short height: header pinned, body scrolls, the last section reachable above the status bar.
      const shortP = await J(c)(
        `(()=>{const b=document.querySelector('.inspector-body'); const hd=document.querySelector('[data-testid=properties-header]').getBoundingClientRect(); const sb=document.querySelector('.statusbar').getBoundingClientRect(); const last=[...document.querySelectorAll('.inspector-panel .psection-toggle')].pop(); last.scrollIntoView({block:'nearest'}); const lr=last.getBoundingClientRect(); const top=document.elementFromPoint(lr.left+lr.width/2, lr.top+lr.height/2);
          return {scrolls:getComputedStyle(b).overflowY, headVisible:hd.top>=0&&hd.bottom<=sb.top, lastVisible:lr.bottom<=sb.top+0.5&&lr.top>=0, lastHit:!!top&&last.contains(top)}})()`
      )
      check(
        `25 Properties usable at ${w}×${ht}: header pinned, body scrolls, the last section reachable above the status bar`,
        shortP.scrolls === 'auto' && shortP.headVisible && shortP.lastVisible && shortP.lastHit,
        shortP
      )
      if (name === 'windows') {
        await shot(c, '05-text-1426x779')
        await c.ev(`${S}.selectLayer(${JSON.stringify(photoIds[1])}); 1`)
        await sleep(300)
        await shot(c, '06-photo-1426x779')
      } else await shot(c, '07-text-1087x643')
    }
    await size(c, 1920, 1000)
    // ================================================================ SETTINGS
    const projBefore = await doc(c)
    appearanceBefore = await J(c)(
      `({theme:document.documentElement.dataset.theme, density:document.documentElement.dataset.density, scale:document.documentElement.style.getPropertyValue('--ui-scale'), iw:innerWidth, zoom:document.documentElement.style.zoom||document.body.style.zoom||''})`
    )
    await openSettings(c)
    const sOpen = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=settings-dialog]'); return d?{title:d.querySelector('h2').textContent, desc:d.querySelector('.desc')?.textContent, pages:[...d.querySelectorAll('.settings-nav-item')].map(b=>b.textContent.trim()), current:d.querySelector('.settings-nav-item[aria-current=page]')?.dataset.page, themes:[...d.querySelectorAll('.theme-card')].map(b=>b.textContent.trim()), done:!!d.querySelector('#settings-done')}:null})()`
    )
    check(
      '9 Ctrl/⌘+, opens Settings (this computer, never stored in a project): Appearance · Printing · Editor',
      sOpen &&
        sOpen.title === 'Settings' &&
        /never stored in a project/.test(sOpen.desc) &&
        sOpen.pages.join('|') === 'Appearance|Printing|Editor' &&
        sOpen.current === 'appearance' &&
        sOpen.themes.length === 3 &&
        sOpen.done,
      sOpen
    )
    await shot(c, '08-settings-appearance')
    await realClick(c, '.theme-card[data-theme-card="dark"]')
    const dark = await c.ev(`document.documentElement.dataset.theme`)
    check('10 Theme → Dark applies right away', dark === 'dark', dark)
    await realClick(
      c,
      '[role=radiogroup][aria-label="Button and text size"] [role=radio]:nth-child(2)'
    )
    const compact = await c.ev(`document.documentElement.dataset.density`)
    check('11 Button and text size → Compact applies right away', compact === 'compact', compact)
    await realClick(c, '[role=radiogroup][aria-label="Interface scale"] [role=radio]:nth-child(4)')
    await sleep(300)
    const scaled = await J(c)(
      `({scale:document.documentElement.style.getPropertyValue('--ui-scale'), iw:innerWidth, zoom:document.documentElement.style.zoom||document.body.style.zoom||'', dpr:devicePixelRatio, topbar:Math.round(document.querySelector('.topbar').getBoundingClientRect().height)})`
    )
    check(
      '12 Interface scale → 125 % scales the interface through the app’s own scale, not page zoom (window width and zoom unchanged; DPR 1 within the harness tolerance)',
      scaled.scale === '1.25' &&
        scaled.iw === appearanceBefore.iw &&
        scaled.zoom === '' &&
        dprIs(scaled.dpr, 1),
      scaled
    )
    await shot(c, '09-settings-dark-compact-125')
    await settingsPage(c, 'printing')
    const printing = await c.ev(`!!document.querySelector('[data-testid=settings-printer]')`)
    await settingsPage(c, 'editor')
    const editorPage = await J(c)(
      `[...document.querySelectorAll('[data-testid=settings-dialog] [role=switch]')].map(s=>s.getAttribute('aria-label')+':'+s.getAttribute('aria-checked'))`
    )
    check(
      '9b Printing shows this computer’s printer; Editor has the Selection toolbar and getting-started tips switches',
      printing &&
        editorPage.join('|') ===
          'Selection toolbar:true|Show getting-started tips for new blank projects:true',
      { printing, editorPage }
    )
    await shot(c, '10-settings-editor')
    // Switch the toolbar off: it disappears; back on.
    await realClick(
      c,
      '[data-testid=settings-dialog] [role=switch][aria-label="Selection toolbar"]'
    )
    await escape(c)
    await sleep(300)
    await c.ev(`${S}.selectLayer(${JSON.stringify(textId)}); 1`)
    await sleep(300)
    const offTb = await c.ev(`!!document.querySelector('[data-testid=selection-toolbar]')`)
    const settingsClosed = await c.ev(`!document.querySelector('[data-testid=settings-dialog]')`)
    check(
      '9c Escape closes Settings; Selection toolbar off hides the toolbar',
      settingsClosed && !offTb,
      { settingsClosed, offTb }
    )
    // B5.1: where focus goes when Settings closes. Ctrl/⌘+, from a button returns to that button; File › Settings…
    // returns to the File menu button (the menu item itself is gone), never <body>, no tooltip, menu not reopened.
    const focusState = (c) =>
      J(c)(
        `({id:document.activeElement&&document.activeElement.id, menu:document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.menuId||null, body:document.activeElement===document.body, menus:document.querySelectorAll('[role=menu]').length, tips:document.querySelectorAll('[role=tooltip]').length, dialog:!!document.querySelector('[data-testid=settings-dialog]')})`
      )
    await c.ev(`document.getElementById('checks-button').focus(); 1`)
    await openSettings(c)
    await escape(c)
    await sleep(300)
    const viaKey = await focusState(c)
    check(
      'B5.1-1 Ctrl/⌘+, → Escape returns focus to the control that had it (Checks button), no tooltip',
      !viaKey.dialog && viaKey.id === 'checks-button' && viaKey.tips === 0,
      viaKey
    )
    const viaMenu = []
    for (const closeWith of ['escape', 'done']) {
      await realClick(c, '.menubar-btn[data-menu-id="file"]')
      await sleep(250)
      await c.ev(
        `(()=>{const b=[...document.querySelectorAll('.ui-menuitem')].find(b=>/^Settings…/.test(b.textContent.trim())); b&&b.setAttribute('data-b51','settings'); return 1})()`
      )
      await realClick(c, '[data-b51="settings"]')
      await waitFor(c, `!!document.querySelector('[data-testid=settings-dialog]')`, 4000)
      await sleep(200)
      if (closeWith === 'escape') await escape(c)
      else await c.ev(`document.getElementById('settings-done').click(); 1`)
      await sleep(400)
      viaMenu.push({ closeWith, ...(await focusState(c)) })
    }
    check(
      'B5.1-2 File › Settings… → Escape or Done returns focus to the File menu button (not the page), no tooltip, menu not reopened',
      viaMenu.every(
        (v) => !v.dialog && v.menu === 'file' && !v.body && v.menus === 0 && v.tips === 0
      ),
      viaMenu
    )
    // Dark + Compact + 125 % at the Windows target: toolbar contained, Properties usable, no horizontal scroll.
    await size(c, 1426, 779)
    await openSettings(c)
    await settingsPage(c, 'editor')
    await realClick(
      c,
      '[data-testid=settings-dialog] [role=switch][aria-label="Selection toolbar"]'
    )
    const footer = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=settings-dialog]').getBoundingClientRect(); const b=document.getElementById('settings-done').getBoundingClientRect(); return {inView:b.bottom<=innerHeight&&b.top>=0&&d.bottom<=innerHeight, sw:document.documentElement.scrollWidth<=innerWidth}})()`
    )
    await realClick(c, '#settings-done')
    await sleep(300)
    await c.ev(`${S}.selectLayer(${JSON.stringify(textId)}); 1`)
    await sleep(400)
    await h.showPanel(c, 'properties')
    const dc = await tb(c)
    const dcProps = await J(c)(
      `(()=>{const hd=document.querySelector('[data-testid=properties-header]').getBoundingClientRect(); return {head:hd.top>=0&&hd.bottom<=innerHeight, sw:document.documentElement.scrollWidth<=innerWidth}})()`
    )
    check(
      '26 Dark + Compact + 125 % at 1426×779: Settings footer visible, toolbar contained, Properties header visible, no horizontal scroll',
      footer.inView && footer.sw && dc && dc.inside && dcProps.head && dcProps.sw,
      { footer, dc, dcProps }
    )
    await shot(c, '11-dark-compact-125-1426x779')
    const projAfter = await doc(c)
    check(
      '14 Settings never touch the project (same content, same history, same Saved/Modified state)',
      projAfter.json === projBefore.json &&
        projAfter.past === projBefore.past &&
        projAfter.dirty === projBefore.dirty
    )
    // ================================================================ SAVE (old-default font) + RESTART
    // A text that asks for Helvetica (the pre-B5 default) must keep it after save and reopen.
    await c.ev(`${S}.editLayers([${JSON.stringify(textId)}], {fontFamily:'Helvetica'}); 1`)
    await c.ev(`${S}.save().then(()=>1)`)
    await waitFor(c, `${S}.project===${S}.savedProject`, 8000)
  } finally {
    c.close()
    await h.kill(proc)
  }

  // ================================================================ RESTART: settings persisted; recents; Locate
  ;({ proc, c } = await h.launch({
    port: PORT + 1,
    userData: ud,
    env,
    size: h.STANDARD_SIZE
  }))
  try {
    await size(c, 1920, 1000)
    await waitFor(c, `!!document.getElementById('open-project')`, 8000)
    const persisted = await J(c)(
      `({theme:document.documentElement.dataset.theme, density:document.documentElement.dataset.density, scale:document.documentElement.style.getPropertyValue('--ui-scale')})`
    )
    check(
      '13 Settings persist across a restart (Dark, Compact, 125 %), as settings of this computer',
      persisted.theme === 'dark' && persisted.density === 'compact' && persisted.scale === '1.25',
      persisted
    )
    const savedFile = fs.readFileSync(savePath, 'utf8')
    check(
      '13b the saved .boothproject holds no Settings (theme, density, scale, tips, toolbar)',
      !/"(theme|density|uiScale|showGettingStartedTips|showSelectionToolbar)"/.test(savedFile)
    )
    // Back to Light, Comfortable, 100 % from the Start screen's Settings button.
    await realClick(c, '#start-settings')
    await waitFor(c, `!!document.querySelector('[data-testid=settings-dialog]')`, 4000)
    await realClick(c, '.theme-card[data-theme-card="light"]')
    await realClick(
      c,
      '[role=radiogroup][aria-label="Button and text size"] [role=radio]:nth-child(1)'
    )
    await realClick(c, '[role=radiogroup][aria-label="Interface scale"] [role=radio]:nth-child(2)')
    await realClick(c, '#settings-done')
    await sleep(300)
    const reset = await J(c)(
      `({theme:document.documentElement.dataset.theme, density:document.documentElement.dataset.density, scale:document.documentElement.style.getPropertyValue('--ui-scale')})`
    )
    check(
      '9d the Start screen’s Settings button opens the same Settings (reset to Light, Comfortable, 100 %)',
      reset.theme === 'light' && reset.density === 'comfortable' && reset.scale === '1',
      reset
    )
    // Recent card: drawn format, name, meta, search.
    await waitFor(c, `document.querySelectorAll('.recent-card').length>0`, 8000)
    const card = await J(c)(
      `[...document.querySelectorAll('.recent-grid > li')].map(li=>({t:li.textContent, sheet:li.querySelectorAll('.recent-sheet .recent-shape').length, dis:li.querySelector('.recent-card').disabled}))`
    )
    await c.ev(
      `(()=>{const i=document.querySelector('[data-testid=recent-search]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'zzz'); i.dispatchEvent(new Event('input',{bubbles:true})); return 1})()`
    )
    await sleep(200)
    const noMatch = await c.ev(
      `document.querySelectorAll('.recent-card').length===0 && /No recent project matches/.test(document.querySelector('.welcome').textContent)`
    )
    await c.ev(
      `(()=>{const i=document.querySelector('[data-testid=recent-search]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'untit'); i.dispatchEvent(new Event('input',{bubbles:true})); return 1})()`
    )
    await sleep(200)
    const match = await c.ev(`document.querySelectorAll('.recent-card').length`)
    check(
      '19 recent card: the strip drawn as its two copies on the sheet, the name and "2×6 strip · opened …" (no path); Search recent filters',
      card.length >= 1 &&
        card[0].sheet === 2 &&
        /Untitled/.test(card[0].t) &&
        /2×6 strip · opened/.test(card[0].t) &&
        !card[0].t.includes(work) &&
        noMatch &&
        match === 1,
      { card, noMatch, match }
    )
    await shot(c, '12-start-recents')
  } finally {
    c.close()
    await h.kill(proc)
  }

  // ================================================================ MISSING FILE + LOCATE (file moved between runs)
  fs.renameSync(savePath, movedPath)
  ;({ proc, c } = await h.launch({
    port: PORT + 2,
    userData: ud,
    // The first Open dialog is cancelled (Locate… → Cancel), the second answers the moved file.
    env: { ...env, WALKONE_DEV_OPEN_PATH: `CANCEL;${movedPath}` },
    size: h.STANDARD_SIZE
  }))
  try {
    await size(c, 1920, 1000)
    // Missing file: stays listed with File not found + Locate…, which opens the file from its new place.
    await waitFor(c, `!!document.getElementById('open-project')`, 8000)
    await waitFor(c, `document.querySelectorAll('.recent-grid > li').length>0`, 8000)
    const missing = await J(c)(
      `[...document.querySelectorAll('.recent-grid > li')].map(x=>({t:x.textContent, dis:x.querySelector('.recent-card').disabled, locate:!!x.querySelector('[aria-label^="Locate"]')}))`
    )
    await shot(c, '13-start-missing-recent')
    const cards = (c) =>
      J(c)(
        `[...document.querySelectorAll('.recent-grid > li')].map(x=>({t:x.textContent, missing:x.classList.contains('missing'), dis:x.querySelector('.recent-card').disabled}))`
      )
    // B5.1: Locate… → Cancel leaves the missing card exactly as it was.
    await realClick(c, '.recent-grid > li [aria-label^="Locate"]')
    await sleep(800)
    const afterCancel = await cards(c)
    const stillStart = await c.ev(`!${S}.project && !!document.getElementById('open-project')`)
    check(
      'B5.1-3 Locate… → Cancel: nothing opens and the missing card is unchanged',
      stillStart &&
        JSON.stringify(afterCancel) ===
          JSON.stringify(missing.map((m) => ({ t: m.t, missing: true, dis: m.dis }))),
      { afterCancel, stillStart }
    )
    await realClick(c, '.recent-grid > li [aria-label^="Locate"]')
    await waitFor(c, `!!${S}.project`, 10000)
    const located = await J(c)(
      `(()=>{const s=${S}; const t=s.project&&s.project.layers.find(l=>l.type==='text'); return {name:s.project&&s.project.metadata.name, font:t&&t.fontFamily, tips:!!document.querySelector('[data-testid=first-run-tips]')}})()`
    )
    // B5.1: back on the Start screen there is ONE card for this project, connected to its new place, and it reopens.
    await c.ev(`${S}.closeProject().then(()=>1)`)
    await waitFor(c, `!!document.getElementById('open-project')`, 8000)
    await waitFor(c, `document.querySelectorAll('.recent-grid > li').length>0`, 8000)
    await sleep(300)
    const recovered = await cards(c)
    await realClick(c, '.recent-grid > li .recent-card')
    await waitFor(c, `!!${S}.project`, 10000)
    const reopened = await J(c)(
      `({name:${S}.project&&${S}.project.metadata.name, file:${S}.session&&${S}.session.fileName})`
    )
    check(
      'B5.1-4 after Locate the Start screen shows exactly one card for the project (no stale "File not found" card) and it reopens',
      recovered.length === 1 &&
        !recovered[0].missing &&
        !recovered[0].dis &&
        !/File not found/.test(recovered[0].t) &&
        reopened.name === 'Untitled' &&
        reopened.file === path.basename(movedPath),
      { recovered, reopened }
    )
    check(
      '20 a missing recent file stays listed ("File not found", not clickable) and Locate… opens it from its new place',
      missing.length >= 1 &&
        /File not found/.test(missing[0].t) &&
        missing[0].dis &&
        missing[0].locate &&
        located.name === 'Untitled',
      { missing, located }
    )
    check(
      '23 an existing project’s text keeps its stored font after save and reopen (Helvetica stays Helvetica); opened projects show no tips',
      located.font === 'Helvetica' && !located.tips,
      located
    )
    await c.ev(`${S}.addNewLayer('text'); 1`)
    await sleep(300)
    const mixedFonts = await J(c)(
      `${S}.project.layers.filter(l=>l.type==='text').map(l=>l.fontFamily)`
    )
    check(
      '23b new text in that project uses Arial; the old text is unchanged',
      mixedFonts.join() === 'Helvetica,Arial',
      mixedFonts
    )
    // ================================================================ TIPS: hide, stay hidden, restore
    await newBlankStrip(c)
    const tipsA = await c.ev(`!!document.querySelector('[data-testid=first-run-tips]')`)
    await realClick(c, '[data-testid=hide-tips]')
    await sleep(300)
    const hidden = await J(c)(
      `({tips:!!document.querySelector('[data-testid=first-run-tips]'), stored:JSON.parse(localStorage.getItem('walkone.appearance.v1')||'{}').showGettingStartedTips})`
    )
    check(
      '16 Hide these tips hides them and turns the preference off on this computer',
      tipsA && !hidden.tips && hidden.stored === false,
      { tipsA, hidden }
    )
    await newBlankStrip(c)
    const tipsB = await c.ev(`!!document.querySelector('[data-testid=first-run-tips]')`)
    check('17 the next new blank project shows no tips', !tipsB)
    await openSettings(c)
    await settingsPage(c, 'editor')
    await realClick(
      c,
      '[data-testid=settings-dialog] [role=switch][aria-label="Show getting-started tips for new blank projects"]'
    )
    await realClick(c, '#settings-done')
    await sleep(200)
    await newBlankStrip(c)
    const tipsC = await c.ev(`!!document.querySelector('[data-testid=first-run-tips]')`)
    check(
      '18 Settings › Editor turns the tips back on: the next new blank project shows them',
      tipsC
    )
    // ================================================================ IMPORT: fonts unchanged, no tips
    await c.ev(`document.querySelector('.menubar-btn[data-menu-id="file"]').click(); 1`)
    await sleep(250)
    await c.ev(
      `[...document.querySelectorAll('.ui-menuitem')].find(b=>/Import dslrBooth/.test(b.textContent)).click(); 1`
    )
    await waitFor(c, `!!document.querySelector('.dslr-import')`, 15000)
    await c.ev(
      `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Import'); b&&b.click(); return 1})()`
    )
    await waitFor(c, `!!${S}.project && !document.querySelector('.dslr-import')`, 20000)
    await sleep(800)
    const imported = await J(c)(
      `({fonts:[...new Set(${S}.project.layers.filter(l=>l.type==='text').map(l=>l.fontFamily))].sort(), tips:!!document.querySelector('[data-testid=first-run-tips]')})`
    )
    check(
      '24 imported text keeps its dslrBooth fonts exactly (Arial and Segoe UI; never replaced by the new default); no tips on an import',
      imported.fonts.join() === 'Arial,Segoe UI' && !imported.tips,
      imported
    )
    // ================================================================ NO SAMPLE PHOTOS
    const texts = []
    texts.push(await c.ev(`document.body.innerText`))
    const ph = await c.ev(`(${S}.project.layers.find(l=>l.type==='photo')||{}).id||null`)
    if (ph) {
      await c.ev(`${S}.selectLayer(${JSON.stringify(ph)}); 1`)
      await sleep(300)
      texts.push(await c.ev(`document.body.innerText`))
      await realClick(c, '[data-testid=selection-toolbar] [data-action=more]')
      texts.push(await c.ev(`document.body.innerText`))
      await escape(c)
    }
    await openSettings(c)
    for (const p of ['appearance', 'printing', 'editor']) {
      await settingsPage(c, p)
      texts.push(await c.ev(`document.body.innerText`))
    }
    await escape(c)
    check(
      '27 no Sample photos, Shuffle, Reset samples, Choose photo or Reposition anywhere in B5 surfaces',
      texts.every((t) => !SAMPLE_WORDS.test(t))
    )
  } finally {
    c.close()
    await h.kill(proc)
  }

  check('28 no console errors or uncaught exceptions', errors.length === 0, errors.slice(0, 5))
  const failed = results.filter((r) => !r.ok)
  writeResults('results-7b-b5.json', JSON.stringify(results, null, 2) + '\n')
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  fs.rmSync(work, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  process.exit(2)
})
