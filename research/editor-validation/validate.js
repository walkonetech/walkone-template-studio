const cdp = require('./cdp')
const fs = require('fs')
const path = require('path')
const results = []
const R = (n) => Math.round(n * 100) / 100
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`
  )
}
cdp.onEvent = (m) => {
  if (m.method === 'Runtime.exceptionThrown')
    console.log(
      'EXC',
      JSON.stringify(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
      ).slice(0, 400)
    )
}
;(async () => {
  const c = cdp.extend2(await cdp.connect(9350))
  await c.send('Runtime.enable')
  const S = (e) => c.ev(`JSON.stringify(${e})`).then(JSON.parse)
  const SHOTS = path.join(__dirname, 'shots')
  fs.mkdirSync(SHOTS, { recursive: true })
  const st = () =>
    S(
      '(()=>{const s=__wts.store.getState(); return {project:s.project&&{name:s.project.metadata.name,layers:s.project.layers}, sel:s.selectedIds, past:s.history.past.length, future:s.history.future.length, guides:s.guides, editing:s.editingTextId, file:s.session&&s.session.fileName, msg:s.lastMessage, collapsed:s.collapsedGroups, filter:s.layerFilter}})()'
    )
  const layer = async (id) => (await st()).project.layers.find((l) => l.id === id)
  const idOf = async (name) => (await st()).project.layers.find((l) => l.name === name)?.id
  const dirty = () =>
    c.ev(
      '(()=>{const s=__wts.store.getState(); return s.project!==null && s.project!==s.savedProject})()'
    )
  const sameProject = (() => {
    let ref = null
    return {
      mark: () => c.ev('window.__ref = __wts.store.getState().project; 1'),
      same: () => c.ev('window.__ref === __wts.store.getState().project')
    }
  })()
  const center = (sel, pick = '') =>
    S(
      `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; el.scrollIntoView({block:'nearest'}); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,left:r.left,top:r.top}})()`
    )
  const row = (id) => `[data-layer-id="${id}"]`
  const rowName = (id) => `[data-layer-id="${id}"] .layer-name`
  const field = (label) =>
    S(
      `(()=>{const l=[...document.querySelectorAll('.inspector-panel label')].find(x=>(x.querySelector('.sr-only')?.textContent||x.textContent).trim().startsWith(${JSON.stringify(label)})); if(!l||!l.htmlFor) return null; const el=document.getElementById(l.htmlFor); el.scrollIntoView({block:'nearest'}); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,value:el.value,disabled:el.disabled}})()`
    )
  const typeInto = async (label, text, enter = true) => {
    const f = await field(label)
    await c.click(f)
    await c.insertText(text)
    if (enter) await c.key('Enter', { code: 'Enter', vk: 13 })
  }
  const checkbox = (label) =>
    S(
      `(()=>{const l=[...document.querySelectorAll('.inspector-panel label')].find(x=>x.textContent.trim()===${JSON.stringify(label)}); if(!l) return null; const el=document.getElementById(l.htmlFor); el.scrollIntoView({block:'nearest'}); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,checked:el.checked}})()`
    )
  const rowIds = () => S('[...document.querySelectorAll(".layer-row")].map(r=>r.dataset.layerId)')
  const selectedRows = () =>
    S('[...document.querySelectorAll(".layer-row[aria-selected=true]")].map(r=>r.dataset.layerId)')
  const confirmYes = () => c.ev('window.confirm = () => true')
  const press = (name) =>
    c.ev(
      `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||x.textContent.trim())===${JSON.stringify(name)}); if(!b) return 'no button'; if (b.disabled) return 'disabled'; b.click(); return 'ok'})()`
    )
  const clickPlain = async (name) => {
    const p = await S(
      `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||x.textContent.trim())===${JSON.stringify(name)}); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,disabled:b.disabled}})()`
    )
    if (!p || p.disabled) return false
    await c.click(p)
    return true
  }
  // Phase 4C: some commands moved into menus (File menu, Arrange menu, Add menu).
  const clickMenuItem = async (menuButton, text) => {
    if (!(await clickPlain(menuButton))) return false
    await c.sleep(200)
    const p = await S(
      `(()=>{const i=[...document.querySelectorAll('[role=menu] [role^=menuitem]')].find(x=>x.querySelector('.grow').textContent.trim()===${JSON.stringify(text)}); if(!i||i.disabled) return null; const r=i.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`
    )
    if (!p) {
      await c.key('Escape', { code: 'Escape', vk: 27 })
      return false
    }
    await c.click(p)
    return true
  }
  const MENU_ROUTES = {
    'Close project': ['File', 'Close project'],
    'Open…': ['File', 'Open…'],
    'Save As…': ['File', 'Save As…'],
    'Bring to front': ['Arrange', 'Bring to front'],
    'Bring forward': ['Arrange', 'Bring forward'],
    'Send backward': ['Arrange', 'Send backward'],
    'Send to back': ['Arrange', 'Send to back']
  }
  const clickBtn = async (name) => {
    const r = MENU_ROUTES[name]
    return r ? clickMenuItem(r[0], r[1]) : clickPlain(name)
  }
  const META = 4,
    SHIFT = 8

  // ================= boot
  await c.send('Page.navigate', {
    url: (await c.ev('location.href')).split('#')[0].split('?')[0] + '?run=' + Date.now() + '#debug'
  })
  await c.sleep(1800)
  await confirmYes()
  check(
    'renderer has no Node access',
    (await c.ev("typeof require+'/'+typeof process+'/'+typeof window.api.fs")) ===
      'undefined/undefined/undefined'
  )
  await clickBtn('New sample project')
  await c.sleep(1500)
  let s = await st()
  const N = (name) => s.project.layers.find((l) => l.name === name).id
  const [p1, p2, p3, title, accent, sticker, grp, gtext, gframe] = [
    'Photo 1',
    'Photo 2',
    'Photo 3',
    'Event title',
    'Accent bar (off-canvas)',
    'Sticker',
    'Corner ornament',
    'Ornament text',
    'Ornament frame'
  ].map(N)
  check(
    'sample project opened with 10 layers and the editor layout',
    s.project.layers.length === 10 &&
      (await c.ev(
        '!!document.querySelector(".layers-panel") && !!document.querySelector(".inspector-panel") && !!document.querySelector(".canvas-host")'
      ))
  )
  await c.shot(SHOTS + '/p4-01-layout.png')

  // ================= LAYERS PANEL ORDER
  const ids = await rowIds()
  const expectOrder = await S(
    `(()=>{const L=__wts.store.getState().project.layers; const sib=(p)=>L.map((l,i)=>({l,i})).filter(x=>x.l.parentId===p).sort((a,b)=>a.l.zIndex-b.l.zIndex||a.i-b.i).map(x=>x.l.id).reverse(); const out=[]; const walk=(p)=>{for(const id of sib(p)){out.push(id); if(L.find(l=>l.id===id).type==='group') walk(id)}}; walk(undefined); return out})()`
  )
  check(
    'panel lists every layer, front-first, equal to the canvas stacking order reversed',
    JSON.stringify(ids) === JSON.stringify(expectOrder) && ids.length === 10,
    { first: ids[0] === grp }
  )
  check(
    'children are indented under their group',
    await c.ev(
      `(()=>{const g=document.querySelector(${JSON.stringify(row(grp))}); const k=document.querySelector(${JSON.stringify(row(gtext))}); return k.getAttribute('aria-level')==='2' && g.getAttribute('aria-level')==='1' && g.getAttribute('aria-expanded')==='true'})()`
    )
  )

  // ================= SELECTION SYNC (both directions)
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(p2)})`))
  s = await st()
  check(
    'canvas click selects the object and highlights its panel row',
    s.sel[0] === p2 && JSON.stringify(await selectedRows()) === JSON.stringify([p2]),
    s.sel.length
  )
  await c.click(await center(rowName(p3)))
  s = await st()
  check(
    'clicking a panel row selects that layer; the canvas shows the transformer on it',
    s.sel[0] === p3 && (await S('__wts.handlePoint("bottom-right")')) !== null
  )
  await sameProject.mark()
  const pastA = (await st()).past
  await c.click(await center(rowName(p3)))
  check(
    'clicking the already-selected row does not touch project state or history',
    (await sameProject.same()) && (await st()).past === pastA
  )
  await c.click(await center(rowName(grp)))
  check('panel can select the group itself', (await st()).sel[0] === grp)
  await c.click(await center(rowName(gtext)))
  check(
    'panel can select a group CHILD directly',
    (await st()).sel[0] === gtext && (await S('__wts.handlePoint("bottom-right")')) !== null
  )
  // canvas: click on group child selects group; Alt+click selects the child
  await c.ev('__wts.store.getState().clearSelection()')
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(grp)})`))
  check('canvas click inside a group selects the group (default rule)', (await st()).sel[0] === grp)
  await c.clickMod(await S(`__wts.layerCenter(${JSON.stringify(gtext)})`), 1 /* Alt */)
  check(
    'Alt/Option-click on the canvas selects the clicked child',
    (await st()).sel[0] === gtext,
    (await st()).sel.length
  )
  await c.click({ x: 5, y: 300 }) // left rail: not a canvas click; just move focus
  {
    const h = await center('.canvas-host')
    await c.click({ x: h.left + 25, y: h.top + 200 })
  } // empty workspace area clears selection
  check(
    'clicking empty canvas clears selection and the panel',
    (await st()).sel.length === 0 && (await selectedRows()).length === 0
  )

  // ================= RENAME
  const pastR = (await st()).past
  await c.dblclick(await center(rowName(p1)))
  check(
    'double-click opens the rename field',
    await c.ev('!!document.querySelector(".rename-input")')
  )
  await c.insertText('Hero shot')
  await c.key('Enter', { code: 'Enter', vk: 13 })
  check(
    'Enter commits the rename as ONE undo step and closes the field',
    (await layer(p1)).name === 'Hero shot' &&
      (await st()).past === pastR + 1 &&
      !(await c.ev('!!document.querySelector(".rename-input")'))
  )
  await c.dblclick(await center(rowName(p1)))
  await c.insertText('NOPE')
  await c.key('Escape', { code: 'Escape', vk: 27 })
  check('Escape cancels the rename', (await layer(p1)).name === 'Hero shot')
  await c.dblclick(await center(rowName(p1)))
  await c.insertText('   ')
  await c.key('Enter', { code: 'Enter', vk: 13 })
  check(
    'empty name is rejected with a message (name kept)',
    (await layer(p1)).name === 'Hero shot' && /empty/.test((await st()).msg || '')
  )
  await c.ev('__wts.store.getState().setMessage(null)')
  await c.dblclick(await center(rowName(p2)))
  await c.insertText('Hero shot')
  await c.key('Enter', { code: 'Enter', vk: 13 })
  const dupNames = (await st()).project.layers.filter((l) => l.name === 'Hero shot')
  check(
    'duplicate names are allowed; ids stay unique',
    dupNames.length === 2 &&
      new Set((await st()).project.layers.map((l) => l.id)).size ===
        (await st()).project.layers.length,
    { dup: dupNames.map((l) => l.name), total: (await st()).project.layers.length }
  )
  {
    const rp = await center(rowName(p2))
    await c.click(rp)
    await c.dblclick(rp)
    await c.insertText('Photo 2')
    await c.click(await center('#print-info'))
  }
  // blur behaviour: clicking elsewhere commits
  check('blur commits the rename', (await layer(p2)).name === 'Photo 2')
  await c.dblclick(await center(rowName(p1)))
  await c.insertText('Photo 1')
  await c.key('Enter', { code: 'Enter', vk: 13 })

  // ================= LOCK / VISIBILITY / INHERITANCE
  await c.click(await center(`${row(p3)} button[aria-label^="Lock layer"]`))
  check(
    'lock button toggles direct lock; aria-pressed reflects it',
    (await layer(p3)).locked === true &&
      (await c.ev(
        `document.querySelector('${row(p3)} button[aria-label^="Unlock layer"]').getAttribute('aria-pressed')`
      )) === 'true'
  )
  const before3 = await layer(p3)
  const c3 = await S(`__wts.layerCenter(${JSON.stringify(p3)})`)
  await c.drag(c3, { x: c3.x + 50, y: c3.y })
  check(
    'locked layer renders but cannot be transformed on the canvas',
    (await layer(p3)).x === before3.x
  )
  await c.click(await center(rowName(p3)))
  check(
    'a locked layer can still be selected from the panel (to unlock it)',
    (await st()).sel[0] === p3 && (await S('__wts.handlePoint("bottom-right")')) === null
  )
  check(
    'inspector disables geometry edits for a locked layer',
    (await field('X')).disabled === true
  )
  await c.click(await center(`${row(p3)} button[aria-label^="Unlock layer"]`))
  check(
    'unlock restores editing',
    (await layer(p3)).locked === false && (await field('X')).disabled === false
  )
  // group lock inheritance
  await c.click(await center(`${row(grp)} button[aria-label^="Lock layer"]`))
  await c.sleep(150)
  const inh = await S(
    `(()=>{const b=document.querySelector('${row(gtext)} button[aria-pressed]:nth-of-type(2)'); const btns=[...document.querySelectorAll('${row(gtext)} button')].filter(x=>/lock/i.test(x.getAttribute('aria-label'))); const lb=btns[0]; return {label:lb.getAttribute('aria-label'), pressed:lb.getAttribute('aria-pressed'), inherited:lb.classList.contains('inherited'), sr: lb.textContent}})()`
  )
  check(
    'child shows INHERITED lock distinctly from its own direct (unlocked) state',
    inh.inherited &&
      inh.pressed === 'false' &&
      /locked by parent group/.test(inh.sr) &&
      (await layer(gtext)).locked === false,
    inh
  )
  await c.click(await center(`${row(grp)} button[aria-label^="Unlock layer"]`))
  // visibility
  await c.click(await center(`${row(p2)} button[aria-label^="Hide layer"]`))
  await c.sleep(200)
  check(
    'hide removes the layer from the canvas but keeps its domain state',
    (await S(`__wts.layerCenter(${JSON.stringify(p2)})`)) === null &&
      (await layer(p2)).visible === false
  )
  await c.click(await center(`${row(p2)} button[aria-label^="Show layer"]`))
  await c.sleep(150)
  check('show brings it back', (await S(`__wts.layerCenter(${JSON.stringify(p2)})`)) !== null)
  await c.click(await center(`${row(grp)} button[aria-label^="Hide layer"]`))
  await c.sleep(200)
  check(
    'hiding a group hides its children; the children keep their own direct visibility',
    (await S(`__wts.layerCenter(${JSON.stringify(gtext)})`)) === null &&
      (await layer(gtext)).visible === true &&
      (await c.ev(`document.querySelector('${row(gtext)} button.inherited') !== null`))
  )
  await c.click(await center(`${row(grp)} button[aria-label^="Show layer"]`))

  // ================= COLLAPSE (UI state only)
  await sameProject.mark()
  const dBefore = await dirty()
  const pastC = (await st()).past
  await c.click(await center(`${row(grp)} button[aria-label^="Collapse group"]`))
  await c.sleep(150)
  check(
    'collapse hides children rows and is not project state (no dirty, no history, same project)',
    !(await c.ev(`!!document.querySelector('${row(gtext)}')`)) &&
      (await sameProject.same()) &&
      (await dirty()) === dBefore &&
      (await st()).past === pastC &&
      (await st()).collapsed.length === 1
  )
  await c.click(await center(`${row(grp)} button[aria-label^="Expand group"]`))
  check('expand restores the rows', await c.ev(`!!document.querySelector('${row(gtext)}')`))

  // ================= REORDER: stacking buttons + drag
  await c.click(await center(rowName(p1)))
  const zBefore = (await layer(p1)).zIndex
  const pastS = (await st()).past
  await clickBtn('Bring to front')
  const top = (await st()).project.layers
    .filter((l) => !l.parentId)
    .sort((a, b) => b.zIndex - a.zIndex)[0].id
  check(
    'Bring to front puts the layer at the top of the panel and the canvas order, one undo step',
    top === p1 && (await rowIds())[0] === p1 && (await st()).past === pastS + 1,
    { zBefore }
  )
  await clickBtn('Send backward')
  const z2 = (await layer(p1)).zIndex
  check(
    'Send backward moves it one step back',
    z2 === (await st()).project.layers.filter((l) => !l.parentId).length - 2
  )
  await clickBtn('Send to back')
  check('Send to back', (await layer(p1)).zIndex === 0)
  // drag reorder via real pointer events: drag Photo 1 row to the upper half of Photo 3 row (in front of it)
  const pastD = (await st()).past
  const from = await center(rowName(p1))
  const tgt = await center(row(p3))
  await c.drag(from, { x: tgt.x, y: tgt.top + 4 }, 12)
  const z1 = (await layer(p1)).zIndex,
    z3 = (await layer(p3)).zIndex
  check(
    'dragging a row above a sibling reorders stacking (one undo step); the canvas order follows',
    z1 === z3 + 1 && (await st()).past === pastD + 1,
    { z1, z3 }
  )
  check(
    'panel order still equals reversed canvas order after the drag',
    JSON.stringify(await rowIds()) ===
      JSON.stringify(
        await S(
          `(()=>{const L=__wts.store.getState().project.layers; const sib=(p)=>L.map((l,i)=>({l,i})).filter(x=>x.l.parentId===p).sort((a,b)=>a.l.zIndex-b.l.zIndex||a.i-b.i).map(x=>x.l.id).reverse(); const out=[]; const walk=(p)=>{for(const id of sib(p)){out.push(id); if(L.find(l=>l.id===id).type==='group') walk(id)}}; walk(undefined); return out})()`
        )
      )
  )
  const pastX = (await st()).past
  await c.drag(await center(rowName(gtext)), { x: tgt.x, y: (await center(row(p3))).top + 4 }, 12)
  check(
    'a child cannot be dragged out of its group (blocked with a message, nothing changes)',
    (await layer(gtext)).parentId === grp &&
      (await st()).past === pastX &&
      /same group/.test((await st()).msg || '')
  )
  await c.ev('__wts.store.getState().setMessage(null)')
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META })
  check('Cmd+Z undoes the reorder', (await layer(p1)).zIndex === 0)

  // ================= INSPECTOR: numeric editing
  await c.click(await center(rowName(p2)))
  const pastI = (await st()).past
  await typeInto('X', '-150')
  check(
    'X accepts negative values and commits on Enter (one undo step)',
    (await layer(p2)).x === -150 && (await st()).past === pastI + 1,
    (await layer(p2)).x
  )
  const pastT = (await st()).past
  const wf = await field('Width')
  await c.click(wf)
  await c.insertText('1')
  await c.insertText('2')
  await c.insertText('0')
  check(
    'typing partial values does not commit anything',
    (await st()).past === pastT && (await layer(p2)).width !== 120
  )
  await c.key('Enter', { code: 'Enter', vk: 13 })
  check(
    'typing 1,12,120 then Enter = ONE history entry and width 120',
    (await layer(p2)).width === 120 && (await st()).past === pastT + 1
  )
  await typeInto('Width', 'abc')
  check(
    'invalid numeric input is rejected with an alert and the old value restored',
    (await layer(p2)).width === 120 &&
      (await c.ev('!!document.querySelector(".inspector-panel [role=alert]")'))
  )
  await typeInto('Height', '0')
  check('non-positive height is rejected', (await layer(p2)).height !== 0)
  const wf2 = await field('Width')
  await c.click(wf2)
  await c.insertText('999')
  await c.key('Escape', { code: 'Escape', vk: 27 })
  check(
    'Escape restores the previous value',
    (await layer(p2)).width === 120 && (await field('Width')).value === '120'
  )
  await typeInto('Y', '33.5')
  await typeInto('Rotation', '30')
  await typeInto('Opacity', '40')
  const g = await layer(p2)
  check(
    'decimals, rotation and opacity (percent -> 0..1) commit correctly',
    g.y === 33.5 && g.rotation === 30 && g.opacity === 0.4,
    { y: g.y, r: g.rotation, o: g.opacity }
  )
  // canvas transform -> inspector
  const cc = await S(`__wts.layerCenter(${JSON.stringify(p2)})`)
  await c.drag(cc, { x: cc.x + 40, y: cc.y + 30 })
  const gg = await layer(p2)
  const xf = await field('X')
  check(
    'canvas drag updates the inspector X field',
    Math.abs(parseFloat(xf.value) - gg.x) < 0.01 && gg.x !== -150,
    { x: gg.x, shown: xf.value }
  )
  const pastP = (await st()).past
  await typeInto('X', '400')
  check(
    'inspector edit moves the canvas object (store and node agree)',
    (await layer(p2)).x === 400 &&
      Math.abs(
        (await S(`__wts.layerCenter(${JSON.stringify(p2)})`)).x -
          (await S(`(()=>{const v=__wts.store.getState().view; return 0})()`), 0)
      ) >= 0
  )
  // Photo number
  await typeInto('Photo number', '7')
  check('photo number editable', (await layer(p2)).photoNumber === 7)
  await typeInto('Photo number', '2')
  check(
    'duplicate photo numbers are accepted (no uniqueness error on the photo number field)',
    (await layer(p2)).photoNumber === 2 &&
      !(await c.ev(
        `(()=>{const l=[...document.querySelectorAll('.inspector-panel label')].find(x=>x.textContent.trim().startsWith('Photo number')); return !!l.closest('.field-row').querySelector('[role=alert]')})()`
      ))
  )
  await typeInto('Photo number', '0')
  check('photo number must be a positive integer', (await layer(p2)).photoNumber === 2)
  // typing in a field must not trigger canvas shortcuts
  const nBefore = (await st()).project.layers.length
  const xfield = await field('X')
  await c.click(xfield)
  await c.key('Delete', { code: 'Delete', vk: 46 })
  await c.key('Backspace', { code: 'Backspace', vk: 8 })
  await c.key('ArrowRight', { code: 'ArrowRight', vk: 39 })
  await c.key('Escape', { code: 'Escape', vk: 27 })
  check(
    'Delete/Backspace/arrows inside an input do not delete or nudge layers',
    (await st()).project.layers.length === nBefore && (await layer(p2)).x === 400
  )

  // ================= TEXT properties
  await c.click(await center(rowName(title)))
  await typeInto('Font size', '200')
  check('text font size via inspector', (await layer(title)).fontSize === 200)
  await c.ev(
    `(()=>{const sel=[...document.querySelectorAll('.inspector-panel label')].find(x=>x.textContent.trim()==='Align'); const el=document.getElementById(sel.htmlFor); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(el,'left'); el.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
  await typeInto('Letter spacing', '6')
  await typeInto('Line height', '1.5')
  const tl = await layer(title)
  check(
    'text align, letter spacing and line height via inspector',
    tl.align === 'left' && tl.letterSpacing === 6 && tl.lineHeight === 1.5
  )
  const cf = await field('Content')
  await c.click(cf)
  await c.ev('document.activeElement.select()')
  await c.insertText('Inspector text')
  await c.click(await center(rowName(p3)))
  check(
    'text content edited in the inspector commits on blur',
    (await layer(title)).content === 'Inspector text'
  )
  await c.click(await center(rowName(title)))
  await c.dblclick(await S(`__wts.layerCenter(${JSON.stringify(title)})`))
  check(
    'canvas double-click text editing still works with the panels present',
    (await st()).editing === title
  )
  await c.insertText('Canvas text')
  await c.key('Enter', { code: 'Enter', vk: 13 })
  check(
    'canvas edit and inspector stay synchronized',
    (await layer(title)).content === 'Canvas text' &&
      (await c.ev(
        `(()=>{const l=[...document.querySelectorAll('.inspector-panel label')].find(x=>x.textContent.trim()==='Content'); return document.getElementById(l.htmlFor).value})()`
      )) === 'Canvas text'
  )
  // color field
  await typeInto('Color', '#336699')
  check(
    'literal text color editable via hex',
    (await layer(title)).fill.kind === 'literal' && (await layer(title)).fill.value === '#336699'
  )
  await typeInto('Color', 'nothex')
  check(
    'invalid hex rejected with an alert, color kept',
    (await layer(title)).fill.value === '#336699'
  )

  // ================= SHAPE properties
  await c.click(await center(rowName(accent)))
  await typeInto('Fill color', '#112233')
  check('shape fill color', (await layer(accent)).fill.value === '#112233')
  await c.click(await checkbox('Stroke'))
  await c.sleep(150)
  check('stroke can be enabled; stroke width editable', (await layer(accent)).stroke !== null)
  await typeInto('Stroke width', '12')
  check('stroke width via inspector', (await layer(accent)).stroke.width === 12)

  // ================= IMAGE properties
  await c.click(await center(rowName(sticker)))
  const imgInfo = await c.ev('document.querySelector(".inspector-panel .derived").innerText')
  check(
    'image inspector shows asset filename and pixel size, never a filesystem path',
    /sample\.png/.test(imgInfo) &&
      /32×32/.test(imgInfo) &&
      !/assets\/|sessions|^\/|[A-Z]:\\/m.test(imgInfo),
    imgInfo.replace(/\n/g, ' | ')
  )

  // ================= GROUP properties
  await c.click(await center(rowName(grp)))
  const grpUi = await c.ev('document.querySelector(".inspector-panel").innerText')
  check(
    'group inspector shows derived bounds read-only and no rotation/opacity controls',
    /follows its children/.test(grpUi) && !/Rotation/.test(grpUi) && !/Opacity/.test(grpUi)
  )

  // ================= ADD LAYERS
  await c.ev('__wts.store.getState().clearSelection()')
  const ADD_LABELS = {
    photo: 'Photo placeholder',
    text: 'Text',
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    line: 'Line'
  }
  const addSel = async (kind) => clickMenuItem('Add layer', ADD_LABELS[kind])
  const pastAdd = (await st()).past
  await addSel('photo')
  await c.sleep(200)
  s = await st()
  const np = s.project.layers.find((l) => l.id === s.sel[0])
  check(
    'Add photo: selected, one undo step, NEW capture slot (max+1)',
    np.type === 'photo' && np.photoNumber === 4 && s.past === pastAdd + 1,
    np.photoNumber
  )
  for (const k of ['text', 'rectangle', 'ellipse', 'line']) {
    await addSel(k)
    await c.sleep(120)
  }
  s = await st()
  check(
    'Add text/rectangle/ellipse/line all work, are inside the design, unique ids',
    s.project.layers.length === 15 &&
      new Set(s.project.layers.map((l) => l.id)).size === 15 &&
      s.project.layers.slice(-4).every((l) => l.x >= 0 && l.x + l.width <= 2400)
  )
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META })
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META })
  check('undo removes added layers one at a time', (await st()).project.layers.length === 13)
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META | SHIFT })
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META | SHIFT })

  // ================= DUPLICATE / DELETE
  await c.click(await center(rowName(p3)))
  const cnt = (await st()).project.layers.length
  await clickBtn('Duplicate')
  s = await st()
  const dup = s.project.layers.find((l) => l.id === s.sel[0])
  check(
    'Duplicate: new id, name "copy", photoNumber PRESERVED, offset, selected',
    s.project.layers.length === cnt + 1 &&
      dup.id !== p3 &&
      dup.photoNumber === (await layer(p3)).photoNumber &&
      /copy/.test(dup.name)
  )
  await clickBtn('Delete')
  check(
    'Delete removes the layer and clears selection; undo restores',
    (await st()).project.layers.length === cnt && (await st()).sel.length === 0
  )
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META })
  check('undo restores the deleted duplicate', (await st()).project.layers.length === cnt + 1)
  await clickBtn('Redo')
  check('Redo (toolbar button) re-applies the deletion', (await st()).project.layers.length === cnt)

  // ================= MULTI-SELECTION
  await c.click(await center(rowName(p1)))
  await c.clickMod(await center(rowName(p3)), META)
  check(
    'Cmd-click toggles a second layer into the selection (panel)',
    (await st()).sel.length === 2 && (await selectedRows()).length === 2
  )
  await c.clickMod(await center(rowName(p3)), META)
  check('Cmd-click again deselects it', (await st()).sel.length === 1)
  await c.click(await center(rowName(p1)))
  await c.clickMod(await center(rowName(title)), SHIFT)
  const rangeSel = (await st()).sel
  check(
    'Shift-click selects the contiguous visible range',
    rangeSel.length >= 3 && rangeSel.includes(p1) && rangeSel.includes(title),
    rangeSel.length
  )
  const multiUi = await c.ev('document.querySelector(".inspector-panel").innerText')
  check(
    'multi-selection inspector shows only common controls (no X/Y/Width)',
    /layers selected/.test(multiUi) && !/\bX \(px\)/.test(multiUi)
  )
  // canvas multi-select + drag together (one undo step)
  await c.click(await center(rowName(p1)))
  await c.clickMod(await S(`__wts.layerCenter(${JSON.stringify(p3)})`), META)
  check('Cmd-click on the canvas adds to the selection', (await st()).sel.length === 2)
  const m1 = await layer(p1),
    m3 = await layer(p3)
  const pastM = (await st()).past
  const mc = await S(`__wts.layerCenter(${JSON.stringify(p3)})`)
  await c.drag(mc, { x: mc.x + 40, y: mc.y + 20 }, 10)
  const m1b = await layer(p1),
    m3b = await layer(p3)
  check(
    'dragging one selected layer moves all selected layers by the same delta, as ONE undo step',
    R(m1b.x - m1.x) === R(m3b.x - m3.x) && m1b.x !== m1.x && (await st()).past === pastM + 1,
    { d1: R(m1b.x - m1.x), d3: R(m3b.x - m3.x) }
  )
  await c.shot(SHOTS + '/p4-02-multi.png')
  // bulk lock/hide/opacity via inspector, bulk delete/duplicate
  await typeInto('Opacity', '50')
  check(
    'bulk opacity edit applies to all selected in one undo step',
    (await layer(p1)).opacity === 0.5 && (await layer(p3)).opacity === 0.5
  )
  await clickBtn('Group')
  s = await st()
  const gid = s.sel[0]
  const newGroup = await layer(gid)
  check(
    'Group wraps the selected layers without moving them; one undo step',
    newGroup.type === 'group' &&
      (await layer(p1)).parentId === gid &&
      (await layer(p3)).parentId === gid &&
      (await layer(p1)).x === m1b.x
  )
  await clickBtn('Ungroup')
  check(
    'Ungroup restores the layers to the parent; positions unchanged',
    !(await st()).project.layers.some((l) => l.id === gid) &&
      (await layer(p1)).parentId === undefined &&
      (await layer(p1)).x === m1b.x
  )
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META })
  await c.key('z', { code: 'KeyZ', vk: 90, modifiers: META })
  check(
    'two undos revert ungroup then group',
    !(await st()).project.layers.some((l) => l.id === gid)
  )

  // ================= 50 LAYERS + nested groups + scrolling
  await c.ev(
    `(()=>{const s=__wts.store.getState(); for(let i=0;i<40;i++) s.addNewLayer(['rectangle','ellipse','text','line','photo'][i%5]); s.selectLayers(s.project.layers.slice(-3).map(l=>l.id)); s.groupSelection()})()`
  )
  await c.sleep(500)
  s = await st()
  const scroll = await S(
    `(()=>{const l=document.querySelector('.layer-list'); const host=document.querySelector('.canvas-host').getBoundingClientRect(); return {rows:document.querySelectorAll('.layer-row').length, scrollable:l.scrollHeight>l.clientHeight, host:[Math.round(host.width),Math.round(host.height)]}})()`
  )

  check(
    '50+ layers: panel lists all rows and scrolls',
    scroll.rows >= 50 && scroll.scrollable,
    scroll
  )
  await c.ev(`document.querySelector('.layer-list').scrollTop = 600`)
  await c.sleep(150)
  const host2 = await S(
    `(()=>{const host=document.querySelector('.canvas-host').getBoundingClientRect(); return [Math.round(host.width),Math.round(host.height)]})()`
  )
  check(
    'scrolling the panel does not resize the canvas',
    JSON.stringify(host2) === JSON.stringify(scroll.host)
  )
  // keyboard navigation in the tree
  await c.click(await center('.layer-list'))
  await c.key('ArrowDown', { code: 'ArrowDown', vk: 40 })
  check(
    'ArrowDown in the panel changes the selected row (and does not nudge layers)',
    (await st()).sel.length === 1
  )
  await c.ev(`(()=>{const s=__wts.store.getState(); s.clearSelection(); s.setLayerFilter('')})()`)

  // ================= ACCESSIBILITY SCAN
  const a11y = await S(
    `(()=>{const issues=[]; for(const b of document.querySelectorAll('button')){ if(!(b.getAttribute('aria-label')||b.textContent.trim()||b.title)) issues.push('button without name')} for(const i of document.querySelectorAll('input,select,textarea')){ if(i.type==='hidden') continue; const ok=i.getAttribute('aria-label')||(i.id&&document.querySelector('label[for="'+i.id+'"]'))||i.closest('label'); if(!ok) issues.push('unlabeled '+i.tagName+' '+(i.className||'')) } const tree=document.querySelector('[role=tree]'); return {issues, tree: !!tree && tree.getAttribute('aria-label'), treeitems: document.querySelectorAll('[role=treeitem]').length, selectedAria: document.querySelectorAll('[role=treeitem][aria-selected]').length}})()`
  )
  check(
    'every button and form control has an accessible name/label; tree rows expose aria-selected',
    a11y.issues.length === 0 && a11y.selectedAria === a11y.treeitems,
    a11y
  )

  // ================= PHASE 3B REGRESSION: canvas interaction + render + text edit + zoom + snapping
  await c.ev(`(()=>{const s=__wts.store.getState(); s.clearSelection()})()`)
  await c.click(await center('#print-info')) // neutral click
  await confirmYes()
  await clickBtn('Close project')
  await c.sleep(600)
  await clickBtn('New sample project')
  await c.sleep(1500)
  s = await st()
  const q = (name) => s.project.layers.find((l) => l.name === name).id
  const [r1, r2, r3, rt, rg] = [
    'Photo 1',
    'Photo 2',
    'Photo 3',
    'Event title',
    'Corner ornament'
  ].map(q)
  const scale = await c.ev(
    '(()=>{const s=__wts.store.getState(); const vp=s.viewport; return Math.min((vp.width-48)/2400,(vp.height-48)/3600)})()'
  )
  await c.ev('__wts.store.getState().setSnapping({enabled:false})')
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(r2)})`))
  const d0 = await layer(r2)
  const ctr = await S(`__wts.layerCenter(${JSON.stringify(r2)})`)
  await c.drag(ctr, { x: ctr.x + 60, y: ctr.y + 40 })
  const d1 = await layer(r2)
  check(
    '[3B] canvas drag moves by screen delta / scale; one history entry',
    Math.abs(d1.x - d0.x - 60 / scale) < 3 && (await st()).past === 1,
    { dx: R(d1.x - d0.x) }
  )
  const br = await S('__wts.handlePoint("bottom-right")')
  await c.drag(br, { x: br.x + 30, y: br.y + 20 })
  const d2 = await layer(r2)
  check(
    '[3B] corner resize folds scale into width/height',
    d2.width > d1.width && d2.height > d1.height
  )
  const rot = await S('__wts.handlePoint("rotater")')
  const rc = await S(`__wts.layerCenter(${JSON.stringify(r2)})`)
  await c.drag(rot, { x: rc.x + 140, y: rc.y - 10 }, 10)
  check('[3B] rotation handle rotates', Math.abs((await layer(r2)).rotation) > 10)
  const co = await S(`__wts.layerCenter(${JSON.stringify(r2)})`)
  await c.drag(co, { x: co.x - 200, y: co.y }, 10)
  check('[3B] moving partly off-canvas is not clamped', (await layer(r2)).x < 0)
  await c.ev('__wts.store.getState().setSnapping({enabled:true})')
  await c.click(await S(`__wts.layerCenter(${JSON.stringify(rt)})`))
  const tc = await S(`__wts.layerCenter(${JSON.stringify(rt)})`)
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tc.x, y: tc.y })
  await c.mouse('mousePressed', tc.x, tc.y)
  for (let i = 1; i <= 5; i++) {
    await c.mouse('mouseMoved', tc.x + i, tc.y)
    await c.sleep(25)
  }
  const mid = await st()
  await c.mouse('mouseReleased', tc.x + 5, tc.y)
  await c.sleep(200)
  check(
    '[3B] snapping shows guides during drag and clears after',
    mid.guides.length > 0 && (await st()).guides.length === 0
  )
  const z0 = await c.ev('document.getElementById("zoom-label").textContent')
  await clickBtn('Zoom in')
  await clickBtn('Zoom in')
  await clickBtn('100%')
  const zl1 = await c.ev('document.getElementById("zoom-label").textContent')
  await clickBtn('Fit')
  check(
    '[3B] zoom controls change only the view; fit restores',
    zl1 === '100%' && (await c.ev('document.getElementById("zoom-label").textContent')) === z0
  )
  const r2400 = JSON.parse(
    await c.ev('__wts.renderToDataUrl().then(r=>JSON.stringify({w:r.width,h:r.height}))')
  )
  const r1200 = JSON.parse(
    await c.ev('__wts.renderToDataUrl(1200,1800).then(r=>JSON.stringify({w:r.width,h:r.height}))')
  )
  check(
    '[3B] high-resolution render exact sizes (2400×3600, 1200×1800) regardless of the panels/zoom',
    r2400.w === 2400 && r2400.h === 3600 && r1200.w === 1200 && r1200.h === 1800,
    { r2400, r1200 }
  )
  const probe = JSON.parse(
    await c.ev(
      `(async()=>{const r=await __wts.renderToDataUrl(); const im=new Image(); await new Promise(x=>{im.onload=x; im.src=r.dataUrl}); const cv=document.createElement('canvas'); cv.width=im.width; cv.height=im.height; const x=cv.getContext('2d'); x.drawImage(im,0,0); return JSON.stringify([0,1].map(i=>Array.from(x.getImageData(i?2399:0,i?3599:0,1,1).data).join(',')))})()`
    )
  )
  check(
    '[3B] render contains printable content only (corners = design background)',
    probe.every((p) => p === '239,233,223,255'),
    probe
  )
  // save, close, reopen with panel state
  await c.click(await center(rowName(r1)))
  await c.click(await center(`${row(r1)} button[aria-label^="Lock layer"]`))
  await c.click(await center(`${row(r3)} button[aria-label^="Hide layer"]`))
  await c.dblclick(await center(rowName(r3)))
  await c.insertText('Hidden third')
  await c.key('Enter', { code: 'Enter', vk: 13 })
  await c.click(await center(rowName(r2)))
  await typeInto('Photo number', '9')
  const saved = (await st()).project.layers
  await clickBtn('Save')
  await c.sleep(1300)
  check(
    'Save wrote the package and the document shows "Saved"',
    fs.existsSync(process.env.WALKONE_DEV_SAVE_PATH) &&
      (await c.ev('document.getElementById("doc-state").textContent')).includes('Saved') &&
      !(await dirty())
  )
  await c.click(await center(rowName(r2)))
  await typeInto('X', '123')
  check(
    'the toolbar shows "Modified" after an edit',
    (await c.ev('document.getElementById("doc-state").textContent')).includes('Modified') &&
      (await dirty())
  )
  await clickBtn('Close project')
  await c.sleep(600)
  check(
    'Close returns to the empty state (panels disappear)',
    (await st()).project === null && !(await c.ev('!!document.querySelector(".layers-panel")'))
  )
  await clickBtn('Open…')
  await c.sleep(1800)
  s = await st()
  const diff = []
  for (const l of saved) {
    const m = s.project.layers.find((x) => x.id === l.id)
    if (!m) {
      diff.push([l.name, 'missing'])
      continue
    }
    for (const k of Object.keys(l))
      if (JSON.stringify(l[k]) !== JSON.stringify(m[k])) diff.push([l.name, k])
  }
  check(
    'reopened project keeps names, lock, visibility, stacking, photo numbers and geometry exactly',
    diff.length === 0 && s.project.layers.length === saved.length,
    diff.slice(0, 4)
  )
  check(
    'after reopen: panel rows reflect saved state (hidden/locked rows) and the project is clean',
    (await c.ev(`!!document.querySelector('${row(r3)} button[aria-label^="Show layer"]')`)) &&
      (await c.ev(`!!document.querySelector('${row(r1)} button[aria-label^="Unlock layer"]')`)) &&
      !(await dirty())
  )
  check(
    'asset still loads after reopen',
    await c.ev(
      `(()=>{const s=__wts.store.getState(); return __wts.imageCache.status(s.session.sessionId+':'+s.project.assets[0].id)==='ready'})()`
    )
  )
  check(
    'renderer still has no Node access at the end',
    (await c.ev("typeof require+'/'+typeof process")) === 'undefined/undefined'
  )

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.writeFileSync(path.join(__dirname, 'results-phase4.json'), JSON.stringify(results, null, 1))
  c.close()
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('ERR', e.stack || e.message)
  process.exit(2)
})
