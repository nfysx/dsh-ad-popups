/**
 * dsh-ad-popups —— 宿主半边。
 *
 * 「思考期虚拟广告弹窗」娱乐插件:模型正在回答时,主界面飘出一堆一眼假的
 * 广告弹窗,把等待时间变成笑点。
 *
 * 本插件只做三件事:
 *   1. 追踪「哪些会话正在跑」——`agent/assistant-stream`(流式,长回答唯一的高频信号)、
 *      `session/event`(回合与工具边界)、`api-session/status`(官方权威)、`agent/status`(兜底);
 *   2. 把这份状态 + 素材 + 设置通过 `/api/dsh-ad-popups/*` 暴露给浏览器半边;
 *   3. 用 webServer 把 client.js 注入 GUI 的 index.html(桌面端与浏览器版各一条通道)。
 *
 * 弹窗内容全部是虚构恶搞,不含任何真实商品/服务的宣传,也不带外链跳转。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import z from '@deepseek-ai/schemastery'
import { resolveAdCopy, defaultAdText } from './ads.js'

/** 路由前缀(浏览器半边按同一常量拼 URL)。 */
const API_PREFIX = '/api/dsh-ad-popups'

/** 日志前缀与版本(排查「到底装的是哪一版」时很有用)。 */
const LOG_TAG = 'dsh-ad-popups'
const PLUGIN_VERSION = '0.2.0'

/** 客户端脚本的对外路径(注入 <script> 与路由都用它)。 */
const CLIENT_SCRIPT_PATH = '/dsh-ad-popups/client.js'

/** 设置页的对外路径(插件自己提供的页面,不依赖客户端 bundle)。 */
const SETTINGS_PAGE_PATH = '/dsh-ad-popups/settings'

/** 设置文件:放 $DSH_HOME 下,和 dsh-meme 一样重启不丢。 */
const SETTINGS_FILE = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-ad-popups.json')

/** 会话空闲多久后从状态表里剔除(防内存泄漏)。 */
const SESSION_TTL_MS = 30 * 60 * 1000

/**
 * 「还在思考」的判定窗口:最后一次活动信号之后多久算空闲。
 *
 * 信号来自四路:`agent/assistant-stream`(流式输出,**长回答期间唯一的高频信号**)、
 * `session/event`(回合与工具边界)、`api-session/status`(官方权威)、`agent/status`(兜底)。
 *
 * 窗口取 8 秒:流式期间信号很密,但模型「想一下再吐」「跑个慢工具」这种停顿偶尔会超过
 * 几秒 —— 窗口太小会让广告在回答中途断掉(第一版 2.5 秒就踩过这个),太大又会在答完后
 * 多飘一会儿。8 秒是这两者之间的折中。客户端另有「间隔超过 15 秒才算新一轮」的判据,
 * 所以中途的短暂空闲不会重新触发一波广告。
 */
const IDLE_GRACE_MS = 8000

/** 清理超时会话的扫描间隔(状态判定本身是按请求即时算的,这里只做内存回收)。 */
const SWEEP_INTERVAL_MS = 60_000

/** 默认设置(插件 config 与设置文件都可以覆盖)。 */
const DEFAULTS = {
  enabled: true,
  maxPopups: 4,
}

/**
 * 数值夹取(供 Config 与设置解析共用;函数声明会提升,放在 Config 之后定义也没问题)。
 * @param {unknown} value - 待夹取的原始值。
 * @param {number} min - 下限。
 * @param {number} max - 上限。
 * @param {number} fallback - 不是有限数时用的默认值。
 * @returns {number} 夹取后的整数。
 */
function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 插件配置 schema。
 *
 * cordis 启动插件前会拿 `Config['~standard'].validate(raw)` 校验并归一化配置
 * (Standard Schema 接口)。这里必须真的是一份 schema 对象:
 * 随便写个普通对象的话,cordis 读 `Config['~standard']` 拿到 undefined,
 * 直接报 "Cannot read properties of undefined (reading 'validate')",
 * 整条插件行都不会激活(这个坑已经踩过一次,见 README「踩坑记录」)。
 *
 * 用 DSH 自带的 `@deepseek-ai/schemastery`(dsh-pet 等同款),不额外引第三方校验库。
 */
export const Config = z.object({
  /** 总开关:关掉后不再投放广告(脚本仍注入,徽标留在原地供重新开启)。 */
  enabled: z.boolean().default(DEFAULTS.enabled),
  /** 同时在屏的弹窗上限(1-8)。 */
  maxPopups: z.number().min(1).max(8).step(1).default(DEFAULTS.maxPopups),
})

