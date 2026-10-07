// Minimal DevTools-protocol driver used for scripted manual validation (scratchpad only).
const { execSync } = require('child_process')
const fs = require('fs')
exports.connect = async (port = 9340) => {
  const j = JSON.parse(execSync(`curl -s localhost:${port}/json`).toString()).find(
    (t) => t.type === 'page'
  )
  const ws = new WebSocket(j.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = {}
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (pending[m.id]) {
      pending[m.id](m)
      delete pending[m.id]
    } else if (m.method && exports.onEvent) exports.onEvent(m)
  }
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id
      pending[i] = (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails)
      throw new Error(
        JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)
      )
    return r.result.value
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const mouse = (type, x, y, extra = {}) =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      ...extra
    })
  const drag = async (from, to, steps = 8) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y })
    await mouse('mousePressed', from.x, from.y)
    for (let i = 1; i <= steps; i++) {
      await mouse(
        'mouseMoved',
        from.x + ((to.x - from.x) * i) / steps,
        from.y + ((to.y - from.y) * i) / steps
      )
      await sleep(15)
    }
    await mouse('mouseReleased', to.x, to.y)
    await sleep(120)
  }
  const click = async (p) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
    await mouse('mousePressed', p.x, p.y)
    await mouse('mouseReleased', p.x, p.y)
    await sleep(120)
  }
  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
  }
  return { send, ev, sleep, drag, click, shot, mouse, close: () => ws.close() }
}

// ---- additions for Phase 3B validation
exports.extend = (c) => {
  const key = async (k, { code = k, vk = 0, modifiers = 0, text } = {}) => {
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers,
      ...(text ? { text } : {})
    })
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
    await c.sleep(120)
  }
  const dblclick = async (p) => {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
    for (const n of [1, 2]) {
      await c.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: p.x,
        y: p.y,
        button: 'left',
        buttons: 1,
        clickCount: n
      })
      await c.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: p.x,
        y: p.y,
        button: 'left',
        buttons: 0,
        clickCount: n
      })
      await c.sleep(60)
    }
    await c.sleep(250)
  }
  const insertText = async (t) => {
    await c.send('Input.insertText', { text: t })
    await c.sleep(100)
  }
  const clickButton = (label) =>
    c.ev(
      `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(label)}); if(!b) return 'no button'; b.click(); return 'ok'})()`
    )
  return { ...c, key, dblclick, insertText, clickButton }
}

exports.extend2 = (c) => {
  const e = exports.extend(c)
  const mouseMod = async (type, x, y, modifiers = 0) =>
    c.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      modifiers
    })
  const clickMod = async (p, modifiers = 0) => {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, modifiers })
    await mouseMod('mousePressed', p.x, p.y, modifiers)
    await mouseMod('mouseReleased', p.x, p.y, modifiers)
    await c.sleep(150)
  }
  const dragMod = async (from, to, steps = 8, modifiers = 0) => {
    await c.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x,
      y: from.y,
      modifiers
    })
    await mouseMod('mousePressed', from.x, from.y, modifiers)
    for (let i = 1; i <= steps; i++) {
      await c.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
        buttons: 1,
        modifiers
      })
      await c.sleep(15)
    }
    await mouseMod('mouseReleased', to.x, to.y, modifiers)
    await c.sleep(150)
  }
  return { ...e, clickMod, dragMod }
}
