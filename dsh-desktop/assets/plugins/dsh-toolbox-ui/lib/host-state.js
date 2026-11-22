// 一个 dsh app 实例（app root）拥有的全部可变状态，以及它的唯一清理点。
//
// 为什么需要这类：本模块有十几份模块级可变状态，它们的**键**分两类（app root / 项目路径），
// 但它们的**owner** 只有一类——登记它们的那次安装。在 R7 之前，"谁记录"与"谁清除"不是同一
// 个东西：`installAgentRuntime` 的 cleanup 会撤连接、删会话记录、释放挂载器令牌，却把
// 「某个项目的某台服务器挂载失败过」这类诊断留在模块级 Map 里。R2 已经量化过同一条缺陷的另一种
// 形态（删除/禁用之后面板继续点名），代价是用户按着一条不存在的事实去排查。
//
// 这里的分工刻意划在"可变状态"上：
//   · 属于本实例的容器（连接表、会话记录、各种缓存、工具代次）→ 住在这个类里，`dispose()` 清；
//   · 进程级但由本实例写过的键（诊断表、项目写锁）→ 由 `own*()` 登记，`dispose()` 按登记释放。
//     **表本身不进这个类**：它们是"项目/文件"的事实，键与生命周期由 workspace-runtime 决定，
//     把它搬进来只会让这个类认识 wsPath 语义，多一层不必要的耦合。
//
// 上限（缓存条数、诊断去重条数）也住在这里：它们描述的是"这个实例允许多少内存"，不是某张表的实现细节。

/** 一个容器的条数上限；满了按插入序丢最旧的一条（Map 的迭代序就是插入序）。 */
function capped(map, limit) {
  if (map.size >= limit) map.delete(map.keys().next().value);
  return map;
}

export class HostState {
  /**
   * @param {object} root app root（cordis 根的 ctx 对象），仅用于日志与断言归属。
   * @param {{ ownStores?: { release(key: string): void }[] }} [options]
   *   ownStores：进程级表各自的释放动作。`dispose()` 会把本实例登记过的键逐个交给它们，
   *   于是"我写过什么"与"卸载时删什么"由同一份登记驱动，不需要第二个清单。
   */
  constructor(root, { ownStores = [] } = {}) {
    this.root = root;
    this.ownStores = ownStores;
    // 工具代次：本实例的 tools/change 序号，是工具清单缓存与 ToolSearch 视图 revision 的键。
    // **必须 per instance**：模块级计数器会让同进程的另一个实例的每一次变更都把本实例的缓存打穿
    //（症状只在多实例下可见：明明没变，每次轮询都全量重算）。
    this.epoch = 0;
    // 当前管事的挂载器令牌（见 installAgentRuntime）；undefined = 没人订阅，代次不可信。
    this.generation = undefined;
    this.agentStates = new Map(); // agent -> { root, wsPath, restrictKey, restrictDisposer }
    this.configCache = new Map(); // canonicalWsPath -> { stamp, mtimeMs, size, config }
    this.schemasCache = undefined; // { epoch, schemas }：全局可见工具的快照
    this.inventoryCache = undefined; // { epoch, inventory }：全局工具清单
    this.denyCache = new Map(); // cacheKey -> string[]（exclude 展开成 deny 的结果）
    this.connections = new Map(); // connKey -> ConnCell（共享连接）
    this.projectSlots = new Map(); // agent -> Map<connKey, ProjectSlot>（投射索引，不是所有权凭据）
    this.scopeModule = undefined; // dsh-scope 模块（每个 app 一份，避免跨 app/HMR 串用）
    this.toolsChangeFlush = undefined; // tools/change 的合并刷写 promise
    this.warned = new Map(); // diagnosticKey -> message（同一条日志只打一次）
    this.ownedPaths = new Set(); // 本实例在进程级表里写过的键
  }

  /** 缓存上限：条数属于"这个实例允许多少内存"，与具体表的键无关。 */
  static get cacheLimit() { return 64; }
  static get warnLimit() { return 64; }
  static get denyLimit() { return 32; }

  /** 登记"我在进程级表里写过这个键"。返回入参，便于在写入点就地串联。 */
  own(key) {
    if (typeof key === "string" && key !== "") this.ownedPaths.add(key);
    return key;
  }

  /**
   * 一处清：本实例的全部可变状态。卸载（HMR / fiber dispose）时必须走到这里。
   *
   * 顺序有意：先释放进程级表里本实例写过的键，再清自己的容器。反过来的话，任何在清理过程中
   * 读取容器（例如日志里打条数）的路径都会看到半清状态。
   */
  dispose() {
    for (const key of this.ownedPaths) {
      for (const store of this.ownStores) {
        try { store.release(key); } catch { /* 释放是幂等的；单张表失败不该拦住其余清理 */ }
      }
    }
    this.ownedPaths.clear();
    this.agentStates.clear();
    this.configCache.clear();
    this.schemasCache = undefined;
    this.inventoryCache = undefined;
    this.denyCache.clear();
    this.connections.clear();
    this.projectSlots.clear();
    this.scopeModule = undefined;
    this.toolsChangeFlush = undefined;
    this.warned.clear();
    // 代次回到起点：这块实例的内存已经清空，缓存键必须跟着失效（否则新代第一次读就命中空缓存）。
    this.epoch = 0;
    this.generation = undefined;
  }

  /** 测试接缝：只报计数，不泄露内容（与 `checkForUpdate` 同一惯例）。 */
  facts() {
    return {
      epoch: this.epoch,
      hasGeneration: this.generation !== undefined,
      agentStates: this.agentStates.size,
      configCache: this.configCache.size,
      denyCache: this.denyCache.size,
      connections: this.connections.size,
      projectSlots: this.projectSlots.size,
      warned: this.warned.size,
      ownedPaths: this.ownedPaths.size,
      hasSchemasCache: this.schemasCache !== undefined,
      hasInventoryCache: this.inventoryCache !== undefined,
      hasScopeModule: this.scopeModule !== undefined,
    };
  }
}

export { capped };
