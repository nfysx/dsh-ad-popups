#!/usr/bin/env node
/**
 * asar-read —— 读 Electron `app.asar` 里文件的零依赖小工具。
 *
 * 开发 DSH 插件时很有用:官方包(bundle、webserver、cordis、桌面端 main.js…)
 * 都打包在 `app.asar` 里,想确认某个 API 的真实签名、或看某个事件到底怎么发的,
 * 用它直接把文件抠出来读就行,不需要安装任何依赖。
 *
 * 用法:
 *   node tools/asar-read.mjs list  <asar> [路径子串]        列出条目
 *   node tools/asar-read.mjs cat   <asar> <条目路径> [输出文件]
 *   node tools/asar-read.mjs grep  <asar> <条目路径> <关键词> [上下文行数]
 *
 * 例(DISH 桌面版):
 *   node tools/asar-read.mjs list "%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar" dsh-host-webserver
 *   node tools/asar-read.mjs grep "%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar" \
 *     "dsh/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js" "index-inject"
 *
 * asar 头部格式(参考 Electron 文档):
 *   [u32 = 4][u32 pickleSize][u32 headerStringSize][u32 jsonSize][json header...]
 *   文件正文从 `8 + headerStringSize` 开始,每个条目带相对 offset 与 size。
 */

import { openSync, readSync, closeSync, writeFileSync } from 'node:fs'

const [, , action, asarPath, ...rest] = process.argv

/** 打印用法并退出。 */
function usage(exitCode = 1) {
  const lines = [
    '用法:',
    '  node tools/asar-read.mjs list  <asar> [路径子串]',
    '  node tools/asar-read.mjs cat   <asar> <条目路径> [输出文件]',
    '  node tools/asar-read.mjs grep  <asar> <条目路径> <关键词> [上下文行数]',
  ]
  console.error(lines.join('\n'))
  process.exit(exitCode)
}

if (asarPath === undefined || (action !== 'list' && action !== 'cat' && action !== 'grep')) usage()

/** 打开 asar,返回 { entries, read }。 */
function openAsar(file) {
  const fd = openSync(file, 'r')
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(12)
  const headerBuf = Buffer.alloc(headerSize)
  readSync(fd, headerBuf, 0, headerSize, 16)
  const header = JSON.parse(headerBuf.toString('utf8'))
  const base = 8 + headerSize

  const entries = []
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node.files ?? {})) {
      const path = prefix === '' ? name : prefix + '/' + name
      if (value.files !== undefined) walk(value, path)
      else entries.push({ path, size: value.size, offset: base + Number(value.offset) })
    }
  }
  walk(header, '')

  return {
    entries,
    /** 读出某个条目的全部字节。 */
    read(entry) {
      const buf = Buffer.alloc(entry.size)
      readSync(fd, buf, 0, entry.size, entry.offset)
      return buf
    },
    close() {
      closeSync(fd)
    },
  }
}

const asar = openAsar(asarPath)

try {
  if (action === 'list') {
    const needle = rest[0] ?? ''
    let shown = 0
    for (const entry of asar.entries) {
      if (needle !== '' && !entry.path.includes(needle)) continue
      console.log(entry.path + '  ' + entry.size)
      shown++
    }
    console.error('共 ' + shown + ' 个条目(总 ' + asar.entries.length + ')')
  } else {
    const target = rest[0]
    const entry = asar.entries.find((candidate) => candidate.path === target)
    if (entry === undefined) {
      console.error('条目不存在: ' + String(target))
      process.exit(1)
    }
    const text = asar.read(entry).toString('utf8')

    if (action === 'cat') {
      if (rest[1] === undefined) {
        process.stdout.write(text)
      } else {
        writeFileSync(rest[1], text)
        console.error('已写入 ' + rest[1] + '(' + entry.size + ' 字节)')
      }
    } else {
      const keyword = rest[1]
      const context = Number(rest[2] ?? '3')
      if (keyword === undefined) usage()
      const lines = text.split('\n')
      let hits = 0
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(keyword)) continue
        hits++
        const from = Math.max(0, i - context)
        const to = Math.min(lines.length - 1, i + context)
        console.log('--- 第 ' + (i + 1) + ' 行 ---')
        for (let j = from; j <= to; j++) console.log((j + 1) + ': ' + lines[j])
      }
      console.error('命中 ' + hits + ' 处')
    }
  }
} finally {
  asar.close()
}
