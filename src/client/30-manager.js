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
