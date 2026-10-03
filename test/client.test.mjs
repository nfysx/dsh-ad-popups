/**
 * dsh-ad-popups 客户端脚本的自测(不需要浏览器/构建链):
 * 用最小 DOM 桩在 Node 里真跑一遍 client.js,验证
 *   1. 能正常启动、不抛异常;
 *   2. 宿主说「正在思考」时会真的飘出弹窗;
 *   3. 「关闭」按钮按够次数后弹窗真的消失;
 *   4. 「别放了」能立刻清空并静音。
 *
 * 运行:node --test ad-flyer/test/client.test.mjs
 *(或直接 node ad-flyer/test/client.test.mjs 看逐条结果)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT_SOURCE = readFileSync(join(here, '..', 'client.js'), 'utf8')

/** 客户端里设置页的路径(独立页面那条链接)。 */
const SETTINGS_PATH = '/dsh-ad-popups/settings'

// ---------------------------------------------------------------------------
// 最小 DOM 桩:只实现 client.js 真正用到的那部分
// ---------------------------------------------------------------------------

class FakeClassList {
  constructor() { this.set = new Set() }
  add(...names) { for (const n of names) this.set.add(n) }
  remove(...names) { for (const n of names) this.set.delete(n) }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : force
    if (on) this.set.add(name)
    else this.set.delete(name)
    return on
  }
  contains(name) { return this.set.has(name) }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase()
    this.children = []
    this.parentNode = null
    this.style = { setProperty() {}, removeProperty() {} }
    this.dataset = {}
    this.attributes = {}
    this.classList = new FakeClassList()
    this.listeners = new Map()
    this.offsetWidth = 268
    this.offsetHeight = 190
    this._text = ''
    /** 表单控件的桩状态:textarea 用 value,checkbox 用 checked。 */
    this.value = ''
    this.checked = false
    this.type = ''
    /** 该元素的「当前表单值」——留空时回落到 value(真实 DOM 里 value 就是它)。 */
    this.formData = undefined
  }
  get textContent() { return this._text }
  set textContent(value) { this._text = String(value) }
  /** 真实 DOM 里 className 与 classList 是联动的,桩里也要联动,否则按 class 找元素会全落空。 */
  get className() { return [...this.classList.set].join(' ') }
  set className(value) {
    this.classList.set.clear()
    for (const name of String(value).split(/\s+/)) if (name !== '') this.classList.set.add(name)
  }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) { return this.attributes[name] ?? null }
  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }
  removeChild(child) {
    const at = this.children.indexOf(child)
    if (at !== -1) this.children.splice(at, 1)
    child.parentNode = null
    return child
  }
  addEventListener(type, fn, capture) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add({ fn, capture: capture === true })
  }
  removeEventListener(type, fn) {
    const set = this.listeners.get(type)
    if (set === undefined) return
    for (const entry of [...set]) if (entry.fn === fn) set.delete(entry)
  }
  /** 触发一个已登记的监听器(测试用)。
   *
   * 按真实的 DOM 事件流走:捕获阶段(根 → 目标)→ 目标阶段 → 冒泡阶段(目标 → 根),
   * 并且尊重 stopPropagation。这样「在捕获阶段 stopPropagation 把自己的监听器一起拦掉」
   * 这类 bug 才会被测出来 —— 之前正是它让面板控件的 handler 永远不触发。
   */
  fire(type, event = {}) {
    const path = []
    for (let node = this; node !== null && node !== undefined; node = node.parentNode) path.push(node)
    path.reverse() // 根 → 目标
    const ev = event
    if (typeof ev.stopPropagation !== 'function') {
      ev.stopPropagation = () => { ev.__stopped = true }
    } else {
      const original = ev.stopPropagation
      ev.stopPropagation = () => { ev.__stopped = true; original() }
    }
    let fired = 0
    const call = (node, capture) => {
      if (ev.__stopped === true) return
      const set = node.listeners.get(type)
      if (set === undefined) return
      for (const entry of [...set]) {
        if (entry.capture !== capture) continue
        fired += 1
        entry.fn(ev)
        if (ev.__stopped === true) return
      }
    }
    for (const node of path) call(node, true)
    call(this, false)
    for (let i = path.length - 2; i >= 0 && ev.__stopped !== true; i--) call(path[i], false)
    return fired
  }
  /** 递归收集自身及后代。 */
  walk(out = []) {
    out.push(this)
    for (const child of this.children) child.walk(out)
    return out
  }
  querySelectorAll(selector) {
    // client.js 只用属性选择器挑自己的东西,这里按 class 大致支持一下
    const cls = selector.startsWith('.') ? selector.slice(1) : null
    return this.walk().filter((el) => cls !== null && el.classList.contains(cls))
  }
  /** 面板会调 panel.contains(target) / panel.focus() / panel.getBoundingClientRect()。 */
  contains(node) {
    for (const el of this.walk()) {
      if (el === node) return true
    }
    return false
  }
  focus() {}
  getBoundingClientRect() {
    return { left: 100, top: 80, width: 760, height: 600, right: 860, bottom: 680 }
  }
  scrollIntoView() {}
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html')
    this.head = new FakeElement('head')
    this.body = new FakeElement('body')
    // 真实 DOM 里 head/body 是 documentElement 的子节点,面板也可能挂在 documentElement 上
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
    this.listeners = new Map()
  }
  createElement(tag) { return new FakeElement(tag) }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(fn)
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
}

