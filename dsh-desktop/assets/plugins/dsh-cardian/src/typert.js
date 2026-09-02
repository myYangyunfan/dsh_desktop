/**
 * dsh-cardian — Typert host manifest（./typert）.
 *
 * Host 侧 typert-loader 会扫描已加载插件，对导出本文件的 TYPERT 对象并注册为
 * 严格 Remote 定义。网关按 strict 定义路径 RPC（/api/cardian/<method>）。
 *
 * 维护铁律：新增 Remote 方法必须同步三处——本文件 invocations、
 * src/index.js 的 CardianGateway methods 列表、src/client/controller.ts 的
 * REMOTE.descriptors 列表。
 */
import { z } from 'zod'

const JSON_CODEC = (typeSymbol) => ({
  mode: 'strict',
  typeSymbol,
  schema: z.unknown()
})

const inv = (method, parameters = []) => ({
  id: `dsh-cardian#cardianRemote/${method}`,
  service: 'cardianRemote',
  namespace: 'cardian',
  method,
  invocation: { kind: 'direct' },
  parameters: parameters.map((name) => ({ name, wire: name, source: 'json', codec: JSON_CODEC('dsh-cardian/types#Json') })),
  result: JSON_CODEC('dsh-cardian/types#Json')
})

export const TYPERT = {
  package: 'dsh-cardian',
  face: 'host',
  schemas: [],
  invocations: [
    inv('describe'),
    inv('sectionList', ['params']),
    inv('sectionGet', ['params']),
    inv('sectionUpsert', ['params']),
    inv('sectionRemove', ['params']),
    inv('ingestProject', ['params']),
    inv('ingestStatus', ['params']),
    // AI 扫盘建库（网关逐文件直调宿主 llm）：
    //   listModels   -> ctx.get('llm') 的 provider/model 目录（扫描向导下拉）
    //   pauseIngest  -> 置 paused + abort 在途调用（已完成卡片保留）
    //   resumeIngest -> 清 paused，只补剩余未回填项（幂等）
    //   cancelIngest -> 停止，不再处理剩余项
    //   rescanDiff   -> changedSince：仅 added/changed 走 enrich，removed 剪孤儿卡
    // ⚠ 与 src/index.js 的 GATEWAY_METHODS、src/client/controller.ts 的
    //   BRIDGE_METHODS 三处同步（test/gateway-contract.test.mjs 锁定）。
    inv('listModels', ['params']),
    inv('pauseIngest', ['params']),
    inv('resumeIngest', ['params']),
    inv('cancelIngest', ['params']),
    inv('rescanDiff', ['params']),
    inv('status'),
    inv('tagCloud', ['params']),
    inv('backlinks', ['params']),
    inv('related', ['params']),
    inv('graph', ['params']),
    inv('doctor'),
    inv('schema'),
    inv('search', ['params']),
    inv('recall', ['params']),
    // 治理动作与导出能力（均带 1 个 params wire，非零 wire）：
    //   promote    -> memory.promote(ref, { target })      记忆晋升到 PROJECT.md
    //   due        -> cards.due({ deck })                  到期复习列表
    //   exportJson -> cardian.exportJson()                 整库 JSON 快照
    //   exportSkill-> cardian.exportSkill(opts)            分层导出 SKILL.md 包
    inv('promote', ['params']),
    inv('due', ['params']),
    inv('exportJson', ['params']),
    inv('exportSkill', ['params']),
  ],
  model: {
    services: [],
    events: [],
    objects: []
  }
}