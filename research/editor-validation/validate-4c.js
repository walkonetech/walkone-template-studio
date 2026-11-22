// Phase 4C scripted validation of the REDESIGNED editor (automation over the DevTools protocol with real mouse and
// keyboard events; NOT human testing and NOT a visual-design judgement). Launches the built app itself.
// Run: npm run build && node research/editor-validation/validate-4c.js
const fs = require('fs')
const path = require('path')
const h = require('./harness')
const { sleep } = h

const tmp = h.tmpDir('wts-4c-')
const ud = path.join(tmp, 'ud')
const SHOTS = path.join(__dirname, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const sessionsDir = () => path.join(ud, 'sessions')
const sessions = () => (fs.existsSync(sessionsDir()) ? fs.readdirSync(sessionsDir()) : [])
let port = 9370

/**
 * The right-column panel an expression/selector needs (B3.1). Below 860 CSS px tall Properties and Layers are TABS
 * (Windows 1440×900 at 125 % ≈ 779 px), so only one exists in the DOM: before reading or clicking inside one, the
 * helpers below bring it on screen exactly as a user would (a tab click via h.showPanel; nothing when stacked).
 * An expression that needs BOTH panels is left alone (such checks read them one at a time).
 */
const panelFor = (js) => {
  const props = /inspector-panel|psection/.test(js)
  const layers = /layers-panel|layer-row|More layer actions|Add layer/.test(js)
  return props && !layers ? 'properties' : layers && !props ? 'layers' : null
}

async function session(opts, fn) {
  const { proc, c } = await h.launch({ port: port++, userData: ud, ...opts })
  const S = async (e) => {
    const panel = panelFor(e)
    if (panel) await h.showPanel(c, panel)
    return c.ev(`JSON.stringify(${e})`).then(JSON.parse)
  }
  // Measure after the panel has finished scrolling the element into view (first call scrolls, second is stable).
  const Sstable = async (e) => {
    await S(e)
    await c.sleep(150)
    return S(e)
  }
  const api = {
    c,
    proc,
    S,
    shot: async (name) => {
      const r = await c.send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'))
    },
    state: () =>
      S(
        `(()=>{const s=__wts.store.getState(); return {has:!!s.project, name:s.project&&s.project.metadata.name, dirty:s.project!==null&&s.project!==s.savedProject, past:s.history.past.length, sel:s.selectedIds, layers:s.project?s.project.layers.length:0, snapping:s.snapping.enabled, file:s.session&&s.session.fileName, scale:s.view&&s.view.mode}})()`
      ),
    layer: (name) =>
      S(`__wts.store.getState().project.layers.find(l=>l.name===${JSON.stringify(name)})`),
    center: (js) =>
      Sstable(
        `(()=>{const el=${js}; if(!el) return null; el.scrollIntoView({block:'center',behavior:'instant'}); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`
      ),
    btn: (label) =>
      `[...document.querySelectorAll('button,[role=menuitem],[role=menuitemcheckbox],[role=radio]')].find(x=>(x.getAttribute('aria-label')||x.textContent.trim())===${JSON.stringify(label)})`,
    field: (text) =>
      `document.getElementById([...document.querySelectorAll('.inspector-panel label')].find(l=>l.textContent.includes(${JSON.stringify(text)})).htmlFor)`,
    menuItem: (text) =>
      `[...document.querySelectorAll('[role=menu] [role^=menuitem]')].find(x=>x.querySelector('.grow').textContent.trim()===${JSON.stringify(text)})`,
    clickEl: async (js) => {
      const panel = panelFor(js)
      if (panel) await h.showPanel(c, panel)
      const p = await api.center(js)
      if (!p) return false
      await c.click(p)
      return true
    },
    done: () => h.kill(proc)
  }
  api.press = (label) => api.clickEl(api.btn(label))
  api.type = async (fieldText, value) => {
    await api.clickEl(api.field(fieldText))
    await c.insertText(value)
    await c.key('Enter', { code: 'Enter', vk: 13 })
    await sleep(150)
  }
  /** B5: secondary Properties sections start closed; open one by its title before using its fields. */
  api.openSection = async (title) => {
    await c.ev(
      `(()=>{const t=[...document.querySelectorAll('.inspector-panel .psection-toggle')].find(x=>x.querySelector('.psection-title')?.textContent===${JSON.stringify(title)}); if(t&&t.getAttribute('aria-expanded')==='false') t.click(); return 1})()`
    )
    await sleep(150)
  }
  api.selectByName = async (name) => {
    const id = (await api.layer(name)).id
    await c.ev(`__wts.store.getState().selectLayer(${JSON.stringify(id)}); 1`)
    await sleep(250)
    return id
  }
  try {
    await fn(api)
  } finally {
    await api.done()
  }
}

;(async () => {
  const savePath = path.join(tmp, 'Studio.boothproject')

  // ================= WELCOME (empty user-data: no recents) =================
  await session(
    {
      env: { WALKONE_DEV_SAVE_PATH: savePath, WALKONE_DEV_UNSAVED_CHOICES: 'discard' },
      size: h.STANDARD_SIZE
    },
    async (a) => {
      const { c } = a
      check(
        'renderer has no Node access',
        (await c.ev('typeof require + typeof process')) === 'undefinedundefined'
      )
      const w = await a.S(
        `{h1: document.querySelector('#welcome-title')?.textContent, rail: !!document.querySelector('.toolrail'), side: !!document.querySelector('.sidebar'), canvas: document.querySelectorAll('canvas').length, newBtn: !!document.getElementById('start-blank'), importBtn: !!document.getElementById('start-import'), openBtn: !!(${a.btn('Open project…')}), recentEmpty: !!document.querySelector('.welcome-empty'), noDocActions: !document.getElementById('save-button') && !document.getElementById('export-button'), guided: /guided/i.test(document.querySelector('.welcome').textContent), sample: !!(${a.btn('New sample project')})}`
      )
      check(
        'welcome appears with no project (no rail, no side panels, no canvas)',
        w.h1 === 'Start a template' && !w.rail && !w.side && w.canvas === 0,
        w
      )
      check(
        'Start screen (B3) offers Blank design, Import dslrBooth and Open project…, an empty recents message, no Guided Design, and no document actions in the top bar',
        w.newBtn && w.importBtn && w.openBtn && w.recentEmpty && w.noDocActions && !w.guided,
        w
      )
      await a.shot('4c-01-welcome')

      // File menu from the keyboard-reachable menubar
      await a.clickEl(a.btn('File'))
      await sleep(250)
      const items = await a.S(
        `[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(x=>({t:x.querySelector('.grow').textContent, d:x.disabled}))`
      )
      const labels = items.map((i) => i.t)
      check(
        'File menu lists New, Open, Save, Save As, Close',
        ['New project…', 'Open…', 'Save', 'Save As…', 'Close project'].every((l) =>
          labels.includes(l)
        ),
        labels
      )
      check(
        'File menu: only New, Open and Import dslrBooth template enabled with no project',
        items
          .filter((i) => !i.d)
          .map((i) => i.t)
          // B5: Settings… is a setting of this computer, so it works without a project too.
          .join() === 'New project…,Open…,Import dslrBooth template…,Settings…'
      )
      check('menu exposes no diagnostic entries', !labels.some((l) => /sample|debug|dev/i.test(l)))
      await c.key('Escape', { code: 'Escape', vk: 27 })
      await sleep(200)
      check(
        'Escape closes the menu',
        (await a.S(`!!document.querySelector('[role=menu]')`)) === false
      )

      // Cmd+N works from the welcome screen
      await c.key('n', { code: 'KeyN', vk: 78, modifiers: h.MOD_BIT })
      await sleep(400)
      check(
        '⌘N opens the New project dialog (welcome screen)',
        await a.S(`!!document.querySelector('[role=dialog]')`)
      )
      await c.key('Escape', { code: 'Escape', vk: 27 })
      await sleep(250)

      // New project dialog (the Start screen's Blank design card)
      await a.clickEl(`document.getElementById('start-blank')`)
      await sleep(400)
      const dlg = await a.S(
        `(()=>{const d=document.querySelector('[role=dialog]'); return d&&{modal:d.getAttribute('aria-modal'), title:d.querySelector('h2').textContent, focus:document.activeElement.id!=='' && document.activeElement.tagName, labelled:!!d.getAttribute('aria-labelledby')}})()`
      )
      check(
        'New project opens an accessible dialog with focus inside',
        dlg && dlg.modal === 'true' && dlg.labelled && dlg.focus === 'INPUT',
        dlg
      )
      await a.shot('4c-02-new-project-dialog')
      await c.key('Escape', { code: 'Escape', vk: 27 })
      await sleep(250)
      check(
        'Escape closes the dialog without creating a project',
        (await a.state()).has === false && !(await a.S(`!!document.querySelector('[role=dialog]')`))
      )
      await a.clickEl(`document.getElementById('start-blank')`)
      await sleep(300)
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: h.MOD_BIT,
        windowsVirtualKeyCode: 65
      })
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: h.MOD_BIT,
        windowsVirtualKeyCode: 65
      })
      await c.insertText('Studio Test')
      await c.ev(
        `(()=>{[...document.querySelectorAll('[role=dialog] [role=radio]')].find(x=>x.textContent.trim()==='2×6 Photo Strip').click()})()`
      )
      await c.key('Enter', { code: 'Enter', vk: 13 })
      await sleep(1000)
      const st = await a.state()
      check(
        'Enter in the dialog creates the project (name + format)',
        st.has && st.name === 'Studio Test',
        st
      )
      check('New project opens Modified (never saved)', st.dirty === true)
      const title = await a.S(
        `{name: document.querySelector('#doc-name').textContent, state: document.querySelector('#doc-state').textContent.trim(), print: document.querySelector('#print-info').textContent}`
      )
      check(
        'top bar shows project name and Modified; status bar shows the format',
        title.name === 'Studio Test' &&
          title.state === 'Modified' &&
          /2×6/.test(title.print) &&
          /600 DPI/.test(title.print),
        title
      )
      check(
        'rail, drawer, canvas and side panels appear with a project',
        await a.S(
          `!!document.querySelector('.toolrail') && !!document.querySelector('.sidebar') && document.querySelectorAll('canvas').length>0`
        )
      )
      check(
        'empty project: Layers shows its empty state, Properties shows the project (read one panel at a time: tabs below 860 px)',
        (await a.S(
          `!!document.querySelector('.layers-panel .ui-empty') && /No layers yet/.test(document.querySelector('.layers-panel').textContent)`
        )) &&
          (await a.S(
            `/No layer selected/.test(document.querySelector('.inspector-panel').textContent)`
          ))
      )
      const rc = await h.rightColumn(c)
      check(
        'the right column follows the responsive contract for the actual CSS height (stacked ≥ 860 px, tabs below)',
        rc.layout === rc.expected,
        rc
      )
      // Save via the primary button (Save As dialog answered by override) -> Saved state
      await a.press('Save')
      await sleep(1200)
      const saved = await a.S(
        `{state: document.querySelector('#doc-state').textContent.trim(), file: __wts.store.getState().session.fileName}`
      )
      check(
        'Save (primary button) writes the file and the title shows Saved',
        saved.state === 'Saved' && saved.file === 'Studio.boothproject' && fs.existsSync(savePath),
        saved
      )
    }
  )

  // ================= RECENT + OPEN from welcome =================
  await session({ env: { WALKONE_DEV_OPEN_PATH: savePath }, size: h.STANDARD_SIZE }, async (a) => {
    const card = await a.S(
      `[...document.querySelectorAll('.recent-card')].map(x=>({t:x.textContent, dis:x.disabled}))`
    )
    check(
      'recent project card appears with a relative time and no path',
      card.length === 1 &&
        /Studio Test/.test(card[0].t) &&
        /2×6 strip · opened (just now|\d+ minutes? ago)/.test(card[0].t) &&
        !card[0].t.includes(tmp),
      card
    )
    await a.shot('4c-03-welcome-recent')
    await a.clickEl('document.querySelector(".recent-card")')
    await sleep(1200)
    const s = await a.state()
    check(
      'clicking a recent project opens it clean',
      s.has && s.name === 'Studio Test' && !s.dirty,
      s
    )
    await a.c.ev('__wts.store.getState().closeProject ? 1 : 0')
    await a.press('Close project').catch(() => {})
  })
  fs.rmSync(path.join(ud, 'sessions'), { recursive: true, force: true })

  // Missing recent file is flagged, not clickable
  fs.renameSync(savePath, savePath + '.moved')
  await session({ size: h.STANDARD_SIZE }, async (a) => {
    const card = await a.S(
      `[...document.querySelectorAll('.recent-grid > li')].map(x=>({t:x.textContent, dis:x.querySelector('.recent-card').disabled, locate:!!x.querySelector('[aria-label^="Locate"]')}))`
    )
    check(
      'missing recent file stays listed with "File not found", is disabled and offers Locate…',
      card.length === 1 && /File not found/.test(card[0].t) && card[0].dis && card[0].locate,
      card
    )
    await a.shot('4c-04-welcome-missing-recent')
  })
  fs.renameSync(savePath + '.moved', savePath)

  // ================= EDITOR (sample project, 1440x900) =================
  await session(
    {
      env: {
        WALKONE_DEV_SAVE_PATH: path.join(tmp, 'Sample.boothproject'),
        WALKONE_DEV_UNSAVED_CHOICES: 'discard'
      },
      size: h.STANDARD_SIZE
    },
    async (a) => {
      const { c } = a
      await a.press('New sample project')
      await sleep(1200)
      check(
        'sample project at 1440 (floating tier, B3): the tool drawer starts closed so the canvas keeps its room',
        await a.S(`!document.querySelector('.tooldrawer')`)
      )
      check(
        'labelled rail (B3): Elements, Text, Photos, Uploads, Colors; all real, none pressed while closed',
        await a.S(
          `(()=>{const b=[...document.querySelectorAll('.toolrail-btn')]; return b.map(x=>x.textContent.trim()).join()==='Elements,Text,Photos,Uploads,Colors' && b.every(x=>x.getAttribute('aria-pressed')==='false' && !x.hasAttribute('aria-disabled'))})()`
        )
      )
      await c.ev(`document.querySelector('[data-tool=elements]').click(); 1`)
      await sleep(300)
      check(
        'Elements opens the drawer floating over the canvas; the rail button shows it pressed',
        await a.S(
          `document.querySelector('.tooldrawer')?.dataset.mode==='floating' && document.querySelector('[data-tool=elements]').getAttribute('aria-pressed')==='true'`
        )
      )
      await a.shot('4c-05-editor-1440')

      // Layers panel selection + inspector
      const titleId = await a.layer('Event title')
      await a.clickEl(`document.getElementById('layer-row-${titleId.id}')`)
      await sleep(300)
      let s = await a.state()
      check('Layers: clicking a row selects it', s.sel.length === 1 && s.sel[0] === titleId.id)
      check(
        // B5: text Essentials (Content, Font, Style, Color, Align) then Position & size / Spacing & box / Appearance / Layer.
        'Properties: shows text Essentials and the Position & size / Spacing & box / Appearance / Layer sections',
        await a.S(
          `!!document.querySelector('.inspector-panel [data-essentials=text]') && ['Layer','Position & size','Spacing & box','Appearance'].every(t=>[...document.querySelectorAll('.psection-title')].some(x=>x.textContent.trim()===t))`
        )
      )
      await a.shot('4c-06-text-selected')

      // numeric edit: X
      await a.openSection('Position & size')
      await a.type('X (px)', '321')
      check('inspector numeric edit: X commits on Enter', (await a.layer('Event title')).x === 321)
      s = await a.state()
      check('numeric edit is one undo step and marks Modified', s.dirty && s.past >= 1)
      // invalid numeric entry
      await a.clickEl(a.field('Y (px)'))
      await c.insertText('abc')
      await c.key('Enter', { code: 'Enter', vk: 13 })
      await sleep(150)
      check(
        'invalid number keeps the old value and shows an inline error state',
        (await a.layer('Event title')).y === titleId.y
      )
      // opacity slider + numeric
      await a.openSection('Appearance')
      await a.type('Opacity (%)', '50')
      check(
        'opacity numeric field commits (50%)',
        Math.abs((await a.layer('Event title')).opacity - 0.5) < 1e-6
      )
      // rename in inspector
      await a.openSection('Layer')
      await a.type('Name', 'Headline')
      check('rename via inspector name field', !!(await a.layer('Headline')))
      // rename in panel by double-click
      const hid = (await a.layer('Headline')).id
      await a.c.dblclick(await a.center(`document.querySelector('#layer-row-${hid} .layer-name')`))
      await sleep(200)
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: h.MOD_BIT,
        windowsVirtualKeyCode: 65
      })
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: h.MOD_BIT,
        windowsVirtualKeyCode: 65
      })
      await c.insertText('Title')
      await c.key('Enter', { code: 'Enter', vk: 13 })
      await sleep(200)
      check('rename in the Layers panel (double-click, Enter)', !!(await a.layer('Title')))
      // text content edit via inspector textarea
      await a.clickEl(a.field('Content'))
      await c.ev(`${a.field('Content')}.select(); 1`)
      await c.insertText('Hello World')
      await a.clickEl(a.field('Font size'))
      await sleep(250)
      check(
        'text content edit (textarea commit on blur)',
        (await a.layer('Title')).content === 'Hello World'
      )
      // colour: hex field
      const colorSwatch = await a.S(
        `!!document.querySelector('.inspector-panel .swatch.lg') && !!document.querySelector('.inspector-panel .hex-input') && !!(${a.btn('Open Color color picker')})`
      )
      check('color control: swatch + hex + picker button (native picker is secondary)', colorSwatch)
      await a.type('Color', '#ff0000')
      const fill = (await a.layer('Title')).fill
      check('color hex edit commits', fill && fill.value === '#ff0000', fill)
      await a.clickEl(a.field('Color'))
      await c.insertText('zzz')
      await c.key('Enter', { code: 'Enter', vk: 13 })
      await sleep(150)
      check(
        'invalid hex is rejected (fill unchanged) with an alert',
        (await a.layer('Title')).fill.value === '#ff0000' &&
          (await a.S(`!!document.querySelector('.inspector-panel [role=alert]')`))
      )

      // section collapse state survives selection change and is UI-only
      const pastBefore = (await a.state()).past
      await a.clickEl(
        `[...document.querySelectorAll('.psection-toggle')].find(x=>x.querySelector('.psection-title')?.textContent==='Appearance')`
      )
      check(
        'inspector section collapses (aria-expanded false)',
        await a.S(
          `[...document.querySelectorAll('.psection-toggle')].find(x=>x.querySelector('.psection-title')?.textContent==='Appearance').getAttribute('aria-expanded')==='false'`
        )
      )
      await a.selectByName('Photo 1')
      check(
        // B5: photo Essentials (Photo number, Fit, Frame) + the Frame details section; Position & size stays open.
        'collapse state persists across selection; photo Essentials and Frame details shown; no Sample photo section (removed in B3.1)',
        await a.S(
          `(()=>{const t=[...document.querySelectorAll('.psection-toggle')]; const ti=(x)=>x.querySelector('.psection-title')?.textContent; return t.find(x=>ti(x)==='Appearance').getAttribute('aria-expanded')==='false' && t.find(x=>ti(x)==='Position & size').getAttribute('aria-expanded')==='true' && !!document.querySelector('.inspector-panel [data-essentials=photo]') && !t.some(x=>/Sample/.test(x.textContent)) && t.some(x=>ti(x)==='Frame details')})()`
        )
      )
      check('collapsing a section does not touch history', (await a.state()).past === pastBefore)
      await a.clickEl(
        `[...document.querySelectorAll('.psection-toggle')].find(x=>x.querySelector('.psection-title')?.textContent==='Appearance')`
      )
      await a.type('Photo number', '7')
      check('photo number edit', (await a.layer('Photo 1')).photoNumber === 7)
      await a.shot('4c-07-photo-selected')

      // Layers: hide / lock / duplicate / reorder / filter / group
      const p2 = await a.layer('Photo 2')
      await a.clickEl(`document.getElementById('layer-row-${p2.id}')`)
      await a.clickEl(
        `document.querySelector('#layer-row-${p2.id} [aria-label="Hide layer Photo 2"]')`
      )
      check('hide layer via row eye button', (await a.layer('Photo 2')).visible === false)
      check(
        'hidden state stays visible in the row without hover (warning treatment)',
        await a.S(
          `(()=>{const b=document.querySelector('#layer-row-${p2.id} .row-toggle.off-state'); return !!b && getComputedStyle(b).opacity==='1'})()`
        )
      )
      await a.clickEl(
        `document.querySelector('#layer-row-${p2.id} [aria-label="Show layer Photo 2"]')`
      )
      await a.clickEl(
        `document.querySelector('#layer-row-${p2.id} [aria-label="Lock layer Photo 2"]')`
      )
      check('lock layer via row button', (await a.layer('Photo 2')).locked === true)
      await a.clickEl(
        `document.querySelector('#layer-row-${p2.id} [aria-label="Unlock layer Photo 2"]')`
      )
      let n0 = (await a.state()).layers
      await a.press('More layer actions')
      await sleep(250)
      await a.clickEl(a.menuItem('Duplicate'))
      await sleep(250)
      check('Duplicate (Layers › More menu) adds a layer', (await a.state()).layers === n0 + 1)
      n0 = (await a.state()).layers
      await c.key('z', { code: 'KeyZ', vk: 90, modifiers: h.MOD_BIT })
      await sleep(250)
      check(
        '⌘Z undoes the duplicate (shortcut works from the canvas/panel)',
        (await a.state()).layers === n0 - 1
      )
      // reorder via Arrange menu (the undo above dropped the selection, so select again)
      await a.selectByName('Photo 2')
      const before = await a.S(`__wts.store.getState().project.layers.map(l=>l.name+':'+l.zIndex)`)
      await a.press('Arrange')
      await sleep(250)
      check(
        'Arrange menu offers four stacking commands',
        await a.S(
          `['Bring to front','Bring forward','Send backward','Send to back'].every(t=>[...document.querySelectorAll('[role=menu] [role=menuitem]')].some(x=>x.textContent.includes(t)))`
        )
      )
      await a.clickEl(a.menuItem('Send to back'))
      await sleep(250)
      const after = await a.S(`__wts.store.getState().project.layers.map(l=>l.name+':'+l.zIndex)`)
      check('Send to back changes stacking', JSON.stringify(before) !== JSON.stringify(after))
      // filter
      await a.clickEl(`document.querySelector('.layers-panel input[type=search]')`)
      await c.insertText('zzzz')
      await sleep(250)
      check(
        'filter with no match shows the empty state',
        await a.S(`/No matching layers/.test(document.querySelector('.layers-panel').textContent)`)
      )
      await c.ev(`document.querySelector('.layers-panel input[type=search]').select(); 1`)
      await c.insertText('Photo')
      await sleep(250)
      check(
        'filter narrows the list',
        await a.S(
          `document.querySelectorAll('.layer-row').length>0 && document.querySelectorAll('.layer-row').length<10`
        )
      )
      await a.clickEl(`document.querySelector('.layers-panel input[type=search]')`)
      await c.ev(`document.querySelector('.layers-panel input[type=search]').select(); 1`)
      await c.key('Backspace', { code: 'Backspace', vk: 8 })
      await sleep(250)

      // Multi-select + group
      const p1 = await a.layer('Photo 1')
      const p3 = await a.layer('Photo 3')
      await a.clickEl(`document.getElementById('layer-row-${p1.id}')`)
      await a.c.clickMod(await a.center(`document.getElementById('layer-row-${p3.id}')`), h.MOD_BIT)
      await sleep(300)
      s = await a.state()
      check('Cmd/Ctrl-click extends selection to two layers', s.sel.length === 2)
      check(
        'multi-selection inspector shows count + actions',
        await a.S(
          `/2 layers selected/.test(document.querySelector('.inspector-panel').textContent) && !!(${a.btn('Group')})`
        )
      )
      await a.shot('4c-08-multi-selection')
      await a.press('More layer actions')
      await sleep(250)
      await a.clickEl(a.menuItem('Group'))
      await sleep(300)
      check(
        'Group works from the Layers › More menu',
        await a.S(
          `__wts.store.getState().project.layers.some(l=>l.type==='group' && l.name!=='Corner ornament')`
        )
      )
      await a.press('More layer actions')
      await sleep(250)
      await a.clickEl(a.menuItem('Ungroup'))
      await sleep(250)

      // Top bar: undo / redo icons, history
      const pa = (await a.state()).past
      await a.press('Undo')
      await sleep(200)
      check('Undo (icon button) steps history back', (await a.state()).past === pa - 1)
      await a.press('Redo')
      await sleep(200)
      check('Redo (icon button) steps history forward', (await a.state()).past === pa)
      check(
        'shell buttons have accessible names (Undo, Redo, Save, Export, Add layer, More layer actions, Snap)',
        await a.S(
          `['Undo','Redo','Save','Export','See how it prints','Add layer','More layer actions','Snap to guides','Safe areas','Overflow'].every(n=>!!document.querySelector('[aria-label="'+n+'"]'))`
        )
      )

      // Edit menu routes commands
      await a.selectByName('Date and location')
      n0 = (await a.state()).layers
      await a.clickEl(a.btn('Edit'))
      await sleep(250)
      const editItems = await a.S(
        `[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(x=>({t:x.querySelector('.grow').textContent, d:x.disabled, k:x.querySelector('kbd')?.textContent}))`
      )
      check(
        'Edit menu shows shortcut hints and enablement',
        editItems.find((i) => i.t === 'Duplicate')?.k === h.keyLabel('D') &&
          editItems.find((i) => i.t === 'Redo')?.k === h.keyLabel('Z', true),
        editItems.map((i) => i.t + (i.d ? '(off)' : ''))
      )
      await a.clickEl(a.menuItem('Duplicate'))
      await sleep(250)
      check('Edit > Duplicate routes to the store', (await a.state()).layers === n0 + 1)

      // View menu + status bar controls
      await a.clickEl(a.btn('View'))
      await sleep(250)
      const snapItem = await a.S(
        `(()=>{const x=[...document.querySelectorAll('[role=menuitemcheckbox]')].find(i=>i.textContent.includes('Snap')); return x&&x.getAttribute('aria-checked')})()`
      )
      check('View menu shows Snap as a checked item', snapItem === 'true', snapItem)
      await a.clickEl(
        `[...document.querySelectorAll('[role=menuitemcheckbox]')].find(i=>i.textContent.includes('Snap'))`
      )
      await sleep(200)
      check(
        'View > Snap toggles snapping off and the status button reflects it',
        (await a.state()).snapping === false &&
          (await a.S(
            `document.querySelector('[aria-label="Snap to guides"]').getAttribute('aria-pressed')`
          )) === 'false'
      )
      await a.press('Snap to guides')
      check('status bar Snap button toggles it back', (await a.state()).snapping === true)
      check(
        'canvas-state bar has no Sample photos control (removed in B3.1); its Overflow pill toggles the view',
        await (async () => {
          const none = !(await a.S(`!!document.querySelector('[aria-label="Sample photos"]')`))
          const before = await a.S(`__wts.store.getState().showOverflow`)
          await a.press('Overflow')
          await sleep(200)
          const after = await a.S(`__wts.store.getState().showOverflow`)
          await a.press('Overflow')
          await sleep(200)
          return none && before === true && after === false
        })()
      )

      // Zoom
      const z0 = await a.S(`document.querySelector('#zoom-label').textContent`)
      await a.press('Zoom in')
      await sleep(250)
      const z1 = await a.S(`document.querySelector('#zoom-label').textContent`)
      await a.press('100%')
      await sleep(250)
      const z100 = await a.S(`document.querySelector('#zoom-label').textContent`)
      await a.press('Fit')
      await sleep(250)
      const zfit = await a.S(`document.querySelector('#zoom-label').textContent`)
      check(
        'zoom controls: in changes, 100% = 100%, Fit returns to fit',
        z1 !== z0 && z100 === '100%' && zfit === z0,
        { z0, z1, z100, zfit }
      )
      await c.key('1', { code: 'Digit1', vk: 49, modifiers: h.MOD_BIT })
      await sleep(250)
      const zk1 = await a.S(`document.querySelector('#zoom-label').textContent`)
      await c.key('0', { code: 'Digit0', vk: 48, modifiers: h.MOD_BIT })
      await sleep(250)
      const zk0 = await a.S(`document.querySelector('#zoom-label').textContent`)
      await c.key('=', { code: 'Equal', vk: 187, modifiers: h.MOD_BIT })
      await sleep(250)
      const zkp = await a.S(`document.querySelector('#zoom-label').textContent`)
      check('⌘1 = 100%, ⌘0 = fit, ⌘= zooms in', zk1 === '100%' && zk0 === z0 && zkp !== z0, {
        zk1,
        zk0,
        zkp
      })
      await a.press('Fit')
      await sleep(200)

      // Canvas still works: drag a layer
      const ids = await a.selectByName('Sticker')
      const ctr = await c
        .ev(`JSON.stringify(__wts.layerCenter(${JSON.stringify(ids)}))`)
        .then(JSON.parse)
      const x0 = (await a.layer('Sticker')).x
      await c.drag(ctr, { x: ctr.x - 40, y: ctr.y + 20 })
      await sleep(300)
      check('canvas drag still moves a layer (real mouse)', (await a.layer('Sticker')).x !== x0)
      check(
        'artboard is an editor-only effect: exact-size render has no shadow/edge',
        await c.ev(
          `(async()=>{const r=await __wts.renderToDataUrl(); return r.width===2400 && r.height===3600})()`
        )
      )

      // Panel resize: keyboard on the splitter; not a project change
      const dirtyBefore = (await a.state()).past
      const w0 = await a.S(`document.querySelector('.sidebar').getBoundingClientRect().width`)
      await c.ev(`document.querySelector('[aria-label="Resize side panels"]').focus(); 1`)
      await c.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 })
      await c.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 })
      await sleep(250)
      const w1 = await a.S(`document.querySelector('.sidebar').getBoundingClientRect().width`)
      check(
        'sidebar resizes from the keyboard (ArrowLeft grows it) within limits',
        w1 > w0 && w1 <= 520,
        { w0, w1 }
      )
      check('resizing a panel does not touch history', (await a.state()).past === dirtyBefore)
      // The Layers/Properties splitter exists only when they are stacked (≥ 860 CSS px tall); below that they are
      // tabs and there is nothing to drag (B3.1: responsive contract, not a window-size assumption).
      const rcSplit = await h.rightColumn(c)
      if (rcSplit.layout === 'stacked') {
        const split0 = await a.S(
          `document.querySelector('.sidebar-pane').getBoundingClientRect().height`
        )
        await a.c.drag(
          await a.center(`document.querySelector('[aria-label="Resize Layers and Properties"]')`),
          {
            x: (
              await a.center(
                `document.querySelector('[aria-label="Resize Layers and Properties"]')`
              )
            ).x,
            y:
              (
                await a.center(
                  `document.querySelector('[aria-label="Resize Layers and Properties"]')`
                )
              ).y + 80
          }
        )
        await sleep(300)
        const split1 = await a.S(
          `document.querySelector('.sidebar-pane').getBoundingClientRect().height`
        )
        check('Layers/Properties splitter drags (mouse)', split1 > split0 + 40, { split0, split1 })
      } else {
        check(
          'Layers/Properties: tabs below 860 px tall, so no split to drag (tabs switch the panel instead)',
          rcSplit.expected === 'tabs' &&
            !(await a.S(
              `!!document.querySelector('[aria-label="Resize Layers and Properties"]')`
            )) &&
            (await h.showPanel(c, 'layers')) &&
            (await h.showPanel(c, 'properties')),
          rcSplit
        )
      }
      await a.shot('4c-09-editor-resized')

      // Keyboard: shortcuts must not fire from inside inputs
      await a.selectByName('Photo 2')
      const count = (await a.state()).layers
      const pastK = (await a.state()).past
      await a.clickEl(a.field('X (px)'))
      await c.key('Delete', { code: 'Delete', vk: 46 })
      await c.key('Backspace', { code: 'Backspace', vk: 8 })
      await c.key('d', { code: 'KeyD', vk: 68, modifiers: h.MOD_BIT })
      await c.key('z', { code: 'KeyZ', vk: 90, modifiers: h.MOD_BIT })
      await sleep(250)
      s = await a.state()
      check(
        'inputs protect global shortcuts (Delete/Backspace/⌘D/⌘Z in a field change nothing)',
        s.layers === count && s.past === pastK,
        { layers: s.layers, count }
      )
      await c.key('Escape', { code: 'Escape', vk: 27 })

      // Focus traversal: Tab through the chrome; every focused control shows a ring
      await c.ev('document.activeElement && document.activeElement.blur(); 1')
      const rings = []
      for (let i = 0; i < 45; i++) {
        await c.key('Tab', { code: 'Tab', vk: 9 })
        rings.push(
          await a.S(
            `(()=>{const e=document.activeElement; if(!e||e===document.body) return null; const cs=getComputedStyle(e); const ow=parseFloat(cs.outlineWidth)||0; return {tag:e.tagName, name:(e.getAttribute('aria-label')||e.textContent||e.id||'').trim().slice(0,28), ring: (cs.outlineStyle!=='none'&&ow>0) || cs.boxShadow!=='none', role:e.getAttribute('role')}})()`
          )
        )
      }
      const seen = rings.filter(Boolean)
      const distinct = new Set(seen.map((r) => r.tag + r.name)).size
      check('Tab traversal reaches many distinct controls (≥ 25)', distinct >= 25, distinct)
      check(
        'every keyboard-focused control shows a visible focus ring',
        seen.every((r) => r.ring),
        seen.filter((r) => !r.ring)
      )
      await a.shot('4c-10-focus-ring')
    }
  )

  // ================= RECOVERY (Decide later / Discard / Recover) =================
  fs.rmSync(ud, { recursive: true, force: true })
  async function crashWithEdit(name) {
    await session({ env: {}, size: h.STANDARD_SIZE }, async (a) => {
      await a.press('New sample project')
      await sleep(1000)
      await a.c.ev(
        `(()=>{const s=__wts.store.getState(); s.renameLayer(s.project.layers.find(l=>l.name==='Event title').id, ${JSON.stringify(name)}); return 1})()`
      )
      await sleep(3200) // autosave debounce
    })
  }
  await crashWithEdit('Crash one')
  check('abrupt termination (SIGKILL) left a recoverable session', sessions().length === 1)
  await session({ size: h.STANDARD_SIZE }, async (a) => {
    const d = await a.S(
      `(()=>{const d=document.querySelector('[role=dialog]'); return d&&{title:d.querySelector('h2').textContent, modal:d.getAttribute('aria-modal'), text:d.textContent, buttons:[...d.querySelectorAll('button')].map(b=>b.textContent.trim()), focus:document.activeElement.textContent.trim()}})()`
    )
    check(
      'recovery dialog: calm title, project name, time and file status',
      d &&
        /We found unsaved work/.test(d.title) &&
        /Diagnostic Sample/.test(d.text) &&
        /Recovery copy from/.test(d.text) &&
        /Never saved/.test(d.text),
      d && d.title
    )
    check(
      'recovery dialog: Recover / Discard / Decide later, focus starts on Recover',
      d &&
        ['Recover', 'Discard', 'Decide later'].every((b) => d.buttons.includes(b)) &&
        d.focus === 'Recover',
      d && d.buttons
    )
    check('recovery dialog is not color-only and has no file paths', d && !d.text.includes(tmp))
    await a.shot('4c-11-recovery-dialog')
    await a.press('Decide later')
    await sleep(300)
    check(
      'Decide later closes the dialog and keeps the session',
      !(await a.S(`!!document.querySelector('[role=dialog]')`)) && sessions().length === 1
    )
    check(
      'after Decide later the welcome screen is usable',
      await a.S(`!!document.querySelector('#welcome-title')`)
    )
  })
  // Second launch: SIGKILL'd again -> still offered -> Discard path
  await session({ size: h.STANDARD_SIZE }, async (a) => {
    check(
      'session still offered on the next launch',
      await a.S(`!!document.querySelector('[role=dialog]')`)
    )
    await a.press('Discard')
    await sleep(250)
    check(
      'Discard asks for confirmation first (session still on disk)',
      (await a.S(
        `!![...document.querySelectorAll('[role=dialog] button')].find(b=>/Confirm discard/.test(b.textContent))`
      )) && sessions().length === 1
    )
    await a.shot('4c-12-recovery-discard-confirm')
    await a.press('Keep')
    await sleep(200)
    check(
      'Keep cancels the discard',
      sessions().length === 1 &&
        (await a.S(
          `!![...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Discard')`
        ))
    )
    await a.clickEl(
      `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Discard')`
    )
    await sleep(200)
    await a.clickEl(
      `[...document.querySelectorAll('[role=dialog] button')].find(b=>/Confirm discard/.test(b.textContent))`
    )
    await sleep(600)
    check(
      'Confirm discard removes the recovery copy and closes the dialog',
      sessions().length === 0 && !(await a.S(`!!document.querySelector('[role=dialog]')`))
    )
  })
  await crashWithEdit('Crash two')
  await session({ size: h.STANDARD_SIZE }, async (a) => {
    await a.press('Recover')
    await sleep(1200)
    const s = await a.state()
    check(
      'Recover opens the project Modified with the edit',
      s.has && s.dirty && !!(await a.layer('Crash two')),
      s
    )
    check(
      'top bar shows Modified after recovery; dialog gone',
      (await a.S(`document.querySelector('#doc-state').textContent.trim()`)) === 'Modified' &&
        !(await a.S(`!!document.querySelector('[role=dialog]')`))
    )
  })

  // ================= AUTOSAVE ISSUE UI =================
  fs.rmSync(ud, { recursive: true, force: true })
  await session({ size: h.STANDARD_SIZE }, async (a) => {
    await a.press('New sample project')
    await sleep(1000)
    const sid = await a.c.ev('__wts.store.getState().session.sessionId')
    // Make the working session unwritable: replace its directory with a file.
    const dir = path.join(sessionsDir(), sid)
    fs.renameSync(dir, dir + '.bak')
    fs.writeFileSync(dir, 'x')
    await a.c.ev(
      `(()=>{const s=__wts.store.getState(); s.renameLayer(s.project.layers[0].id,'Trigger'); return 1})()`
    )
    for (let i = 0; i < 40 && !(await a.S(`!!document.querySelector('#autosave-issue')`)); i++)
      await sleep(500)
    const issue = await a.S(
      `(()=>{const e=document.querySelector('#autosave-issue'); return e&&{text:e.textContent.trim(), role:e.getAttribute('role'), modal:!!document.querySelector('[role=dialog]')}})()`
    )
    check(
      'autosave failure shows a restrained "Autosave issue" badge (no modal)',
      issue && /Autosave issue/.test(issue.text) && issue.role === 'alert' && !issue.modal,
      issue
    )
    await a.shot('4c-13-autosave-issue')
    fs.rmSync(dir, { force: true })
    fs.renameSync(dir + '.bak', dir)
  })
  fs.rmSync(ud, { recursive: true, force: true })

  // ================= RESPONSIVE DESKTOP =================
  for (const [width, height] of [
    [1100, 680],
    [1280, 800],
    [1440, 900],
    [1920, 1080]
  ]) {
    await session({ env: {}, size: { width, height } }, async (a) => {
      await a.press('New sample project')
      await sleep(1200)
      await a.selectByName('Photo 1')
      const m = await a.S(
        `(()=>{const r=(s)=>{const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}}; return {iw:innerWidth, ih:innerHeight, sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, ws:r('.workspace'), side:r('.sidebar'), top:r('.topbar'), status:r('.statusbar'), drawer:!!document.querySelector('.tooldrawer'), layers:r('.layers-panel'), props:r('.inspector-panel'), clippedTop: document.querySelector('.topbar').scrollWidth>document.querySelector('.topbar').clientWidth}})()`
      )
      check(
        `${width}×${height}: no horizontal or vertical page overflow`,
        m.sw <= m.iw && m.sh <= m.ih,
        { sw: m.sw, iw: m.iw, sh: m.sh, ih: m.ih }
      )
      check(
        `${width}×${height}: canvas workspace ≥ 500 px wide, sidebar fully on screen`,
        m.ws.w >= 500 && m.side.r <= m.iw + 1,
        { ws: Math.round(m.ws.w), drawer: m.drawer }
      )
      // B3: at ≥ 860 px tall Properties sits above Layers (both ≥ 150 px); shorter windows show them as tabs, so the
      // one on screen gets the full column instead of two squeezed panes.
      const tabs = await a.S(`document.querySelector('.sidebar')?.dataset.layout === 'tabs'`)
      check(
        tabs
          ? `${width}×${m.ih}: Properties | Layers tabs; the visible panel is ≥ 300 px tall`
          : `${width}×${m.ih}: Properties above Layers, each ≥ 150 px tall`,
        tabs
          ? (m.props?.h ?? m.layers?.h ?? 0) >= 300 && !(m.props && m.layers)
          : m.layers.h >= 150 && m.props.h >= 150 && m.props.t < m.layers.t,
        { layers: m.layers && Math.round(m.layers.h), props: m.props && Math.round(m.props.h) }
      )
      check(`${width}×${height}: top bar does not clip`, !m.clippedTop)
      await a.shot(`4c-14-size-${width}x${height}`)
    })
  }

  const failed = results.filter((r) => !r.ok)
  fs.writeFileSync(
    path.join(__dirname, 'results-phase4c.json'),
    JSON.stringify(results, null, 2) + '\n'
  )
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('HARNESS ERROR', e)
  process.exit(2)
})
