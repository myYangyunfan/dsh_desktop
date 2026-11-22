// 按契约表装配 Typert Remote 装饰器（wire 上的方法集合）。
//
// 为什么要有这一层：两个 gateway 是 tsc 的产物，装饰器已经被降级成每个方法两行脚手架
// （`_x_decorators = [Remote("x")]` + `__esDecorate(...)`）。那份清单与 lib/rpc-contract.js
// 的 MCP_METHODS / SKILL_METHODS 逐字重复——表里加一个方法要再抄一遍，抄错一个字母就静默
// 偏离契约（wire 上多一个没人认领的 endpoint，或者少一个）。现在"哪些方法上 wire、叫什么、
// 什么顺序"只在契约表里写一次，实现留在类里。
//
// 两条不变量：
//   1. 标记顺序 = 表里的顺序。`__esDecorate` 按调用顺序把 initializer 追加进
//      `_instanceExtraInitializers`，构造函数末尾的 `__runInitializers` 按同一顺序执行，
//      `mark()` 再按顺序追加标记——网关正是按这个顺序发现 endpoint。
//   2. 表里的每个名字都必须是原型上的**自有**方法。`__esDecorate(ctor, null, …)` 找不到描述符
//      时退化成 `{}`，最后 `Object.defineProperty(prototype, name, {})`：名字写错一个字母，得到
//      的是原型上一个 undefined 成员，而标记照样登记——wire 上有 endpoint、调用时才炸，且
//      "原型方法集合 = 契约"那条用例也是绿的（名字两边都在）。装饰器逐条贴在方法上时这条由
//      编译器保证；改成表驱动之后必须自己保住，所以这里显式断言，不做静默兜底。
import { Remote } from '@deepseek-ai/dsh-typert-protocol'

/**
 * 把一份契约表装配成网关类上的 Remote 标记。
 *
 * @param {Function} ctor 网关类（静态块里的 `this`）
 * @param {{ method: string }[]} methods 契约表里的一份（MCP_METHODS / SKILL_METHODS）
 * @param {{ decorate: Function, metadata: object | undefined, initializers: Function[] }} options
 *   decorate 是 tsc 的 `__esDecorate`（留在 lib/index.js，逐字未改）；initializers 是该类的
 *   `_instanceExtraInitializers`（构造末尾要跑的那一队）。
 */
export function applyRemoteMethods(ctor, methods, { decorate, metadata, initializers }) {
  const prototype = ctor.prototype
  for (const { method } of methods) {
    if (!Object.hasOwn(prototype, method) || typeof prototype[method] !== 'function') {
      throw new Error(
        `${ctor.name}.prototype 上没有方法 ${method}（契约表与实现必须一一对应）：` +
          `原型上只有 ${Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor').join(', ')}`,
      )
    }
    // access 不传：`Remote()` 只读 kind/name/static/private/initializers，tsc 生成的 access
    // 闭包在降级后的装饰器里没有任何读者（`__esDecorate` 只是原样拷进 context）。
    decorate(ctor, null, [Remote(method)], { kind: 'method', name: method, static: false, private: false, metadata }, null, initializers)
  }
}
