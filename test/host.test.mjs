/**
 * dsh-ad-popups 宿主半边的自测:用假的 cordis 上下文 + 假的 WebServer 真跑一遍 apply(),
 * 验证
 *   1. 三条路由都注册上了,index 注入也在;
 *   2. api-session/status / session/event / agent/status 能正确驱动「思考中」状态;
 *   3. turn/end 之后状态会落回空闲;
 *   4. 总开关关掉后仍然注入脚本(徽标是唯一的重开入口);
 *   5. 设置读写落到 $DSH_HOME 下的设置文件。
 *
 * 运行:node --test ad-flyer/test/host.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** 用一套干净的 $DSH_HOME 重新 import 宿主半边(设置文件路径在模块加载时解析)。 */
async function freshPlugin(home) {
  process.env.DSH_HOME = home
  const url = pathToFileURL(join(here, '..', 'index.js')).href + '?home=' + encodeURIComponent(home)
  return await import(url)
}

/** 假 cordis 上下文:记录监听器,方便测试主动触发事件。 */
function makeCtx() {
  const listeners = new Map()
  const effects = []
  const ctx = {
    listeners,
    effects,
    get(name) {
      return name === 'webServer' ? ctx.webServer : undefined
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(fn)
      const dispose = () => listeners.get(name)?.delete(fn)
      return dispose
    },
    /** 触发一个事件;返回有多少监听器收到。 */
    emit(name, ...args) {
      const set = listeners.get(name)
      if (set === undefined) return 0
      for (const fn of [...set]) fn(...args)
      return set.size
    },
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
  }

  const routes = new Map()
  const taps = []
  ctx.webServer = {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
    tapIndex(transform) {
      taps.push(transform)
      return () => {
        const at = taps.indexOf(transform)
        if (at !== -1) taps.splice(at, 1)
      }
    },
    get port() { return 19387 },
  }
  ctx.routes = routes
  ctx.taps = taps
  return ctx
}

/** 假的响应对象:攒住状态码 / 头 / body。 */
function makeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.status = status
      if (headers !== undefined) Object.assign(res.headers, headers)
    },
    end(chunk) {
      if (chunk !== undefined) res.body += String(chunk)
    },
  }
  return res
}

/**
 * 假的请求对象:GET 无 body,POST 带一段 JSON。
 * 带上 host 头(设置路由要求回环来源),并实现 off/pause(请求体超限路径会用到)。
 */
function makeReq(method = 'GET', body, headers = { host: '127.0.0.1:19387' }) {
  const listeners = new Map()
  const req = {
    method,
    headers,
    pause() {},
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
      return req
    },
    off(type, fn) {
      const set = listeners.get(type)
      if (set === undefined) return req
      const at = set.indexOf(fn)
      if (at !== -1) set.splice(at, 1)
      return req
    },
    once(type, fn) {
      const wrapped = (...args) => {
        req.off(type, wrapped)
        fn(...args)
      }
      return req.on(type, wrapped)
    },
    destroy() {},
  }
  if (body !== undefined) {
    // 等 handler 挂好监听后再派发(真实流也是这个顺序)
    queueMicrotask(() => {
      const chunk = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')
      for (const fn of [...(listeners.get('data') ?? [])]) fn(chunk)
      for (const fn of [...(listeners.get('end') ?? [])]) fn()
    })
  }
  return req
}

/** 请求一次已注册的路由。 */
async function call(route, req, res) {
  await route.handler(req, res)
  // POST 路径里 handler 内部是 async IIFE,给它一拍
  await new Promise((resolve) => setTimeout(resolve, 0))
  return res
}

/** 造一个已经 apply 好的插件环境。 */
async function setup() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-ad-popups-test-'))
  const plugin = await freshPlugin(home)
  const ctx = makeCtx()
  plugin.apply(ctx, {})
  return { home, plugin, ctx, cleanup: () => rmSync(home, { recursive: true, force: true }) }
}