export const inject = ['webServer']

/** 读设置文件(坏了就当空对象,绝不因为设置文件起不来)。 */
function readSettingsFile() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    return raw !== null && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/** 写设置文件(best-effort,失败只记日志)。 */
function writeSettingsFile(patch) {
  try {
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true })
    writeFileSync(SETTINGS_FILE, JSON.stringify({ ...readSettingsFile(), ...patch }, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('[' + LOG_TAG + '] 设置写入失败:', error instanceof Error ? error.message : String(error))
    return false
  }
}

/** 解析生效设置:设置文件 > 插件 config > 默认。 */
function resolveSettings(config) {
  const file = readSettingsFile()
  const pick = (key, fallback) => (file[key] !== undefined ? file[key] : config && config[key] !== undefined ? config[key] : fallback)
  const adText = typeof file.adText === 'string' ? file.adText : defaultAdText()
  return {
    enabled: pick('enabled', DEFAULTS.enabled) !== false,
    maxPopups: clampInt(pick('maxPopups', DEFAULTS.maxPopups), 1, 8, DEFAULTS.maxPopups),
    /** 设置页里的原始文案文本(保存的是文本,不是解析结果 —— 用户改了备注也能存住)。 */
    adText,
    /** 实际下发给浏览器半边的素材(解析失败的行走默认文案)。 */
    ads: resolveAdCopy(adText).ads,
  }
}

/** 自定位包目录:符号链接安装时 import.meta.url 可能指向别处,所以多试几个候选。 */
function packageRoots() {
  const roots = []
  try {
    roots.push(dirname(fileURLToPath(import.meta.url)))
  } catch {
    // 忽略:某些运行时没有 import.meta.url
  }
  roots.push(dirname(fileURLToPath(new URL('./client.js', import.meta.url))))
  if (typeof __dirname === 'string') roots.push(__dirname)
  return [...new Set(roots)]
}

/** 从包目录读一个文件(依次试几个候选根目录)。 */
function readPackageFile(name) {
  const tried = []
  for (const root of packageRoots()) {
    const file = join(root, name)
    tried.push(file)
    try {
      return readFileSync(file, 'utf8')
    } catch {
      // 试下一个候选
    }
  }
  throw new Error(name + ' 未找到,已尝试: ' + tried.join(' | '))
}

/** 读客户端脚本(每次请求都读:开发期改完刷新页面即生效)。 */
function loadClientScript() {
  return readPackageFile('client.js')
}

/** 读设置页 HTML(同样每次请求即读,方便改完刷新)。 */
function loadSettingsPage() {
  return readPackageFile('settings.html')
}

/**
 * 读取并解析 JSON 请求体(带大小上限)。
 *
 * 超限时**不能** `req.destroy()`:那会先把 socket 拆掉,后面想回一条 400/413 就再也发不出去了
 * (客户端只会看到 fetch failed)。正确做法是丢掉超出的内容、继续把 body 读完,
 * 然后正常回一个错误状态码(由调用方按 `excess` 标记决定是 413 还是 400)。
 * @param {import('node:http').IncomingMessage} req - 请求对象。
 * @param {number} limitBytes - 请求体字节上限。
 * @returns {Promise<unknown>} 解析后的 JSON。
 * @throws {Error} 请求体超限(带 excess: true)或 JSON 非法。
 */
function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let oversize = false

    const cleanup = () => {
      req.off?.('data', onData)
      req.off?.('end', onEnd)
      req.off?.('error', onError)
    }
    const onData = (chunk) => {
      if (oversize) return
      size += chunk.length
      if (size > limitBytes) {
        oversize = true
        // 丢掉已经攒下的部分,但**继续把请求体读完**:只有让客户端把 body 发完,
        // 那条 400 响应才写得出去(直接 destroy 会让客户端只看到 fetch failed)。
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => {
      cleanup()
      if (oversize) {
        const error = new Error('请求体过大(上限 ' + String(limitBytes) + ' 字节)')
        error.excess = true
        reject(error)
        return
      }
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }

    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
}

/**
 * 判断一个请求是否来自本机回环(防止 host 绑到 0.0.0.0 时同网设备改设置)。
 * Host 必须是回环地址;带 Origin 时必须与 Host 同源。
 * @param {import('node:http').IncomingMessage} req - 请求对象。
 * @returns {boolean} 是否放行。
 */
function isLoopbackRequest(req) {
  const header = req.headers?.host
  if (typeof header !== 'string' || header === '') return false
  let host = header
  // 去掉端口;IPv6 字面量形如 [::1]:19387
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    if (end === -1) return false
    host = host.slice(1, end)
  } else {
    const colon = host.indexOf(':')
    if (colon !== -1) host = host.slice(0, colon)
  }
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1'
  if (!loopback) return false
  const origin = req.headers?.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    try {
      const parsed = new URL(origin)
      if (parsed.host !== header) return false
    } catch {
      return false
    }
  }
  return true
}

