// Phase 5D scripted validation (automation over the DevTools protocol, NOT human testing): typography, font
// availability/portability, text fit-height and the Event Palette. Launches the BUILT app itself.
// Run: npm run build && node research/editor-validation/validate-5d.js
const fs = require('fs')
const path = require('path')
const h = require('./harness')
const { sleep } = h

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
const shotsDir = path.join(__dirname, 'shots')
fs.mkdirSync(shotsDir, { recursive: true })
const shot = (c, n) => c.shot(path.join(shotsDir, n))
const J = (c, expr) => c.ev(`JSON.stringify(${expr})`).then(JSON.parse)
const state = (c) =>
  J(
    c,
    `(()=>{const s=__wts.store.getState(); const p=s.project; return {
    has:!!p, dirty:p!==null&&p!==s.savedProject, past:s.history.past.length, msg:s.lastMessage, mode:s.viewMode, selected:s.selectedIds,
    palette:p?p.palette.colors:[], bg:p&&p.canvas.backgroundColor,
    layers:p?p.layers.map(l=>({id:l.id,type:l.type,name:l.name,x:l.x,y:l.y,width:l.width,height:l.height,font:l.fontFamily,fontSize:l.fontSize,lineHeight:l.lineHeight,content:l.content,fill:l.fill,stroke:l.stroke,frame:l.frame,locked:l.locked})):[]}})()`
  )
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
const px = (c, which, points, preview = false) =>
  c
    .ev(
      `(async()=>{const r=await __wts.${which}(undefined,undefined,${preview}); const img=new Image(); img.src=r.dataUrl; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; const x=cv.getContext('2d'); x.drawImage(img,0,0);
    return JSON.stringify({w:img.width,h:img.height,px:${JSON.stringify(points)}.map(([a,b])=>[...x.getImageData(a,b,1,1).data])})})()`
    )
    .then(JSON.parse)
const design = (c, pts) => px(c, 'renderToDataUrl', pts)
const sheet = (c, pts) => px(c, 'renderSheetToDataUrl', pts)
const setSelect = (c, selector, value) =>
  c.ev(
    `(()=>{const sel=document.querySelector(${JSON.stringify(selector)}); if(!sel) return 'no select'; const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(sel,${JSON.stringify(value)}); sel.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'})()`
  )
const click = (c, expr) =>
  c.ev(`(()=>{const e=${expr}; if(!e) return 'none'; e.click(); return 'ok'})()`)
const btn = (text) =>
  `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)})`
const typeInto = async (c, selector, text, { enter = true } = {}) => {
  await c.ev(
    `(()=>{const i=document.querySelector(${JSON.stringify(selector)}); i.focus(); i.select&&i.select(); return 1})()`
  )
  await c.insertText(text)
  if (enter) await c.key('Enter', { code: 'Enter', vk: 13, text: '\r' })
  await sleep(300)
}
const elCentre = (c, expr) =>
  J(
    c,
    `(()=>{const e=${expr}; if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`
  )
const hover = async (c, p) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x - 3, y: p.y - 3 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
  await sleep(750)
}
const tipText = (c) =>
  c.ev(`(()=>{const t=document.querySelector('[role=tooltip]'); return t?t.textContent:''})()`)
const dbg = async (c, l) =>
  console.log('  [drawer]', l, await c.ev(`!!document.querySelector('.tooldrawer')`))
const FONT_INPUT = `.inspector-panel input[role=combobox]`
// Opens a rail category's drawer only if it is not already showing (the rail button toggles). B3: the font inventory
// lives in the Text drawer, the Event palette and canvas background in the Colors drawer.
const drawer = (c, tool) =>
  c.ev(
    `(()=>{ if (document.querySelector('.tooldrawer[data-tool=${tool}]')) return 1; document.querySelector('.toolrail-btn[data-tool=${tool}]').click(); return 1})()`
  )