/** 造一个受控的沙箱环境。 */
function makeSandbox(stateResponses) {
  const document = new FakeDocument()
  const timers = new Map()
  let timerSeq = 0
  const fetchCalls = []
  /** 设置接口的应答(面板读它);默认给一份和内置文案等价的样例。 */
  const settingsPayload = {
    ok: true,
    config: { enabled: true, maxPopups: 4 },
    adText: '角标 | 内置样例标题',
    defaultAdText: '角标 | 内置样例标题',
  }
  /** 面板发出的 POST 请求体(测试用来断言保存内容)。 */
  const posts = []
  const clampMax = (value) => Math.min(8, Math.max(1, Math.round(Number(value) || 4)))

  const window = {
    document,
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: {
      store: new Map(),
      getItem(k) { return this.store.has(k) ? this.store.get(k) : null },
      setItem(k, v) { this.store.set(k, String(v)) },
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn, delay) {
      const id = ++timerSeq
      timers.set(id, { fn, delay, repeat: false })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    /** 设置面板用 setInterval 刷新状态栏,所以桩里也得有。 */
    setInterval(fn, delay) {
      const id = ++timerSeq
      timers.set(id, { fn, delay, repeat: true })
      return id
    },
    clearInterval(id) { timers.delete(id) },
  }

  const sandbox = {
    window,
    document,
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Array,
    Object,
    Promise,
    Error,
    AbortController: undefined,
    // client.js 里有的地方用的是全局定时器(不是 window.xxx),沙箱里要补齐
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    fetch(url, init) {
      fetchCalls.push({ url, init })
      // 设置面板读的是设置接口,状态轮询读的是状态接口 —— 两者分开应答
      const isSettings = String(url).indexOf('/settings') !== -1
      if (isSettings) {
        if (init !== undefined && init.method === 'POST') {
          let body = {}
          try { body = JSON.parse(init.body) } catch (error) { body = {} }
          posts.push(body)
          // 回一份「已保存」的应答(带上宿主会归一化后的值)
          settingsPayload.config = {
            enabled: body.enabled !== undefined ? body.enabled !== false : settingsPayload.config.enabled,
            maxPopups: body.maxPopups !== undefined ? clampMax(body.maxPopups) : settingsPayload.config.maxPopups,
          }
          if (typeof body.adText === 'string') settingsPayload.adText = body.adText
          if (body.resetAdText === true) settingsPayload.adText = settingsPayload.defaultAdText
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(JSON.parse(JSON.stringify(settingsPayload))),
        })
      }
      // 状态接口:默认永远返回同一份快照 —— 靠 shift 顺序会让「第 N 次轮询拿到什么」
      // 变得依赖时序,测试就脆了。要模拟「中途改设置」就改传进来的那个对象。
      const override = envRef.oncePayload
      envRef.oncePayload = undefined
      const payload = override ?? stateResponses[stateResponses.length - 1]
        ?? { thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      })
    },
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox

  const envRef = { oncePayload: undefined }
  sandbox.__envRef = envRef

  return {
    sandbox,
    document,
    window,
    fetchCalls,
    settingsPayload,
    posts,
    /** 让下一次轮询拿到指定快照(模拟「中途在设置页改了开关」)。 */
    once(payload) {
      envRef.oncePayload = payload
    },
    /**
     * 把所有到期的定时器按 delay 顺序跑掉(含新产生的)。
     *
     * 注意:client.js 跑在独立的 vm realm 里,它的 promise 微任务只会在这边
     * 真正让出事件循环时才被 drain —— 光 `await Promise.resolve()` 是不够的,
     * 必须 await 一个真实的 setTimeout。
     */
    async flushTimers(rounds = 6) {
      const yieldLoop = () => new Promise((resolve) => setTimeout(resolve, 0))
      for (let round = 0; round < rounds; round++) {
        await yieldLoop()
        const due = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)
        if (due.length === 0) continue
        for (const [id, entry] of due) {
          // 定时器是 one-shot;interval 留着下一轮再跑
          if (!entry.repeat) timers.delete(id)
          entry.fn()
        }
        await yieldLoop()
      }
    },
  }
}

