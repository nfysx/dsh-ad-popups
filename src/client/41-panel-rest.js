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