;(async () => {
  const work = h.tmpDir('wts-5d-')
  const ud = path.join(work, 'ud')
  const savePath = path.join(work, 'Type Test.boothproject')
  const env = {
    WALKONE_DEV_SAVE_PATH: savePath,
    WALKONE_DEV_OPEN_PATH: savePath,
    WALKONE_DEV_UNSAVED_CHOICES: 'discard'
  }
  let { proc, c } = await h.launch({
    port: 9550,
    userData: ud,
    env,
    size: { width: 1440, height: 900 }
  })
  try {
    // ------------------------------------------------------------------ setup
    await c.ev(
      `__wts.store.getState().createProject({name:'Type Test', preset:'strip-2x6-600'}).then(()=>1)`
    )
    await sleep(800)
    await c.ev(`(()=>{const s=__wts.store.getState();
      s.addNewLayer('text'); let t=__wts.store.getState(); const text=t.selectedIds[0]; t.editLayers([text],{x:100,y:200,width:1000,height:200,fontSize:120,content:'Kara & Saher',fontFamily:'Georgia'});
      s.addNewLayer('rectangle'); t=__wts.store.getState(); const rect=t.selectedIds[0]; t.editLayers([rect],{x:100,y:700,width:600,height:400,stroke:{color:{kind:'literal',value:'#112233'},width:20}});
      s.addNewLayer('photo'); t=__wts.store.getState(); const ph=t.selectedIds[0]; t.editLayers([ph],{x:100,y:1300,width:1000,height:700,frame:{style:'solid',thickness:40,color:{kind:'literal',value:'#555555'}}});
      return 1})()`)
    await sleep(500)
    let st = await state(c)
    const T = st.layers.find((l) => l.type === 'text')
    const R = st.layers.find((l) => l.type === 'shape')
    const P = st.layers.find((l) => l.type === 'photo')
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(T.id)}); 1`)
    await sleep(500)

    // ------------------------------------------------------------------ font selector
    const catalog = await J(c, `(()=>{return null})()`)
    void catalog
    const t0 = Date.now()
    await c.click(await elCentre(c, `document.querySelector(${JSON.stringify(FONT_INPUT)})`))
    await sleep(500)
    const openMs = Date.now() - t0
    const listing = await J(
      c,
      `{n:document.querySelectorAll('[role=listbox] [role=option]').length, expanded:document.querySelector(${JSON.stringify(FONT_INPUT)}).getAttribute('aria-expanded'), note:(document.querySelector('.font-list-note')||{}).textContent||''}`
    )
    check(
      '1 clicking the Font field opens a searchable list (combobox + listbox), showing installed fonts',
      listing.expanded === 'true' && listing.n >= 20,
      { rows: listing.n, openMs }
    )
    await shot(c, '5d-01-font-selector.png')
    await dbg(c, "01-font-selector.png')")
    await c.insertText(h.SERIF.query)
    await sleep(400)
    const filtered = await J(
      c,
      `[...document.querySelectorAll('[role=listbox] [role=option]')].map(o=>o.textContent.trim())`
    )
    check(
      `2 typing searches case-insensitively by substring (all rows contain "${h.SERIF.query}"; ${h.SERIF.name} is offered)`,
      filtered.length > 0 &&
        filtered.every(
          (n) => n.toLowerCase().includes(h.SERIF.query) || n.startsWith(`Use “${h.SERIF.query}”`)
        ) &&
        filtered.some((n) => n.startsWith(h.SERIF.name)),
      filtered.slice(0, 6)
    )
    await shot(c, '5d-02-font-search.png')
    await dbg(c, "d-02-font-search.png')")
    st = await state(c)
    check(
      '3 browsing and typing never change the layer or history',
      st.layers.find((l) => l.id === T.id).font === 'Georgia' && st.past === (await state(c)).past
    )
    await c.key('Escape', { code: 'Escape', vk: 27 })
    await sleep(200)
    check(
      '3b Escape closes the list without changing the font',
      (await state(c)).layers.find((l) => l.id === T.id).font === 'Georgia' &&
        !(await c.ev(`!!document.querySelector('[role=listbox]')`))
    )
    // choose the installed serif with the keyboard
    const pastBefore = (await state(c)).past
    await c.click(await elCentre(c, `document.querySelector(${JSON.stringify(FONT_INPUT)})`))
    await sleep(300)
    await c.insertText(h.SERIF.name.toLowerCase())
    await sleep(300)
    await c.key('ArrowDown', { code: 'ArrowDown', vk: 40 })
    await c.key('Enter', { code: 'Enter', vk: 13, text: '\r' })
    await sleep(400)
    st = await state(c)
    const fontNow = st.layers.find((l) => l.id === T.id).font
    check(
      '4 choosing an installed font with the keyboard sets it (one history entry)',
      fontNow.toLowerCase() === h.SERIF.name.toLowerCase() && st.past === pastBefore + 1,
      { fontNow }
    )
    const canvasFont = await c.ev(`__wts.textFont(${JSON.stringify(T.id)})`)
    check(
      '4b the canvas draws the requested family first, then the fallback stack',
      canvasFont === `${fontNow}, Helvetica, Arial, sans-serif`,
      canvasFont
    )
    check(
      '4c an installed font shows no missing warning',
      !(await c.ev(`!!document.querySelector('[data-testid=font-missing]')`))
    )
    // missing font via manual entry
    await c.click(await elCentre(c, `document.querySelector(${JSON.stringify(FONT_INPUT)})`))
    await sleep(300)
    await c.insertText('Bickham Script Pro')
    await sleep(300)
    const manual = await J(
      c,
      `[...document.querySelectorAll('[role=listbox] [role=option]')].map(o=>o.textContent.trim())`
    )
    await c.key('Enter', { code: 'Enter', vk: 13, text: '\r' })
    await sleep(500)
    st = await state(c)
    check(
      '5 a font that is not installed can still be requested by typing its name (manual entry)',
      manual.some((m) => /Use “Bickham Script Pro”/.test(m)) &&
        st.layers.find((l) => l.id === T.id).font === 'Bickham Script Pro',
      manual
    )
    check(
      '5b the missing font shows a clear, non-destructive warning and the requested family is preserved',
      (await c.ev(
        `(()=>{const a=document.querySelector('[data-testid=font-missing]'); return !!a && /Font unavailable/.test(a.textContent) && /Bickham Script Pro/.test(a.textContent) && /fallback/.test(a.textContent)})()`
      )) && st.layers.find((l) => l.id === T.id).font === 'Bickham Script Pro'
    )
    const missFont = await c.ev(`__wts.textFont(${JSON.stringify(T.id)})`)
    check(
      '5c the canvas renders with the fallback stack while the project keeps the requested name',
      missFont === 'Bickham Script Pro, Helvetica, Arial, sans-serif',
      missFont
    )
    await shot(c, '5d-03-missing-font-warning.png')
    await dbg(c, "ing-font-warning.png')")
    // project font inventory
    await drawer(c, 'text')
    await sleep(300)
    const inv = await J(
      c,
      `{summary:document.querySelector('[data-testid=font-summary]')?.textContent, rows:[...document.querySelectorAll('.font-inv-row')].map(r=>r.textContent.replace(/\\s+/g,' ').trim())}`
    )
    const invDbg = await J(
      c,
      `{drawer:!!document.querySelector('.tooldrawer'), bg:!!document.querySelector('[data-testid=canvas-background]'), invHtml:(document.querySelector('[data-testid=font-inventory]')||{}).outerHTML?.slice(0,300), tool:[...document.querySelectorAll('.toolrail-btn[aria-pressed=true]')].map(b=>b.textContent.trim())}`
    )
    check(
      '6 project font inventory lists the fonts used and flags the missing one',
      /1 font used, 1 missing/.test(inv.summary || '') &&
        inv.rows.some((r) => /Bickham Script Pro.*missing/.test(r)),
      { inv, invDbg }
    )
    await shot(c, '5d-04-font-inventory.png')
    // replace all uses (a second layer with the same missing font)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.addNewLayer('text'); const t=__wts.store.getState(); t.editLayers([t.selectedIds[0]],{x:100,y:2200,width:900,height:200,fontFamily:'bickham script pro',content:'Second'}); t.selectLayer(${JSON.stringify(T.id)}); return 1})()`
    )
    await sleep(500)
    const beforeReplace = await state(c)
    await c.ev(
      `(()=>{const c=[...document.querySelectorAll('.font-alert input[role=combobox]')][0]; c.scrollIntoView({block:'center'}); return 1})()`
    )
    await c.click(await elCentre(c, `document.querySelector('.font-alert input[role=combobox]')`))
    await sleep(300)
    await c.insertText('Georgia')
    await sleep(300)
    await c.key('Enter', { code: 'Enter', vk: 13, text: '\r' })
    await sleep(300)
    await click(c, btn('Replace all uses (2)'))
    await sleep(500)
    st = await state(c)
    const texts = st.layers.filter((l) => l.type === 'text')
    check(
      '7 Replace all uses swaps every matching layer (any spelling) in ONE undo step, keeps their other properties, leaves other fonts alone',
      texts.every((l) => l.font === 'Georgia') &&
        st.past === beforeReplace.past + 1 &&
        texts.find((l) => l.content === 'Second').width === 900,
      texts.map((l) => l.font)
    )
    await c.ev(`__wts.store.getState().undo(); 1`)
    st = await state(c)
    check(
      '7b undo restores the requested (missing) fonts exactly',
      st.layers.filter((l) => l.type === 'text').every((l) => /bickham script pro/i.test(l.font))
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers(s.project.layers.filter(l=>l.type==='text').map(l=>l.id),{fontFamily:'Georgia'}); const x=s.project.layers.find(l=>l.content==='Second'); s.selectLayer(x.id); s.deleteSelection(); s.selectLayer(${JSON.stringify(T.id)}); return 1})()`
    )
    await c.ev(
      `__wts.store.getState().editLayers([${JSON.stringify(T.id)}],{fontFamily:'Bickham Script Pro'}); 1`
    )

    // ------------------------------------------------------------------ fit height
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(T.id)}],{fontFamily:'Georgia',content:'Line one\\nLine two\\nLine three',fontSize:100,lineHeight:1.2,height:999}); return 1})()`
    )
    await sleep(500)
    await shot(c, '5d-05-fit-height-before.png')
    const p1 = (await state(c)).past
    await click(c, btn('Fit height to content'))
    await sleep(400)
    st = await state(c)
    let tl = st.layers.find((l) => l.id === T.id)
    check(
      '8 Fit height to content: 3 lines × 100 px × 1.2 → 360; width, position, size kept; one history entry',
      Math.abs(tl.height - 360) < 0.01 &&
        tl.width === 1000 &&
        tl.fontSize === 100 &&
        tl.x === 100 &&
        tl.y === 200 &&
        st.past === p1 + 1,
      { h: tl.height }
    )
    await shot(c, '5d-06-fit-height-after.png')
    await c.ev(`__wts.store.getState().editLayers([${JSON.stringify(T.id)}],{fontSize:200}); 1`)
    await click(c, btn('Fit height to content'))
    await sleep(300)
    tl = (await state(c)).layers.find((l) => l.id === T.id)
    check(
      '8b after changing the font size the fit follows (3 × 200 × 1.2 = 720)',
      Math.abs(tl.height - 720) < 0.01,
      tl.height
    )
    await c.ev(
      `__wts.store.getState().editLayers([${JSON.stringify(T.id)}],{fontSize:100,content:'A fairly long single paragraph that must wrap onto several lines inside a narrow box',width:300}); 1`
    )
    await click(c, btn('Fit height to content'))
    await sleep(300)
    tl = (await state(c)).layers.find((l) => l.id === T.id)
    check(
      '8c a narrow width wraps to more lines and the box grows to match (multiples of 120)',
      tl.height >= 360 && Math.abs(tl.height / 120 - Math.round(tl.height / 120)) < 0.001,
      tl.height
    )
    await c.ev(`__wts.store.getState().undo(); __wts.store.getState().undo(); 1`)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(T.id)}],{content:'Kara & Saher',fontSize:120,width:1000,height:200,fontFamily:'Georgia'}); return 1})()`
    )

    // ------------------------------------------------------------------ Event palette
    await drawer(c, 'colors')
    await sleep(300)
    await click(c, btn('Add basic colors'))
    await sleep(500)
    st = await state(c)
    check(
      '9 "Add basic colors" creates the semantic roles in one step (neutral values; Background matches the canvas)',
      st.palette.length === 5 &&
        ['primary', 'secondary', 'accent', 'background', 'text'].every((r) =>
          st.palette.some((p) => p.role === r)
        ) &&
        st.palette.find((p) => p.role === 'background').value === '#ffffff'
    )
    const accent = st.palette.find((p) => p.role === 'accent')
    await shot(c, '5d-07-event-palette.png')
    // link text, rectangle fill, photo frame via the UI
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.selectLayer(${JSON.stringify(T.id)}); return 1})()`
    )
    await sleep(500)
    const link = (label) =>
      `.inspector-panel select[aria-label=${JSON.stringify(`Link ${label} to an Event Palette color`)}]`
    await setSelect(c, link('Color'), accent.id)
    await sleep(300)
    st = await state(c)
    check(
      '10 text colour linked to Accent through the UI (reference, not a copy)',
      st.layers.find((l) => l.id === T.id).fill.kind === 'palette' &&
        st.layers.find((l) => l.id === T.id).fill.paletteColorId === accent.id
    )
    check(
      '10b a linked colour field names the palette entry and still offers "Use fixed color"',
      await c.ev(
        `(()=>{const p=document.querySelector('.inspector-panel'); return /Linked to\\s*Accent/.test(p.textContent) && [...p.querySelectorAll('button')].some(b=>b.textContent.trim()==='Use fixed color')})()`
      )
    )
    await shot(c, '5d-08-text-linked.png')
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(R.id)}); 1`)
    await sleep(500)
    const labels = await J(
      c,
      `[...document.querySelectorAll('.inspector-panel select[aria-label^="Link "]')].map(s=>s.getAttribute('aria-label'))`
    )
    const fillLabel = labels.find((l) => /Fill/.test(l)) || labels[0]
    await setSelect(
      c,
      `.inspector-panel select[aria-label=${JSON.stringify(fillLabel)}]`,
      accent.id
    )
    await sleep(300)
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(P.id)}); 1`)
    await sleep(500)
    const pl = await J(
      c,
      `[...document.querySelectorAll('.inspector-panel select[aria-label^="Link "]')].map(s=>s.getAttribute('aria-label'))`
    )
    await setSelect(
      c,
      `.inspector-panel select[aria-label=${JSON.stringify(pl.find((l) => /Frame/i.test(l)) || pl[0])}]`,
      accent.id
    )
    await sleep(300)
    // stroke and canvas background by store (the same domain edit the UI performs)
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(R.id)}],{stroke:{color:{kind:'palette',paletteColorId:${JSON.stringify(accent.id)}},width:20}}); s.setCanvasBackgroundColor({kind:'palette',paletteColorId:${JSON.stringify(st.palette.find((p) => p.role === 'background').id)}}); return 1})()`
    )
    st = await state(c)
    check(
      '11 shape fill, photo frame colour, shape stroke and canvas background can all be linked to a palette entry',
      st.layers.find((l) => l.id === R.id).fill.kind === 'palette' &&
        st.layers.find((l) => l.id === P.id).frame.color.kind === 'palette' &&
        st.layers.find((l) => l.id === R.id).stroke.color.kind === 'palette' &&
        st.bg.kind === 'palette',
      { labels, pl }
    )
    const usage = await c.ev(
      `document.querySelector('.palette-row[data-palette-id=${JSON.stringify(accent.id)}] [data-testid=palette-usage]').textContent`
    )
    check('11b the palette shows how many properties use Accent', /Used by 4/.test(usage), usage)
    // global change through the hex field of the palette row
    const pts = [
      [300, 800],
      [120, 1650],
      [1150, 100]
    ]
    const before = await design(c, pts)
    const pastB = (await state(c)).past
    await typeInto(
      c,
      `.palette-row[data-palette-id=${JSON.stringify(accent.id)}] input.hex-input`,
      '#d3a74e'
    )
    await sleep(500)
    st = await state(c)
    const after = await design(c, pts)
    check(
      '12 editing Accent (typed hex + Enter) is ONE history entry, marks Modified, and updates the palette value',
      st.palette.find((p) => p.id === accent.id).value === '#d3a74e' &&
        st.past === pastB + 1 &&
        st.dirty
    )
    check(
      '12b every property linked to Accent updates at once (rectangle fill, photo frame) while the canvas background, linked to the Background entry, stays white',
      near(after.px[0], [...hex('#d3a74e'), 255]) &&
        near(after.px[1], [...hex('#d3a74e'), 255]) &&
        near(after.px[2], [255, 255, 255, 255]),
      {
        before: before.px,
        after: after.px,
        photo: (await state(c)).layers.find((l) => l.id === P.id)
      }
    )
    await shot(c, '5d-09-global-accent-change.png')
    await c.ev(`__wts.store.getState().undo(); 1`)
    st = await state(c)
    const undone = await design(c, [[300, 800]])
    check(
      '13 undo restores the old Accent everywhere; redo reapplies',
      st.palette.find((p) => p.id === accent.id).value === '#c6a45d' &&
        near(undone.px[0], [...hex('#c6a45d'), 255]) &&
        (await c.ev(
          `__wts.store.getState().redo(); __wts.store.getState().project.palette.colors.find(c=>c.role==='accent').value`
        )) === '#d3a74e'
    )
    // typing a partial hex does not commit; Escape restores
    const pastP = (await state(c)).past
    await c.ev(
      `(()=>{const i=document.querySelector('.palette-row[data-palette-id="${accent.id}"] input.hex-input'); i.focus(); i.select(); return 1})()`
    )
    await c.insertText('#ab')
    await sleep(200)
    check(
      '13b typing a partial HEX commits nothing (no history entry per keystroke)',
      (await state(c)).past === pastP
    )
    await c.key('Escape', { code: 'Escape', vk: 27 })
    await sleep(200)
    check(
      '13c Escape restores the field and still commits nothing',
      (await state(c)).past === pastP &&
        (await state(c)).palette.find((p) => p.id === accent.id).value === '#d3a74e'
    )
    // two-up: both copies
    await c.ev(`__wts.store.getState().setViewMode('preview'); 1`)
    await sleep(700)
    const sh = await sheet(c, [
      [300, 800],
      [1500, 800],
      [120, 1650],
      [1320, 1650],
      [1150, 100],
      [2350, 100]
    ])
    check(
      '14 Print Preview: both derived copies use the same new palette colour (no per-copy palette)',
      sh.px.slice(0, 4).every((p) => near(p, [...hex('#d3a74e'), 255])) &&
        sh.px.slice(4).every((p) => near(p, [255, 255, 255, 255])),
      sh.px
    )
    await shot(c, '5d-10-print-preview-palette.png')
    await c.ev(`__wts.store.getState().setViewMode('design'); 1`)
    // B3.1: entering Print Preview closes the creation drawer (and Design does not reopen it): reopen Colors.
    check(
      '14c entering Print Preview closed the Colors drawer (B3.1)',
      !(await c.ev(`!!document.querySelector('.tooldrawer')`))
    )
    await drawer(c, 'colors')
    await sleep(500)

    // detach one object, then change Accent again
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(R.id)}); 1`)
    await sleep(500)
    const detachBtn = `[...document.querySelectorAll('.inspector-panel button')].filter(b=>b.textContent.trim()==='Use fixed color')[0]`
    await click(c, detachBtn)
    await sleep(300)
    st = await state(c)
    const rect = st.layers.find((l) => l.id === R.id)
    check(
      '15 "Use fixed color" resolves the current palette value into a literal (appearance unchanged)',
      rect.fill.kind === 'literal' && rect.fill.value === '#d3a74e',
      rect.fill
    )
    await typeInto(
      c,
      `.palette-row[data-palette-id=${JSON.stringify(accent.id)}] input.hex-input`,
      '#aa3355'
    )
    await sleep(500)
    const r2 = await design(c, [
      [300, 800],
      [120, 1650],
      [1150, 100]
    ])
    check(
      '16 after changing Accent again: the detached rectangle stays #d3a74e while the still-linked frame follows (#aa3355)',
      near(r2.px[0], [...hex('#d3a74e'), 255]) &&
        near(r2.px[1], [...hex('#aa3355'), 255]) &&
        near(r2.px[2], [255, 255, 255, 255]),
      r2.px
    )
    // canvas background linked to Accent follows it too
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.setCanvasBackgroundColor({kind:'palette',paletteColorId:${JSON.stringify(accent.id)}}); return 1})()`
    )
    const bgLinked = await design(c, [[1150, 100]])
    check(
      '16b canvas background linked to Accent shows the current Accent (#aa3355)',
      near(bgLinked.px[0], [...hex('#aa3355'), 255]),
      bgLinked.px
    )
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.setCanvasBackgroundColor({kind:'palette',paletteColorId:${JSON.stringify(st.palette.find((p) => p.role === 'background').id)}}); s.setPaletteColor(${JSON.stringify(accent.id)},'#c6a45d'); return 1})()`
    )

    // custom colour: add, rename, references survive, removal refused while used
    await c.ev(`__wts.store.getState().clearSelection(); 1`)
    await sleep(300)
    await click(
      c,
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add color')`
    )
    await sleep(500)
    st = await state(c)
    const custom = st.palette.find((p) => p.role === 'custom')
    check(
      '17 "Add color" creates a custom palette entry with a stable id',
      !!custom && st.palette.length === 6,
      custom
    )
    await c.ev(
      `__wts.store.getState().editLayers([${JSON.stringify(R.id)}],{fill:{kind:'palette',paletteColorId:${JSON.stringify(custom.id)}}}); 1`
    )
    await typeInto(
      c,
      `.palette-row[data-palette-id=${JSON.stringify(custom.id)}] input[aria-label^="Name"], .palette-row[data-palette-id=${JSON.stringify(custom.id)}] input:not(.hex-input):not([type=color])`,
      'Champagne'
    )
    await sleep(400)
    st = await state(c)
    check(
      '18 renaming a custom colour keeps its id and every reference (and the appearance)',
      st.palette.find((p) => p.id === custom.id).name === 'Champagne' &&
        st.layers.find((l) => l.id === R.id).fill.paletteColorId === custom.id
    )
    const pastR = (await state(c)).past
    await click(
      c,
      `document.querySelector('.palette-row[data-palette-id="${custom.id}"] button[aria-label^="Remove"]')`
    )
    await sleep(300)
    st = await state(c)
    check(
      '19 removing a USED colour is refused with an explanation; nothing changes',
      st.palette.some((p) => p.id === custom.id) &&
        /used by 1 propert/.test(st.msg || '') &&
        st.past === pastR,
      st.msg
    )
    await c.ev(
      `__wts.store.getState().editLayers([${JSON.stringify(R.id)}],{fill:{kind:'literal',value:'#112233'}}); 1`
    )
    await click(
      c,
      `document.querySelector('.palette-row[data-palette-id="${custom.id}"] button[aria-label^="Remove"]')`
    )
    await sleep(300)
    check(
      '20 after detaching the use, the unused colour can be removed',
      !(await state(c)).palette.some((p) => p.id === custom.id)
    )

    // ------------------------------------------------------------------ tooltips
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(T.id)}); 1`)
    await sleep(500)
    const tips = [
      [
        'fit height',
        btn('Fit height to content'),
        /Fit height to content/,
        /Resize the text box height to fit its current content/
      ],
      [
        'use fixed color',
        btn('Use fixed color'),
        /Use fixed color/,
        /Detach from the Event Palette and keep the current appearance/
      ]
    ]
    const tr = []
    for (const [name, expr, a, b2] of tips) {
      const p = await elCentre(c, expr)
      if (!p) {
        tr.push({ name, ok: false, why: 'missing' })
        continue
      }
      await hover(c, p)
      const t = await tipText(c)
      const hit = await c.ev(
        `(()=>{const e=document.elementFromPoint(${p.x},${p.y}); return e?e.outerHTML.slice(0,140):null})()`
      )
      tr.push({ name, ok: a.test(t) && b2.test(t), t, ...(a.test(t) ? {} : { p, hit }) })
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
      await sleep(150)
    }
    check(
      '21 new typography/palette controls have hover tooltips (purpose in one sentence)',
      tr.every((r) => r.ok),
      tr.filter((r) => !r.ok)
    )

    // ------------------------------------------------------------------ save / reopen / recovery
    await c.ev(
      `(()=>{const s=__wts.store.getState(); s.editLayers([${JSON.stringify(T.id)}],{fontFamily:'Bickham Script Pro'}); return 1})()`
    )
    const savedPalette = (await state(c)).palette
    await c.ev(`__wts.store.getState().saveAs().then(()=>1)`)
    await sleep(1000)
    await c.ev(`__wts.store.getState().closeProject().then(()=>1)`)
    await sleep(500)
    await c.ev(`__wts.store.getState().openFromDialog().then(()=>1)`)
    await sleep(1200)
    st = await state(c)
    check(
      '22 save → reopen: palette entries, palette references and the missing font REQUEST all survive (nothing rewritten)',
      JSON.stringify(st.palette) === JSON.stringify(savedPalette) &&
        st.layers.find((l) => l.id === T.id).font === 'Bickham Script Pro' &&
        st.layers.find((l) => l.id === T.id).fill.kind === 'palette' &&
        st.bg.kind === 'palette'
    )
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(T.id)}); 1`)
    await sleep(600)
    check(
      '22b the missing-font warning is shown again after reopening',
      await c.ev(`!!document.querySelector('[data-testid=font-missing]')`)
    )
    // recovery
    await c.ev(`__wts.store.getState().setPaletteColor(${JSON.stringify(accent.id)},'#445566'); 1`)
    await c.ev(`__wts.store.getState().replaceFont('Bickham Script Pro','Georgia'); 1`)
    await c.ev(`__wts.store.getState().flushRecovery().then(()=>1)`)
    await sleep(500)
    await h.kill(proc)
    ;({ proc, c } = await h.launch({
      port: 9551,
      userData: ud,
      env,
      size: { width: 1440, height: 900 }
    }))
    for (let i = 0; i < 20 && !(await c.ev(`__wts.store.getState().recovery.loaded`)); i++)
      await sleep(250)
    const cands = await J(c, `__wts.store.getState().recovery.candidates`)
    await c.ev(
      `__wts.store.getState().recoverCandidate(${JSON.stringify(cands[0] && cands[0].sessionId)}).then(()=>1)`
    )
    await sleep(900)
    st = await state(c)
    check(
      '23 crash recovery restores the palette edit and the font replacement',
      st.palette.find((p) => p.id === accent.id).value === '#445566' &&
        st.layers.find((l) => l.id === T.id).font === 'Georgia',
      { accent: st.palette.find((p) => p.id === accent.id).value }
    )
    check(
      'S1 renderer still has no Node access; CSP unchanged; local-fonts is the only permission granted',
      (await c.ev(`typeof require==='undefined' && typeof process==='undefined'`)) &&
        (await c.ev(
          `document.querySelector('meta[http-equiv=Content-Security-Policy]').content`
        )) ===
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
    )
    const perm = await c.ev(
      `(async()=>{try{const r=await navigator.permissions.query({name:'geolocation'}); return r.state}catch(e){return 'err'}})()`
    )
    check(
      'S2 other permissions are not granted (geolocation is not "granted")',
      perm !== 'granted',
      perm
    )
  } catch (e) {
    check('script completed without exception', false, String(e && e.stack ? e.stack : e))
  } finally {
    await h.kill(proc)
    const failed = results.filter((r) => !r.ok)
    fs.writeFileSync(
      path.join(__dirname, 'results-phase5d.json'),
      JSON.stringify(
        {
          passed: results.length - failed.length,
          total: results.length,
          failed: failed.map((f) => f.name),
          results
        },
        null,
        1
      )
    )
    console.log(`\n${results.length - failed.length}/${results.length} passed`)
    process.exit(failed.length ? 1 : 0)
  }
})()
