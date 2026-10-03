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