/** 在沙箱里跑一遍 client.js。 */
function boot(stateResponses) {
  const env = makeSandbox(stateResponses)
  vm.createContext(env.sandbox)
  vm.runInContext(CLIENT_SOURCE, env.sandbox, { filename: 'client.js' })
  return env
}

/** 屏幕上现在的弹窗(按 class 找)。 */
function popupsOf(document) {
  return document.body.walk().filter((el) => el.classList.contains('dsh-ad-popup'))
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

test('启动后不抛异常,并且装上逃生徽标与样式', () => {
  const env = boot([{ thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }])
  const all = env.document.body.walk()
  assert.equal(all.filter((el) => el.classList.contains('dsh-ad-badge')).length, 1, '应该只有一个徽标')
  assert.ok(env.document.head.walk().some((el) => el.tagName === 'STYLE'), '样式应该注入 head')
  assert.ok(env.sandbox.window.__dshAdPopups !== undefined, '管理器应该挂到 window 上')
  assert.equal(popupsOf(env.document).length, 0, '没在思考时不该有弹窗')
})

test('宿主报告「正在思考」后真的飘出弹窗', async () => {
  const env = boot([
    { thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } },
    { thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 100 }], config: { enabled: true, maxPopups: 4 } },
  ])
  const manager = env.sandbox.window.__dshAdPopups
  // 第一次轮询(未思考) + 第二次轮询(思考中)
  await env.flushTimers(3)
  await env.flushTimers(8)
  const popups = popupsOf(env.document)
  assert.ok(popups.length >= 1, `应该至少飘出一个弹窗,实际 ${popups.length}`)
  assert.ok(popups.length <= 8, '弹窗数不该超过硬上限')
  assert.equal(manager.counters.shown, popups.length, '计数应与实际弹窗一致')
  // 每个弹窗都要带「纯属虚构」声明
  for (const popup of popups) {
    const text = popup.walk().map((el) => el.textContent).join('')
    assert.match(text, /纯属虚构/, '每个弹窗都要标明纯属虚构')
  }
})

test('广告文案永远不含外链、不含真实跳转', async () => {
  const env = boot([{ thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: true, maxPopups: 8 } }])
  await env.flushTimers(10)
  const all = env.document.body.walk()
  for (const el of all) {
    assert.ok(!el.classList.contains('dsh-ad-popup') || el.tagName !== 'A', '弹窗里不能有 <a> 链接')
    for (const value of Object.values(el.attributes)) {
      assert.ok(!/^https?:/i.test(value), '不能出现外链地址')
    }
  }
})

