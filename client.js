/*
 * dsh-ad-popups —— 浏览器半边(构建产物)**请勿直接编辑**
 *
 * 由 `node src/client/build.mjs` 从 src/client/*.js 生成,拼接顺序见该脚本的 MODULES。
 * 源文件里写清了每条设计取舍;注入契约(client bundle 不可用)也写在那里的文件头。
 *
 * 源文件 sha256(前 12 位):
 *   c8c069dd02b2  src/client/format.js
 *   2d5094c10de4  src/client/00-header.js
 *   e1584f7b97d4  src/client/10-util.js
 *   5e4ea5846df0  src/client/20-popup.js
 *   2a45485dc0fc  src/client/30-manager.js
 *   96a05c297fea  src/client/40-panel.js
 *   f1fb0eefb9ae  src/client/41-panel-rest.js
 *   4f257d401839  src/client/50-manager-rest.js
 *   1c791b6a1804  src/client/60-styles.js
 *   f4986073b57d  src/client/70-boot.js
 */
/**
 * dsh-ad-popups 浏览器半边 —— **文案格式与人机共用的纯函数**。
 *
 * 这个模块是 `ads.js`(宿主那侧直接 import 的 ESM 模块)的**同源副本**:
 * 两边必须保持一致,构建脚本会用行为比对来强制这一点 —— 同一批文案喂给
 * `ads.js` 的 parseAdText 与内联进 client.js 的这一份,输出必须完全相同。
 *
 * 为什么要有副本:浏览器半边是注入进宿主页面的**普通脚本**,不能用 import,
 * 所以它的源码在构建时被内联进 client.js(见 build.mjs)。
 *
 * 内容分两类:
 *   · 文案格式:字段顺序、配色名、条数上限、文本 ⇄ 字段的解析与拼行;
 *   · 表单控件读写:同一个工具在面板与自测里共用。
 *     (DOM 桩为了让「初始值」与「用户填了什么」分开会额外走 `control.formData`,
 *      真实浏览器里 formData 永远是 undefined,行为不受影响。)
 */

/** 一次最多编辑/解析这么多条广告(与宿主侧 ads.js 的 MAX_ADS 必须相等,构建脚本会校验)。 */
var MAX_AD_ROWS = 60

/** 单条字段与标题的长度上限(与 ads.js 的同名常量必须一致)。 */
var MAX_FIELD_CHARS = 240
var MAX_TITLE_CHARS = 80

/** 每行广告的字段顺序(表单化编辑与拼行都用它)。 */
var AD_FIELD_KEYS = ['kicker', 'title', 'body', 'marquee', 'action', 'theme']

/** 配色下拉的选项(与 ads.js 的 THEME_NAMES 对齐)。 */
var THEME_OPTIONS = ['hot', 'warn', 'blue', 'gold', 'tech', 'pink', 'purple', 'green']

/**
 * 把字段裁到合理长度(按字符数)。
 * @param {unknown} value - 原始值。
 * @param {number} limit - 上限。
 * @returns {string} 裁好的字符串。
 */
function clipField(value, limit) {
  var text = String(value === undefined || value === null ? '' : value).trim()
  return text.length <= limit ? text : text.slice(0, limit)
}

/**
 * 读一个表单控件的当前值。
 *
 * 真实 DOM 里 `input.value` / `input.checked` 就是答案;自测的 DOM 桩为了让
 * 「初始值」和「用户填了什么」分开,额外走 `formData`。两种形状都认。
 * @param {object} control - 表单控件。
 * @param {*} fallback - 两者都没有时的默认值。
 * @returns {*} 控件的当前值。
 */
function readControl(control, fallback) {
  if (control === undefined || control === null) return fallback
  if (control.formData !== undefined) return control.formData
  if (control.value !== undefined && control.value !== '') return control.value
  if (typeof control.checked === 'boolean') return control.checked
  return fallback
}

/**
 * 把一个值写进表单控件(同时维护 value/checked 与 formData)。
 * @param {object} control - 表单控件。
 * @param {*} value - 要写入的值。
 */
function writeControl(control, value) {
  if (control === undefined || control === null) return
  control.formData = value
  if (typeof value === 'boolean') control.checked = value
  else control.value = String(value)
}

/**
 * 解析「角标 | 标题 | 正文 | 跑马灯 | 按钮文字 | 配色」形式的文案文本。
 *
 * 与宿主侧 `ads.js` 的 `parseAdText` 是同一套格式(构建脚本会比对两者的行为):
 * 未知配色回退到 `hot`、正文可写 `-` 表示留空、全角竖线 `｜` 也当分隔符。
 * @param {string} text - 多行文案。
 * @returns {Array<object>} 解析出的广告字段数组(只有标题必填)。
 */
function parseAdText(text) {
  var out = []
  var lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/)
  for (var i = 0; i < lines.length && out.length < MAX_AD_ROWS; i++) {
    var raw = lines[i].trim()
    if (raw === '' || raw.charAt(0) === '#') continue
    var parts = raw.split(/[|｜]/)
    for (var j = 0; j < parts.length; j++) parts[j] = parts[j].trim()
    var title = clipField(parts[1], MAX_TITLE_CHARS) || clipField(parts[0], MAX_TITLE_CHARS)
    if (title === '') continue
    var pickPart = function (at) {
      var value = parts[at]
      return value === undefined || value === '-' ? '' : clipField(value, MAX_FIELD_CHARS)
    }
    var themeRaw = clipField(parts[5], 16).toLowerCase()
    out.push({
      kicker: parts.length > 1 ? pickPart(0) : '免责声明',
      title: title,
      body: pickPart(2),
      marquee: pickPart(3) || title,
      action: pickPart(4) || '立即领取',
      theme: THEME_OPTIONS.indexOf(themeRaw) !== -1 ? themeRaw : 'hot',
    })
  }
  return out
}

/**
 * 把一条广告的字段拼回文案文本里的一行(设置里存的就是这个格式)。
 * @param {object} ad - 一条广告的字段。
 * @returns {string} `角标 | 标题 | …` 形式的一行。
 */
function stringifyAdLine(ad) {
  var out = []
  for (var i = 0; i < AD_FIELD_KEYS.length; i++) {
    var value = ad !== null && ad !== undefined ? ad[AD_FIELD_KEYS[i]] : undefined
    out.push(value === undefined || value === null ? '' : String(value))
  }
  return out.join(' | ')
}

/**
 * dsh-ad-popups —— 浏览器半边(由宿主半边注入 index.html)。
 *
 * 模型思考期间,在主界面飘出一堆「一眼假」的广告弹窗,把等待时间变成笑点。
 *
 * 四条铁律(和宿主半边一致):
 *   1. 全部内容纯属虚构恶搞,不是任何真实商品/服务的宣传,不含任何外链跳转;
 *   2. 除了向宿主本机的状态接口轮询「是否在思考 / 当前文案」,不外发任何数据;
 *   3. 素材由宿主下发(在设置页里编辑)—— 改文案不需要碰这个文件;
 *   4. 总开关只在设置页:弹窗里不放任何开关,右下角徽标只显示状态 + 进设置页。
 *
 * 实现上刻意做成一个自包含的原生脚本(不依赖 React / ModuleLoader / 构建链),
 * 因为插件市场里的第三方脚本没有稳定的打包契约,原生 DOM 最稳。
 */
