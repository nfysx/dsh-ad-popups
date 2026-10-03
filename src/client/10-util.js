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
