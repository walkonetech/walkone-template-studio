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
    }
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
