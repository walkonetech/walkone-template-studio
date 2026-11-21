// Phase 7B B4 scripted validation (automation over the DevTools protocol, NOT human testing): the graphic workflow
// surfaces in the BUILT app. Checks panel (top bar → left zone, Error / Needs attention / Good to know, Good to know
// collapsed, "Ready · n notes", merged repeats with Select all and Details, no disabled future actions, Escape);
// Export (pinned readiness + printer, three picture cards with For the booth on by default, files line, Review/checks,
// More options, sticky footer, Export visible at 1426×779 and 1100×650, real export); Printer & cutting (title,
// strip-corner diagram, trim band + safe line, the 3-step meter, DS-RX1 "Tested on a print" / "Ready to use", How do
// we know?, trim still estimated, production booth unverified, no developer paths); dslrBooth import (found summary,
// one-strip Recommended + selected, as-is option, Compatibility details collapsed, import result); the safe-area
// warning halo over red artwork (same rectangle, no export impact); Dark + Compact; no Sample Photos anywhere; owner
// screenshots. Uses a SYNTHETIC two-strip template made by inspect-import.py; no private fixtures.
// Run: npm run build && node research/editor-validation/validate-7b-b4.js
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
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
const waitFor = async (c, expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await c.ev(expr)) return true
    await sleep(200)
  }
  return false
}
const S = `__wts.store.getState()`
const PORT = 9601
const RX1 = 'dnp-ds-rx1-6x4-2inch-cut'

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
  await c.shot(path.join(shotsDir, `7b-b4-${name}.png`))
}
const escape = (c) => c.key('Escape', { code: 'Escape', vk: 27 })
const openMenu = async (c, menu) => {
  await c.ev(`document.querySelector('.menubar-btn[data-menu-id="${menu}"]').click(); 1`)
  await sleep(250)
}
const clickMenuItem = (c, label) =>
  c.ev(
    `(()=>{const b=[...document.querySelectorAll('.ui-menuitem')].find(x=>x.querySelector('.grow')&&x.querySelector('.grow').textContent===${JSON.stringify(label)}); if(!b) return false; b.click(); return true})()`
  )
const menuLabels = async (c, menu) => {
  await openMenu(c, menu)
  const l = await J(c)(`[...document.querySelectorAll('.ui-menuitem .grow')].map(e=>e.textContent)`)
  await escape(c)
  await sleep(150)
  return l
}
const doc = (c) =>
  J(c)(
    `(()=>{const s=${S}; return {dirty:s.project!==null&&s.project!==s.savedProject, past:s.history.past.length, json:JSON.stringify(s.project)}})()`
  )