test('「关闭」按钮:挣扎几次之后弹窗真的消失', async () => {
  const env = boot([
    { thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: true, maxPopups: 4 } },
  ])
  await env.flushTimers(10)
  const popups = popupsOf(env.document)
  assert.ok(popups.length >= 1, '先要有弹窗')

  const target = popups[0]
  const closeBtn = target.walk().find((el) => el.classList.contains('dsh-ad-close'))
  assert.ok(closeBtn !== undefined, '每个弹窗都要有真的关闭按钮')

  // 最多点 6 次,配合定时器:总会关掉
  for (let i = 0; i < 6; i++) {
    closeBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
    await env.flushTimers(4)
    if (target.parentNode === null) break
  }
  assert.equal(target.parentNode, null, '点够次数后弹窗必须真的被移除')
})

test('弹窗里不再有任何「开关」:只有关闭键 + 立即领取 + 虚构声明', async () => {
  const env = boot([
    { thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: true, maxPopups: 4 } },
  ])
  await env.flushTimers(10)
  const popups = popupsOf(env.document)
  assert.ok(popups.length >= 1, '先要有弹窗')

  for (const popup of popups) {
    assert.equal(popup.walk().filter((el) => el.classList.contains('dsh-ad-mute')).length, 0,
      '弹窗里不该再有「别放了」这类开关(总开关统一在设置页)')
    const names = popup.walk()
      .filter((el) => el.tagName === 'BUTTON')
      .map((el) => [...el.classList.set].join('|'))
    assert.ok(names.every((name) => name === 'dsh-ad-cta' || name === 'dsh-ad-close'),
      '弹窗里只允许「立即领取」和「关闭」两个按钮,实际:' + names.join(','))
    const text = popup.walk().map((el) => el.textContent).join('')
    assert.match(text, /纯属虚构/, '每个弹窗都要标明纯属虚构')
  }
})

test('徽标:点「设置」在页面内打开设置面板(不依赖新窗口)', async () => {
  const env = boot([{ thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }])
  await env.flushTimers(4)
  const badge = env.document.body.walk().find((el) => el.classList.contains('dsh-ad-badge'))
  assert.ok(badge !== undefined, '要有徽标')
  const trigger = badge.walk().find((el) => el.classList.contains('dsh-ad-badge-btn'))
  assert.ok(trigger !== undefined, '徽标上要有「设置」按钮')
  assert.equal(badge.walk().filter((el) => el.classList.contains('dsh-ad-mute')).length, 0,
    '徽标上不该有「别放了」开关')

  // 关键回归:桌面端 window.open 点了没反应,所以设置必须是页面内面板
  let openedWindow = false
  env.sandbox.window.open = () => { openedWindow = true; return null }
  const manager = env.sandbox.window.__dshAdPopups
  trigger.fire('click', { preventDefault() {}, stopPropagation() {} })
  await env.flushTimers(3)

  assert.equal(openedWindow, false, '不该依赖 window.open')
  const mask = env.document.documentElement.walk().find((el) => el.classList.contains('dsh-ad-mask'))
  assert.ok(mask !== undefined, '应该在页面内出现设置面板')
  assert.ok(manager.panel !== undefined, '管理器应记住面板实例')

  // 面板要能把当前文案读成表单(每个字段一个输入框)
  const fields = mask.walk().filter((el) => typeof el.className === 'string' && el.className.indexOf('dsh-ad-field-title') !== -1)
  assert.ok(fields.length >= 1, '面板里要有标题输入框')
  assert.match(String(fields[0].formData), /内置样例标题/, '面板要把当前文案读进来')
})

test('设置面板:自绘开关点一下就切换(不依赖原生 checkbox)', async () => {
  const env = boot([{ thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }])
  await env.flushTimers(3)
  const manager = env.sandbox.window.__dshAdPopups
  manager.openPanel()
  await env.flushTimers(3)

  const mask = env.document.documentElement.walk().find((el) => el.classList.contains('dsh-ad-mask'))
  const toggle = mask.walk().find((el) => el.classList.contains('dsh-ad-row-toggle'))
  assert.ok(toggle !== undefined, '要有总开关')
  assert.equal(toggle.getAttribute('role'), 'switch', '总开关注册成 switch 角色')
  assert.equal(manager.panel.enabled, true, '初始是开')

  toggle.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.enabled, false, '点一下应该变成关(只是草稿,还没保存)')
  assert.equal(toggle.getAttribute('aria-checked'), 'false')

  toggle.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.enabled, true, '再点一下变回开')
})