/** 统一的 JSON 响应。 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * 注册「思考中」状态追踪 + HTTP API + index 注入。
 * @param {object} ctx - 插件上下文。
 * @param {object} config - 插件配置。
 */
export function apply(ctx, config) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    console.error('[' + LOG_TAG + '] 没有 webServer 服务,插件不生效')
    return
  }

  /** 设置:文件改动即热读,所以每次请求都重新解析。 */
  const settings = () => resolveSettings(config)

  /**
   * sessionId -> { startedAt, lastActivityAt, source }
   *
   * 条目留在表里(不因为一轮结束就删):「是否还在思考」完全由 `lastActivityAt` 与
   * 空闲窗口决定,这样短时间内连续多轮不会让浏览器半边误以为换了会话,
   * 也免得每轮都重建条目。
   */
  const sessions = new Map()

  /** 某个条目此刻算不算「在思考」。 */
  const isThinking = (entry, now) => now - entry.lastActivityAt <= IDLE_GRACE_MS

  const markRunning = (sessionId, source) => {
    if (typeof sessionId !== 'string' || sessionId === '') return
    const now = Date.now()
    const existing = sessions.get(sessionId)
    if (existing === undefined) {
      sessions.set(sessionId, { startedAt: now, lastActivityAt: now, source })
      return
    }
    // 空闲很久之后又来了信号 = 新的一轮,重新开始计时;否则只刷新活动时间。
    if (now - existing.lastActivityAt > IDLE_GRACE_MS * 4) existing.startedAt = now
    existing.lastActivityAt = now
    existing.source = source
  }

  /**
   * 标记「这一轮结束了」。不删条目:紧接着的下一轮 turn/start 会重新刷新它,
   * 中间的空档由 {@link IDLE_GRACE_MS} 兜住(turn/end 之后先让它立刻算空闲)。
   */
  const markIdle = (sessionId) => {
    if (typeof sessionId !== 'string') return
    const entry = sessions.get(sessionId)
    if (entry === undefined) return
    entry.lastActivityAt = Math.min(entry.lastActivityAt, Date.now() - IDLE_GRACE_MS - 1)
  }

  /** 只刷新活动时间(中间事件:工具调用、步骤开始等)。 */
  const touch = (sessionId) => {
    const entry = sessions.get(sessionId)
    if (entry !== undefined) entry.lastActivityAt = Date.now()
  }

  /** 取会话 id(不同事件给的对象形状略有差别,统一兜一下)。 */
  const sessionIdOf = (session) => {
    if (typeof session === 'string') return session
    if (session !== null && typeof session === 'object' && typeof session.id === 'string') return session.id
    return undefined
  }

  // ---- 状态来源 1:官方「会话是否在跑」的状态事件(最权威) ----
  ctx.effect(() => ctx.on('api-session/status', (sessionId, isRunning) => {
    if (isRunning === true) markRunning(String(sessionId), 'status')
    else markIdle(String(sessionId))
  }), 'dsh-ad-popups: api-session/status')

  // ---- 状态来源 2:持久事件流(补 tool/call 之类的中间活动,长任务不会因为
  //      状态事件偶尔缺席而被误判为空闲) ----
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const sessionId = sessionIdOf(session)
    if (sessionId === undefined) return
    const type = event !== null && typeof event === 'object' ? event.type : undefined
    if (type === 'turn/start') {
      markRunning(sessionId, 'turn')
      return
    }
    if (type === 'turn/end') {
      // 先撤下「正在跑」标记;若宿主随后还发下一轮事件,会被重新标记上。
      markIdle(sessionId)
      return
    }
    touch(sessionId)
  }), 'dsh-ad-popups: session/event')

  // ---- 状态来源 3:流式回答(长回答期间唯一的「我还活着」信号) ----
  //
  // 这一条是必须的,不是锦上添花:`turn/start` 与 `turn/end` 之间,一次长时间的
  // 模型作答可能几分钟都没有新的持久事件 —— 没有这个订阅,空闲判定会把「正在
  // 一个字一个字往外蹦」误判成「早答完了」,广告会在回答中途突然停掉(实测踩过)。
  // 注意只 touch 不 markRunning:这条流属于**已经在跑**的会话,不该凭它凭空造状态。
  ctx.effect(() => ctx.on('agent/assistant-stream', (payload) => {
    const agent = payload !== null && typeof payload === 'object' ? payload.agent : undefined
    const sessionId = sessionIdOf(agent !== undefined && agent !== null && typeof agent === 'object' ? agent.session : undefined)
    if (sessionId === undefined) return
    touch(sessionId)
  }), 'dsh-ad-popups: agent/assistant-stream')

  // ---- 状态来源 4:agent 的 idle ⇄ running(轻量,做兜底) ----
  ctx.effect(() => ctx.on('agent/status', (payload) => {
    const status = payload !== null && typeof payload === 'object' ? payload.status : undefined
    const sessionId = sessionIdOf(payload !== null && typeof payload === 'object' && payload.agent !== undefined
      ? payload.agent.session
      : undefined)
    if (sessionId === undefined) return
    if (status === 'running') markRunning(sessionId, 'agent')
    else if (status === 'idle') markIdle(sessionId)
  }), 'dsh-ad-popups: agent/status')

  // 会话销毁 / 出错都没有「还在跑」的意义了
  ctx.effect(() => ctx.on('session/disposed', (session) => {
    markIdle(sessionIdOf(session))
  }), 'dsh-ad-popups: session/disposed')

  // ---- 定期剔除长时间没动静的会话(防内存泄漏;判定见 SESSION_TTL_MS) ----
  ctx.effect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [sessionId, entry] of sessions) {
        if (now - entry.lastActivityAt > SESSION_TTL_MS) sessions.delete(sessionId)
      }
    }, SWEEP_INTERVAL_MS)
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearInterval(timer)
  }, 'dsh-ad-popups: session sweep')

  /** 组装一份状态快照给浏览器半边(含素材,文案改完刷新即生效,不用重启)。 */
  const snapshot = () => {
    const now = Date.now()
    const live = []
    for (const [sessionId, entry] of sessions) {
      if (!isThinking(entry, now)) continue
      live.push({
        sessionId,
        /** 本轮已经跑了多久(浏览器半边据此决定广告密度)。 */
        elapsedMs: Math.max(0, now - entry.startedAt),
        source: entry.source,
      })
    }
    const current = settings()
    return {
      ok: true,
      version: 1,
      now,
      thinking: live.length > 0,
      sessions: live,
      config: { enabled: current.enabled, maxPopups: current.maxPopups },
      ads: current.ads,
    }
  }

  // ---- 路由 1:状态查询(浏览器半边轮询) ----
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/state',
    handler(req, res) {
      try {
        sendJson(res, 200, snapshot())
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String(error && error.message ? error.message : error) })
      }
    },
  }), 'dsh-ad-popups: 状态路由')

  // ---- 路由 2:设置读写 ----
  // webServer 自身不带认证或来源策略(它只管路由),所以写设置这一层自己把门:
  // 只接受来自本机回环的请求,带 Origin 时必须与 Host 同源。
  // 这样即使 host 被配成 0.0.0.0,同网设备 / 恶意页面也无法改本地设置。
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/settings',
    handler(req, res) {
      void (async () => {
        try {
          if (!isLoopbackRequest(req)) {
            sendJson(res, 403, { ok: false, error: '仅允许本机访问' })
            return
          }
          if (req.method === 'GET') {
            const current = settings()
            sendJson(res, 200, {
              ok: true,
              config: { enabled: current.enabled, maxPopups: current.maxPopups },
              adText: current.adText,
              defaultAdText: defaultAdText(),
            })
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          const body = await readJsonBody(req, 512 * 1024)
          const patch = {}
          if (body !== null && typeof body === 'object') {
            if (body.enabled !== undefined) patch.enabled = body.enabled !== false
            if (body.maxPopups !== undefined) patch.maxPopups = clampInt(body.maxPopups, 1, 8, DEFAULTS.maxPopups)
            if (typeof body.adText === 'string') {
              // 只校验「能解析出至少一条」,不替用户改写文本 —— 备注和排版都留给他
              const parsed = resolveAdCopy(body.adText)
              if (parsed.usedFallback && body.adText.trim() !== '') {
                sendJson(res, 400, {
                  ok: false,
                  error: '文案里没有一条能解析出标题,请检查格式:角标 | 标题 | 正文 | 跑马灯 | 按钮 | 配色',
                })
                return
              }
              patch.adText = body.adText
            }
            if (body.resetAdText === true) patch.adText = defaultAdText()
          }
          const ok = writeSettingsFile(patch)
          const current = settings()
          sendJson(res, ok ? 200 : 500, {
            ok,
            config: { enabled: current.enabled, maxPopups: current.maxPopups },
            adText: current.adText,
            /** 当前实际生效的素材条数(设置页显示用)。 */
            adCount: current.ads.length,
          })
        } catch (error) {
          // 请求体超限 / JSON 非法都走这里;此时响应还发得出去(读体阶段没有 destroy socket)
          const excess = error !== null && typeof error === 'object' && error.excess === true
          sendJson(res, excess ? 413 : 400, {
            ok: false,
            error: String(error && error.message ? error.message : error),
          })
        }
      })()
    },
  }), 'dsh-ad-popups: 设置路由')

  // ---- 路由 3:设置页(插件自带的静态页面,不依赖客户端 bundle) ----
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: SETTINGS_PAGE_PATH,
    handler(req, res) {
      try {
        const html = loadSettingsPage()
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(html),
        })
        res.end(html)
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(String(error && error.message ? error.message : error))
      }
    },
  }), 'dsh-ad-popups: 设置页路由')

  // ---- 路由 4:客户端脚本本体 ----
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: CLIENT_SCRIPT_PATH,
    handler(req, res) {
      try {
        const code = loadClientScript()
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(code),
        })
        res.end(code)
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(String(error && error.message ? error.message : error))
      }
    },
  }), 'dsh-ad-popups: 客户端脚本路由')

  // ---- index 注入 ----
  //
  // 这里要同时覆盖两种界面,它们的取 index 方式完全不同:
  //
  //   1. 浏览器版(dsh web):index.html 由宿主渲染,`tapIndex` 生效;
  //   2. **桌面端(Electron)**:index.html 是安装包里的静态 dist,经 `dsh-app://`
  //      直接读盘,**永远不经过 `renderIndex()`**,所以 `tapIndex` 在桌面端毫无作用
  //      (第一版就是这么写的,结果桌面端一个弹窗都没有)。
  //
  // 桌面端唯一的注入通道是 `webserver/index-inject` 的结构化行:宿主启动时
  // `collectIndexInjections()` 收集一次,经 IPC 交给渲染层逐行应用。
  // 行必须用内联 script 形式(`script-src` 行在页面侧是 `await loadScript`,
  // 加载失败会 reject 整个 boot —— dsh-whale-widget 踩过这个坑),所以这里
  // 用一个内联脚本来建 <script src>,并自己吞掉 onerror。
  //
  // 两条通道都挂上,并用「页面里已经出现过这个 src」判重,避免浏览器版被注入两次。
  const injectionTag = '<script defer src="' + CLIENT_SCRIPT_PATH + '"></script>'
  const injectionRowText = 'var s=document.createElement("script");s.src="' + CLIENT_SCRIPT_PATH
    + '";s.defer=true;s.onerror=function(){};document.head.appendChild(s);'

  /**
   * 把内联行推给宿主的注入表(桌面端靠它;浏览器版这行也会渲染,但下面的 tapIndex 会判重)。
   *
   * 注意:**不因总开关而跳过注入**。客户端脚本始终要进页面 —— 它负责画那个右下角徽标,
   * 而「已关闭」状态下徽标上就是唯一的重新开启入口。早期版本在关闭时连脚本都不注入,
   * 结果用户关掉之后就再也找不到设置入口了(自锁,已修)。
   */
  ctx.effect(() => ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return
    for (const row of table) {
      if (row !== null && typeof row === 'object' && typeof row.text === 'string' && row.text.includes(CLIENT_SCRIPT_PATH)) return
    }
    table.push({ kind: 'script', placement: 'head', text: injectionRowText })
  }), 'dsh-ad-popups: index 注入(结构化行,桌面端通道)')

  /** 浏览器版通道:直接改写宿主渲染出来的 index.html。 */
  ctx.effect(() => webServer.tapIndex((html) => {
    if (html.indexOf(CLIENT_SCRIPT_PATH) !== -1) return html
    if (html.indexOf('</head>') !== -1) return html.replace('</head>', injectionTag + '</head>')
    if (html.indexOf('</body>') !== -1) return html.replace('</body>', injectionTag + '</body>')
    return html + injectionTag
  }), 'dsh-ad-popups: index 注入(tapIndex,浏览器版通道)')

  console.log('[' + LOG_TAG + '] v' + PLUGIN_VERSION + ' 已就绪:设置页 ' + SETTINGS_PAGE_PATH
    + ',状态 API ' + API_PREFIX + '/state,客户端脚本 ' + CLIENT_SCRIPT_PATH)
}
