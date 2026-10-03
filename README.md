# dsh-ad-popups · 思考期虚拟广告弹窗

> 给 [DeepSeek Harness](https://github.com/deepseek-ai) 的娱乐插件:模型正在思考、回答还没出来时,
> 主界面会飘出一堆**一眼就是假的**广告弹窗。

**⚠️ 全部内容纯属虚构恶搞,不构成任何广告宣传。** 插件不跳转任何外链、不收集任何数据、
不带任何真实品牌或商品;每个弹窗都常驻「本广告纯属虚构 · 不构成任何宣传」的标注。

```
┌───────────────────────────┐   ┌───────────────────────────┐
│ ● DS广告联盟 · 弹窗 1      │   │ ● DS广告联盟 · 弹窗 2      │
│                           │   │                           │
│ ╭──────────╮              │   │ ╭──────────╮              │
│ │ 限时福利  │              │   │ │ 系统提示  │              │
│ ╰──────────╯              │   │ ╰──────────╯              │
│ 恭喜!您是第 1 位访客       │   │ 检测到您的电脑有 1 个 CPU │
│ 本页面只有您一个人看…     │   │ 这可能严重影响……没什么影响 │
│ ▓▓ 第 1 位访客 · 还是 ▓▓   │   │ ▓▓ 1 个 CPU · 严重超标 ▓▓  │
│ ┌───────────────────────┐ │   │ ┌───────────────────────┐ │
│ │       立即领取         │ │   │ │       立即清理         │ │
│ └───────────────────────┘ │   │ └───────────────────────┘ │
│ 本广告纯属虚构    [关闭]  │   │ 本广告纯属虚构    [关闭]  │
└───────────────────────────┘   └───────────────────────────┘
```


## 安装

本插件是一个标准的 DSH 插件包(宿主半边 + 注入式浏览器半边)。

### 先装依赖(克隆之后必做)

```bash
npm install            # 只有 3 个包,主要是 @deepseek-ai/schemastery(声明 Config 用)
```

> 只装进 DSH profile 使用时,Dsh 运行时会解析到自带的 `@deepseek-ai/schemastery`,
> 所以**插件本身能跑**;但要让自测和构建在本目录里跑通,必须先 `npm install` ——
> 否则 `import './index.js'` 会因为找不到该包而失败(宿主相关用例会整体挂掉)。

### 改源码后重新构建

仓库里已经带了构建产物 `client.js`,直接安装即可;改过 `src/` 之后:

```bash
npm run build          # 由 src/client/*.js 生成 client.js
npm run check:build    # 只校验产物与源是否同步
npm test               # 先校验产物,再跑全部 57 条用例
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
| **0.6 秒内连按 3 次 `Esc`** | 清空眼前所有弹窗 |
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