test('设置面板:改字段后保存,会把开关与文案写回宿主', async () => {
  const env = boot([{ thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }])
  await env.flushTimers(3)
  const manager = env.sandbox.window.__dshAdPopups
  manager.openPanel()
  await env.flushTimers(3)

  const mask = env.document.documentElement.walk().find((el) => el.classList.contains('dsh-ad-mask'))
  assert.ok(mask !== undefined, '面板要开着')

  // 关掉总开关 + 用步进器把上限从 4 调到 2 + 改第一条的标题
  const toggle = mask.walk().find((el) => el.classList.contains('dsh-ad-row-toggle'))
  toggle.fire('click', { preventDefault() {}, stopPropagation() {} })

  // 上限是步进器(− / ＋):每次点击都必须真的改到草稿值与显示值
  const minus = mask.walk().find((el) => el.classList.contains('dsh-ad-step-minus'))
  const plus = mask.walk().find((el) => el.classList.contains('dsh-ad-step-plus'))
  assert.ok(minus !== undefined && plus !== undefined, '要有 − / ＋ 两个步进按钮')
  assert.equal(manager.panel.maxPopups, 4, '初始 4')
  minus.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.maxPopups, 3, '点一次 − 应该变 3')
  assert.equal(String(manager.panel.maxPopupsInput.formData), '3', '显示框要同步')
  minus.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.maxPopups, 2, '再点一次变 2')
  // 边界:一直点 − 不能低于 1
  for (let i = 0; i < 5; i++) minus.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.maxPopups, 1, '下限是 1')
  // 再用 ＋ 回到 2
  plus.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.maxPopups, 2, '点一次 ＋ 变 2')
  for (let i = 0; i < 10; i++) plus.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.maxPopups, 8, '上限是 8')
  for (let i = 0; i < 6; i++) minus.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.maxPopups, 2, '再调回 2 用于后面的保存断言')

  const titleField = mask.walk().find((el) => typeof el.className === 'string' && el.className.indexOf('dsh-ad-field-title') !== -1)
  assert.ok(titleField !== undefined, '要有标题输入框')
  titleField.formData = '面板里写的标题'

  const saveBtn = mask.walk().find((el) => el.classList.contains('dsh-ad-btn-primary'))
  assert.ok(saveBtn !== undefined, '要有保存按钮')
  saveBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
  // 多放几轮:POST 的应答回来后,后面几次轮询会在新开关值下继续跑
  await env.flushTimers(8)

  assert.equal(env.posts.length, 1, '应该发出一次 POST')
  assert.equal(env.posts[0].enabled, false, '开关要带上')
  assert.equal(env.posts[0].maxPopups, 2, '上限要带上')
  assert.match(env.posts[0].adText, /面板里写的标题/, '文案要带上')

  // 保存后要有明确反馈(顶部提示条 + 按钮文案),不能让人猜
  const toast = mask.walk().find((el) => el.classList.contains('dsh-ad-toast'))
  assert.ok(toast !== undefined, '要有顶部提示条')
  assert.match(String(toast.textContent), /已保存/, '保存后提示条要显示已保存')
  assert.match(String(saveBtn.textContent), /已保存|保存/, '按钮要有反馈文案')

  // 面板保存的内容确实落到宿主侧(之后 state 轮询会把它读回来,所以这里不查内存值)
  assert.equal(env.settingsPayload.config.enabled, false, '宿主侧应记下新开关')
  assert.equal(env.settingsPayload.config.maxPopups, 2, '宿主侧应记下新上限')
  assert.match(env.settingsPayload.adText, /面板里写的标题/, '宿主侧应记下新文案')
})

