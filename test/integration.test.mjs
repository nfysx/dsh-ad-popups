/**
 * dsh-ad-popups 端到端自测:用真的 node:http 服务器 + 真的 fetch 跑一遍整条链路,
 * 证明「宿主路由 + 状态判定 + 客户端脚本」这三段在真实 HTTP 上确实串得起来。
 *
 * 运行:node --test ad-flyer/test/integration.test.mjs
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** 一个极简的 webserver 替身:真监听端口,按注册表分发请求。 */
function makeWebServer() {
  const routes = new Map()
  const taps = []
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const route = routes.get(path)
    if (route === undefined) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    Promise.resolve(route.handler(req, res)).catch((error) => {
      res.writeHead(400)
      res.end(String(error))
    })
  })
  return {
    server,
    routes,
    taps,
    handle: { routes, taps },
    api: {
      register(route) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
      tapIndex(transform) {
        taps.push(transform)
        return () => {}
      },
      get port() { return server.address()?.port },
    },
  }
}

let base = ''
let web = null
let home = ''
let ctx = null

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'dsh-ad-popups-e2e-'))
  process.env.DSH_HOME = home
  const plugin = await import(pathToFileURL(join(here, '..', 'index.js')).href + '?e2e=' + Date.now())

  web = makeWebServer()
  const listeners = new Map()
  ctx = {
    get: (name) => (name === 'webServer' ? web.api : undefined),
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(fn)
      return () => listeners.get(name)?.delete(fn)
    },
    emit(name, ...args) {
      const set = listeners.get(name)
      if (set === undefined) return 0
      for (const fn of [...set]) fn(...args)
      return set.size
    },
    effect(fn) {
      return fn()
    },
  }
  plugin.apply(ctx, {})

  await new Promise((resolve) => web.server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + String(web.server.address().port)
})

after(async () => {
  if (web !== null) await new Promise((resolve) => web.server.close(resolve))
  if (home !== '') rmSync(home, { recursive: true, force: true })
})

test('真实 HTTP:状态接口可用且初始是空闲', async () => {
  const response = await fetch(base + '/api/dsh-ad-popups/state', { cache: 'no-store' })
  assert.equal(response.status, 200)
  const state = await response.json()
  assert.equal(state.ok, true)
  assert.equal(state.thinking, false)
  assert.equal(state.config.enabled, true, '默认总开关是开的')
  assert.equal(response.headers.get('cache-control'), 'no-store', '状态不能被打缓存')
})

test('真实 HTTP:思考开始/结束后状态随之变化', async () => {
  ctx.emit('api-session/status', 'session-e2e', true)
  let state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.equal(state.thinking, true)
  assert.equal(state.sessions[0].sessionId, 'session-e2e')

  ctx.emit('session/event', { id: 'session-e2e' }, { type: 'turn/end' })
  state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.equal(state.thinking, false)
})

test('真实 HTTP:客户端脚本可直接被浏览器加载', async () => {
  const response = await fetch(base + '/dsh-ad-popups/client.js')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /javascript/)
  const code = await response.text()
  assert.match(code, /__dshAdPopups/, '拿到的应该是真的客户端脚本')
  // 脚本语法必须能被解析(等价于浏览器首次加载它)
  assert.doesNotThrow(() => new Function(code))
})

test('真实 HTTP:设置页与设置接口可用,状态里带素材', async () => {
  const page = await fetch(base + '/dsh-ad-popups/settings')
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /text\/html/)
  const html = await page.text()
  assert.match(html, /广告文案/, '设置页里应有文案编辑器')
  assert.match(html, /\/api\/dsh-ad-popups\/settings/)

  const read = await fetch(base + '/api/dsh-ad-popups/settings', { cache: 'no-store' })
  assert.equal(read.status, 200)
  const payload = await read.json()
  assert.equal(payload.ok, true)
  assert.ok(typeof payload.adText === 'string' && payload.adText.length > 0, '应返回当前文案')
  assert.ok(typeof payload.defaultAdText === 'string' && payload.defaultAdText.length > 0, '应返回内置文案')

  const state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.ok(Array.isArray(state.ads) && state.ads.length > 0, '状态里应带下发的素材')
  assert.ok(state.ads[0].title.length > 0, '素材要有标题')
})

test('真实 HTTP:改文案立刻生效,非法文案被拒,可恢复默认', async () => {
  const custom = '角标 | 来自 HTTP 的标题 | 正文 | 跑马灯 | 按钮 | blue'
  let response = await fetch(base + '/api/dsh-ad-popups/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adText: custom }),
  })
  assert.equal(response.status, 200)
  let state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.equal(state.ads.length, 1)
  assert.equal(state.ads[0].title, '来自 HTTP 的标题', '新文案应立刻生效')
  assert.equal(state.ads[0].theme, 'blue')

  // 只有注释 = 解析不出任何一条 → 400,并且不能改到已有文案
  response = await fetch(base + '/api/dsh-ad-popups/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adText: '# 只有注释\n\n# 还是注释' }),
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).ok, false)
  state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.equal(state.ads[0].title, '来自 HTTP 的标题', '被拒的写入不该改到已有文案')

  // 恢复内置文案
  response = await fetch(base + '/api/dsh-ad-popups/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resetAdText: true }),
  })
  assert.equal(response.status, 200)
  state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.ok(state.ads.length >= 10, '恢复内置文案后素材应该有很多条')
})

test('真实 HTTP:设置改完立刻生效,关闭后脚本仍注入(留着重开的入口)', async () => {
  const response = await fetch(base + '/api/dsh-ad-popups/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false, maxPopups: 3 }),
  })
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.config.enabled, false)
  assert.equal(payload.config.maxPopups, 3)

  const state = await (await fetch(base + '/api/dsh-ad-popups/state')).json()
  assert.equal(state.config.enabled, false, '状态接口要立刻反映新设置')

  // 关闭只影响「投不投广告」;脚本仍然注入,否则徽标不在、用户没法再打开
  const html = web.taps[0]('<html><head></head><body></body></html>')
  assert.notEqual(html.indexOf('client.js'), -1, '关闭后仍要注入脚本(徽标是唯一的重开入口)')

  // 收尾:把它开回去,避免影响后续用例
  await fetch(base + '/api/dsh-ad-popups/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  })
})
