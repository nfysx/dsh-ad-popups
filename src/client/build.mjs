/**
 * 构建浏览器半边:把 `src/client/*.js` 拼接成 `client.js`。
 *
 * ## 为什么需要拼接
 *
 * 浏览器半边是**注入进宿主页面的普通脚本**(`<script defer src="/dsh-ad-popups/client.js">`),
 * 它不能 `import`,也没有第三方可用的 bundle 契约。所以:开发时拆成易读的模块,
 * 发布时拼成一个自包含的 IIFE —— 这个脚本就是那道桥。
 *
 * ## 规则(刻意保持极简:没有 AST、没有依赖图)
 *
 *   1. 按 {@link MODULES} 的固定顺序读取源文件,去掉 `import` 行与行首 `export `,
 *      依次拼进 IIFE 内;
 *   2. 模块之间靠**函数声明提升 + 执行顺序**协作(与拆分之上的 client.js 完全一致);
 *   3. 产物带生成头,列出各源文件的 sha256 前缀,便于确认线上跑的是哪次构建;
 *   4. 构建前做两项漂移校验:
 *      · 结构校验:关键符号(parseAdText / AD_FIELD_KEYS …)确实进了产物;
 *      · **行为校验**:`ads.js` 与 `src/client/format.js` 必须对同一批输入给出
 *        完全相同的解析结果 —— 它们是同一份逻辑的两个副本(宿主 import 前者,
 *        浏览器内联后者),只靠人肉同步迟早会漂移,所以用行为比对钉死。
 *
 * ## 用法
 *
 *   node src/client/build.mjs            # 生成 client.js
 *   node src/client/build.mjs --check    # 只检查产物是否与源同步(CI 用)
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const OUT = join(root, 'client.js')

const checkOnly = process.argv.includes('--check')

/** 拼接顺序:格式 → 常量 → 工具 → 弹窗 → 管理器 → 面板 → 其余方法 → 样式 → 启动。 */
const MODULES = [
  'src/client/format.js',
  'src/client/00-header.js',
  'src/client/10-util.js',
  'src/client/20-popup.js',
  'src/client/30-manager.js',
  'src/client/40-panel.js',
  'src/client/41-panel-rest.js',
  'src/client/50-manager-rest.js',
  'src/client/60-styles.js',
  'src/client/70-boot.js',
]

/** 产物里必须出现的符号 —— 少一个就说明某个源文件没被拼进去。 */
const REQUIRED_SYMBOLS = [
  'function parseAdText(',
  'function stringifyAdLine(',
  'var AD_FIELD_KEYS = [',
  'var MAX_AD_ROWS = 60',
  'function Manager(',
  'function Popup(',
  'var CSS_TEXT = [',
  'function boot(',
  'window.__dshAdPopups',
]

