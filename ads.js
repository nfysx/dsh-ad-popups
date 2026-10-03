/**
 * dsh-ad-popups —— 虚构广告素材与「文案文本」的双向转换。
 *
 * 文案存在设置页的文本框里,一行一条广告,字段用 `|` 分隔:
 *
 *   # 以 # 开头是注释,空行忽略
 *   角标 | 标题 | 正文 | 跑马灯 | 按钮文字 | 配色
 *
 * 例:
 *   限时福利 | 恭喜!您是第 1 位访客 | 本页面只有您一个人看… | 第 1 位访客 · 还是第 1 位 | 立即领取 | hot
 *
 * 只有「标题」是必需的;其余字段缺省时按位置依次补上(正文可用 `-` 占位表示留空)。
 * 配色取 THEME_NAMES 之一,不认识就回退到 hot。
 *
 * 这个模块是纯函数(不碰 fs / DOM),所以宿主半边、设置页和自测都能直接用。
 * 全部文案均为原创恶搞,**不构成任何广告宣传**。
 */

/** 可选的配色名(与 client.js 的 THEMES 一一对应)。 */
export const THEME_NAMES = ['hot', 'warn', 'blue', 'gold', 'tech', 'pink', 'purple', 'green']

/** 默认配色。 */
export const DEFAULT_THEME = 'hot'

/** 文案行最多这么多条(防止设置页塞进来无限多条)。 */
export const MAX_ADS = 60

/** 单条字段的长度上限(标题另有一条更短的)。 */
export const MAX_FIELD_CHARS = 240

/** 标题的长度上限(标题是弹窗里最显眼的一行,太长会撑破版面)。 */
export const MAX_TITLE_CHARS = 80

/** 内置默认文案(用户没改过时用它)。 */
export const DEFAULT_ADS = [
  ['限时福利', '恭喜!您是第 114514 位访客', '本页面只有您一个人看,所以恭喜您成为第 114514 位访客。奖品是这句话本身。', '第 1 位访客 · 第 2 位访客 · 最后一位访客', '立即领取', 'hot'],
  ['系统提示', '检测到您的电脑有 1 个 CPU', '这可能严重影响……没什么影响。但清理一下会显得更专业。', '1 个 CPU · 严重超标 · 建议立即清理', '立即清理', 'warn'],
  ['附近的人', '附近有 8 个模型想和您聊天', '距离最近的一个是 0 毫秒 —— 因为就是现在正在回您话的这个。', '8 位在线 · 距离 0 米 · 缘分已至', '开始聊天', 'blue'],
  ['理财专区', '月入三万的秘诀,只差一个按钮', '秘诀是:不要相信写着「月入三万的秘诀只差一个按钮」的广告。', '稳赚不赔 · 收益率 999% · 风险自负', '查看秘诀', 'gold'],
  ['本地计算', '您的网络被限速了 0.1%', '本地检测到潜在的网络波动,建议立即打开一个并不存在的加速器。', '限速 0.1% · 本地检测 · 立即加速', '一键加速', 'tech'],
  ['登录礼包', '连续打卡 1 天,送绝版皮肤', '是的,今天就是第 1 天。坚持一年就有 365 个绝版皮肤了。', '打卡 1 天 · 绝版皮肤 · 手慢无', '立即打卡', 'pink'],
  ['AI 算命', 'AI 算出您今天会在网页上点关闭', '准得离谱。您接下来要点的那个按钮,我都已经知道是哪个了。', '大师在线 · 一次神算 · 不许不信', '免费算命', 'purple'],
  ['库存告急', '最后 9999 件,已售 0 件', '库存确实很紧张,紧张到我们也不知道到底在卖什么。', '仅剩 9999 件 · 已售 0 件 · 快抢', '立即抢购', 'hot'],
  ['邀请有礼', '邀请 1 位好友,双方各得 0 元', '0 元也是钱。四舍五入就是一个亿,再四舍五入就是没有。', '邀好友 · 得 0 元 · 人人有份', '立即邀请', 'green'],
  ['会议邀请', '一个不需要您的会议正在等您', '主持人已开启摄像头,正在等一位永远不会入会的人。', '会议号 000-000-000 · 无需入会 · 准时开始', '加入会议', 'blue'],
  ['重要通知', '您的浏览器需要更新到 0.0.1 版', '本次更新内容:把版本号从 0.0.0 改成 0.0.1。', '安全更新 · 强烈建议 · 更新即正义', '立即更新', 'warn'],
  ['会员中心', '尊贵的普通用户,您有一份特权', '特权是可以像会员一样点一下这个按钮,然后什么也不会发生。', '尊贵身份 · 专属特权 · 仅限本人', '领取特权', 'gold'],
  ['健康提醒', '您已经盯着屏幕 3 秒了', '建议远眺 20 米,看看窗外 —— 如果窗外也有一堆弹窗,请忽略本条建议。', '护眼模式 · 20-20-20 法则 · 现在就开始', '开启护眼', 'green'],
  ['本地商店', '附近 0 家店铺正在打折', '折扣力度空前:全场 0 折,前提是全场不存在。', '0 家店铺 · 0 折起 · 先到先得', '查看店铺', 'pink'],
  ['投票活动', '请为「正在思考」投上一票', '当前票数:1 票(由本插件自己投出)。感谢您的参与。', '投票进行中 · 已有 1 票 · 就差您了', '投一票', 'purple'],
  ['温馨提示', '本弹窗是一个玩笑', '它不会卖给您任何东西,也没有任何按钮会真的带您去哪里 —— 除了这个关闭键。', '纯属虚构 · 娱乐插件 · 可随时关闭', '我知道了', 'tech'],
]

