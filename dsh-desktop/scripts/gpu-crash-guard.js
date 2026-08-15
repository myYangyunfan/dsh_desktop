'use strict';

// GPU 崩溃自动降级守卫（纯逻辑，可脱离 Electron 单测，issue #26）。
//
// 背景：旧版为了规避显卡驱动兼容性问题无条件 app.disableHardwareAcceleration()，
// 导致软件渲染下 GPU 进程空转 ~60% 单核、界面掉帧。新版默认启用硬件加速，
// 仅在 GPU 进程短时间内连续崩溃（判定驱动不兼容）时触发降级：由 main.js
// 持久化 settings.json 的 hardwareAcceleration:'off' 并重启应用。
//
// 双事件去重：Electron 中 GPU 崩溃可能同时触发 app 'gpu-process-crashed' 与
// 'child-process-gone'（type=GPU），record() 用 dedupeMs 窗口把同一次崩溃
// 只计一次。

function createGpuCrashGuard(options = {}) {
  const limit = options.limit ?? 3;
  const windowMs = options.windowMs ?? 60 * 1000;
  const dedupeMs = options.dedupeMs ?? 3000;
  const now = options.now ?? Date.now;
  let times = [];
  let last = -Infinity; // 首次记录永不被去重窗口吞掉（真实时钟为 epoch 毫秒，t - (-Infinity) 恒大于窗口）

  return {
    /**
     * 记录一次 GPU 崩溃。返回 true 表示已达到连续崩溃阈值（应降级）。
     * 去重窗口内的重复记录被忽略（双事件触发只计一次）。
     */
    record() {
      const t = now();
      if (t - last < dedupeMs) return false;
      last = t;
      times = times.filter((x) => t - x < windowMs);
      times.push(t);
      return times.length >= limit;
    },
    /** 当前滑动窗口内的崩溃次数。 */
    count() {
      return times.length;
    },
    reset() {
      times = [];
    },
  };
}

module.exports = { createGpuCrashGuard };