/** 只做结构替换、不碰语义的两类行。 */
const IMPORT_RE = /^\s*import\s.+from\s+['"].+['"]\s*$|^\s*import\s+['"].+['"]\s*$/
const EXPORT_RE = /^export\s+(?=(?:function|const|let|var|class)\b)/gm

/** 读源文件并记录它的 sha256 前缀。 */
function read(rel) {
  const text = readFileSync(join(root, rel), 'utf8')
  return { rel, text, hash: createHash('sha256').update(text).digest('hex').slice(0, 12) }
}

/** 去掉 import 行与行首 export。 */
function normalize(text) {
  return text
    .split('\n')
    .filter((line) => !IMPORT_RE.test(line))
    .join('\n')
    .replace(EXPORT_RE, '')
    .replace(/\n+$/, '')
}

/** 取顶层声明的名字,用于检查「format.js 内联进 client.js」有没有重名。 */
function topLevelNames(text) {
  const names = []
  const re = /^(?:export\s+)?(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/gm
  let match
  while ((match = re.exec(text)) !== null) names.push(match[1])
  return names
}

/** 失败即退出(构建脚本里失败是终态)。 */
function fail(message) {
  console.error('✗ ' + message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. 读取与拼接
// ---------------------------------------------------------------------------

const sources = MODULES.map(read)
const body = sources.map(({ text }) => normalize(text)).join('\n\n')

const banner = [
  '/*',
  ' * dsh-ad-popups —— 浏览器半边(构建产物)**请勿直接编辑**',
  ' *',
  ' * 由 `node src/client/build.mjs` 从 src/client/*.js 生成,拼接顺序见该脚本的 MODULES。',
  ' * 源文件里写清了每条设计取舍;注入契约(client bundle 不可用)也写在那里的文件头。',
  ' *',
  ' * 源文件 sha256(前 12 位):',
  ...sources.map(({ rel, hash }) => ` *   ${hash}  ${rel}`),
  ' */',
].join('\n')

const output = banner + '\n' + body + '\n'

// ---------------------------------------------------------------------------
// 2. 结构校验
// ---------------------------------------------------------------------------

for (const symbol of REQUIRED_SYMBOLS) {
  if (!output.includes(symbol)) fail('产物里缺少 ' + JSON.stringify(symbol) + ',检查 MODULES 是否漏了源文件')
}

// ---------------------------------------------------------------------------
// 3. 行为校验:内联的解析逻辑 与 ads.js 必须完全一致
// ---------------------------------------------------------------------------

const formatSource = sources[0].text
// 求值用的副本要去掉 export —— new Function 只接受脚本正文,不认 ESM 语法。
// 整份 format.js 直接求值,再取出需要的成员:这样不必去解析它的文本结构。
const formatEval = normalize(formatSource)
const { parseAdText: clientParse, stringifyAdLine: clientStringifyLine, MAX_AD_ROWS: clientMaxAdRows } =
  // eslint-disable-next-line no-new-func -- 把内联副本原样跑起来,与宿主那侧做行为比对
  new Function(formatEval + '\nreturn { parseAdText: parseAdText, stringifyAdLine: stringifyAdLine, MAX_AD_ROWS: MAX_AD_ROWS }')()
if (typeof clientParse !== 'function' || typeof clientStringifyLine !== 'function') {
  fail('src/client/format.js 里没有 parseAdText / stringifyAdLine')
}

const { parseAdText: hostParse, defaultAdText: hostDefaultAdText, MAX_ADS: hostMaxAds } =
  await import(new URL('../../ads.js', import.meta.url).href)

// 上限必须一致:宿主侧 MAX_ADS 与浏览器侧 MAX_AD_ROWS 是同一个约定的两个名字
if (hostMaxAds !== clientMaxAdRows) {
  fail('条数上限不一致:ads.js 的 MAX_ADS=' + String(hostMaxAds) + ',format.js 的 MAX_AD_ROWS=' + String(clientMaxAdRows))
}

// 内联后不能和 client.js 自己的顶层声明重名,否则会静默覆盖
{
  const formatNames = new Set(topLevelNames(formatEval))
  const clientNames = []
  for (const source of sources.slice(1)) clientNames.push(...topLevelNames(normalize(source.text)))
  const collisions = clientNames.filter((name) => formatNames.has(name))
  if (collisions.length > 0) {
    fail('format.js 与 client.js 的声明重名:' + collisions.join(', ') + ' —— 内联后会互相覆盖')
  }
}

/** 覆盖各种边角写法的样例:足够把两份实现钉在一起。 */
const SAMPLES = [
  '',
  '   ',
  '# 只有注释\n\n   ',
  '角标 | 标题 | 正文 | 跑马灯 | 按钮 | hot',
  '角标|标题|正文|跑马灯|按钮|blue',
  '角标｜标题｜正文｜跑马灯｜按钮｜green',
  '只有一列标题',
  '角标 | 标题',
  '角标 | 标题 | - | - | 按钮 | gold',
  '|',
  'a | 标题 | b | c | d | 荧光彩虹',
  'a | 标题 | b | c | d | WARN',
  '  前有空格 | 标题也带空格   ',
  '# 注释\n第一条 | 标题一\n\n第二条 | 标题二 | 正文二 | 跑马二 | 按钮二 | pink',
  'x | ' + 'y'.repeat(500) + ' | ' + 'z'.repeat(500),
  Array.from({ length: 70 }, (_, i) => '角标 | 标题' + String(i)).join('\n'),
]

for (const sample of SAMPLES) {
  const host = JSON.stringify(hostParse(sample))
  const client = JSON.stringify(clientParse(sample))
  if (host !== client) {
    fail('ads.js 与 src/client/format.js 的行为已经漂移(同一输入不同输出)\n'
      + '  输入: ' + JSON.stringify(sample.slice(0, 80)) + '\n'
      + '  ads.js: ' + host.slice(0, 200) + '\n'
      + '  format.js: ' + client.slice(0, 200) + '\n'
      + '  修法:把同一处改动同步到另一个文件,或直接 `copy src\\client\\format.js ads.js`(注意保留 ads.js 的 ESM 导出)')
  }
}

// 拼行那一半同样要比:浏览器侧拼出来的文本,交给宿主侧解析后必须与原素材完全相同
{
  const ads = hostParse(hostDefaultAdText())
  const clientText = ads.map((ad) => clientStringifyLine(ad)).join('\n')
  const reparsed = JSON.stringify(hostParse(clientText))
  const original = JSON.stringify(ads)
  if (reparsed !== original) {
    fail('format.js 的 stringifyAdLine 与 ads.js 的解析不闭合(拼出的文本解析回来不一致)\n'
      + '  原始: ' + original.slice(0, 200) + '\n'
      + '  往返: ' + reparsed.slice(0, 200))
  }
}

// ---------------------------------------------------------------------------
// 4. 写入 / 检查
// ---------------------------------------------------------------------------

if (checkOnly) {
  let existing = ''
  try {
    existing = readFileSync(OUT, 'utf8')
  } catch {
    fail('client.js 不存在,请先运行 node src/client/build.mjs')
  }
  if (existing !== output) fail('client.js 与源文件不同步,请运行 node src/client/build.mjs 重新生成')
  console.log('✓ client.js 与源文件一致(' + String(output.length) + ' 字节)')
  process.exit(0)
}

writeFileSync(OUT, output, 'utf8')
console.log('已生成 client.js:' + String(output.length) + ' 字节,来自 ' + String(sources.length) + ' 个源文件')
for (const { rel, hash } of sources) console.log('  ' + hash + '  ' + rel)