/** Is the element's centre on screen and not covered by something else (the visible-and-clickable test)? */
const reachable = (c, sel) =>
  J(c)(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return {found:false}; const r=e.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+r.height/2; const hit=document.elementFromPoint(x,y);
      return {found:true, inView:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth, top:hit===e||e.contains(hit), b:Math.round(r.bottom), ih:innerHeight, sw:document.documentElement.scrollWidth, iw:innerWidth}})()`
  )
const noHScroll = (c, sel) =>
  J(c)(
    `(()=>{const d=document.querySelector(${JSON.stringify(sel)}); const b=d&&d.querySelector('.body'); return {page:document.documentElement.scrollWidth<=innerWidth, dialog:!d||d.scrollWidth<=d.clientWidth+1, body:!b||b.scrollWidth<=b.clientWidth+1}})()`
  )
const SAMPLE_WORDS = /sample photo|shuffle|reset samples|choose photo|reposition/i

;(async () => {
  const work = h.tmpDir('wts-7b-b4-')
  const outDir = path.join(work, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const zip = path.join(work, 'Synthetic Two Strips.zip')
  execFileSync(h.PY, ['-P', path.join(__dirname, 'inspect-import.py'), 'make', zip])
  const { proc, c } = await h.launch({
    port: PORT,
    userData: path.join(work, 'ud'),
    env: {
      WALKONE_DEV_IMPORT_DSLR_PATH: zip,
      WALKONE_DEV_EXPORT_DIR: outDir,
      WALKONE_DEV_NO_REVEAL: '1',
      WALKONE_DEV_UNSAVED_CHOICES: 'discard'
    },
    size: h.STANDARD_SIZE
  })
  try {
    await size(c, 1920, 1000)
    await c.ev(`${S}.createProject({name:'Ava & Theo', preset:'strip-2x6-600'}).then(()=>1)`)
    await sleep(800)
    for (let i = 0; i < 3; i++) await c.ev(`${S}.addNewLayer('photo'); 1`)
    await sleep(300)
    await c.ev(`${S}.selectLayer(null); 1`)

    // ================================================================ CHECKS PANEL
    const btn0 = await J(c)(
      `(()=>{const b=document.getElementById('checks-button'); return {state:b.dataset.state, label:b.getAttribute('aria-label'), counts:b.querySelectorAll('.ui-count').length}})()`
    )
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await sleep(400)
    const panel = await J(c)(
      `(()=>{const p=document.getElementById('checks-panel'); if(!p) return null; const r=p.getBoundingClientRect(), rail=document.querySelector('.toolrail').getBoundingClientRect(), ws=document.querySelector('.workspace').getBoundingClientRect(), ins=document.querySelector('.inspector-panel');
        return {left:Math.round(r.left), railRight:Math.round(rail.right), wsCentre:Math.round(ws.left+ws.width/2), right:Math.round(r.right), props:!!ins&&ins.getBoundingClientRect().width>0, region:p.dataset.region, mode:p.dataset.mode, expanded:document.getElementById('checks-button').getAttribute('aria-expanded'), drawer:!!document.getElementById('tool-drawer'), text:p.querySelector('#checks-summary').textContent}})()`
    )
    check(
      '1 Checks opens from the top bar (a clean project reads Ready, no problem counts)',
      btn0.state === 'Ready' && btn0.counts === 0 && panel && panel.expanded === 'true',
      { btn0, panel }
    )
    check(
      '2 the Checks panel opens on the LEFT (drawer zone, beside the rail) and Properties stays visible',
      panel &&
        Math.abs(panel.left - panel.railRight) <= 12 &&
        panel.right < panel.wsCentre + 400 &&
        panel.props &&
        panel.region === 'drawer' &&
        !panel.drawer,
      panel
    )
    check('2b a clean project reads "Ready" in the panel', /^Ready/.test(panel?.text || ''), panel)
    await shot(c, '01-checks-clean')

    // Problems: a missing font in two texts near the edge with the DS-RX1 printer, a hidden layer, then a broken colour.
    await c.ev(`${S}.addNewLayer('text'); ${S}.addNewLayer('text'); 1`)
    await sleep(200)
    const texts = await J(c)(`${S}.project.layers.filter(l=>l.type==='text').map(l=>l.id)`)
    await c.ev(
      `${S}.editLayers(${JSON.stringify(texts)}, {fontFamily:'Zz Not Installed Font'}); ${S}.editLayers(['${texts[0]}'], {x:30, y:3480, content:'JUNE 14 · 2027'}); ${S}.editLayers(['${texts[1]}'], {x:900, y:40, content:'Hashtag'}); 1`
    )
    await c.ev(`${S}.addNewLayer('rectangle'); 1`)
    await sleep(200)
    const rectId = await c.ev(`${S}.project.layers.find(l=>l.type==='shape').id`)
    await c.ev(`${S}.editLayers(['${rectId}'], {visible:false}); 1`)
    await c.ev(`${S}.setOutputProfile('${RX1}'); ${S}.setShowSafeAreas(true); 1`)
    await sleep(500)
    const committed = await c.ev(
      `${S}.commit((p)=>({...p, layers:p.layers.map(l=>l.id==='${texts[1]}'?{...l, fill:{kind:'palette', paletteColorId:'deleted-colour'}}:l)}))`
    )
    await sleep(500)
    const groups = await J(c)(
      `[...document.querySelectorAll('#checks-panel .check-group')].map(g=>({sev:g.dataset.severity, open:g.open, label:g.querySelector('.check-group-label').textContent, cards:[...g.querySelectorAll('.check-card')].map(k=>({code:k.dataset.code, count:+k.dataset.count, topic:k.querySelector('.check-topic').textContent, title:k.querySelector('.check-title').textContent, actions:[...k.querySelectorAll('[data-action]')].map(b=>b.textContent), details:!!k.querySelector('.check-details')}))}))`
    )
    check(
      '3 groups read Error → Needs attention → Good to know (plain words, no check codes in titles)',
      committed &&
        groups.map((g) => g.label).join('|') === 'Error|Needs attention|Good to know' &&
        groups.every((g) => g.cards.every((k) => !k.title.includes(k.code))),
      groups.map((g) => [g.label, g.cards.map((k) => k.title)])
    )
    check(
      '4 Good to know starts collapsed; Error and Needs attention start open',
      groups.length === 3 && groups[0].open && groups[1].open && !groups[2].open,
      groups.map((g) => [g.sev, g.open])
    )
    const font = groups[1]?.cards.find((k) => k.code === 'font-missing')
    check(
      '4b a repeated finding is merged: "2 texts use a font that isn’t installed" with Select all 2 and Details',
      font &&
        font.title === '2 texts use a font that isn’t installed' &&
        font.actions.includes('Select all 2') &&
        font.details,
      font
    )
    const buttons = await J(c)(
      `[...document.querySelectorAll('#checks-panel button')].map(b=>({t:b.textContent.trim(), d:b.disabled}))`
    )
    check(
      '6 only working actions: no Fix / Move inside / Later, no disabled buttons in the panel',
      buttons.every((b) => !b.d && !/^(Fix|Move inside|Later)$/i.test(b.t)),
      buttons.map((b) => b.t)
    )
    // Select all → the two texts; Details shows the layer names.
    await c.ev(
      `[...document.querySelectorAll('#checks-panel .check-card[data-code="font-missing"] [data-action]')].find(b=>/Select all/.test(b.textContent)).click(); 1`
    )
    await sleep(250)
    const sel = await J(c)(`${S}.selectedIds`)
    await c.ev(
      `document.querySelector('#checks-panel .check-card[data-code="font-missing"] .check-details summary').click(); 1`
    )
    await sleep(200)
    const det = await c.ev(
      `document.querySelector('#checks-panel .check-card[data-code="font-missing"] .check-details').open && document.querySelector('#checks-panel .check-card[data-code="font-missing"] .check-details-body').textContent`
    )
    check(
      '6b Select all selects exactly the merged layers; Details opens with their names; the panel stays open',
      sel.slice().sort().join() === texts.slice().sort().join() &&
        /JUNE 14/.test(det || '') &&
        (await c.ev(`!!document.getElementById('checks-panel')`)),
      { sel, det }
    )
    const btn1 = await J(c)(
      `(()=>{const b=document.getElementById('checks-button'); return {state:b.dataset.state, counts:[...b.querySelectorAll('.ui-count')].map(x=>x.dataset.count+':'+x.textContent), tone:b.className.match(/tone-(\\w+)/)[1]}})()`
    )
    check(
      '6c the top-bar Checks button reads the worst problem with an icon, tone and separate counts',
      btn1.state === '1 error' && btn1.tone === 'error' && btn1.counts[0] === 'error:1',
      btn1
    )
    await shot(c, '02-checks-warning')
    // Escape (focus inside the panel) closes it and returns focus to the Checks button.
    await c.ev(`document.querySelector('#checks-panel .check-group summary').focus(); 1`)
    await escape(c)
    await sleep(250)
    const esc = await J(c)(
      `({open:!!document.getElementById('checks-panel'), focus:document.activeElement.id, tip:!!document.querySelector('.ui-tip')})`
    )
    check(
      '6d Escape closes the Checks panel (one level); focus returns to the Checks button without a stale tooltip',
      !esc.open && esc.focus === 'checks-button' && !esc.tip,
      esc
    )
    // Ready with notes only: fix the colour and the font, keep the hidden layer and the provisional-profile note.
    await c.ev(`${S}.undo(); 1`)
    await c.ev(
      `${S}.editLayers(${JSON.stringify(texts)}, {fontFamily:'${h.SANS}'}); ${S}.editLayers(['${texts[0]}'], {x:200, y:3000}); ${S}.editLayers(['${texts[1]}'], {x:200, y:2800}); 1`
    )
    await sleep(500)
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await sleep(400)
    const ready = await J(c)(
      `({summary:document.getElementById('checks-summary').textContent, state:document.getElementById('checks-button').dataset.state, groups:[...document.querySelectorAll('#checks-panel .check-group')].map(g=>g.dataset.severity+':'+g.open)})`
    )
    check(
      '5 only notes → the panel reads "Ready · n notes", the button "Ready"; notes stay collapsed and never look like problems',
      /^Ready · \d+ notes?$/.test(ready.summary) &&
        ready.state === 'Ready' &&
        ready.groups.join() === 'info:false',
      ready
    )
    // Responsive: header visible and every action reachable at 1426×779 and 1100×650 (body scrolls).
    await c.ev(
      `${S}.editLayers(${JSON.stringify(texts)}, {fontFamily:'Zz Not Installed Font'}); ${S}.editLayers(['${texts[0]}'], {x:30, y:3480}); 1`
    )
    await sleep(300)
    const panelAt = []
    for (const [w, ht] of [
      [1426, 779],
      [1100, 650]
    ]) {
      await size(c, w, ht)
      if (!(await c.ev(`!!document.getElementById('checks-panel')`)))
        await c.ev(`document.getElementById('checks-button').click(); 1`)
      await sleep(300)
      await c.ev(
        `document.querySelectorAll('#checks-panel details.check-group').forEach(d=>d.open=true); 1`
      )
      await sleep(200)
      const r = await J(c)(
        `(()=>{const p=document.getElementById('checks-panel'), b=p.querySelector('.drawer-body'), hd=p.querySelector('.drawer-header').getBoundingClientRect(); const acts=[...p.querySelectorAll('[data-action]')]; const last=acts[acts.length-1]; last.scrollIntoView({block:'nearest'}); const lr=last.getBoundingClientRect(), pr=p.getBoundingClientRect(), sb=document.querySelector('.statusbar').getBoundingClientRect();
          return {w:innerWidth, h:innerHeight, mode:p.dataset.mode, headerTop:Math.round(hd.top), headerVisible:hd.top>=0&&hd.bottom<=innerHeight, scrolls:b.scrollHeight>b.clientHeight, lastBottom:Math.round(lr.bottom), panelBottom:Math.round(pr.bottom), statusTop:Math.round(sb.top), hScroll:document.documentElement.scrollWidth>innerWidth}})()`
      )
      panelAt.push(r)
      await shot(c, `03-checks-${w}x${ht}`)
    }
    check(
      '31/32 Checks panel at 1426×779 and 1100×650: header visible, body scrolls, the last action is reachable above the status bar, no horizontal scroll',
      panelAt.every(
        (r) =>
          r.headerVisible &&
          r.lastBottom <= r.panelBottom &&
          r.panelBottom <= r.statusTop + 1 &&
          !r.hScroll
      ),
      panelAt
    )
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await size(c, 1920, 1000)

    // ================================================================ EXPORT
    const before = await doc(c)
    // Opened from the keyboard-focused button, so closing can be checked to restore focus there.
    await c.ev(
      `document.getElementById('export-button').focus(); document.getElementById('export-button').click(); 1`
    )
    await waitFor(
      c,
      `!!document.querySelector('[data-testid=export-summary] #export-readiness') && !/Checking/.test(document.getElementById('export-readiness').textContent)`,
      15000
    )
    const cards = await J(c)(
      `[...document.querySelectorAll('.export-card')].map(b=>({id:b.dataset.card, checked:b.getAttribute('aria-checked'), role:b.getAttribute('role'), title:b.querySelector('.export-card-title').textContent, art:!!b.querySelector('svg.art'), img:!!b.querySelector('img,image')}))`
    )
    check(
      '7 three picture cards: For the booth · Print files · Client proof (drawings, no images)',
      cards.map((x) => x.title).join('|') === 'For the booth|Print files|Client proof' &&
        cards.every((x) => x.art && !x.img && x.role === 'checkbox'),
      cards
    )
    check('8 first use: For the booth is selected', cards[0]?.checked === 'true', cards)
    check('9 Print files starts off', cards[1]?.checked === 'false', cards)
    check('10 Client proof starts off', cards[2]?.checked === 'false', cards)
    const fileLine = async () =>
      J(c)(
        `({line:document.getElementById('export-files-summary').textContent, btn:document.getElementById('export-start').textContent})`
      )
    const f1 = await fileLine()
    await c.ev(`document.querySelector('.export-card[data-card=print]').click(); 1`)
    await sleep(150)
    const f3 = await fileLine()
    await c.ev(`document.querySelector('.export-card[data-card=proof]').click(); 1`)
    await sleep(150)
    const f4 = await fileLine()
    check(
      '11 the files line and the Export button follow the cards (1 → 3 → 4 files)',
      /^Creates 1 file: Ava & Theo\.zip$/.test(f1.line) &&
        f1.btn === 'Export 1 file…' &&
        /^Creates 3 files/.test(f3.line) &&
        f3.btn === 'Export 3 files…' &&
        /^Creates 4 files/.test(f4.line) &&
        /proof\.png/.test(f4.line),
      { f1, f3, f4 }
    )
    const sum = await J(c)(
      `({text:document.getElementById('export-readiness').textContent, review:!!document.querySelector('[data-testid=export-review]'), printer:document.querySelector('[data-testid=export-output-profile]').textContent, checksOpen:document.getElementById('export-checks').open, pf:document.getElementById('preflight-summary').textContent})`
    )
    check(
      '11b pinned summary: "Almost ready · n things to look at" with Review and the printer (DNP DS-RX1 · Tested); checks stay quiet until asked',
      /^Almost ready · \d+ things? to look at$/.test(sum.text) &&
        sum.review &&
        sum.printer === 'DNP DS-RX1 · Tested' &&
        !sum.checksOpen,
      sum
    )
    await c.ev(`document.querySelector('[data-testid=export-review]').click(); 1`)
    await sleep(500)
    const rev = await J(c)(
      `({open:document.getElementById('export-checks').open, groups:[...document.querySelectorAll('#export-checks .check-group')].map(g=>g.dataset.severity+':'+g.open), codes:[...document.querySelectorAll('#export-checks .check-card')].map(k=>k.dataset.code)})`
    )
    check(
      '11c Review opens the same Checks (same groups and cards as the panel; Good to know still collapsed)',
      rev.open &&
        rev.groups.join() === 'warning:true,info:false' &&
        rev.codes.includes('font-missing') &&
        rev.codes.some((k) => k.startsWith('safe-area-')),
      rev
    )
    // Sticky header/summary/footer: scroll the body to the end.
    const sticky = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=export-dialog]'), b=d.querySelector('.body'), s=d.querySelector('.summary').getBoundingClientRect().top; b.scrollTop=b.scrollHeight; const s2=d.querySelector('.summary').getBoundingClientRect().top, f=d.querySelector('footer').getBoundingClientRect(), go=document.getElementById('export-start').getBoundingClientRect();
        return {summaryStill:Math.abs(s-s2)<1, footerIn:f.bottom<=innerHeight, goIn:go.bottom<=f.bottom&&go.top>=f.top}})()`
    )
    check(
      '12 the summary stays pinned and the footer (with Export) stays visible while the body scrolls',
      sticky.summaryStill && sticky.footerIn && sticky.goIn,
      sticky
    )
    await shot(c, '04-export-1920x1000')
    const exportAt = []
    for (const [w, ht] of [
      [1426, 779],
      [1100, 650]
    ]) {
      await size(c, w, ht)
      exportAt.push({
        w,
        ht,
        go: await reachable(c, '#export-start'),
        cancel: await reachable(c, '[data-testid=export-dialog] footer .ui-btn.ghost'),
        h: await noHScroll(c, '[data-testid=export-dialog]'),
        cardsIn: await c.ev(
          `(()=>{const r=document.querySelector('.export-card[data-card=proof]').getBoundingClientRect(); return r.right<=innerWidth}) ()`
        )
      })
      await c.ev(`document.querySelector('[data-testid=export-dialog] .body').scrollTop=0; 1`)
      await shot(c, `05-export-${w}x${ht}`)
    }
    check(
      '13/31/32 Export at 1426×779 and 1100×650: Export and Cancel visible and clickable, no horizontal scroll',
      exportAt.every(
        (r) =>
          r.go.inView &&
          r.go.top &&
          r.cancel.inView &&
          r.h.page &&
          r.h.dialog &&
          r.h.body &&
          r.cardsIn
      ),
      exportAt
    )
    // Errors open the checks by themselves and block Export.
    await escape(c)
    await sleep(300)
    const escExport = await J(c)(
      `({open:!!document.querySelector('[data-testid=export-dialog]'), focus:document.activeElement.id, tip:!!document.querySelector('.ui-tip')})`
    )
    check(
      'K1 Escape closes Export; focus returns to the Export button with no stale tooltip',
      !escExport.open && escExport.focus === 'export-button' && !escExport.tip,
      escExport
    )
    await c.ev(
      `${S}.commit((p)=>({...p, layers:p.layers.map(l=>l.id==='${texts[1]}'?{...l, fill:{kind:'palette', paletteColorId:'deleted-colour'}}:l)}))`
    )
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(
      c,
      `!/Checking/.test(document.getElementById('export-readiness')?.textContent||'Checking')`,
      15000
    )
    const err = await J(c)(
      `({text:document.getElementById('export-readiness').textContent, open:document.getElementById('export-checks').open, disabled:document.getElementById('export-start').disabled, first:document.querySelector('#export-checks .check-group').dataset.severity})`
    )
    check(
      '11d an error opens the checks by itself ("Fix 1 error before exporting") and blocks Export',
      /^Fix 1 error before exporting$/.test(err.text) &&
        err.open &&
        err.disabled &&
        err.first === 'error',
      err
    )
    await escape(c)
    await c.ev(`${S}.undo(); 1`)
    await sleep(300)
    // Real export: booth + print files + proof + the 4×6 template.
    await size(c, 1426, 779)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(
      c,
      `!/Checking/.test(document.getElementById('export-readiness')?.textContent||'Checking')`,
      15000
    )
    await c.ev(
      `document.querySelector('.export-card[data-card=print]').click(); document.querySelector('.export-card[data-card=proof]').click(); 1`
    )
    await c.ev(`document.querySelector('#export-more summary').click(); 1`)
    await sleep(200)
    await c.ev(
      `(()=>{const e=document.querySelector('.export-output[data-kind="dslrbooth-4x6"] input'); if(!e.checked) e.click(); return 1})()`
    )
    await sleep(200)
    const more = await J(c)(
      `[...document.querySelectorAll('.export-output')].map(e=>e.dataset.kind+':'+e.querySelector('input').checked)`
    )
    await c.ev(`document.getElementById('export-start').click(); 1`)
    const done = await waitFor(c, `!!document.getElementById('export-result')`, 120000)
    const files = fs.readdirSync(outDir).sort()
    const pngSize = (f) => {
      const b = fs.readFileSync(path.join(outDir, f))
      return [b.readUInt32BE(16), b.readUInt32BE(20)]
    }
    const zipNames = (f) =>
      execFileSync(h.PY, [
        '-I',
        '-c',
        'import zipfile,sys,json; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',
        path.join(outDir, f)
      ]).toString()
    const z = files
      .filter((f) => f.endsWith('.zip'))
      .map(zipNames)
      .join(' ')
    check(
      '14 the existing outputs still export: both dslrBooth ZIPs, print, design and proof PNGs at their sizes; no sample in any file',
      done &&
        more.join() === 'dslrbooth:true,dslrbooth-4x6:true,print:true,design:true,proof:true' &&
        files.join('|') ===
          'Ava & Theo 4x6.zip|Ava & Theo-design.png|Ava & Theo-print.png|Ava & Theo-proof.png|Ava & Theo.zip' &&
        pngSize('Ava & Theo-print.png').join('x') === '2400x3600' &&
        pngSize('Ava & Theo-design.png').join('x') === '1200x3600' &&
        pngSize('Ava & Theo-proof.png').join('x') === '2400x3600' &&
        !/sample/i.test(z),
      { files, more, z: z.slice(0, 200) }
    )
    await c.ev(
      `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Done'); b&&b.click(); return 1})()`
    )
    await sleep(300)
    const after = await doc(c)
    check('14b exporting never changes the project or its history', after.json === before.json, {
      before: before.past,
      after: after.past
    })

    // ================================================================ PRINTER & CUTTING
    await size(c, 1426, 779)
    const viewItems = await menuLabels(c, 'view')
    await openMenu(c, 'view')
    await clickMenuItem(c, 'Printer & cutting…')
    await waitFor(c, `!!document.querySelector('[data-testid=printer-dialog]')`, 5000)
    await sleep(400)
    const pr = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=printer-dialog]'), body=d.querySelector('.body').getBoundingClientRect(), dia=document.querySelector('[data-testid=printer-diagram] .printer-corner-art').getBoundingClientRect(), svg=d.querySelector('svg.corner');
        return {title:d.querySelector('h2').textContent, ready:(d.querySelector('[data-testid=printer-readiness]')||{}).textContent||null, diagramIn:dia.top>=body.top-1&&dia.bottom<=body.bottom+1&&dia.height>120, trim:d.querySelector('[data-testid=trim-label]').textContent, safe:d.querySelector('[data-testid=safe-label]').textContent,
          hatch:!!svg.querySelector('pattern#trim-hatch'), band:!!svg.querySelector('path[fill="url(#trim-hatch)"]'), dashed:!!svg.querySelector('path[stroke-dasharray]'), steps:[...d.querySelectorAll('.meter-steps li')].map(l=>l.dataset.step+(l.getAttribute('aria-current')?'*':'')), current:d.querySelector('.meter-steps [aria-current] .meter-label').textContent,
          tiles:[...d.querySelectorAll('.setup-tile')].map(t=>t.dataset.tile+'|'+t.textContent), evOpen:d.querySelector('#printer-evidence').open, prod:d.querySelector('[data-testid=production-state]').textContent, text:d.textContent, img:d.querySelectorAll('img').length}})()`
    )
    check(
      '15 the dialog is "Printer & cutting · DNP DS-RX1" (View menu item renamed; no "Output profile" wording)',
      pr.title === 'Printer & cutting · DNP DS-RX1' &&
        viewItems.includes('Printer & cutting…') &&
        !viewItems.includes('Output profile…'),
      { title: pr.title, viewItems }
    )
    check(
      '16 the strip-corner diagram is visible without scrolling at 1426×779',
      pr.diagramIn,
      pr.diagramIn
    )
    check(
      '17 the diagram shows the amber trim band ("May be cut off · about 1.6–1.8 mm (estimate)") and the dashed teal safe line ("… inside · 3 mm")',
      pr.hatch &&
        pr.band &&
        pr.dashed &&
        pr.trim === 'May be cut off · about 1.6–1.8 mm (estimate)' &&
        pr.safe === 'Keep names and logos inside · 3 mm',
      { trim: pr.trim, safe: pr.safe }
    )
    check(
      '18 the 3-step meter: Estimated · Tested on a print · Measured',
      pr.steps.join() === 'estimated,tested*,measured',
      pr.steps
    )
    check(
      '19 DS-RX1 reads "Tested on a print" and "Ready to use"',
      pr.current === 'Tested on a print' && pr.ready === 'Ready to use',
      { current: pr.current, ready: pr.ready }
    )
    check(
      '19b setup tiles in plain words: dslrBooth (2×6, Print 2 per page) · Printer settings (2-inch cut, margin off) · Paper (6×4 PC)',
      pr.tiles.length === 3 &&
        /Print 2 per page/.test(pr.tiles[0]) &&
        /2-inch centre cut on, print margin off/.test(pr.tiles[1]) &&
        /6×4 \(PC\)/.test(pr.tiles[2]) &&
        !/CUT_2INCH/.test(pr.tiles.join()),
      pr.tiles
    )
    check(
      '19c no developer notes or repository paths in the dialog; no pictures of people',
      !/research\/|docs\/|\.md\b|Source:|CLAUDE/.test(pr.text) &&
        pr.img === 0 &&
        !SAMPLE_WORDS.test(pr.text),
      pr.img
    )
    await shot(c, '06-printer-1426x779')
    await c.ev(`document.querySelector('#printer-evidence summary').click(); 1`)
    await sleep(300)
    const ev = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=output-profile-details]'); const rows={}; for (const dt of d.querySelectorAll('dt')) { const dd=dt.nextElementSibling; rows[dt.textContent]={text:dd.textContent, ev:(dd.querySelector('[data-evidence]')||{dataset:{}}).dataset.evidence||null} } return {open:document.getElementById('printer-evidence').open, rows}})()`
    )
    check(
      '20 "How do we know?" opens the per-value evidence (overall: Observed on test laptop)',
      ev.open &&
        /Observed on test laptop/.test(ev.rows.Overall?.text || '') &&
        Object.keys(ev.rows).length >= 15,
      Object.keys(ev.rows)
    )
    check(
      '21 trim stays an estimate (Inferred; cut loss Unknown) and the safe line stays Provisional',
      ['Trim, top edge', 'Trim, bottom edge', 'Trim, left edge', 'Trim, right edge'].every(
        (k) => ev.rows[k]?.ev === 'inferred'
      ) &&
        ev.rows['Trim at the cut']?.ev === 'unknown' &&
        ev.rows['Safe line, edges']?.ev === 'provisional',
      Object.fromEntries(Object.entries(ev.rows).filter(([k]) => /Trim|Safe/.test(k)))
    )
    check(
      '22 the production booth stays unverified (meter line and evidence row)',
      pr.prod === 'Not yet verified on the production booth PC.' &&
        /Not yet verified/.test(ev.rows['Production booth']?.text || '') &&
        ev.rows['Production booth']?.ev === 'unknown',
      { prod: pr.prod, row: ev.rows['Production booth'] }
    )
    await c.ev(`document.getElementById('printer-evidence').scrollIntoView(); 1`)
    await sleep(200)
    await shot(c, '07-printer-evidence')
    await c.ev(
      `document.querySelector('#printer-evidence summary').click(); document.querySelector('[data-testid=printer-dialog] .body').scrollTop=0; 1`
    )
    await size(c, 1100, 650)
    const prShort = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=printer-dialog]'), body=d.querySelector('.body').getBoundingClientRect(), dia=document.querySelector('[data-testid=printer-diagram] .printer-corner-art').getBoundingClientRect(); return {diagramIn:dia.top>=body.top-1&&dia.bottom<=body.bottom+1}})()`
    )
    const prDone = await reachable(c, '[data-testid=printer-dialog] footer .ui-btn.primary')
    check(
      '32b Printer & cutting at 1100×650: the diagram is visible without scrolling and Done is reachable; no horizontal scroll',
      prShort.diagramIn &&
        prDone.inView &&
        prDone.top &&
        (await noHScroll(c, '[data-testid=printer-dialog]')).body,
      { prShort, prDone }
    )
    await shot(c, '08-printer-1100x650')
    await escape(c)
    await sleep(250)

    // ================================================================ SAFE-AREA WARNING HALO
    await size(c, 1920, 1000)
    await c.ev(
      `${S}.commit((p)=>({...p, canvas:{...p.canvas, backgroundColor:{kind:'literal', value:'#d0201c'}}}))`
    )
    await c.ev(`${S}.selectLayer(null); 1`)
    await sleep(700)
    const halo = await J(c)(
      `(()=>{const st=Konva.stages.filter(s=>s.container().isConnected)[0]; const flags=st.find('.safe-flag'), halos=st.find('.safe-flag-halo'); if(!flags.length) return {flags:0};
        const same=flags.every((f,i)=>{const a=halos[i]; return a&&['x','y','width','height'].every(k=>Math.abs(a[k]()-f[k]())<1e-9)});
        const f=flags[0], box=f.getClientRect(), cv=st.toCanvas(), x=cv.getContext('2d'), ratio=cv.width/st.width();
        const sample=(px,py)=>{const d=x.getImageData(Math.round(px*ratio),Math.round(py*ratio),1,1).data; return [d[0],d[1],d[2]]};
        const lum=(c)=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
        let dark=0, flag=0, n=0; const y=box.y+box.height/2; for(let dx=-6;dx<=6;dx++){ const c=sample(box.x+dx, y); n++; if(lum(c)<45) dark++; if(c[0]>200&&c[1]<160&&c[2]<150) flag++ }
        const bg=sample(box.x+box.width/2, box.y-30);
        return {flags:flags.length, halos:halos.length, same, haloStroke:halos[0].stroke(), haloWidth:halos[0].strokeWidth(), flagWidth:f.strokeWidth(), dark, flag, n, bg, bgLum:Math.round(lum(bg))}})()`
    )
    check(
      '29 the warning outline stays visible over red artwork: a dark halo understroke sits beside the red dashed line',
      halo.flags > 0 &&
        halo.halos === halo.flags &&
        halo.dark >= 2 &&
        halo.bgLum > 45 &&
        halo.haloStroke === 'rgba(0, 0, 0, 0.6)',
      halo
    )
    check(
      '30 the halo is the same rectangle as the warning (no new geometry)',
      halo.same && halo.haloWidth > halo.flagWidth,
      { same: halo.same, haloWidth: halo.haloWidth, flagWidth: halo.flagWidth }
    )
    await shot(c, '09-halo-over-red')
    const r1 = await c.ev(
      `(async()=>{const a=await __wts.renderToDataUrl(); const b=await __wts.renderSheetToDataUrl(); return a.dataUrl.length+':'+b.dataUrl.length})()`
    )
    await c.ev(`${S}.setShowSafeAreas(false); 1`)
    await sleep(300)
    const r2 = await c.ev(
      `(async()=>{const a=await __wts.renderToDataUrl(); const b=await __wts.renderSheetToDataUrl(); return a.dataUrl.length+':'+b.dataUrl.length})()`
    )
    const renders = await J(c)(
      `(async()=>{const a=await __wts.renderToDataUrl(); await ${S}.setShowSafeAreas(true); await new Promise(r=>setTimeout(r,300)); const b=await __wts.renderToDataUrl(); return {same:a.dataUrl===b.dataUrl}})()`
    ).catch(() => ({ same: null }))
    check(
      '30b safe areas (and the halo) never reach a render or an export: renders are identical with safe areas on and off',
      r1 === r2 && renders.same !== false,
      { r1, r2, renders }
    )
    await c.ev(`${S}.undo(); 1`)
    await sleep(300)

    // ================================================================ DSLRBOOTH IMPORT
    await size(c, 1426, 779)
    await openMenu(c, 'file')
    await clickMenuItem(c, 'Import dslrBooth template…')
    await waitFor(c, `!!document.querySelector('.dslr-import')`, 20000)
    await sleep(500)
    const imp = await J(c)(
      `(()=>{const d=document.querySelector('[data-testid=dslr-import-dialog]'); return {found:d.querySelector('[data-testid=import-found] strong').textContent,
        layouts:[...d.querySelectorAll('.dslr-import-layout')].map(e=>({v:e.dataset.layout, checked:e.querySelector('input').checked, rec:(e.querySelector('.ui-badge')||{}).textContent||null, title:e.querySelector('.title').childNodes[0].textContent, art:!!e.querySelector('svg.art')})),
        compatOpen:d.querySelector('#import-compat').open, facts:!!d.querySelector('#import-compat .dslr-import-facts'), forYou:[...d.querySelectorAll('.import-for-you .preflight-item')].map(e=>e.dataset.code), technical:[...d.querySelectorAll('#import-compat .preflight-item')].map(e=>e.dataset.code), text:d.textContent}})()`
    )
    check(
      '23 the import begins with a plain-language summary: "We found a 2×6 design printed twice on a 4×6 sheet."',
      imp.found === 'We found a 2×6 design printed twice on a 4×6 sheet.',
      imp.found
    )
    check(
      '24 "One 2×6 strip, printed two per sheet" is first and marked Recommended (with a drawing)',
      imp.layouts[0]?.v === 'strip' &&
        imp.layouts[0].rec === 'Recommended' &&
        imp.layouts[0].title === 'One 2×6 strip, printed two per sheet' &&
        imp.layouts[0].art,
      imp.layouts
    )
    check(
      '25 the as-is option is offered: "The 4×6 sheet exactly as it is"',
      imp.layouts[1]?.v === 'as-is' &&
        imp.layouts[1].title === 'The 4×6 sheet exactly as it is' &&
        !imp.layouts[1].rec,
      imp.layouts[1]
    )
    check(
      '26 the recommended one-strip option is selected by default',
      imp.layouts[0]?.checked && !imp.layouts[1]?.checked,
      imp.layouts
    )
    check(
      '27 Compatibility details start collapsed and hold the facts and the technical notes (nothing dropped)',
      !imp.compatOpen &&
        imp.facts &&
        imp.technical.includes('two-up') &&
        imp.technical.includes('original-device'),
      { forYou: imp.forYou, technical: imp.technical }
    )
    await shot(c, '10-import-1426x779')
    await c.ev(`document.querySelector('#import-compat summary').click(); 1`)
    await sleep(300)
    await shot(c, '11-import-compatibility')
    const impAt = []
    await size(c, 1100, 650)
    impAt.push({
      go: await reachable(c, '[data-testid=dslr-import-dialog] footer .ui-btn.primary'),
      h: await noHScroll(c, '[data-testid=dslr-import-dialog]'),
      cards: await c.ev(
        `(()=>{const b=document.querySelector('[data-testid=dslr-import-dialog] .body'); b.scrollTop=0; const r=document.querySelector('.dslr-import-layout[data-layout="as-is"]').getBoundingClientRect(), br=b.getBoundingClientRect(); return r.bottom<=br.bottom+1})()`
      )
    })
    check(
      '32c dslrBooth import at 1100×650: both layout choices visible without scrolling, Import reachable, no horizontal scroll',
      impAt.every((r) => r.go.inView && r.go.top && r.h.body && r.cards),
      impAt
    )
    await size(c, 1426, 779)
    await c.ev(
      `document.querySelector('[data-testid=dslr-import-dialog] footer .ui-btn.primary').click(); 1`
    )
    await waitFor(c, `!document.querySelector('.dslr-import')`, 30000)
    await sleep(800)
    const imported = await J(c)(
      `(()=>{const p=${S}.project; return {design:[p.canvas.print.width,p.canvas.print.height], sheet:[p.output.print.width,p.output.print.height], slots:p.layers.filter(l=>l.type==='photo').length, name:p.metadata.name}})()`
    )
    check(
      '28 the import result is unchanged: one 2×6 strip printed two per sheet (4×6), 3 photo slots',
      imported.design.join('x') === '2x6' &&
        imported.sheet.join('x') === '4x6' &&
        imported.slots === 3,
      imported
    )

    // ================================================================ DARK + COMPACT, NO SAMPLE PHOTOS
    await openMenu(c, 'view')
    await clickMenuItem(c, 'Dark theme')
    await sleep(300)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(
      c,
      `!/Checking/.test(document.getElementById('export-readiness')?.textContent||'Checking')`,
      15000
    )
    await shot(c, '12-export-dark')
    const darkText = await c.ev(`document.querySelector('[role=dialog]').textContent`)
    await escape(c)
    await openMenu(c, 'view')
    await clickMenuItem(c, 'Printer & cutting…')
    await waitFor(c, `!!document.querySelector('[data-testid=printer-dialog]')`, 5000)
    await sleep(300)
    await shot(c, '13-printer-dark')
    await escape(c)
    await openMenu(c, 'view')
    await clickMenuItem(c, 'Light theme')
    await openMenu(c, 'view')
    await clickMenuItem(c, 'Compact size')
    await size(c, 1100, 650)
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await sleep(400)
    await shot(c, '14-checks-compact-1100x650')
    await c.ev(`document.getElementById('checks-button').click(); 1`)
    await c.ev(`document.getElementById('export-button').click(); 1`)
    await waitFor(
      c,
      `!/Checking/.test(document.getElementById('export-readiness')?.textContent||'Checking')`,
      15000
    )
    const compactGo = await reachable(c, '#export-start')
    await shot(c, '15-export-compact-1100x650')
    check(
      '33 Dark and Compact: Export stays reachable at 1100×650 in Compact; the dialogs keep their structure in Dark',
      compactGo.inView && compactGo.top && /What do you need\?/.test(darkText),
      compactGo
    )
    await escape(c)
    await openMenu(c, 'view')
    await clickMenuItem(c, 'Comfortable size')
    const everywhere = await c.ev(`document.body.textContent`)
    check(
      'S no Sample Photos anywhere (top bar, panel, dialogs, menus): no Sample photos / Shuffle / Reset samples / Choose photo / Reposition',
      !SAMPLE_WORDS.test(everywhere) &&
        !SAMPLE_WORDS.test(darkText) &&
        !SAMPLE_WORDS.test(imp.text) &&
        !(await menuLabels(c, 'view')).some((l) => SAMPLE_WORDS.test(l)),
      null
    )
    check('E no console errors', errors.length === 0, errors.slice(0, 5))
  } catch (e) {
    console.log('HARNESS ERROR', e)
    check('harness', false, String(e).slice(0, 300))
  } finally {
    await h.kill(proc)
    const passed = results.filter((r) => r.ok).length
    console.log(`\n${passed}/${results.length} passed`)
    fs.writeFileSync(
      path.join(__dirname, 'results-7b-b4.json'),
      JSON.stringify(results, null, 2) + '\n'
    )
    fs.rmSync(work, { recursive: true, force: true })
    process.exit(passed === results.length ? 0 : 1)
  }
})()
