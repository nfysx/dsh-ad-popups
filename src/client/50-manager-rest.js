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