/** 读一次状态接口。 */
async function readState(ctx) {
  const res = makeRes()
  await call(ctx.routes.get('/api/dsh-ad-popups/state'), makeReq('GET'), res)
  assert.equal(res.status, 200)
  return JSON.parse(res.body)
}

/**
 * 收集一次结构化 index 注入表 —— 等价于宿主启动时的 `collectIndexInjections()`。
 * 桌面端(Electron)只认这张表(tapIndex 在那边完全不生效),所以必须单独验证。
 */
function collectInjections(ctx) {
  const table = []
  ctx.emit('webserver/index-inject', table)
  return table
}

// ---------------------------------------------------------------------------

test('四条路由都注册上了,index 注入也在', async () => {
  const env = await setup()
  try {
    assert.ok(env.ctx.routes.has('/api/dsh-ad-popups/state'), '缺状态路由')
    assert.ok(env.ctx.routes.has('/api/dsh-ad-popups/settings'), '缺设置路由')
    assert.ok(env.ctx.routes.has('/dsh-ad-popups/settings'), '缺设置页路由')
    assert.ok(env.ctx.routes.has('/dsh-ad-popups/client.js'), '缺客户端脚本路由')
    assert.equal(env.ctx.taps.length, 1, '应该只注册一个 tapIndex 注入')

    const html = env.ctx.taps[0]('<html><head></head><body></body></html>')
    assert.match(html, /<script defer src="\/dsh-ad-popups\/client\.js"><\/script>/, 'index 里应注入客户端脚本')
    // 幂等:再跑一遍不重复注入
    const again = env.ctx.taps[0](html)
    assert.equal(again, html, '同一份 html 不应被注入两次')
  } finally {
    env.cleanup()
  }
})

test('设置页路由返回真的 settings.html', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/dsh-ad-popups/settings'), makeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.match(String(res.headers['Content-Type']), /text\/html/)
    assert.match(res.body, /广告文案/, '页面里应该有文案编辑器')
    assert.match(res.body, /\/api\/dsh-ad-popups\/settings/, '页面应该调用设置接口')
    assert.ok(res.body.includes('</html>'), '应该是一份完整 HTML')
  } finally {
    env.cleanup()
  }
})

test('桌面端通道:webserver/index-inject 会给出可用的结构化行', async () => {
  const env = await setup()
  try {
    const rows = collectInjections(env.ctx)
    assert.equal(rows.length, 1, '应该恰好推一行')
    const row = rows[0]
    assert.equal(row.kind, 'script', '桌面端要用内联 script 行(script-src 行加载失败会 reject 整个 boot)')
    assert.equal(row.placement, 'head')
    assert.ok(row.text.includes('/dsh-ad-popups/client.js'), '行里要指向客户端脚本')
    assert.ok(row.text.includes('onerror'), '内联加载器要自己吞掉加载失败')

    // 第二次收集:同一行不该重复出现
    assert.deepEqual(collectInjections(env.ctx), rows, '重复收集应保持一行')
  } finally {
    env.cleanup()
  }
})

test('关掉总开关后仍然注入脚本(否则关掉就再也找不到入口了)', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', { enabled: false }), res)
    assert.equal(res.status, 200)

    // 方案 A:关闭只是「不投放广告」,脚本照旧注入 —— 右下角徽标是唯一的重新开启入口
    const rows = collectInjections(env.ctx)
    assert.equal(rows.length, 1, '关掉后结构化行仍要推')
    assert.ok(rows[0].text.includes('/dsh-ad-popups/client.js'), '推的还是客户端脚本')
    const html = env.ctx.taps[0]('<html><head></head><body></body></html>')
    assert.notEqual(html.indexOf('client.js'), -1, '关掉后 tapIndex 仍要注入')
    // 幂等:重复改写也不会注两遍
    assert.equal(env.ctx.taps[0](html), html, '同一份 html 不该被注入两次')
  } finally {
    env.cleanup()
  }
})

