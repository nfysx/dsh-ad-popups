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
export var MAX_AD_ROWS = 60

/** 单条字段与标题的长度上限(与 ads.js 的同名常量必须一致)。 */
export var MAX_FIELD_CHARS = 240
export var MAX_TITLE_CHARS = 80

/** 每行广告的字段顺序(表单化编辑与拼行都用它)。 */
export var AD_FIELD_KEYS = ['kicker', 'title', 'body', 'marquee', 'action', 'theme']

/** 配色下拉的选项(与 ads.js 的 THEME_NAMES 对齐)。 */
export var THEME_OPTIONS = ['hot', 'warn', 'blue', 'gold', 'tech', 'pink', 'purple', 'green']

/**
 * 把字段裁到合理长度(按字符数)。
 * @param {unknown} value - 原始值。
 * @param {number} limit - 上限。
 * @returns {string} 裁好的字符串。
 */
export function clipField(value, limit) {
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
export function readControl(control, fallback) {
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
export function writeControl(control, value) {
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
export function parseAdText(text) {
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
export function stringifyAdLine(ad) {
  var out = []
  for (var i = 0; i < AD_FIELD_KEYS.length; i++) {
    var value = ad !== null && ad !== undefined ? ad[AD_FIELD_KEYS[i]] : undefined
    out.push(value === undefined || value === null ? '' : String(value))
  }
  return out.join(' | ')
}
