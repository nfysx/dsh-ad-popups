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