test('没有 webServer 服务时安静退出,不抛异常', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-ad-popups-test-'))
  const plugin = await freshPlugin(home)
  const ctx = {
    get: () => undefined,
    effect: () => () => {},
    on: () => () => {},
  }
  assert.doesNotThrow(() => plugin.apply(ctx, {}))
  rmSync(home, { recursive: true, force: true })
})

test('api-session/status 能驱动「思考中」,turn/end 后落回空闲', async () => {
  const env = await setup()
  try {
    let state = await readState(env.ctx)
    assert.equal(state.thinking, false, '一开始不该在思考')
    assert.equal(state.version, 1)

    // 宿主官方状态事件:agent 开始跑
    assert.equal(env.ctx.emit('api-session/status', 'session-abc', true), 1, '状态监听器应该收到事件')
    state = await readState(env.ctx)
    assert.equal(state.thinking, true, 'agent 跑起来后应报告思考中')
    assert.equal(state.sessions.length, 1)
    assert.equal(state.sessions[0].sessionId, 'session-abc')
    assert.ok(state.sessions[0].elapsedMs >= 0, '要带本轮已跑时长')

    // 一轮结束
    env.ctx.emit('session/event', { id: 'session-abc' }, { type: 'turn/end' })
    state = await readState(env.ctx)
    assert.equal(state.thinking, false, 'turn/end 之后应立刻落回空闲')
  } finally {
    env.cleanup()
  }
})

test('session/event 的 turn/start 也能开始计时(状态事件缺席时的兜底)', async () => {
  const env = await setup()
  try {
    env.ctx.emit('session/event', { id: 'session-xyz' }, { type: 'turn/start' })
    let state = await readState(env.ctx)
    assert.equal(state.thinking, true, 'turn/start 应该让状态变成思考中')
    assert.equal(state.sessions[0].source, 'turn', '来源应记为 turn')

    // 中间事件(工具调用等)只刷新活动时间,不会把状态打掉
    env.ctx.emit('session/event', { id: 'session-xyz' }, { type: 'tool/call', data: {} })
    state = await readState(env.ctx)
    assert.equal(state.thinking, true, '中间事件不该把思考状态打掉')
  } finally {
    env.cleanup()
  }
})

test('流式输出会持续续命:长回答不会中途被误判为空闲', async () => {
  const env = await setup()
  try {
    // 一轮开始
    env.ctx.emit('session/event', { id: 'session-stream' }, { type: 'turn/start' })
    let state = await readState(env.ctx)
    assert.equal(state.thinking, true)

    // 流式帧(真实事件形状:payload.agent.session.id)
    const frames = env.ctx.emit('agent/assistant-stream', { agent: { session: { id: 'session-stream' } }, frame: { type: 'chunk' } })
    assert.equal(frames, 1, 'assistant-stream 监听器应该收到事件')

    // 关键回归:等超过空闲窗口(8s)之后,只要流还在推,状态就必须仍然 thinking。
    // 第一版没有这个订阅,长回答跑到一半广告会突然消失。
    await new Promise((resolve) => setTimeout(resolve, 20))
    state = await readState(env.ctx)
    assert.equal(state.thinking, true, '流式期间必须仍然算「思考中」')

    // 流停止 + 回合结束 → 落回空闲
    env.ctx.emit('session/event', { id: 'session-stream' }, { type: 'turn/end' })
    state = await readState(env.ctx)
    assert.equal(state.thinking, false)
  } finally {
    env.cleanup()
  }
})

test('流式帧不会凭空造出状态(只续命,不新增)', async () => {
  const env = await setup()
  try {
    // 没有 turn/start,直接来流式帧:不该凭空出现一个「正在思考」的会话
    env.ctx.emit('agent/assistant-stream', { agent: { session: { id: 'ghost' } }, frame: {} })
    const state = await readState(env.ctx)
    assert.equal(state.thinking, false, '没有回合开始的流式帧不该造出状态')
  } finally {
    env.cleanup()
  }
})