test('设置面板:能新增/删除一条广告(表单化编辑)', async () => {
  const env = boot([{ thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }])
  await env.flushTimers(3)
  const manager = env.sandbox.window.__dshAdPopups
  manager.openPanel()
  await env.flushTimers(3)

  const mask = env.document.documentElement.walk().find((el) => el.classList.contains('dsh-ad-mask'))
  const rowsBefore = manager.panel.rows.length
  assert.ok(rowsBefore >= 1, '读进来的文案应该变成若干表单行')

  const addBtn = mask.walk().find((el) => el.textContent === '＋ 新增一条')
  assert.ok(addBtn !== undefined, '要有「新增一条」按钮')
  addBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.rows.length, rowsBefore + 1, '新增后应多一行')

  const delBtn = mask.walk().find((el) => el.textContent === '删除')
  assert.ok(delBtn !== undefined, '每行都要有删除按钮')
  delBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(manager.panel.rows.length, rowsBefore, '删除后应少一行')

  // 一条都没有时保存要被拦住
  while (manager.panel.rows.length > 0) {
    const btn = mask.walk().find((el) => el.textContent === '删除')
    btn.fire('click', { preventDefault() {}, stopPropagation() {} })
  }
  const saveBtn = mask.walk().find((el) => el.classList.contains('dsh-ad-btn-primary'))
  saveBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
  await env.flushTimers(3)
  assert.equal(env.posts.length, 0, '一条广告都没有时不该发 POST')
  const toast = mask.walk().find((el) => el.classList.contains('dsh-ad-toast'))
  assert.match(String(toast.textContent), /至少要有一条/, '应给出明确原因')
})

test('设置面板:✕ 关得掉,重复打开不叠加,destroy 会清干净', async () => {
  const env = boot([{ thinking: false, sessions: [], config: { enabled: true, maxPopups: 4 } }])
  await env.flushTimers(3)
  const manager = env.sandbox.window.__dshAdPopups
  const masksIn = () => env.document.documentElement.walk().filter((el) => el.classList.contains('dsh-ad-mask'))

  manager.openPanel()
  await env.flushTimers(2)
  const mask = masksIn()[0]
  assert.ok(mask !== undefined, '面板要挂上(新实现挂在 documentElement 上)')

  const closeX = mask.walk().find((el) => el.classList.contains('dsh-ad-panel-x'))
  assert.ok(closeX !== undefined, '要有 ✕')
  closeX.fire('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(masksIn().length, 0, '✕ 应该把面板移除')
  assert.equal(manager.panel, undefined)

  // 幂等:连着开两次也只应该有一个
  manager.openPanel()
  manager.openPanel()
  await env.flushTimers(2)
  assert.equal(masksIn().length, 1, '重复打开不该出现两个面板')

  // destroy 要连面板一起清掉
  manager.destroy()
  assert.equal(masksIn().length, 0, 'destroy 后不该留下设置面板')
})

test('关闭状态下徽标仍在,并给出「开启」一键恢复', async () => {
  const env = boot([{ thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: false, maxPopups: 4 } }])
  await env.flushTimers(4)

  // 关掉后:不投广告,但徽标必须在(它是重新开启的唯一入口)
  assert.equal(popupsOf(env.document).length, 0, '关闭状态不该有弹窗')
  const badge = env.document.body.walk().find((el) => el.classList.contains('dsh-ad-badge'))
  assert.ok(badge !== undefined, '关闭状态下徽标仍要存在')
  const btn = badge.walk().find((el) => el.classList.contains('dsh-ad-badge-btn'))
  assert.ok(btn !== undefined, '徽标上要有按钮')
  assert.equal(btn.textContent, '开启', '关闭状态下按钮应变成「开启」')
  assert.match(String(badge.walk().map((el) => el.textContent).join('')), /已关闭/, '徽标要显示已关闭')

  // 点「开启」应该真的写回宿主(enabled: true)
  btn.fire('click', { preventDefault() {}, stopPropagation() {} })
  await env.flushTimers(4)
  assert.equal(env.posts.length, 1, '应该发出一次 POST')
  assert.equal(env.posts[0].enabled, true, 'POST 里要把开关打开')
  assert.equal(env.settingsPayload.config.enabled, true, '宿主侧应记下已开启')

  // 开启后按钮回到「设置」
  const manager = env.sandbox.window.__dshAdPopups
  manager.enabled = true
  manager.updateBadge()
  assert.equal(btn.textContent, '设置')
})

