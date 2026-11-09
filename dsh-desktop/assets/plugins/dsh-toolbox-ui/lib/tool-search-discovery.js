// 发现集状态的所有者：**按 agent 隔离**、随服务实例存活、可被并发搜索安全提交。
//
// 为什么单独一层（而不是散在 runtime 的三个调用点）：
//   1. 发现集是**本机制唯一的可变领域状态**。它必须只有一个写入路径，否则
//      "目录说藏着、守卫说已发现"这类不一致会在两个调用点之间长出来；
//   2. 用户报过"A 会话搜到 15 个工具，别的工作区也变了"。发现集绝不能是模块级/全局的：
//      这里用 `WeakMap<agent, state>`，键就是 agent 对象本身——同工作区两个会话、不同工作区
//      的会话，天然是两份状态。**全局库存/策略共享不等于已发现集合共享**；
//   3. 淘汰（LRU）只调整"后续呈现"，不能撤销已经接受的调用或刚交给模型的 schema：
//      已承诺（promised）不进淘汰候选；而"已接受的调用"根本不受影响——淘汰不撤销注册、
//      不改准入（这正是"不用 restrict 做延迟"的直接结果），PTC 程序绑定同理。
//
// 并发语义：所有提交都是**同步**的（JS 单线程内无 await），搜索里"异步准备签名"发生在
// 提交之后，因此不会用旧快照覆盖新状态。

import { createState, discover, evict, orderedNames, promise, seed, sizeOf, touch, versionOf } from './tool-search-state.js'

/**
 * @param {object} options
 * @param {number} options.maxDiscovered - 运行期发现集上限。
 * @param {(agent: object) => string[]|undefined} options.restore - 首次接触某个 agent 时的恢复种子
 *   （有序，旧→新）。返回 `undefined` = 没有可用来源（保持空集）。
 * @param {(event: object) => void} [options.onDiagnostic]
 */
export function createDiscoveryStore({ maxDiscovered, restore, onDiagnostic }) {
  /** @type {WeakMap<object, ReturnType<typeof createState> & {restored: boolean}>} */
  const states = new WeakMap()

  const stateFor = (agent) => {
    let state = states.get(agent)
    if (state !== undefined) return state
    state = { ...createState(), restored: false }
    states.set(agent, state)
    const saved = restore?.(agent)
    if (Array.isArray(saved)) {
      // 恢复是**有序替换**：投影/派生消息给的是完整集合，不是增量。
      seed(state, saved.length > maxDiscovered ? saved.slice(-maxDiscovered) : saved)
    }
    state.restored = true
    return state
  }

  /**
   * 淘汰到预算。**即时执行**：淘汰只影响后续呈现，不撤销注册/准入，所以在途调用与
   * PTC 程序绑定都不依赖它（推迟到"执行根结束"反而会让结果里的计数与实际不一致）。
   *
   * `cap` 是**本次提交的批次长度**：`select:` 一次能返回超过 maxDiscovered 的名字，若按
   * 运行期上限硬砍，本批靠前的名字会在**同一条结果里**被淘汰，而结果的 instruction 又写着
   * "按名字直接调"——下一次调用必被守卫拒。所以一次提交的保护下限抬到本批长度；
   * 叠加 `promise` 的承诺保护，本批在下一批到来之前始终可用。
   */
  const converge = (state, cap = 0) => evict(state, Math.max(maxDiscovered, cap))

  return {
    stateFor,

    /**
     * 提交一次搜索的发现（同步）。返回本次**真正新增**的名字。
     * @param {object} agent
     * @param {string[]} names
     * @returns {string[]}
     */
    discover(agent, names) {
      const state = stateFor(agent)
      const fresh = discover(state, names)
      return fresh
    },

    /** 记录"这些 schema 刚交给模型"（含本批里早就发现过的）。 */
    claim(agent, names) {
      const state = stateFor(agent)
      promise(state, names, maxDiscovered)
    },

    /** 模型真的调用了某个工具：兑现承诺并刷新 LRU。 */
    touch(agent, name) {
      touch(stateFor(agent), name)
    },

    /** 按预算淘汰；`cap` 传入本批长度以保护刚返回的整批。 */
    evict(agent, cap = 0) {
      return converge(stateFor(agent), cap)
    },

    /** 有序快照（旧 → 新）：v2 协议写出的就是它。 */
    snapshot(agent) {
      return orderedNames(stateFor(agent))
    },

    size(agent) {
      return sizeOf(stateFor(agent))
    },

    version(agent) {
      return versionOf(stateFor(agent))
    },

  }
}