test('agent/status 的 running/idle 是有效信号', async () => {
  const env = await setup()
  try {
    env.ctx.emit('agent/status', { status: 'running', agent: { session: { id: 'session-agent' } } })
    let state = await readState(env.ctx)
    assert.equal(state.thinking, true, 'agent running 应报告思考中')
    assert.equal(state.sessions[0].sessionId, 'session-agent')

    env.ctx.emit('agent/status', { status: 'idle', agent: { session: { id: 'session-agent' } } })
    state = await readState(env.ctx)
    assert.equal(state.thinking, false, 'agent idle 应落回空闲')
  } finally {
    env.cleanup()
  }
})

test('客户端脚本路由返回真的 client.js', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/dsh-ad-popups/client.js'), makeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.match(String(res.headers['Content-Type']), /javascript/)
    assert.match(res.body, /__dshAdPopups/, '返回的应该是真的客户端脚本')
    assert.equal(res.body, readFileSync(join(here, '..', 'client.js'), 'utf8'), '脚本内容应与磁盘一致')
  } finally {
    env.cleanup()
  }
})

test('设置写进 $DSH_HOME,并带上总开关状态', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', { enabled: false, maxPopups: 2 }), res)
    assert.equal(res.status, 200)
    const payload = JSON.parse(res.body)
    assert.equal(payload.ok, true)
    assert.equal(payload.config.enabled, false)
    assert.equal(payload.config.maxPopups, 2)

    const file = join(env.home, 'dsh-ad-popups.json')
    assert.ok(existsSync(file), '设置文件应该被写出来')
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(saved.enabled, false)
    assert.equal(saved.maxPopups, 2)

    // state 里也要带上这个配置,浏览器半边据此停投放(但脚本仍然注入)
    const state = await readState(env.ctx)
    assert.equal(state.config.enabled, false, 'state 应该带上总开关状态')
    assert.notEqual(
      env.ctx.taps[0]('<html><head></head><body></body></html>').indexOf('client.js'), -1,
      '关闭状态下脚本仍要注入,否则徽标不在、没法再打开',
    )
  } finally {
    env.cleanup()
  }
})

test('maxPopups 会被夹到 1-8,坏请求体不会打死路由', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', { maxPopups: 999 }), res)
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).config.maxPopups, 8, '超过上限应夹到 8')

    let state = await readState(env.ctx)
    assert.equal(state.config.maxPopups, 8)
  } finally {
    env.cleanup()
  }
})

test('不支持的 HTTP 方法返回 405,而不是崩掉', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('DELETE'), res)
    assert.equal(res.status, 405)
    assert.equal(JSON.parse(res.body).ok, false)
  } finally {
    env.cleanup()
  }
})

test('插件在 index 里没有 head/body 时也能注入,且不会重复', async () => {
  const env = await setup()
  try {
    const html = env.ctx.taps[0]('<app-root></app-root>')
    assert.match(html, /client\.js/, '没有 head/body 时应追加在末尾')
    assert.equal(env.ctx.taps[0](html), html, '二次调用不该重复注入')
  } finally {
    env.cleanup()
  }
})

test('Config 是一份真 schema(走 cordis 的 Standard Schema 校验路径)', async () => {
  const env = await setup()
  try {
    const schema = env.plugin.Config
    assert.ok(schema !== undefined, '必须导出 Config')
    const standard = schema['~standard']
    assert.ok(standard !== undefined, 'Config 必须带 ~standard(cordis resolveConfig 依赖它)')
    assert.equal(typeof standard.validate, 'function', '~standard.validate 必须是函数')

    // 空配置 → 默认值(这是 cordis 实际走的路径:直接把校验结果当 config 传给 apply)
    const empty = standard.validate(undefined)
    assert.equal(empty.issues, undefined, '空配置不该报错')
    assert.deepEqual(empty.value, { enabled: true, maxPopups: 4 }, '空配置应落回默认值')

    // 正常配置被接受
    assert.deepEqual(
      standard.validate({ enabled: false, maxPopups: 2 }).value,
      { enabled: false, maxPopups: 2 },
    )

    // 非法值要么报 issue 要么落回默认,总之不能抛
    assert.doesNotThrow(() => standard.validate({ maxPopups: 999 }))
    assert.doesNotThrow(() => standard.validate({ maxPopups: 'abc' }))
    assert.doesNotThrow(() => standard.validate('nonsense'))
    assert.doesNotThrow(() => standard.validate(null))
  } finally {
    env.cleanup()
  }
})