/**
 * 把字段裁到合理长度(按字符数)。
 * @param {unknown} value - 原始值。
 * @param {number} limit - 上限。
 * @returns {string} 裁好的字符串。
 */
function clip(value, limit = MAX_FIELD_CHARS) {
  const text = String(value ?? '').trim()
  return text.length <= limit ? text : text.slice(0, limit)
}

/**
 * 一行文本 → 一条广告素材。
 * @param {string} line - 一行文案。
 * @param {number} index - 行号(只用于兜底标题)。
 * @returns {{kicker:string,title:string,body:string,marquee:string,action:string,theme:string}|undefined}
 *   解析失败(没有标题)时返回 undefined。
 */
export function parseAdLine(line, index = 0) {
  const raw = String(line ?? '').trim()
  if (raw === '') return undefined
  if (raw.startsWith('#')) return undefined

  // 用 `|` 切列;顺带把统一的全角竖线也当成分隔符(中文输入法很容易打出来)
  const parts = raw.split(/[|｜]/).map(part => part.trim())
  const title = clip(parts[1], MAX_TITLE_CHARS) || clip(parts[0], MAX_TITLE_CHARS)
  if (title === '') return undefined

  // 只给了一列:那一列就是标题,其余按默认补
  const hasKicker = parts.length > 1
  const pick = (at) => (parts[at] === undefined || parts[at] === '-' ? '' : clip(parts[at]))
  const themeRaw = clip(parts[5] ?? '', 16).toLowerCase()

  return {
    kicker: hasKicker ? pick(0) : '免责声明',
    title,
    body: pick(2),
    marquee: pick(3) || title,
    action: pick(4) || '立即领取',
    theme: THEME_NAMES.includes(themeRaw) ? themeRaw : DEFAULT_THEME,
  }
}

/**
 * 解析整段文案文本。
 * @param {string} text - 设置页里的多行文本。
 * @returns {Array<object>} 广告素材数组;没有一行有效时返回空数组。
 */
export function parseAdText(text) {
  const out = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length && out.length < MAX_ADS; i++) {
    const ad = parseAdLine(lines[i], i)
    if (ad !== undefined) out.push(ad)
  }
  return out
}

/**
 * 内置默认文案的文本形式。
 *
 * 这是「出厂设置」:设置面板里的「恢复内置文案」按钮、以及设置文件里还没有 adText 时,
 * 都用它。用户改过的文案存在 `$DSH_HOME/dsh-ad-popups.json` 的 adText 字段里。
 * @returns {string} 每行一条的文案文本。
 */
export function defaultAdText() {
  return DEFAULT_ADS.map(row => row.join(' | ')).join('\n')
}

/**
 * 规范化一段文案文本:能解析出至少一条就用它,否则回退到内置默认。
 * @param {unknown} text - 设置页存的文本。
 * @returns {{ads: Array<object>, usedFallback: boolean}}
 */
export function resolveAdCopy(text) {
  const ads = parseAdText(text)
  if (ads.length > 0) return { ads, usedFallback: false }
  return { ads: parseAdText(defaultAdText()), usedFallback: true }
}
