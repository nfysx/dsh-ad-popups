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