(function () {
  'use strict'

  // ---- 幂等:热重载或重复注入时只保留一个实例 ----
  if (window.__dshAdPopups) {
    try {
      window.__dshAdPopups.destroy()
    } catch (error) {
      /* 旧实例清理失败不影响新实例 */
    }
  }

  // ======================================================================
  // 1. 常量
  // ======================================================================

  /** 状态接口:状态 + 当前素材 + 配置都由它一起下发。 */
  var API_STATE = '/api/dsh-ad-popups/state'

  /** 设置接口:读/写总开关与文案(设置面板用)。 */
  var API_SETTINGS = '/api/dsh-ad-popups/settings'

  /** 状态轮询间隔(只影响「什么时候开始飘广告」的时延)。 */
  var POLL_MS = 600

  /** 轮询失败后的退避上限。 */
  var POLL_MAX_MS = 8000

  /** 一轮思考开始的瞬间投放几个弹窗。 */
  var BURST_MIN = 2
  var BURST_MAX = 4

  /** 思考超过这么久还没结束,就再补一个小的广告潮。 */
  var FOLLOWUP_AFTER_MS = 12_000

  /**
   * 「这一点算新的一轮」的最小间隔:模型中途停顿(想一下再吐、跑个慢工具)会让宿主
   * 短暂报空闲,若一恢复就重新投放,用户会看到广告反复刷新。间隔小于这个值就当成
   * 同一轮继续,不重新投放。
   */
  var NEW_TURN_GAP_MS = 15_000

  /** 同一个页面最多同时存在几个弹窗(宿主配置可以下调)。 */
  var HARD_MAX_POPUPS = 8

  /** 上限的默认值(宿主没给、或读到的值不可用时用它)。 */
  var DEFAULT_MAX_POPUPS = 4

  /** 3 次 Esc 的判定窗口。 */
  var ESC_WINDOW_MS = 600

  /** 关闭按钮的文案轮播:一眼假的「关不掉」喜剧效果。 */
  var CLOSE_LABELS = ['关闭', '真的关闭', '确定关闭', '最后一次', '再见']

  /** 关不掉的理由(点一次换一句,全是废话文学)。 */
  var STALL_LINES = [
    '正在关闭…',
    '广告主不同意',
    '再考虑一下?',
    '加载关闭程序…',
    '关闭需要先看完',
    '即将关闭(还剩 0 秒)',
  ]

  /**
   * 宿主没下发素材时的兜底(正常情况下宿主总会给一份)。
   * 真文案在设置页里改;这里只是「连不上宿主」时的最后一层,内容同样是纯恶搞。
   */
  var FALLBACK_ADS = [
    {
      kicker: '限时福利',
      title: '恭喜!您是第 114514 位访客',
      body: '本页自称有 114514 位访客,而此刻在读这句话的只有您一个 —— 所以这个奖还是您的。',
      marquee: '第 114514 位访客 · 还是第 114514 位',
      action: '立即领取',
      theme: 'hot',
    },
  ]

  /** 主题配色(全部用亮色卡通底,一眼就是广告皮)。 */
  var THEMES = {
    hot: { from: '#ff5f6d', to: '#ffc371', ink: '#3a1005', accent: '#ffe066' },
    warn: { from: '#fff200', to: '#ffb300', ink: '#4a2c00', accent: '#ffffff' },
    blue: { from: '#4facfe', to: '#00f2fe', ink: '#062a45', accent: '#ffffff' },
    gold: { from: '#f7971e', to: '#ffd200', ink: '#43290a', accent: '#ffffff' },
    tech: { from: '#00c6ff', to: '#0072ff', ink: '#ffffff', accent: '#e6fffb' },
    pink: { from: '#ff9a9e', to: '#fecfef', ink: '#4a1030', accent: '#ffffff' },
    purple: { from: '#a18cd1', to: '#fbc2eb', ink: '#2c0a45', accent: '#ffffff' },
    green: { from: '#43e97b', to: '#38f9d7', ink: '#04351f', accent: '#ffffff' },
  }

  // ======================================================================
  // 2. 小工具
  // ======================================================================

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)]
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  /** 两个矩形是否相交(留一点间距,广告之间不贴脸)。 */
  function overlaps(a, b, gap) {
    var g = gap === undefined ? 10 : gap
    return !(a.x + a.w + g <= b.x || b.x + b.w + g <= a.x || a.y + a.h + g <= b.y || b.y + b.h + g <= a.y)
  }

  // 文案格式与表单控件读写(readControl / writeControl / parseAdText / stringifyAdLine /
  // MAX_AD_ROWS / AD_FIELD_KEYS / THEME_OPTIONS)都在 src/client/format.js 里,
  // 构建时会被内联到本文件之前 —— 这样浏览器半边保持自包含,宿主那侧又能直接 import。

  // ======================================================================
  // 3. 弹窗
  // ======================================================================

  /**
   * 一个虚拟广告弹窗。
   * @param {object} manager - 管理器(负责登记 / 注销 / 计数)。
   * @param {object} ad - 素材(宿主下发,或本地兜底)。
   */
  function Popup(manager, ad) {
    this.manager = manager
    this.ad = ad
    this.theme = THEMES[ad.theme] || THEMES.hot
    /** 还要「挣扎」几次才真的关得掉(1-3 次)。 */
    this.stallsLeft = randInt(1, 3)
    /** 关闭按钮已经躲了几次。 */
    this.dodges = 0
    this.closed = false
    this.rect = { x: 0, y: 0, w: 0, h: 0 }
    this.timers = []
    this.build()
  }

  /** 建立 DOM 并按避让规则落位。 */
  Popup.prototype.build = function build() {
    var self = this
    var ad = this.ad
    var theme = this.theme

    var el = document.createElement('div')
    el.className = 'dsh-ad-popup dsh-ad-in'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-label', '虚拟广告弹窗')
    el.style.setProperty('--ad-from', theme.from)
    el.style.setProperty('--ad-to', theme.to)
    el.style.setProperty('--ad-ink', theme.ink)
    el.style.setProperty('--ad-accent', theme.accent)

    // 顶部标题条(假窗口 chrome)
    var bar = document.createElement('div')
    bar.className = 'dsh-ad-bar'
    var dot = document.createElement('span')
    dot.className = 'dsh-ad-dot'
    var barText = document.createElement('span')
    barText.className = 'dsh-ad-bartext'
    barText.textContent = '大肥鱼广告有限公司 · 弹窗 ' + String(this.manager.seq + 1)
    bar.appendChild(dot)
    bar.appendChild(barText)
    el.appendChild(bar)

    // 主体
    var body = document.createElement('div')
    body.className = 'dsh-ad-body'

    if (ad.kicker !== undefined && ad.kicker !== '') {
      var kicker = document.createElement('div')
      kicker.className = 'dsh-ad-kicker'
      kicker.textContent = ad.kicker
      body.appendChild(kicker)
    }

    var title = document.createElement('div')
    title.className = 'dsh-ad-title'
    title.textContent = ad.title
    body.appendChild(title)

    if (ad.body !== undefined && ad.body !== '') {
      var text = document.createElement('div')
      text.className = 'dsh-ad-text'
      text.textContent = ad.body
      body.appendChild(text)
    }

    var marqueeText = ad.marquee !== undefined && ad.marquee !== '' ? ad.marquee : ad.title
    var marquee = document.createElement('div')
    marquee.className = 'dsh-ad-marquee'
    var marqueeInner = document.createElement('span')
    marqueeInner.className = 'dsh-ad-marquee-inner'
    marqueeInner.textContent = marqueeText + '　★　' + marqueeText + '　★　'
    marquee.appendChild(marqueeInner)
    body.appendChild(marquee)

    // 「立即领取」:点了只会抖一下 + 换一句废话,绝不做任何事
    var actionRow = document.createElement('div')
    actionRow.className = 'dsh-ad-actions'
    var action = document.createElement('button')
    action.type = 'button'
    action.className = 'dsh-ad-cta'
    action.textContent = ad.action !== undefined && ad.action !== '' ? ad.action : '立即领取'
    action.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.manager.onCtaClick(self, action)
    })
    actionRow.appendChild(action)
    body.appendChild(actionRow)

    // 底部:虚构声明 + 关闭键(刻意不再放任何「别放了 / 静音」开关,总开关在设置页)
    var foot = document.createElement('div')
    foot.className = 'dsh-ad-foot'

    var disclaimer = document.createElement('span')
    disclaimer.className = 'dsh-ad-disclaimer'
    disclaimer.textContent = '本广告纯属虚构 · 请勿相信'
    foot.appendChild(disclaimer)

    var closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'dsh-ad-close'
    closeBtn.textContent = '关闭'
    closeBtn.title = '点一下就关掉了(大概)'
    closeBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.requestClose()
    })
    // 鼠标靠近时躲开(每次最多躲 3 次,躲多了也不好玩)
    closeBtn.addEventListener('mousemove', function () {
      if (self.dodges >= 3) return
      if (Math.random() > 0.55) return
      self.dodge(closeBtn)
    })
    foot.appendChild(closeBtn)
    body.appendChild(foot)

    el.appendChild(body)
    this.el = el
    this.closeBtn = closeBtn

    document.body.appendChild(el)
    this.place()
  }

  /** 选一个尽量不压住输入框、也尽量不压住别人的位置。 */
  Popup.prototype.place = function place() {
    var el = this.el
    var w = el.offsetWidth || 268
    var h = el.offsetHeight || 190
    var vw = window.innerWidth
    var vh = window.innerHeight

    // 让出底部中间的输入区(那是用户此刻最需要的位置)
    var composer = { x: vw * 0.18, y: vh - 190, w: vw * 0.64, h: 190 }
    var margin = 10
    var best = null

    for (var attempt = 0; attempt < 40; attempt++) {
      var x = randInt(margin, Math.max(margin, vw - w - margin))
      var y = randInt(margin, Math.max(margin, vh - h - margin))
      var candidate = { x: x, y: y, w: w, h: h }
      if (overlaps(candidate, composer, 8)) continue
      var collides = false
      for (var i = 0; i < this.manager.popups.length; i++) {
        if (overlaps(candidate, this.manager.popups[i].rect, 12)) {
          collides = true
          break
        }
      }
      if (collides) continue
      best = candidate
      break
    }

    if (best === null) {
      // 实在挤不下:错位叠在右下角,像真的弹窗那样
      var stack = this.manager.popups.length % 6
      best = {
        x: clamp(vw - w - margin - stack * 22, margin, Math.max(margin, vw - w - margin)),
        y: clamp(vh - h - margin - stack * 22, margin, Math.max(margin, vh - h - margin)),
        w: w,
        h: h,
      }
    }

    this.rect = best
    el.style.left = best.x + 'px'
    el.style.top = best.y + 'px'
    el.style.zIndex = String(9000 + this.manager.seq)
  }

  /** 关闭按钮躲一下鼠标。 */
  Popup.prototype.dodge = function dodge(button) {
    this.dodges += 1
    var dx = randInt(-1, 1) * randInt(24, 54)
    var dy = randInt(-1, 1) * randInt(14, 34)
    button.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'
    this.setTimer(function () {
      button.style.transform = ''
    }, 900)
  }

  /** 点「关闭」:先挣扎几下,挣扎完了才真的关。 */
  Popup.prototype.requestClose = function requestClose() {
    if (this.closed) return
    var self = this
    var btn = this.closeBtn
    var el = this.el

    if (this.stallsLeft > 0) {
      this.stallsLeft -= 1
      btn.textContent = pick(STALL_LINES)
      btn.classList.add('dsh-ad-shake')
      el.classList.add('dsh-ad-nudge')
      this.setTimer(function () {
        btn.classList.remove('dsh-ad-shake')
        btn.textContent = CLOSE_LABELS[clamp(CLOSE_LABELS.length - 1 - self.stallsLeft, 0, CLOSE_LABELS.length - 1)]
      }, 1000)
      this.setTimer(function () {
        el.classList.remove('dsh-ad-nudge')
      }, 420)
      this.manager.onStall()
      return
    }

    // 没有挣扎额度了:按钮先变成「再见」,再真的移除
    btn.textContent = '再见'
    this.setTimer(function () {
      self.close('用户关闭')
    }, 120)
  }

  /** 真的移除。 */
  Popup.prototype.close = function close(reason) {
    if (this.closed) return
    this.closed = true
    for (var i = 0; i < this.timers.length; i++) window.clearTimeout(this.timers[i])
    this.timers = []
    var el = this.el
    el.classList.add('dsh-ad-out')
    var self = this
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el)
      self.manager.forget(self, reason)
    }, 170)
  }

  /**
   * 登记一个随弹窗一起清理的定时器。
   * 已经关掉的弹窗不再登记新定时器 —— 否则 close() 刚清空 timers,
   * 紧接着的回调又会 push 回来,并在已分离的节点上做无用操作。
   * @param {Function} fn - 回调。
   * @param {number} delay - 延迟毫秒。
   * @returns {number} 定时器 id(弹窗已关闭时返回 0,表示没登记)。
   */
  Popup.prototype.setTimer = function setTimer(fn, delay) {
    if (this.closed) return 0
    var id = window.setTimeout(fn, delay)
    this.timers.push(id)
    return id
  }

  // ======================================================================
  // 4. 管理器
  // ======================================================================

  function Manager() {
    this.popups = []
    this.seq = 0
    /** 素材:先放兜底,宿主第一次回话就换成设置页里的那套。 */
    this.ads = FALLBACK_ADS.slice()
    this.counters = { shown: 0, stalls: 0, closed: 0, cta: 0 }
    this.pollTimer = null
    this.pollDelay = POLL_MS
    this.lastThinking = false
    this.lastRunKey = ''
    /** 上一次「宿主说空闲」的时刻,用来判断停顿是否算新的一轮(0 = 还没见过空闲)。 */
    this.lastIdleAt = 0
    this.followups = 0
    this.runStartedAt = 0
    this.maxPopups = 4
    this.enabled = true
    /** 徽标(装好后才有值);关闭状态下它的按钮变成「开启」。 */
    this.badge = undefined
    this.badgeLabel = undefined
    this.badgeBtn = undefined
    this.stateFailures = 0
    this.destroyed = false
    /** 已登记、尚未执行的延迟任务(销毁时统一清掉)。 */
    this.scheduleIds = new Set()

    this.installStyles()
    this.installBadge()
    this.installKeyTrap()
    this.poll()
  }

  /** 注入样式(带 data-plugin 标记,便于别人识别与我们自己清理)。 */
  Manager.prototype.installStyles = function installStyles() {
    var style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-ad-popups')
    style.textContent = CSS_TEXT
    document.head.appendChild(style)
    this.styleEl = style
  }

  /**
   * 右下角徽标:状态显示 + 打开设置面板;**关掉之后它仍然在**,并且在关闭状态下
   * 提供「开启」。这是刻意的:一个能把自己关掉的开关,必须留着再打开的门
   * (早期版本关闭时连脚本都不注入,关掉之后就再也找不到入口了)。
   */
  Manager.prototype.installBadge = function installBadge() {
    var self = this
    var badge = document.createElement('div')
    badge.className = 'dsh-ad-badge'
    badge.setAttribute('data-plugin', 'dsh-ad-popups')
    badge.title = '点击打开「虚拟广告弹窗」设置'

    var label = document.createElement('span')
    label.className = 'dsh-ad-badge-text'
    label.textContent = '虚拟广告 0'
    badge.appendChild(label)

    // 关闭状态下这个按钮变成「开启」,一键把总开关打开(不用进面板)
    var trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'dsh-ad-badge-btn'
    trigger.textContent = '设置'
    trigger.title = '打开设置面板'
    trigger.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      if (self.enabled) {
        self.openPanel()
        return
      }
      self.quickEnableBadge()
    })
    badge.appendChild(trigger)

    // 点徽标本体始终进设置面板(那里能改文案、也能把关掉的重新打开)
    badge.addEventListener('click', function () {
      self.openPanel()
    })

    document.body.appendChild(badge)
    this.badge = badge
    this.badgeLabel = label
    this.badgeBtn = trigger
  }

  /**
   * 徽标上的「开启」:直接把总开关写回宿主。
   *
   * 走设置接口而不是只改本地状态 —— 关掉的状态是宿主记着的,只改本地会在下一次
   * 轮询(0.6 秒内)被覆盖回去,变成「点了没反应」。
   */
  Manager.prototype.quickEnableBadge = function quickEnableBadge() {
    var self = this
    if (this.badgeBtn !== undefined) {
      this.badgeBtn.disabled = true
      this.badgeBtn.textContent = '开启中…'
    }
    fetch(API_SETTINGS, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
      .then(function (response) { return response.json() })
      .then(function (payload) {
        if (payload === null || payload.ok !== true) throw new Error((payload && payload.error) || '开启失败')
        self.enabled = true
        // 立刻把徽标切回「设置」,不等下一次轮询(0.6 秒内会变成「点了没反应」的错觉)
        self.updateBadge()
        self.flashBadge('已开启,模型思考时就会有弹窗')
      })
      .catch(function (error) {
        if (self.badgeBtn !== undefined) {
          self.badgeBtn.disabled = false
          self.badgeBtn.textContent = '开启'
        }
        self.flashBadge('开启失败:' + String(error && error.message ? error.message : error))
      })
      .then(function () {
        if (self.badgeBtn !== undefined) self.badgeBtn.disabled = false
      })
  }

  // ======================================================================
  // 4b. 设置面板(直接在页面内打开)
  // ======================================================================
  // ======================================================================
  //
  // 为什么不做成「点开一个设置页」:桌面端对这个页面调 window.open 是不通的
  // (Electron 的窗口策略 + dsh-app:// 协议,用户点了没反应),iframe 嵌跨源页面也不一定放行。
  // 所以设置全部在页面内用原生 DOM 画出来,只读写同源接口。
  //
  // 三个刻意的实现决定(都是被实测的坑逼出来的):
  //   · **不用点击委托**:每个控件在创建时直接绑自己的 handler。委托要求事件从
  //     目标一路冒泡到容器,而这条冒泡链可能被宿主或别的插件的全局捕获监听掐断
  //     (实测「× 和开关点不动」就是这个原因)。
  //   · **面板挂到 documentElement 而不是 body**:万一宿主把 body 放进某个
  //     transform / overflow 容器里,fixed 定位会相对那个容器算,面板可能被推到屏幕外。
  //   · **不假设宿主能点鼠标**:键盘操作(Ctrl+S 保存、Esc 关闭、Tab+空格操作控件、
  //     Ctrl+V 批量粘贴)全程可用,任何鼠标层面的拦截都绕不过去。

  /** 每行广告的字段顺序与配色选项来自 format.js(与宿主侧 ads.js 同源)。 */
  var AD_FIELDS = [
    { key: 'kicker', label: '角标', width: 90 },
    { key: 'title', label: '标题(必填)', width: 0 },
    { key: 'body', label: '正文', width: 0 },
    { key: 'marquee', label: '跑马灯', width: 0 },
    { key: 'action', label: '按钮', width: 96 },
    { key: 'theme', label: '配色', width: 84 },
  ]

  /**
   * 读宿主的主题变量,给面板上色。
   *
   * DSH 的主题是 `--dsw-alias-*` 一套 CSS 变量;直接读它们比写死颜色强得多 ——
   * 深色/浅色主题、用户换皮肤都会自动跟上,面板不会变成一块突兀的白色。
   * @param {string[]} names - 候选变量名(按优先级)。
   * @param {string} fallback - 全都读不到时的兜底色。
   * @returns {string} 可用的颜色值。
   */
  function themeVar(names, fallback) {
    try {
      var root = document.documentElement
      if (root === undefined || root === null) return fallback
      var computed = window.getComputedStyle(root)
      if (computed === undefined || computed === null) return fallback
      for (var i = 0; i < names.length; i++) {
        var value = computed.getPropertyValue(names[i])
        if (typeof value === 'string' && value.trim() !== '') return value.trim()
      }
    } catch (error) {
      /* 读不到就用兜底色 */
    }
    return fallback
  }

  /**
   * 一次取齐面板要用的颜色。
   *
   * 变量名只取**宿主实际提供**的那批(用 cordis_inspect 的 Theme 提供方核对过):
   * `--dsw-alias-bg-base/-layer-1/-layer-2`、`--dsw-alias-label-primary/-secondary`、
   * `--dsw-alias-border-l1`、`--dsw-alias-brand-primary`、`--dsw-alias-state-error-primary`、
   * `--dsw-alias-state-idle-primary`。写不存在的变量名不会报错,但会静默落到兜底色 ——
   * 那样面板就会在任何皮肤下都用同一套写死的颜色,正是「颜色不统一」的来源。
   * @returns {{bg:string,bg2:string,fg:string,muted:string,line:string,brand:string,brandFg:string,danger:string,idle:string}}
   *   面板配色。
   */
  function panelPalette() {
    return {
      bg: themeVar(['--dsw-alias-bg-layer-1', '--dsw-alias-bg-base'], '#ffffff'),
      bg2: themeVar(['--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-1'], '#f4f4f5'),
      fg: themeVar(['--dsw-alias-label-primary'], '#1b1b1b'),
      muted: themeVar(['--dsw-alias-label-secondary'], '#6b6b6b'),
      line: themeVar(['--dsw-alias-border-l1'], 'rgba(128,128,128,.35)'),
      brand: themeVar(['--dsw-alias-brand-primary'], '#4f46e5'),
      // 主题里没有「按钮前景色」这个 token:品牌色都是饱和强调色,白字在其上可读
      brandFg: '#ffffff',
      danger: themeVar(['--dsw-alias-state-error-primary'], '#e5484d'),
      // 关闭态的开关底色用宿主的「非活跃」色,而不是写死的灰
      idle: themeVar(['--dsw-alias-state-idle-primary'], '#c7c7cc'),
    }
  }

  /** 打开设置面板(已经开着就直接返回)。 */
  Manager.prototype.openPanel = function openPanel() {
    if (this.panel !== undefined) return
    var self = this
    var pal = panelPalette()

    var mask = document.createElement('div')
    mask.className = 'dsh-ad-mask'
    mask.setAttribute('data-plugin', 'dsh-ad-popups')
    mask.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;width:100vw;height:100vh;'
      + 'z-index:2147483000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;'
      + 'padding:18px;pointer-events:auto;box-sizing:border-box'

    var panel = document.createElement('div')
    panel.className = 'dsh-ad-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', '虚拟广告弹窗 · 设置')
    panel.tabIndex = -1
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);'
      + 'width:min(760px,100%);max-height:min(88vh,860px);display:flex;flex-direction:column;'
      + 'background:' + pal.bg + ';color:' + pal.fg + ';border:1px solid ' + pal.line + ';'
      + 'border-radius:14px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.45);'
      + 'pointer-events:auto;box-sizing:border-box;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'
      + '"Segoe UI","Microsoft YaHei",sans-serif'

    // ---- 事件:不再做「捕获阶段隔离」----
    //
    // 这里原来挂了一组 `mask.addEventListener('click', …, true)` 并在里面
    // `stopPropagation()`,本意是防止别的插件的全局监听干扰面板。但它是在**捕获阶段**
    // 掐断的 —— 那一刻事件还没走到目标元素,于是面板里所有控件的 handler 全都不会被触发:
    // 开关、×、保存一律「点了没反应」(徽标在面板外,所以一直是好的,正好掩盖了这个 bug)。
    //
    // 正确做法是让事件自然走到目标,再在各控件自己的 handler 里 stopPropagation
    // (那些 handler 都是冒泡阶段,阻止的是「继续传给 document」,不影响别的控件)。
    // 只有点遮罩空白才算关闭面板。
    mask.addEventListener('click', function (event) {
      if (event.target === mask) self.closePanel()
    })

    /**
     * 诊断探针:面板开着时,任何落在面板里的点击都记一笔。
     * 状态栏会显示「上次点击:元素/坐标」,用于判断事件到底有没有到面板。
     * @param {Event} event - 点击事件。
     */
    var probe = function (event) {
      if (self.panel === undefined) return
      var target = event.target
      if (target === undefined || target === null) return
      if (target !== mask && !panel.contains(target)) return
      var tag = String(target.tagName || '?').toLowerCase()
      var cls = target.className !== undefined && target.className !== null ? String(target.className) : ''
      self.panel.lastHit = tag + (cls !== '' ? '.' + cls.split(' ')[0] : '')
        + ' @' + String(Math.round(event.clientX || 0)) + ',' + String(Math.round(event.clientY || 0))
    }
    mask.addEventListener('click', probe)
    this.panelProbe = { node: mask, fn: probe }

    // ---- 顶部提示条(保存反馈/错误都走它,不再只写一行小字) ----
    var toast = document.createElement('div')
    toast.className = 'dsh-ad-toast'
    toast.style.cssText = 'display:none;padding:8px 16px;font-size:12.5px;flex:none'
    panel.appendChild(toast)

    /**
     * 顶部提示:显示一句反馈。
     * @param {string} text - 提示文字。
     * @param {'ok'|'err'|'info'} kind - 提示类型。
     */
    var flash = function (text, kind) {
      toast.textContent = text
      toast.style.display = 'block'
      toast.style.background = kind === 'err' ? 'rgba(229,72,77,.14)' : kind === 'ok' ? 'rgba(5,150,105,.14)' : 'transparent'
      toast.style.color = kind === 'err' ? pal.danger : kind === 'ok' ? '#059669' : pal.muted
      if (kind !== 'info') {
        window.setTimeout(function () {
          if (toast.parentNode !== null) toast.style.display = 'none'
        }, 2600)
      }
    }

    // ---- 标题栏(可拖动) ----
    var head = document.createElement('div')
    head.className = 'dsh-ad-panel-head'
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;'
      + 'padding:12px 16px;border-bottom:1px solid ' + pal.line + ';flex:none;cursor:move'
    var heading = document.createElement('div')
    heading.className = 'dsh-ad-panel-title'
    heading.style.cssText = 'font-size:15px;font-weight:600'
    heading.textContent = '虚拟广告弹窗 · 设置'
    head.appendChild(heading)

    var headRight = document.createElement('div')
    headRight.style.cssText = 'display:flex;align-items:center;gap:6px'

    var closeX = document.createElement('button')
    closeX.type = 'button'
    closeX.className = 'dsh-ad-panel-x'
    closeX.textContent = '✕'
    closeX.title = '关闭(也可以按 Esc)'
    closeX.style.cssText = 'border:none;background:transparent;color:inherit;font-size:15px;cursor:pointer;'
      + 'border-radius:6px;padding:2px 9px;opacity:.75'
    closeX.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.closePanel()
    })
    headRight.appendChild(closeX)
    head.appendChild(headRight)
    panel.appendChild(head)

    // 拖动:按住标题栏移动面板(指针事件挂在 head 自己身上,不依赖全局)
    var drag = { active: false, dx: 0, dy: 0 }
    head.addEventListener('pointerdown', function (event) {
      if (event.target === closeX) return
      drag.active = true
      var rect = panel.getBoundingClientRect()
      drag.dx = event.clientX - rect.left
      drag.dy = event.clientY - rect.top
      panel.style.transform = 'none'
      panel.style.left = rect.left + 'px'
      panel.style.top = rect.top + 'px'
      panel.style.margin = '0'
    })
    head.addEventListener('pointermove', function (event) {
      if (!drag.active) return
      panel.style.left = (event.clientX - drag.dx) + 'px'
      panel.style.top = (event.clientY - drag.dy) + 'px'
    })
    var endDrag = function () { drag.active = false }
    head.addEventListener('pointerup', endDrag)
    head.addEventListener('pointercancel', endDrag)
    head.addEventListener('pointerleave', endDrag)

    // ---- 滚动主体 ----
    var body = document.createElement('div')
    body.className = 'dsh-ad-panel-body'
    body.style.cssText = 'padding:14px 16px 16px;overflow:auto;flex:1 1 auto;'
      + 'display:flex;flex-direction:column;gap:12px'

    var note = document.createElement('div')
    note.className = 'dsh-ad-note'
    note.style.cssText = 'font-size:12px;opacity:.75;line-height:1.55'
    note.textContent = '模型思考期间飘出的娱乐弹窗。内容纯属虚构,不构成任何广告宣传。'
    body.appendChild(note)

    // ---- 总开关(自绘:不依赖原生 checkbox 的默认切换行为) ----
    var rowToggle = document.createElement('div')
    rowToggle.className = 'dsh-ad-row dsh-ad-row-toggle'
    rowToggle.setAttribute('role', 'switch')
    rowToggle.tabIndex = 0
    rowToggle.title = '也可以按空格/回车切换'
    rowToggle.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;'
      + 'user-select:none;font-weight:600;padding:2px 0'

    var switchTrack = document.createElement('span')
    switchTrack.className = 'dsh-ad-switch'
    switchTrack.style.cssText = 'position:relative;flex:none;width:38px;height:21px;border-radius:999px;'
      + 'background:#c7c7cc;transition:background .15s ease'
    var switchKnob = document.createElement('span')
    switchKnob.style.cssText = 'position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;'
      + 'background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s ease'
    switchTrack.appendChild(switchKnob)
    rowToggle.appendChild(switchTrack)

    var toggleText = document.createElement('span')
    toggleText.textContent = '启用广告弹窗'
    rowToggle.appendChild(toggleText)
    body.appendChild(rowToggle)

    // ---- 上限:步进器(- / + 按钮 + 数字) ----
    //
    // 刻意**不用原生 number 输入框的编辑能力**:它在不同宿主里可能吃到不同的事件/样式
    // 干预,表现就是「点了、敲了但数字不变」。改成两个明确的按钮各改一格,所见即所得 ——
    // 每一步都走我们自己的 handler,不依赖浏览器对 <input type=number> 的默认行为。
    var rowMax = document.createElement('div')
    rowMax.className = 'dsh-ad-row'
    rowMax.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap'
    var maxLabel = document.createElement('span')
    maxLabel.textContent = '同时最多显示'
    rowMax.appendChild(maxLabel)

    var stepBtnStyle = 'width:28px;height:28px;line-height:1;border-radius:8px;cursor:pointer;'
      + 'border:1px solid ' + pal.line + ';background:' + pal.bg2 + ';color:inherit;font-size:15px;font-weight:600'

    var minusBtn = document.createElement('button')
    minusBtn.type = 'button'
    minusBtn.className = 'dsh-ad-step dsh-ad-step-minus'
    minusBtn.textContent = '−'
    minusBtn.title = '少一个(最少 1)'
    minusBtn.style.cssText = stepBtnStyle
    rowMax.appendChild(minusBtn)

    // 只用来显示的值:不接收输入,避免与浏览器的输入框行为纠缠
    var maxPopups = document.createElement('input')
    maxPopups.type = 'text'
    maxPopups.readOnly = true
    maxPopups.tabIndex = -1
    maxPopups.className = 'dsh-ad-num dsh-ad-num-readonly'
    maxPopups.setAttribute('aria-live', 'polite')
    maxPopups.style.cssText = 'width:48px;text-align:center;padding:5px 6px;border-radius:7px;'
      + 'border:1px solid ' + pal.line + ';background:' + pal.bg2 + ';color:inherit;font:inherit;'
      + 'cursor:default;-moz-appearance:textfield'
    rowMax.appendChild(maxPopups)

    var plusBtn = document.createElement('button')
    plusBtn.type = 'button'
    plusBtn.className = 'dsh-ad-step dsh-ad-step-plus'
    plusBtn.textContent = '＋'
    plusBtn.title = '多一个(最多 8)'
    plusBtn.style.cssText = stepBtnStyle
    rowMax.appendChild(plusBtn)

    var maxTail = document.createElement('span')
    maxTail.textContent = '个弹窗(1-8)'
    rowMax.appendChild(maxTail)
    var maxHint = document.createElement('span')
    maxHint.style.cssText = 'font-size:11.5px;opacity:.6'
    maxHint.textContent = '· 清屏就按 3 次 Esc'
    rowMax.appendChild(maxHint)
    body.appendChild(rowMax)

    // ---- 文案:表单化编辑 ----
    var copyHead = document.createElement('div')
    copyHead.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px'
    var copyTitle = document.createElement('div')
    copyTitle.className = 'dsh-ad-panel-sub'
    copyTitle.style.cssText = 'font-size:13px;font-weight:600'
    copyTitle.textContent = '广告文案'
    copyHead.appendChild(copyTitle)
    var copyCount = document.createElement('span')
    copyCount.className = 'dsh-ad-note'
    copyCount.style.cssText = 'font-size:12px;opacity:.7'
    copyHead.appendChild(copyCount)
    var copyGrow = document.createElement('span')
    copyGrow.style.cssText = 'flex:1'
    copyHead.appendChild(copyGrow)

    var addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'dsh-ad-btn'
    addBtn.style.cssText = 'padding:5px 11px;border-radius:8px;border:1px solid ' + pal.line
      + ';background:' + pal.bg2 + ';color:inherit;font:inherit;cursor:pointer'
    addBtn.textContent = '＋ 新增一条'
    copyHead.appendChild(addBtn)
    body.appendChild(copyHead)

    var help = document.createElement('div')
    help.className = 'dsh-ad-note'
    help.style.cssText = 'font-size:11.5px;opacity:.65;line-height:1.55'
    help.textContent = '每条广告填 6 个字段(只有标题必填);配色决定配色卡。改动只在本页草稿里,'
      + '点「保存」才写回宿主。'
    body.appendChild(help)

    var list = document.createElement('div')
    list.className = 'dsh-ad-list'
    list.style.cssText = 'display:flex;flex-direction:column;gap:10px'
    body.appendChild(list)

    // 高级:批量文本(粘贴/导出用),默认折叠
    var adv = document.createElement('details')
    adv.className = 'dsh-ad-adv'
    adv.style.cssText = 'border:1px solid ' + pal.line + ';border-radius:10px;padding:8px 10px;background:' + pal.bg2
    var advSum = document.createElement('summary')
    advSum.style.cssText = 'cursor:pointer;font-size:12.5px;opacity:.85'
    advSum.textContent = '高级:批量文本(一行一条,方便粘贴/备份)'
    adv.appendChild(advSum)
    var advHint = document.createElement('div')
    advHint.className = 'dsh-ad-note'
    advHint.style.cssText = 'font-size:11.5px;opacity:.65;margin:8px 0 6px;line-height:1.5'
    advHint.textContent = '格式:角标 | 标题 | 正文 | 跑马灯 | 按钮文字 | 配色。# 开头是注释。'
      + '按 Ctrl+V 可以直接把整段文本粘进下面的框,再点「应用到上面」。'
    adv.appendChild(advHint)
    var advText = document.createElement('textarea')
    advText.className = 'dsh-ad-advtext'
    advText.spellcheck = false
    advText.rows = 8
    advText.style.cssText = 'width:100%;box-sizing:border-box;min-height:120px;padding:8px 10px;border-radius:8px;'
      + 'border:1px solid ' + pal.line + ';background:' + pal.bg + ';color:inherit;white-space:pre;overflow:auto;'
      + 'font:400 12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
    adv.appendChild(advText)
    var advActions = document.createElement('div')
    advActions.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'
    var applyText = document.createElement('button')
    applyText.type = 'button'
    applyText.className = 'dsh-ad-btn'
    applyText.style.cssText = 'padding:5px 11px;border-radius:8px;border:1px solid ' + pal.line
      + ';background:transparent;color:inherit;font:inherit;cursor:pointer'
    applyText.textContent = '应用到上面'
    advActions.appendChild(applyText)
    var syncText = document.createElement('button')
    syncText.type = 'button'
    syncText.className = 'dsh-ad-btn'
    syncText.style.cssText = 'padding:5px 11px;border-radius:8px;border:1px solid ' + pal.line
      + ';background:transparent;color:inherit;font:inherit;cursor:pointer'
    syncText.textContent = '从上面生成'
    advActions.appendChild(syncText)
    adv.appendChild(advActions)
    body.appendChild(adv)

    // ---- 底部操作区 ----
    var actions = document.createElement('div')
    actions.className = 'dsh-ad-panel-actions'
    actions.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
      + 'padding:12px 16px;border-top:1px solid ' + pal.line + ';flex:none'

    var btnBase = 'padding:6px 14px;border-radius:8px;border:1px solid ' + pal.line
      + ';background:' + pal.bg2 + ';color:inherit;font:inherit;cursor:pointer'

    var save = document.createElement('button')
    save.type = 'button'
    save.className = 'dsh-ad-btn dsh-ad-btn-primary'
    save.style.cssText = btnBase + ';background:' + pal.brand + ';border-color:' + pal.brand
      + ';color:' + pal.brandFg + ';font-weight:600'
    save.textContent = '保存(Ctrl+S)'
    save.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.savePanel()
    })
    actions.appendChild(save)

    var revert = document.createElement('button')
    revert.type = 'button'
    revert.className = 'dsh-ad-btn'
    revert.style.cssText = btnBase
    revert.textContent = '放弃修改'
    revert.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.loadPanel()
    })
    actions.appendChild(revert)

    var reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'dsh-ad-btn'
    reset.style.cssText = btnBase
    reset.textContent = '恢复内置文案'
    reset.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.resetPanel()
    })
    actions.appendChild(reset)

    var grow = document.createElement('span')
    grow.style.cssText = 'flex:1'
    actions.appendChild(grow)

    var status = document.createElement('div')
    status.className = 'dsh-ad-panel-status'
    status.style.cssText = 'font-size:12px;opacity:.75;line-height:1.4;word-break:break-all;'
      + 'flex:1 1 100%;min-height:17px'
    actions.appendChild(status)

    panel.appendChild(body)
    panel.appendChild(actions)
    mask.appendChild(panel)
    // 挂到 documentElement:body 可能被宿主放进 transform/overflow 容器,fixed 会跟着跑偏
    var host = document.documentElement !== undefined && document.documentElement !== null ? document.documentElement : document.body
    host.appendChild(mask)

    this.panel = {
      mask: mask,
      panel: panel,
      rows: [],
      nextId: 1,
      enabled: true,
      maxPopups: 4,
      defaultAdText: '',
      switchTrack: switchTrack,
      switchKnob: switchKnob,
      rowToggle: rowToggle,
      maxPopupsInput: maxPopups,
      save: save,
      list: list,
      advText: advText,
      copyCount: copyCount,
      status: status,
      flash: flash,
    }

    /**
     * 重绘自绘开关。
     * @param {boolean} on - 是否打开。
     */
    var paintSwitch = function (on) {
      switchTrack.style.background = on ? pal.brand : pal.idle
      switchKnob.style.transform = on ? 'translateX(17px)' : 'none'
      rowToggle.setAttribute('aria-checked', on ? 'true' : 'false')
    }
    this.panel.paintSwitch = paintSwitch

    var toggle = function () {
      if (self.panel === undefined) return
      var next = !self.panel.enabled
      self.panel.enabled = next
      paintSwitch(next)
      self.renderPanelStatus()
      flash(next ? '总开关:已打开' : '总开关:已关闭', 'info')
    }
    rowToggle.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      toggle()
    })
    rowToggle.addEventListener('keydown', function (event) {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      toggle()
    })

    /**
     * 把当前草稿里的上限写进显示框(只改显示,不动草稿)。
     * @param {number} value - 1-8 之间的整数。
     */
    var paintMaxPopups = function (value) {
      writeControl(maxPopups, clamp(Math.round(Number(value) || DEFAULT_MAX_POPUPS), 1, HARD_MAX_POPUPS))
    }

    /**
     * 改一格上限:步进器两个按钮与键盘都走这里。
     * @param {number} delta - +1 或 -1。
     */
    var stepMaxPopups = function (delta) {
      if (self.panel === undefined) return
      var next = clamp((Number(self.panel.maxPopups) || DEFAULT_MAX_POPUPS) + delta, 1, HARD_MAX_POPUPS)
      self.panel.maxPopups = next
      paintMaxPopups(next)
      self.renderPanelStatus()
      flash('同时最多显示 ' + String(next) + ' 个弹窗(点「保存」生效)', 'info')
    }

    minusBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      stepMaxPopups(-1)
    })
    plusBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      stepMaxPopups(1)
    })
    // 键盘也能调:聚焦到任一步进按钮后按左右/上下方向键
    var stepKeydown = function (event) {
      var delta = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
      if (delta === 0) return
      event.preventDefault()
      stepMaxPopups(delta)
    }
    minusBtn.addEventListener('keydown', stepKeydown)
    plusBtn.addEventListener('keydown', stepKeydown)

    addBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      if (self.panel === undefined) return
      if (self.panel.rows.length >= MAX_AD_ROWS) {
        flash('最多 ' + String(MAX_AD_ROWS) + ' 条,够了够了', 'err')
        return
      }
      self.addPanelRow({ kicker: '', title: '', body: '', marquee: '', action: '立即领取', theme: 'hot' })
      self.renderPanelCount()
      list.lastElementChild?.scrollIntoView({ block: 'nearest' })
    })

    // 批量文本 ↔ 表单 双向
    syncText.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      if (self.panel === undefined) return
      writeControl(advText, self.panelText())
      flash('已把上面 ' + String(self.panel.rows.length) + ' 条生成到文本框', 'info')
    })
    applyText.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      if (self.panel === undefined) return
      var parsed = parseAdText(String(readControl(advText, '')))
      if (parsed.length === 0) {
        flash('文本里没有一条能解析出标题,请检查格式', 'err')
        return
      }
      self.replacePanelRows(parsed)
      flash('已从文本载入 ' + String(parsed.length) + ' 条', 'ok')
    })

    // 键盘兜底:面板开着时 Ctrl+S 保存、Esc 关闭
    this.panelKeyHandler = function (event) {
      if (self.panel === undefined) return
      if (event.key === 'Escape') {
        event.preventDefault()
        self.closePanel()
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault()
        self.savePanel()
      }
    }
    document.addEventListener('keydown', this.panelKeyHandler, true)

    // 面板一开就拉当前设置
    this.loadPanel()
    this.renderPanelStatus()
    try {
      panel.focus()
    } catch (error) {
      /* 聚焦失败不影响使用 */
    }
  }

  /**
   * 生成一行广告的编辑器。
   * @param {object} ad - 初始字段。
   * @returns {object} 行实例(带各字段控件的引用)。
   */
  Manager.prototype.addPanelRow = function addPanelRow(ad) {
    if (this.panel === undefined) return undefined
    var self = this
    var pal = panelPalette()
    var panel = this.panel
    var id = panel.nextId
    panel.nextId += 1

    var row = document.createElement('div')
    row.className = 'dsh-ad-rowitem'
    row.style.cssText = 'border:1px solid ' + pal.line + ';border-radius:10px;padding:10px;'
      + 'background:' + pal.bg2 + ';display:flex;flex-direction:column;gap:8px'

    var rowHead = document.createElement('div')
    rowHead.style.cssText = 'display:flex;align-items:center;gap:8px'
    var idx = document.createElement('span')
    idx.style.cssText = 'font-size:11.5px;opacity:.6;min-width:52px'
    rowHead.appendChild(idx)

    var preview = document.createElement('span')
    preview.className = 'dsh-ad-rowpreview'
    preview.style.cssText = 'flex:1;font-size:12px;opacity:.85;overflow:hidden;text-overflow:ellipsis;'
      + 'white-space:nowrap'
    rowHead.appendChild(preview)

    var btnStyle = 'padding:3px 9px;border-radius:7px;border:1px solid ' + pal.line
      + ';background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer'

    var upBtn = document.createElement('button')
    upBtn.type = 'button'
    upBtn.textContent = '↑'
    upBtn.title = '上移'
    upBtn.style.cssText = btnStyle
    rowHead.appendChild(upBtn)

    var downBtn = document.createElement('button')
    downBtn.type = 'button'
    downBtn.textContent = '↓'
    downBtn.title = '下移'
    downBtn.style.cssText = btnStyle
    rowHead.appendChild(downBtn)

    var dupBtn = document.createElement('button')
    dupBtn.type = 'button'
    dupBtn.textContent = '复制'
    dupBtn.title = '复制这一条'
    dupBtn.style.cssText = btnStyle
    rowHead.appendChild(dupBtn)

    var delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.textContent = '删除'
    delBtn.title = '删掉这一条'
    delBtn.style.cssText = btnStyle + ';color:' + pal.danger + ';border-color:' + pal.danger
    rowHead.appendChild(delBtn)
    row.appendChild(rowHead)

    var grid = document.createElement('div')
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px'
    row.appendChild(grid)

    var inputs = {}
    for (var i = 0; i < AD_FIELDS.length; i++) {
      var field = AD_FIELDS[i]
      var cell = document.createElement('label')
      var wide = field.key === 'title' || field.key === 'body' || field.key === 'marquee'
      cell.style.cssText = 'display:flex;flex-direction:column;gap:3px;font-size:11.5px;opacity:.9;'
        + (wide ? 'grid-column:1/-1;' : '')
      var label = document.createElement('span')
      label.textContent = field.label
      label.style.cssText = 'opacity:.7'
      cell.appendChild(label)

      var control
      if (field.key === 'theme') {
        control = document.createElement('select')
        for (var t = 0; t < THEME_OPTIONS.length; t++) {
          var option = document.createElement('option')
          option.value = THEME_OPTIONS[t]
          option.textContent = THEME_OPTIONS[t]
          control.appendChild(option)
        }
      } else {
        control = document.createElement('input')
        control.type = 'text'
      }
      control.className = 'dsh-ad-field dsh-ad-field-' + field.key
      control.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border-radius:7px;'
        + 'border:1px solid ' + pal.line + ';background:' + pal.bg + ';color:inherit;font:inherit;font-size:12.5px'
      var initial = ad[field.key] !== undefined && ad[field.key] !== null ? String(ad[field.key]) : ''
      writeControl(control, initial)
      inputs[field.key] = control

      control.addEventListener('input', function () {
        self.renderPanelCount()
      })
      control.addEventListener('change', function () {
        self.renderPanelCount()
      })
      cell.appendChild(control)
      grid.appendChild(cell)
    }

    var state = { id: id, el: row, inputs: inputs, preview: preview, index: idx }
    panel.rows.push(state)

    upBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.movePanelRow(state, -1)
    })
    downBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.movePanelRow(state, 1)
    })
    dupBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      var fields = self.readPanelRow(state)
      fields.title = fields.title + '(副本)'
      self.addPanelRow(fields)
      self.renderPanelCount()
    })
    delBtn.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      self.removePanelRow(state)
    })

    panel.list.appendChild(row)
    this.renderPanelRows()
    return state
  }

  /** 读一行的字段值。 */
  Manager.prototype.readPanelRow = function readPanelRow(state) {
    var out = {}
    for (var i = 0; i < AD_FIELDS.length; i++) {
      var key = AD_FIELDS[i].key
      out[key] = String(readControl(state.inputs[key], '') || '').trim()
    }
    if (out.title === '') out.title = '(未命名广告)'
    if (out.action === '') out.action = '立即领取'
    if (out.theme === '') out.theme = 'hot'
    return out
  }

  /** 把表单里的所有行拼回文案文本。 */
  Manager.prototype.panelText = function panelText() {
    if (this.panel === undefined) return ''
    var lines = []
    for (var i = 0; i < this.panel.rows.length; i++) {
      lines.push(stringifyAdLine(this.readPanelRow(this.panel.rows[i])))
    }
    return lines.join('\n')
  }

  /** 用一批广告替换表单内容。 */
  Manager.prototype.replacePanelRows = function replacePanelRows(ads) {
    if (this.panel === undefined) return
    var list = this.panel.list
    while (list.firstChild) list.removeChild(list.firstChild)
    this.panel.rows = []
    for (var i = 0; i < ads.length && i < MAX_AD_ROWS; i++) this.addPanelRow(ads[i])
    this.renderPanelCount()
  }

  /** 删掉一行。 */
  Manager.prototype.removePanelRow = function removePanelRow(state) {
    if (this.panel === undefined) return
    var at = this.panel.rows.indexOf(state)
    if (at === -1) return
    this.panel.rows.splice(at, 1)
    if (state.el.parentNode !== null) state.el.parentNode.removeChild(state.el)
    this.renderPanelRows()
    this.renderPanelCount()
  }

  /** 上下移动一行。 */
  Manager.prototype.movePanelRow = function movePanelRow(state, delta) {
    if (this.panel === undefined) return
    var rows = this.panel.rows
    var at = rows.indexOf(state)
    var to = at + delta
    if (at === -1 || to < 0 || to >= rows.length) return
    rows.splice(at, 1)
    rows.splice(to, 0, state)
    // 按新顺序重排 DOM
    for (var i = 0; i < rows.length; i++) this.panel.list.appendChild(rows[i].el)
    this.renderPanelRows()
  }

  /** 刷新每行的序号与预览。 */
  Manager.prototype.renderPanelRows = function renderPanelRows() {
    if (this.panel === undefined) return
    for (var i = 0; i < this.panel.rows.length; i++) {
      var state = this.panel.rows[i]
      var fields = this.readPanelRow(state)
      state.index.textContent = '#' + String(i + 1)
      state.preview.textContent = (fields.kicker !== '' ? '[' + fields.kicker + '] ' : '') + fields.title
        + ' · ' + fields.theme
      state.preview.title = fields.title + '\n' + fields.body
    }
  }

  /** 刷新条数。 */
  Manager.prototype.renderPanelCount = function renderPanelCount() {
    if (this.panel === undefined) return
    this.renderPanelRows()
    this.panel.copyCount.textContent = '共 ' + String(this.panel.rows.length) + ' 条'
  }

  /** 关掉设置面板。 */
  Manager.prototype.closePanel = function closePanel() {
    if (this.panel === undefined) return
    if (this.panelTimer !== undefined) {
      window.clearInterval(this.panelTimer)
      this.panelTimer = undefined
    }
    if (this.panelProbe !== undefined) {
      this.panelProbe.node.removeEventListener('click', this.panelProbe.fn)
      this.panelProbe = undefined
    }
    if (this.panelKeyHandler !== undefined) {
      document.removeEventListener('keydown', this.panelKeyHandler, true)
      this.panelKeyHandler = undefined
    }
    var mask = this.panel.mask
    if (mask.parentNode) mask.parentNode.removeChild(mask)
    this.panel = undefined
  }

  /** 面板底部状态栏:总开关 / 当前是否在思考 / 投放计数 / 最近一次点击。 */
  Manager.prototype.renderPanelStatus = function renderPanelStatus() {
    if (this.panel === undefined) return
    var parts = []
    parts.push(this.panel.enabled ? '总开关:开' : '总开关:关')
    if (this.enabled) {
      parts.push(this.lastThinking ? '模型正在思考,弹窗投放中' : '当前空闲')
      parts.push('已投 ' + String(this.counters.shown) + ' 个 · 在屏 ' + String(this.popups.length) + ' 个')
    }
    // 刚点过面板里的东西就报一下落点:排查「点了没反应」时一眼能看出事件到没到
    if (this.panel.lastHit !== undefined) parts.push('上次点击:' + String(this.panel.lastHit))
    this.panel.status.textContent = parts.join(' · ')
  }

  /** 读当前设置并填进面板。 */
  Manager.prototype.loadPanel = function loadPanel() {
    var self = this
    if (this.panel === undefined) return
    this.panel.status.textContent = '读取中…'
    fetch(API_SETTINGS, { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (payload) {
        if (self.panel === undefined) return
        if (payload === null || payload.ok !== true) throw new Error((payload && payload.error) || '读取失败')
        self.panel.enabled = payload.config.enabled !== false
        self.panel.maxPopups = clamp(Number(payload.config.maxPopups) || DEFAULT_MAX_POPUPS, 1, HARD_MAX_POPUPS)
        self.panel.defaultAdText = typeof payload.defaultAdText === 'string' ? payload.defaultAdText : ''
        // 上限用的是只读显示框,这里直接写显示值(草稿值在 panel.maxPopups 上)
        writeControl(self.panel.maxPopupsInput, self.panel.maxPopups)
        self.panel.paintSwitch(self.panel.enabled)
        var parsed = parseAdText(String(payload.adText || ''))
        self.replacePanelRows(parsed.length > 0 ? parsed : parseAdText(self.panel.defaultAdText))
        writeControl(self.panel.advText, String(payload.adText || ''))
        self.renderPanelStatus()
      })
      .catch(function (error) {
        if (self.panel === undefined) return
        self.panel.status.textContent = '读取失败:' + String(error && error.message ? error.message : error)
      })
  }

  /** 恢复内置文案(只改表单;保存才写回)。 */
  Manager.prototype.resetPanel = function resetPanel() {
    if (this.panel === undefined) return
    var parsed = parseAdText(this.panel.defaultAdText)
    this.replacePanelRows(parsed)
    writeControl(this.panel.advText, this.panel.defaultAdText)
    this.panel.flash('已载入内置文案 ' + String(parsed.length) + ' 条 —— 点「保存」才会写回', 'info')
  }

  /** 保存面板里的设置。 */
  Manager.prototype.savePanel = function savePanel(opts) {
    var self = this
    if (this.panel === undefined) return
    var panel = this.panel
    var text = this.panelText()
    if (String(text).trim() === '') {
      panel.flash('至少要有一条带标题的广告才能保存', 'err')
      return
    }
    var body = {
      enabled: panel.enabled === true,
      // 上限以草稿值为准(步进器的每次改动都会同步到 panel.maxPopups)
      maxPopups: clamp(Number(panel.maxPopups) || DEFAULT_MAX_POPUPS, 1, HARD_MAX_POPUPS),
      adText: text,
    }
    if (opts !== undefined && opts.resetAdText === true) body.resetAdText = true

    panel.status.textContent = '保存中…'
    panel.save.disabled = true
    var originalLabel = panel.save.textContent
    panel.save.textContent = '保存中…'

    fetch(API_SETTINGS, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (response) {
        return response.json().then(function (payload) { return { status: response.status, payload: payload } })
      })
      .then(function (result) {
        if (self.panel === undefined) return
        var payload = result.payload
        if (payload === null || payload.ok !== true) {
          throw new Error((payload && payload.error) || ('HTTP ' + String(result.status)))
        }
        panel.enabled = payload.config.enabled !== false
        panel.maxPopups = clamp(Number(payload.config.maxPopups) || DEFAULT_MAX_POPUPS, 1, HARD_MAX_POPUPS)
        panel.paintSwitch(panel.enabled)
        writeControl(panel.maxPopupsInput, panel.maxPopups)
        if (typeof payload.adText === 'string') writeControl(panel.advText, payload.adText)
        // 本地下一次轮询就会拿到新值,这里先即时生效
        self.enabled = panel.enabled
        self.maxPopups = panel.maxPopups
        if (!self.enabled) self.closeAll()
        self.updateBadge()
        self.renderPanelStatus()
        panel.flash('已保存 ✓ 同时最多显示 ' + String(panel.maxPopups) + ' 个,设置已写回宿主', 'ok')
        panel.save.textContent = '已保存 ✓'
        window.setTimeout(function () {
          if (self.panel !== undefined) self.panel.save.textContent = originalLabel
        }, 1800)
      })
      .catch(function (error) {
        if (self.panel === undefined) return
        panel.flash('保存失败:' + String(error && error.message ? error.message : error), 'err')
        panel.status.textContent = '保存失败'
        panel.save.textContent = originalLabel
      })
      .then(function () {
        if (self.panel !== undefined) self.panel.save.disabled = false
      })
  }

  /** 键盘出口:0.6 秒内连按 3 次 Esc = 立刻关掉眼前全部弹窗(不动总开关)。 */
  Manager.prototype.installKeyTrap = function installKeyTrap() {
    var self = this
    var taps = []
    this.onKeyDown = function (event) {
      if (event.key !== 'Escape') return
      // 设置面板开着的时候,Esc 归面板(它自己会关),不要顺手把广告也清了
      if (self.panel !== undefined) return
      var now = Date.now()
      taps.push(now)
      while (taps.length > 0 && now - taps[0] > ESC_WINDOW_MS) taps.shift()
      if (taps.length >= 3) {
        taps = []
        self.closeAll()
        self.flashBadge('已全部关闭(总开关在设置页)')
      }
    }
    window.addEventListener('keydown', this.onKeyDown, true)
  }

  /** 拉一次宿主状态(状态 + 素材 + 配置)。 */
  Manager.prototype.poll = function poll() {
    var self = this
    if (this.destroyed) return
    var controller = typeof AbortController === 'function' ? new AbortController() : undefined
    this.abort = controller

    fetch(API_STATE, { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        return response.json()
      })
      .then(function (state) {
        self.stateFailures = 0
        self.pollDelay = POLL_MS
        self.consume(state)
      })
      .catch(function () {
        self.stateFailures += 1
        // 宿主没装 / 没起:退避重试,但不影响已有弹窗
        self.pollDelay = Math.min(POLL_MAX_MS, POLL_MS * Math.pow(2, Math.min(5, self.stateFailures)))
      })
      .then(function () {
        if (self.destroyed) return
        self.pollTimer = window.setTimeout(function () {
          self.poll()
        }, self.pollDelay)
      })
  }

  /** 用宿主下发的素材替换兜底(设置页改完,下一个轮询周期就生效)。 */
  Manager.prototype.applyAds = function applyAds(ads) {
    if (Array.isArray(ads) && ads.length > 0) this.ads = ads
  }

  /** 消化一份状态快照,决定要不要投广告。 */
  Manager.prototype.consume = function consume(state) {
    if (state === null || typeof state !== 'object') return

    // 素材与配置随状态一起来
    this.applyAds(state.ads)
    if (state.config !== undefined && state.config !== null) {
      if (typeof state.config.enabled === 'boolean') this.enabled = state.config.enabled
      if (typeof state.config.maxPopups === 'number') {
        this.maxPopups = clamp(Math.round(state.config.maxPopups), 1, HARD_MAX_POPUPS)
      }
    }
    // 总开关关掉:立刻收摊(不必等页面刷新)
    if (!this.enabled) {
      this.closeAll()
      this.lastThinking = false
      this.lastRunKey = ''
      this.updateBadge()
      return
    }

    var thinking = state.thinking === true
    var sessions = Array.isArray(state.sessions) ? state.sessions : []

    // 本轮标识:取所有活跃会话里 id 最小的那个当代表(多会话并行时也稳定),
    // 并随之带上「这轮已经跑了多久」—— 已经想很久的话,第一波就给足。
    var runKey = ''
    var elapsedMs = 0
    for (var i = 0; i < sessions.length; i++) {
      var session = sessions[i]
      if (session === null || typeof session !== 'object') continue
      var id = String(session.sessionId)
      if (runKey === '' || id < runKey) {
        runKey = id
        elapsedMs = Number(session.elapsedMs) || 0
      }
    }

    if (thinking) {
      var sinceIdle = this.lastIdleAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastIdleAt
      // 「新的一轮」有两个条件:换了会话,或者中途空闲了足够久(避免停顿被当成新一轮)
      var startedNow = runKey !== this.lastRunKey || sinceIdle > NEW_TURN_GAP_MS
      if (startedNow) {
        // 新的一轮:先来一波广告。已经跑了一会儿的话按时间稍微加量。
        this.lastRunKey = runKey
        this.runStartedAt = Date.now() - elapsedMs
        this.followups = 0
        this.burst(randInt(BURST_MIN, BURST_MAX) + (elapsedMs > 5000 ? 1 : 0))
      } else if (
        Date.now() - this.runStartedAt > FOLLOWUP_AFTER_MS * (this.followups + 1) &&
        this.followups < 4
      ) {
        // 想得有点久:再来一小波,并顺手在徽标上吐槽一句
        this.followups += 1
        this.burst(randInt(1, 2))
        this.flashBadge('想得有点久…')
      }
    } else {
      this.lastIdleAt = Date.now()
    }

    this.lastThinking = thinking
    this.updateBadge()
  }

  /** 投放一波广告。 */
  Manager.prototype.burst = function burst(count) {
    if (!this.isActive()) return
    var self = this
    var stagger = 0
    for (var i = 0; i < count; i++) {
      // 每个弹窗之间错开出现,像真正的弹窗轰炸那样一个接一个
      stagger += randInt(120, 420)
      this.schedule(stagger, function () {
        self.spawn()
      })
    }
  }

  /**
   * 延迟执行(登记在管理器上,销毁时一并清掉)。
   * 执行完的 id 立刻从表里摘掉,避免整场会话一直往里堆已经跑完的编号。
   * @param {number} delay - 延迟毫秒。
   * @param {Function} fn - 回调。
   * @returns {number} 定时器 id。
   */
  Manager.prototype.schedule = function schedule(delay, fn) {
    var self = this
    var id = window.setTimeout(function () {
      self.scheduleIds.delete(id)
      if (!self.destroyed) fn()
    }, Math.max(0, delay))
    this.scheduleIds.add(id)
    return id
  }

  /** 现在还该不该投广告。 */
  Manager.prototype.isActive = function isActive() {
    if (this.destroyed) return false
    return this.enabled
  }

  /** 生成一个弹窗。 */
  Manager.prototype.spawn = function spawn() {
    if (!this.isActive()) return
    var cap = Math.min(HARD_MAX_POPUPS, this.maxPopups)
    if (this.popups.length >= cap) return
    if (!Array.isArray(this.ads) || this.ads.length === 0) return
    this.seq += 1
    this.counters.shown += 1
    var popup = new Popup(this, pick(this.ads))
    this.popups.push(popup)
    this.updateBadge()
    return popup
  }

  /** 弹窗被移除时注销。 */
  Manager.prototype.forget = function forget(popup, reason) {
    var at = this.popups.indexOf(popup)
    if (at !== -1) this.popups.splice(at, 1)
    if (reason === '用户关闭') this.counters.closed += 1
    this.updateBadge()
  }

  /** 「立即领取」被点:抖一下 + 换一句吐槽,什么也不做(这就是笑点)。 */
  Manager.prototype.onCtaClick = function onCtaClick(popup, button) {
    this.counters.cta += 1
    var lines = ['领取失败', '已为您跳过', '再点一次也一样', '活动已结束', '手速太快了']
    button.textContent = pick(lines)
    popup.el.classList.add('dsh-ad-shake')
    var el = popup.el
    popup.setTimer(function () {
      el.classList.remove('dsh-ad-shake')
      button.textContent = popup.ad.action !== undefined ? popup.ad.action : '立即领取'
    }, 1200)
  }

  /** 有人点了「关闭」但没关掉(计一次挣扎)。 */
  Manager.prototype.onStall = function onStall() {
    this.counters.stalls += 1
    this.flashBadge('广告主不同意…')
  }

  /** 关掉全部弹窗(每个弹窗的 close() 会自己从列表里注销)。 */
  Manager.prototype.closeAll = function closeAll() {
    var list = this.popups.slice()
    for (var i = 0; i < list.length; i++) list[i].close('清空')
    this.updateBadge()
  }

  /** 徽标文案:开着显示投放计数,关着显示「已关闭」并把按钮切成「开启」。 */
  Manager.prototype.updateBadge = function updateBadge() {
    if (this.badgeLabel === undefined) return
    var text = this.enabled ? '虚拟广告 ' + String(this.counters.shown) : '虚拟广告 已关闭'
    if (this.enabled && this.popups.length > 0) text += ' · 在放 ' + String(this.popups.length)
    this.badgeLabel.textContent = text
    if (this.badge) this.badge.classList.toggle('dsh-ad-badge-muted', !this.enabled)
    if (this.badge && this.badgeBtn !== undefined) {
      this.badgeBtn.textContent = this.enabled ? '设置' : '开启'
      this.badgeBtn.title = this.enabled
        ? '打开设置面板'
        : '把总开关打开'
    }
  }

  /** 徽标上闪一句吐槽。 */
  Manager.prototype.flashBadge = function flashBadge(text) {
    if (this.badgeLabel === undefined) return
    var self = this
    this.badgeLabel.textContent = text
    window.setTimeout(function () {
      if (!self.destroyed) self.updateBadge()
    }, 1600)
  }

  /** 卸载:清 DOM、清定时器、撤监听。 */
  Manager.prototype.destroy = function destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.closePanel()
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer)
    if (this.abort !== undefined) {
      try {
        this.abort.abort()
      } catch (error) {
        /* 忽略 */
      }
    }
    var ids = this.scheduleIds
    for (var id of ids) window.clearTimeout(id)
    this.scheduleIds = new Set()
    var list = this.popups.slice()
    for (var j = 0; j < list.length; j++) {
      var el = list[j].el
      if (el.parentNode) el.parentNode.removeChild(el)
    }
    this.popups = []
    if (this.badge !== undefined && this.badge.parentNode) this.badge.parentNode.removeChild(this.badge)
    if (this.styleEl !== undefined && this.styleEl.parentNode) this.styleEl.parentNode.removeChild(this.styleEl)
    window.removeEventListener('keydown', this.onKeyDown, true)
    window.removeEventListener('resize', this.onResize, true)
    // 只有「当前实例就是自己」时才撤标记:否则一个晚到的旧实例销毁,
    // 会把新实例的标记一起抹掉,插件看起来就再也没装上了。
    if (window.__dshAdPopups === this) window.__dshAdPopups = undefined
  }

  // ======================================================================
  // 5. 样式
  // ======================================================================

  var CSS_TEXT = [
    '.dsh-ad-popup{position:fixed;width:268px;box-sizing:border-box;border:2px solid #1b1b1b;',
    'border-radius:10px;overflow:hidden;background:#fff;color:var(--ad-ink);',
    'font:400 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    'box-shadow:0 14px 34px rgba(0,0,0,.34);pointer-events:auto;will-change:transform,opacity}',
    '.dsh-ad-popup.dsh-ad-in{animation:dshAdIn .28s cubic-bezier(.2,1.4,.4,1) both}',
    '.dsh-ad-popup.dsh-ad-out{animation:dshAdOut .17s ease-in both}',
    '@keyframes dshAdIn{from{opacity:0;transform:scale(.86) translateY(14px)}to{opacity:1;transform:none}}',
    '@keyframes dshAdOut{to{opacity:0;transform:scale(.94) translateY(8px)}}',
    '.dsh-ad-bar{display:flex;align-items:center;gap:6px;padding:4px 8px;background:linear-gradient(90deg,var(--ad-from),var(--ad-to));',
    'border-bottom:2px solid #1b1b1b;font-size:11px;font-weight:700;color:var(--ad-ink)}',
    '.dsh-ad-dot{width:8px;height:8px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 2px rgba(0,0,0,.15);flex:none}',
    '.dsh-ad-bartext{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dsh-ad-body{padding:10px 12px 12px;background:linear-gradient(160deg,var(--ad-from),var(--ad-to))}',
    '.dsh-ad-kicker{display:inline-block;padding:1px 7px;border:1.5px solid var(--ad-ink);border-radius:999px;',
    'font-size:10px;font-weight:800;letter-spacing:.06em;background:var(--ad-accent);color:var(--ad-ink)}',
    '.dsh-ad-title{margin:7px 0 5px;font-size:17px;font-weight:800;line-height:1.25;text-shadow:0 1px 0 rgba(255,255,255,.35)}',
    '.dsh-ad-text{font-size:12px;opacity:.92}',
    '.dsh-ad-marquee{margin:8px 0;padding:3px 0;background:#1b1b1b;color:#ffe066;font-size:11px;',
    'white-space:nowrap;overflow:hidden;border-radius:3px}',
    '.dsh-ad-marquee-inner{display:inline-block;padding-left:100%;animation:dshAdMarquee 9s linear infinite}',
    '@keyframes dshAdMarquee{to{transform:translateX(-100%)}}',
    '.dsh-ad-actions{display:flex;gap:8px;margin-top:2px}',
    '.dsh-ad-cta{flex:1;padding:7px 10px;border:2px solid #1b1b1b;border-radius:7px;cursor:pointer;',
    'background:var(--ad-accent);color:var(--ad-ink);font-size:13px;font-weight:800;',
    'box-shadow:0 3px 0 #1b1b1b;animation:dshAdPulse 1.6s ease-in-out infinite}',
    '.dsh-ad-cta:active{transform:translateY(2px);box-shadow:0 1px 0 #1b1b1b}',
    '@keyframes dshAdPulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.18)}}',
    '.dsh-ad-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}',
    '.dsh-ad-disclaimer{font-size:9.5px;opacity:.72;line-height:1.2}',
    '.dsh-ad-close{flex:none;padding:4px 10px;border:2px solid #1b1b1b;border-radius:6px;cursor:pointer;',
    'background:#fff;color:#1b1b1b;font-size:11px;font-weight:700;transition:transform .18s ease,background .15s ease;white-space:nowrap}',
    '.dsh-ad-close:hover{background:#ffe066}',
    '.dsh-ad-shake{animation:dshAdShake .4s ease-in-out}',
    '@keyframes dshAdShake{0%,100%{transform:none}25%{transform:translateX(-4px) rotate(-1deg)}75%{transform:translateX(4px) rotate(1deg)}}',
    '.dsh-ad-nudge{animation:dshAdNudge .42s ease-in-out}',
    '@keyframes dshAdNudge{0%,100%{transform:none}30%{transform:translateY(-3px) scale(1.012)}70%{transform:translateY(2px)}}',
    '.dsh-ad-badge{position:fixed;right:12px;bottom:8px;z-index:9999;display:flex;align-items:center;gap:6px;',
    'padding:3px 6px 3px 9px;border-radius:999px;background:rgba(20,20,20,.72);color:#fff;cursor:pointer;',
    'font:500 11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    'backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:.55;transition:opacity .18s ease}',
    '.dsh-ad-badge:hover{opacity:1}',
    '.dsh-ad-badge-muted{opacity:.35}',
    '.dsh-ad-badge-text{white-space:nowrap}',
    '.dsh-ad-badge-btn{border:none;border-radius:999px;padding:2px 8px;cursor:pointer;background:rgba(255,255,255,.18);',
    'color:#fff;font-size:11px}',
    '.dsh-ad-badge-btn:hover{background:rgba(255,255,255,.32)}',
    // ---- 设置面板(页面内打开,不依赖新窗口) ----
    '.dsh-ad-mask{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;',
    'align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}',
    '.dsh-ad-panel{width:min(680px,100%);max-height:88vh;display:flex;flex-direction:column;',
    'background:#fff;color:#1b1b1b;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;',
    'box-shadow:0 24px 60px rgba(0,0,0,.4);',
    'font:400 13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}',
    '@media (prefers-color-scheme:dark){.dsh-ad-panel{background:#1f1f23;color:#ececf1;border-color:#2e2e33}}',
    '.dsh-ad-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;',
    'padding:12px 16px;border-bottom:1px solid rgba(128,128,128,.25)}',
    '.dsh-ad-panel-title{font-size:15px;font-weight:600}',
    '.dsh-ad-panel-x{border:none;background:transparent;color:inherit;font-size:15px;cursor:pointer;',
    'border-radius:6px;padding:2px 8px;opacity:.7}',
    '.dsh-ad-panel-x:hover{opacity:1;background:rgba(128,128,128,.18)}',
    '.dsh-ad-panel-body{padding:14px 16px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px}',
    '.dsh-ad-note{font-size:12px;opacity:.72;line-height:1.55}',
    '.dsh-ad-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.dsh-ad-row-toggle{cursor:pointer;user-select:none;font-weight:600}',
    '.dsh-ad-panel-status{font-size:12px;opacity:.8;min-height:18px}',
    '@media (max-width:720px){.dsh-ad-popup{width:236px}.dsh-ad-title{font-size:15px}}',
  ].join('')

  // ======================================================================
  // 6. 启动
  // ======================================================================

  function boot() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', boot, { once: true })
      return
    }
    var manager = new Manager()
    // 窗口尺寸变化时把弹窗拉回可视范围,免得飘出屏幕;设置面板不用动(它是居中的)
    manager.onResize = function () {
      for (var i = 0; i < manager.popups.length; i++) manager.popups[i].place()
    }
    window.addEventListener('resize', manager.onResize, true)
    window.__dshAdPopups = manager
    window.__dshAdPopupsVersion = '0.2.0'
  }

  boot()
})()
