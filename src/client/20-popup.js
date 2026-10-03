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
