/**
 * 广告文案文本 ⇄ 素材数组的解析测试(纯函数,不需要 DOM)。
 *
 * 文案是用户在设置页直接编辑的纯文本,格式容错度直接决定体验,所以单独覆盖:
 *   # 注释
 *   角标 | 标题 | 正文 | 跑马灯 | 按钮文字 | 配色
 *
 * 运行:node --test ad-flyer/test/ads.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAdLine,
  parseAdText,
  defaultAdText,
  resolveAdCopy,
  DEFAULT_ADS,
  THEME_NAMES,
  MAX_ADS,
} from '../ads.js'

test('单行解析:完整六列', () => {
  const ad = parseAdLine('限时福利 | 标题在这里 | 正文 | 跑马灯 | 点我 | gold')
  assert.deepEqual(ad, {
    kicker: '限时福利',
    title: '标题在这里',
    body: '正文',
    marquee: '跑马灯',
    action: '点我',
    theme: 'gold',
  })
})

test('单行解析:只给标题也能用', () => {
  const ad = parseAdLine('只有一列标题')
  assert.equal(ad.title, '只有一列标题')
  assert.equal(ad.marquee, '只有一列标题', '跑马灯缺省时用标题兜')
  assert.equal(ad.action, '立即领取')
  assert.equal(ad.theme, 'hot')
  assert.ok(ad.kicker.length > 0, '角标缺省时给个默认值')
})

test('单行解析:可以用 - 表示留空', () => {
  const ad = parseAdLine('角标 | 标题 | - | - | 按钮 | blue')
  assert.equal(ad.body, '')
  assert.equal(ad.marquee, '标题', '跑马灯留空仍回退到标题')
  assert.equal(ad.action, '按钮')
})

test('单行解析:全角竖线也当分隔符(中文输入法很容易打出来)', () => {
  const ad = parseAdLine('角标｜标题｜正文｜跑马灯｜按钮｜green')
  assert.equal(ad.title, '标题')
  assert.equal(ad.theme, 'green')
})

test('单行解析:不认识的配色回退到默认', () => {
  assert.equal(parseAdLine('a | 标题 | b | c | d | 荧光彩虹').theme, 'hot')
  assert.equal(parseAdLine('a | 标题 | b | c | d | GOLD').theme, 'gold', '配色名大小写不敏感')
})

test('单行解析:注释行、空行、没有标题的行都跳过', () => {
  assert.equal(parseAdLine('# 这是注释'), undefined)
  assert.equal(parseAdLine('   '), undefined)
  assert.equal(parseAdLine(''), undefined)
  assert.equal(parseAdLine('|'), undefined, '只有分隔符等于没有标题')
})

test('整段解析:注释与空行被忽略,顺序保持', () => {
  const text = [
    '# 我的广告单',
    '',
    '甲 | 第一条 | 正文甲 | 跑马甲 | 按钮甲 | hot',
    '   ',
    '# 中间这条注释也要忽略',
    '乙 | 第二条 | 正文乙 | 跑马乙 | 按钮乙 | blue',
  ].join('\n')
  const ads = parseAdText(text)
  assert.equal(ads.length, 2)
  assert.equal(ads[0].title, '第一条')
  assert.equal(ads[1].title, '第二条')
})

test('整段解析:条目数有上限', () => {
  const lines = []
  for (let i = 0; i < MAX_ADS + 20; i++) lines.push('角标 | 标题' + String(i))
  const ads = parseAdText(lines.join('\n'))
  assert.equal(ads.length, MAX_ADS, '超过上限的部分被丢弃')
})

test('整段解析:一条都没有时返回空数组(交给上层回退)', () => {
  assert.deepEqual(parseAdText(''), [])
  assert.deepEqual(parseAdText('# 只有注释\n\n   '), [])
  assert.deepEqual(parseAdText(undefined), [])
})

test('内置默认文案本身是合法的,且条数不少于 10', () => {
  const ads = parseAdText(defaultAdText())
  assert.equal(ads.length, DEFAULT_ADS.length)
  assert.ok(ads.length >= 10, '默认素材要有一定数量,不然很快重复')
  for (const ad of ads) {
    assert.ok(ad.title.length > 0, '每条都要有标题')
    assert.ok(THEME_NAMES.includes(ad.theme), '配色必须是已知主题:' + ad.theme)
    assert.ok(ad.marquee.length > 0, '每条都要有跑马灯(缺省也会回退到标题)')
  }
})

test('往返:内置文本 → 素材 → 文本 → 素材 稳定不丢字段', () => {
  const original = parseAdText(defaultAdText())
  // 面板编辑保存时就是把素材重新拼成 `a | b | c | …` 这种行
  const rebuilt = original
    .map((ad) => [ad.kicker, ad.title, ad.body, ad.marquee, ad.action, ad.theme].join(' | '))
    .join('\n')
  const roundTrip = parseAdText(rebuilt)
  assert.deepEqual(roundTrip, original, '拼行 → 解析 应当稳定')
})

test('空输入回退到内置默认', () => {
  const fallback = resolveAdCopy('')
  assert.equal(fallback.usedFallback, true)
  assert.equal(fallback.ads.length, DEFAULT_ADS.length)
})

test('resolveAdCopy:有内容就用它,没内容回退默认并标记', () => {
  const custom = resolveAdCopy('角标 | 自定义标题')
  assert.equal(custom.usedFallback, false)
  assert.equal(custom.ads.length, 1)

  const empty = resolveAdCopy('   \n# 啥也没有\n')
  assert.equal(empty.usedFallback, true)
  assert.equal(empty.ads.length, DEFAULT_ADS.length)

  const garbage = resolveAdCopy('这不是一条广告,只是随便写的一句话')
  // 单列文本是合法的(那一列当标题),所以这不算回退
  assert.equal(garbage.usedFallback, false)
  assert.equal(garbage.ads[0].title, '这不是一条广告,只是随便写的一句话')
})

test('字段长度被裁剪,不会撑爆弹窗', () => {
  const long = 'x'.repeat(500)
  const ad = parseAdLine('角标 | ' + long + ' | ' + long)
  assert.ok(ad.title.length <= 80, '标题应被裁到 80 字以内,实际 ' + ad.title.length)
  assert.ok(ad.body.length <= 240, '正文应被裁到 240 字以内,实际 ' + ad.body.length)
})