test('宿主把总开关改成 false 后,客户端立刻收摊且不再投', async () => {
  // 用一份「可变状态」当宿主的回复:改它,之后的每一次轮询都会看到新值
  const hostState = { thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: true, maxPopups: 4 } }
  const env = boot([hostState])

  // 第一波弹窗出现
  await env.flushTimers(4)
  const manager = env.sandbox.window.__dshAdPopups
  assert.ok(manager.counters.shown >= 1, '先要投过广告')
  assert.ok(popupsOf(env.document).length >= 1, '此时屏幕上应当有弹窗')

  // 用户在设置页关掉总开关 → 之后每次轮询都是 enabled:false
  hostState.config = { enabled: false, maxPopups: 4 }
  await env.flushTimers(10)
  assert.equal(manager.enabled, false)
  const leftover = popupsOf(env.document).filter((el) => !el.classList.contains('dsh-ad-out'))
  assert.equal(leftover.length, 0, '总开关关掉后不该还有弹窗留着')

  // 关掉之后也不再新投
  const before = manager.counters.shown
  await env.flushTimers(10)
  assert.equal(manager.counters.shown, before, '关掉后不该再投新广告')
})

test('素材由宿主下发:状态里的 ads 会替换兜底文案', async () => {
  const env = boot([
    {
      thinking: true,
      sessions: [{ sessionId: 's1', elapsedMs: 0 }],
      config: { enabled: true, maxPopups: 4 },
      ads: [{ kicker: '测试角标', title: '来自设置页的标题', body: '正文', marquee: '跑马灯', action: '点我', theme: 'green' }],
    },
  ])
  await env.flushTimers(10)
  const manager = env.sandbox.window.__dshAdPopups
  assert.equal(manager.ads.length, 1, '应该用宿主下发的素材')
  assert.equal(manager.ads[0].title, '来自设置页的标题')
  const text = popupsOf(env.document).map((el) => el.walk().map((n) => n.textContent).join('')).join(' ')
  assert.match(text, /来自设置页的标题/, '画出来的应该是下发的文案')
})

test('宿主配置成 enabled:false 时一枚弹窗都不放', async () => {
  const env = boot([
    { thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: false, maxPopups: 4 } },
  ])
  await env.flushTimers(12)
  assert.equal(popupsOf(env.document).length, 0, '总开关关掉后不该有弹窗')
})

test('状态接口取不到时安静退避,不抛异常也不留弹窗', async () => {
  const env = makeSandbox([])
  env.sandbox.fetch = () => Promise.reject(new Error('连接失败'))
  vm.createContext(env.sandbox)
  vm.runInContext(CLIENT_SOURCE, env.sandbox, { filename: 'client.js' })
  await env.flushTimers(6)
  assert.equal(popupsOf(env.document).length, 0, '取不到状态就不该有弹窗')
  const manager = env.sandbox.window.__dshAdPopups
  assert.ok(manager.pollDelay > 600, '失败后应该退避,而不是继续每 600ms 打一次')
})

test('destroy() 会清干净 DOM 与 window 标记(热重载安全)', async () => {
  const env = boot([{ thinking: true, sessions: [{ sessionId: 's1', elapsedMs: 0 }], config: { enabled: true, maxPopups: 4 } }])
  await env.flushTimers(10)
  const manager = env.sandbox.window.__dshAdPopups
  manager.destroy()
  assert.equal(env.sandbox.window.__dshAdPopups, undefined, '销毁后要撤掉 window 标记')
  assert.equal(popupsOf(env.document).length, 0, '销毁后不该留下弹窗')
  assert.equal(env.document.body.walk().filter((el) => el.classList.contains('dsh-ad-badge')).length, 0, '销毁后不该留下徽标')
})