test('设置文件优先于插件 config(三档优先级里最高的一档)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-ad-popups-test-'))
  try {
    // 先落一份设置文件,再用「config 说 enabled: false」启动插件
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(home, 'dsh-ad-popups.json'), JSON.stringify({ enabled: true, maxPopups: 2 }), 'utf8')
    const plugin = await freshPlugin(home)
    const ctx = makeCtx()
    plugin.apply(ctx, { enabled: false, maxPopups: 6 })

    const res = makeRes()
    await call(ctx.routes.get('/api/dsh-ad-popups/state'), makeReq('GET'), res)
    const state = JSON.parse(res.body)
    assert.equal(state.config.enabled, true, '设置文件里的 enabled 应该盖过 config')
    assert.equal(state.config.maxPopups, 2, '设置文件里的 maxPopups 应该盖过 config')

    // 且 index 注入按设置文件的结论走(开 = 注入)
    assert.match(ctx.taps[0]('<html><head></head><body></body></html>'), /client\.js/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('设置路由拒绝非回环来源与跨源 Origin', async () => {
  const env = await setup()
  try {
    const remote = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', { enabled: false }, { host: '192.168.1.9:19387' }), remote)
    assert.equal(remote.status, 403, '非回环 Host 应被拒绝')

    const crossOrigin = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', { enabled: false }, { host: '127.0.0.1:19387', origin: 'http://evil.example' }), crossOrigin)
    assert.equal(crossOrigin.status, 403, '跨源 Origin 应被拒绝')

    // 被拒绝时不能真的写盘
    const state = await readState(env.ctx)
    assert.equal(state.config.enabled, true, '被拒绝的请求不该改设置')
  } finally {
    env.cleanup()
  }
})

test('超大请求体回 413,而不是把连接拆掉', async () => {
  const env = await setup()
  try {
    // 设置接口的上限是 512 KiB(文案文本可能很长),所以这里要真的超过它
    const big = 'x'.repeat(600 * 1024)
    const res = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', '{"enabled":false,"pad":"' + big + '"}'), res)
    assert.equal(res.status, 413, '超限应回 413')
    assert.equal(JSON.parse(res.body).ok, false)
    assert.match(JSON.parse(res.body).error, /请求体过大/)
  } finally {
    env.cleanup()
  }
})

test('坏的 JSON 回 400,不影响后续请求', async () => {
  const env = await setup()
  try {
    const res = makeRes()
    await call(env.ctx.routes.get('/api/dsh-ad-popups/settings'), makeReq('POST', '{"enabled":'), res)
    assert.equal(res.status, 400)
    assert.equal(JSON.parse(res.body).ok, false)

    const after = await readState(env.ctx)
    assert.equal(after.ok, true, '坏请求之后状态接口仍然正常')
  } finally {
    env.cleanup()
  }
})

test('effect 的 disposer 真的注销了路由与 index 注入', async () => {
  const env = await setup()
  try {
    assert.equal(env.ctx.routes.size, 4, '四条路由都该在')
    assert.equal(env.ctx.taps.length, 1)

    for (const dispose of env.ctx.effects) {
      if (typeof dispose === 'function') dispose()
    }
    assert.equal(env.ctx.routes.size, 0, '注销后不该留下任何路由')
    assert.equal(env.ctx.taps.length, 0, '注销后不该留下 index 注入')
    assert.deepEqual(collectInjections(env.ctx), [], '注销后不该再推结构化行')
  } finally {
    env.cleanup()
  }
})
