# dsh-ad-popups · 思考期虚拟广告弹窗

> 给 [DeepSeek Harness](https://github.com/deepseek-ai) 的娱乐插件:模型正在思考、回答还没出来时,
> 主界面会飘出一堆**一眼就是假的**广告弹窗,把干等的那几秒变成笑点。

**⚠️ 全部内容纯属虚构恶搞,不构成任何广告宣传。** 插件不跳转任何外链、不收集任何数据、
不带任何真实品牌或商品;每个弹窗都常驻「本广告纯属虚构 · 不构成任何宣传」的标注。

```
┌───────────────────────────┐   ┌───────────────────────────┐
│ ● DS广告联盟 · 弹窗 1      │   │ ● DS广告联盟 · 弹窗 2      │
│                           │   │                           │
│ ╭──────────╮              │   │ ╭──────────╮              │
│ │ 限时福利  │              │   │ │ 系统提示  │              │
│ ╰──────────╯              │   │ ╰──────────╯              │
│ 恭喜!您是第 1 位访客      │   │ 检测到您的电脑有 1 个 CPU │
│ 本页面只有您一个人看…     │   │ 这可能严重影响……没什么影响 │
│ ▓▓ 第 1 位访客 · 还是 ▓▓   │   │ ▓▓ 1 个 CPU · 严重超标 ▓▓  │
│ ┌───────────────────────┐ │   │ ┌───────────────────────┐ │
│ │       立即领取         │ │   │ │       立即清理         │ │
│ └───────────────────────┘ │   │ └───────────────────────┘ │
│ 本广告纯属虚构    [关闭]  │   │ 本广告纯属虚构    [关闭]  │
└───────────────────────────┘   └───────────────────────────┘
```

## 特性

- **只在模型思考时出现**:走宿主的事件流判断「有没有会话在跑」,空闲 8 秒自动收摊,
  答完了不会还飘着广告。
- **文案完全由你写**:设置面板里逐条编辑(角标 / 标题 / 正文 / 跑马灯 / 按钮 / 配色),
  也能整段粘贴;保存后 0.6 秒内生效,**不用重启、不用刷新页面**。
- **一眼假的喜剧细节**:假窗口标题栏带红点、渐变底、跑马灯、闪烁的「立即领取」;
  点「关闭」会先挣扎 1–3 次(「广告主不同意」「再考虑一下?」)才真的关掉;
  点「立即领取」只会抖一下并换一句吐槽,什么也不会发生。
- **关得掉,而且回得来**:单个关闭、连按 3 次 `Esc` 清屏、设置里的总开关。
  总开关关掉后弹窗停止,但右下角徽标留在原地变成「开启」,点一下就回来。
- **跟随宿主主题**:面板颜色读宿主自己的主题变量,深浅色主题与换肤都自动跟上。
- **零网络外发**:除同源状态/设置接口外不发任何请求;写设置只接受本机回环请求。

## 安装

本插件是一个标准的 DSH 插件包(宿主半边 + 注入式浏览器半边)。

**从源码安装的开发者**:仓库里已经带了构建产物 `client.js`,直接安装即可;
改过 `src/` 之后记得重新构建:

```bash
npm run build          # 由 src/client/*.js 生成 client.js
npm test               # 先校验产物是否与源同步,再跑全部用例
```

### 1) 命令行(web 等普通 profile)

```bash
dsh plugin --profile <profile> add link:<本目录绝对路径>
# 例:dsh plugin --profile web add link:D:\path\to\dsh-ad-popups
```

### 2) 桌面端(Electron,desktop profile)

desktop profile 由应用独占管理,命令行 `dsh plugin` 会被拒绝。走应用内的
**设置 → 插件管理**,以本地目录安装本目录;或者手工两步:

1. 把本目录放(或软链)到 `<profile>/node_modules/dsh-ad-popups`;
2. 在 `<profile>/cordis.patch.yml` 里加一行:

   ```yaml
   - insert:
       - id: dsh-ad-popups
         name: dsh-ad-popups
   ```

> **生效时机**:宿主半边在安装时会热挂载;**注入**发生在 index.html 被响应的时候,
> 所以装完后要**完整刷新页面或重启应用**。桌面端首次安装请重启一次
> (注入行是宿主启动时一次性收集的)。

确认装好了:

- `GET http://127.0.0.1:<端口>/dsh-ad-popups/client.js` → 200(404 = 没挂上);
- `GET http://127.0.0.1:<端口>/dsh-ad-popups/settings` → 200(插件自带的设置页面)。

`/api/dsh-ad-popups/*` 要带浏览器会话 cookie,用 curl 直接访问会得到 401 ——
那是连接层的正常门槛,不是插件的问题。

## 使用

模型一开始思考,弹窗就自己飘出来了。想调整就点右下角「虚拟广告」徽标:

| 操作 | 结果 |
| --- | --- |
| 点徽标上的 **设置** | 页面内弹出设置面板 |
| 点弹窗上的 **关闭** | 挣扎 1–3 次后关掉这一个 |
| **0.6 秒内连按 3 次 `Esc`** | 清空眼前所有弹窗(不改总开关) |
| 面板里 **总开关** | 彻底停止投放;徽标按钮变成「开启」 |
| 面板里 **− / ＋** | 调「同时最多显示几个」,每次一格(1-8) |
| 面板里 **保存 / Ctrl+S** | 写回宿主,下一个弹窗就用新文案 |

设置面板里的文案是**表单化编辑**:每条广告一组输入框,带上移 / 下移 / 复制 / 删除与
「＋ 新增一条」;底部「高级:批量文本」可以整段粘贴或导出备份。

面板里的开关与上限都是**自绘控件**(开关是一颗滑块,上限是两个步进按钮 + 只读数字),
不走原生 checkbox / number 输入框的默认行为 —— 这样不会因为宿主的全局样式或事件干预
而出现「点了、敲了但没反应」。

### 文案格式(批量文本 / 设置文件里的存储格式)

```
# 以 # 开头是注释,空行忽略
角标 | 标题 | 正文 | 跑马灯 | 按钮文字 | 配色
```

- 只有 **标题** 是必需的;只写一列也能用,其余字段缺省时自动补。
- 正文想留空写 `-`;全角竖线 `｜` 也认(中文输入法很容易打出来)。
- 配色可选:`hot` / `warn` / `blue` / `gold` / `tech` / `pink` / `purple` / `green`。
- 最多 60 条。

想看现成的 16 条内置文案,直接打开设置面板,或看 [`ads.js`](./ads.js) 里的 `DEFAULT_ADS`。

## 配置

优先级:**设置文件 > 插件 Config > 内置默认**。

### 设置文件

```
$DSH_HOME/dsh-ad-popups.json     # Windows 默认:C:\Users\<你>\.dsh\dsh-ad-popups.json
```

```json
{
  "enabled": true,
  "maxPopups": 4,
  "adText": "限时福利 | 恭喜!您是第 1 位访客 | … | 立即领取 | hot\n第二条 | …"
}
```

宿主每次请求都重新读这个文件,所以**改完存盘约 0.6 秒生效**,不用重启
(手工编辑时注意 `adText` 里的换行必须写成转义的 `\n`,所以更推荐用设置面板改)。

### 插件 Config(profile patch 层)

```yaml
- id: dsh-ad-popups
  name: "dsh-ad-popups"
  config:
    enabled: true     # false = 不投放广告(脚本仍注入,徽标留在原地供重新开启)
    maxPopups: 4      # 同时在屏的弹窗上限,1-8
```

### HTTP 接口

```bash
curl -X POST http://127.0.0.1:<端口>/api/dsh-ad-popups/settings \
  -H 'content-type: application/json' \
  -d '{"enabled":true,"maxPopups":4}'
```

写接口只接受**本机回环**请求(Host 必须是回环地址;带 `Origin` 时必须与 Host 同源),
请求体上限 512 KiB,超限回 413。

## 工作原理

```
                       ┌────────────────────── 宿主半边 index.js ─────────────────────┐
 模型开始思考  ──▶  agent/assistant-stream(流式,长回答唯一高频信号)                  │
                    api-session/status(官方权威) · session/event(turn/start|end)     │
                    agent/status(兜底) · session/disposed                            │
                       │  维护「哪些会话还在跑」,空闲 8 秒落回空闲                    │
                       ▼                                                             │
                    GET  /api/dsh-ad-popups/state    → { thinking, sessions[], ads, … }│
                    GET  /api/dsh-ad-popups/settings → 读设置与文案                   │
                    POST /api/dsh-ad-popups/settings → 写 $DSH_HOME/dsh-ad-popups.json│
                    GET  /dsh-ad-popups/settings     → 独立设置页(自带 HTML)         │
                    GET  /dsh-ad-popups/client.js    → 浏览器半边脚本                 │
                    tapIndex + webserver/index-inject → 两条注入通道(浏览器 / 桌面)  │
                       └─────────────────────────────────────────────────────────────┘
                                            │
                       ┌──────────────────── 浏览器半边 client.js ───────────────────┐
                       每 600ms 拉一次状态 + 素材                                       │
                       发现新的一轮思考 → 错落投放 2-4 个虚构弹窗(避开输入区、互不重叠)│
                       挣扎式关闭 · 3×Esc 清屏 · 右下角徽标(设置 / 开启)              │
                       └─────────────────────────────────────────────────────────────┘
```

为什么这么设计(几条是被实测逼出来的):

- **不猜 DOM、只信事件**:靠「有没有停止按钮」之类的 DOM 特征很脆。这里用四路事件互补:
  流式帧负责长回答期间的高频保活,`turn/start|end` 负责回合边界,`api-session/status`
  是官方权威信号,`agent/status` 兜底。任何一路活着都能工作。
- **空闲窗口 8 秒**:流式期间信号很密,但「想一下再吐」「跑个慢工具」的停顿偶尔超过几秒;
  窗口太小会让广告在回答中途断掉(最初 2.5 秒的实现就是这样)。客户端另用
  「间隔超过 15 秒才算新一轮」,所以中途短暂空闲不会重复投放。
- **两条注入通道**:浏览器版的 index.html 由宿主渲染(`tapIndex` 生效);桌面端的
  index.html 是安装包里的静态 dist 经 `dsh-app://` 读盘,**永远不经过宿主渲染**,
  只认 `webserver/index-inject` 的结构化行。少挂一条,就会有一端完全没有弹窗。
- **浏览器半边用原生 DOM**:第三方客户端 bundle 需要完整构建链与打包契约;原生脚本
  (`<script defer>`)最稳,也不会在宿主流式渲染时被反复重建。
- **设置面板挂在 `documentElement`、每个控件自己绑 handler**:面板不能用点击委托
  (冒泡链可能被别的插件的全局捕获监听掐断),`body` 也可能被宿主放进 transform 容器
  导致 `position:fixed` 算错位置。

## 安全边界

| 项 | 结论 |
| --- | --- |
| 外链 / 跳转 | 无。素材与界面里没有 `<a>`、没有 `href`、没有内联 `onclick` |
| 外发数据 | 无。浏览器半边只 `fetch` 同源状态/设置接口;响应里只有会话 id、耗时、配置、文案 |
| 写设置的门槛 | 只接受回环 Host,`Origin` 必须同源,请求体上限 512 KiB(超限 413) |
| 权限 | 不注册工具、不读用户文件、不执行子进程;只写 `$DSH_HOME/dsh-ad-popups.json` |
| 可关闭性 | 单窗关闭、3×Esc 清屏、总开关;总开关关闭后仍保留开启入口 |

## 自测与构建

```bash
npm run build     # 生成 client.js(由 src/client/*.js 拼接)
npm run check:build   # 只检查 client.js 是否与源同步(CI 用)
npm test          # = check:build && node --test --test-concurrency=1 "test/*.test.mjs"
```

**57 条用例,零依赖**(只用 Node 内置的 `node:test`),分四层:

| 文件 | 覆盖 |
| --- | --- |
| `test/ads.test.mjs` | 文案解析:六列 / 单列 / 占位符 / 全角竖线 / 未知配色 / 注释与空行 / 条数上限 / 往返稳定 / 字段裁剪 |
| `test/host.test.mjs` | 四条路由的注册与注销、设置页内容、双通道注入(含幂等)、四路状态信号(含**流式保活**回归)、turn/end 回落、Config 的 Standard Schema 校验、设置文件优先级、回环/同源把关、413/400/405 |
| `test/client.test.mjs` | 最小 DOM 桩里真跑浏览器半边:投放、只留关闭键、自绘开关与上限步进器(含 1/8 边界)、表单增删、保存回写、失败退避、destroy 清理、关闭态徽标一键开启 |
| `test/integration.test.mjs` | 真 `node:http` + 真 `fetch` 跑通整条 HTTP 链路(改文案立刻生效、非法文案被拒、恢复默认) |

`test/client.test.mjs` 里的 DOM 桩实现了**真实的事件传播**(捕获 → 目标 → 冒泡 + `stopPropagation`),
所以「监听器根本没被触发」这类 bug 会被测出来,而不是被绕过去。

### 构建链为什么长这样

浏览器半边是**注入进宿主的普通脚本**(`<script defer src="/dsh-ad-popups/client.js">`),
它不能 `import`,也没有第三方可用的客户端 bundle 契约 —— 所以开发时拆成
`src/client/*.js` 便于阅读,发布时由 [`src/client/build.mjs`](./src/client/build.mjs)
拼成一个自包含的 IIFE。构建脚本只做三件事:

1. 按固定顺序拼接模块,去掉 `import` 行与行首 `export `;
2. 产物顶部写入各源文件的 sha256 前缀(一眼看出线上跑的是哪次构建);
3. **在构建期做一致性校验**,这是它最值钱的部分:
   - 结构:关键符号确实进了产物、`format.js` 与 client 侧没有重名声明(内联会静默覆盖);
   - 上限:`ads.js` 的 `MAX_ADS` 与 `format.js` 的 `MAX_AD_ROWS` 必须相等;
   - **行为**:把 `src/client/format.js` 与 `ads.js` 对同一批边角输入各跑一遍,
     解析结果与拼行结果必须完全一致 —— 这两份是同源副本(宿主 import 前者、
     浏览器内联后者),只靠人肉同步迟早漂移。写这条校验时就立刻抓到了两处真实差异:
     浏览器侧漏了「未知配色回退」和「字段长度裁剪」。

## 开发笔记:几条踩过的坑

留给下一个写 DSH 插件的人:

1. **`Config` 必须是真 schema**。cordis 启动插件前会调 `Config['~standard'].validate(raw)`;
   写成普通对象就会抛 `Cannot read properties of undefined (reading 'validate')`,
   而且**整条插件行都不会激活**。用 DSH 自带的 `@deepseek-ai/schemastery` 即可。
2. **桌面端不认 `tapIndex`**。桌面 index.html 是静态 dist,必须用
   `webserver/index-inject` 推结构化行;而且行要用**内联 script** 形式,
   `script-src` 行在页面侧是 `await loadScript(src)`,加载失败会 reject 整个 boot。
3. **别在捕获阶段 `stopPropagation`**。这会在事件到达目标前把它掐断,结果自己的控件
   全部「点了没反应」——而面板外的徽标却是好的,很容易误判成「全局拦截」。
4. **别把「关闭」实现成「不注入」**。脚本不注入 → 徽标和设置入口一起消失 → 用户再也打不开,
   只能去改配置文件。能关掉自己的开关,必须留着再打开的门。
5. **`change` 事件是失焦才触发的**。数字输入框只绑 `change` 会让人以为「输入无效」;
   输入期间就该监听 `input`。
6. **超限请求体不要 `req.destroy()`**。socket 一拆,你自己那条 413/400 也发不出去,
   客户端只能看到 `fetch failed`。丢掉多余内容、把 body 读完,再正常回状态码。

调试官方实现时,`tools/asar-read.mjs` 可以零依赖地读 Electron `app.asar` 里的文件:

```bash
node tools/asar-read.mjs list  "<...>/resources/app.asar" dsh-host-webserver
node tools/asar-read.mjs grep  "<...>/resources/app.asar" \
  "dsh/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js" "index-inject"
```

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半边:四路状态追踪 + HTTP API + 双通道 index 注入 |
| `client.js` | **构建产物**:浏览器半边(弹窗、设置面板、右下角徽标) |
| `src/client/` | 浏览器半边的源模块(`format.js` 与 `ads.js` 同源,会被内联进产物) |
| `src/client/build.mjs` | 构建脚本:拼接 + 生成头 + 一致性校验 |
| `ads.js` | 文案 ⇄ 素材的纯函数解析(宿主 import,自测直接用) |
| `settings.html` | 插件自带的独立设置页(浏览器里可直接开) |
| `cordis.patch.yml` | bundle 挂载声明 |
| `test/` | 57 条自测(不参与运行时) |
| `tools/asar-read.mjs` | 开发用:零依赖读取 Electron `app.asar` |

## 许可

[MIT](./LICENSE)。内置文案为原创恶搞文本,不含任何真实品牌、商品或服务。
