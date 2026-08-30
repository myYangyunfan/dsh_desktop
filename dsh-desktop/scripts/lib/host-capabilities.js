'use strict';

// ---------------------------------------------------------------------------
// 宿主能力清单 / 探测 / 降级。
//
// 现状：patch 注入 `window.__dshDesktopOpenDir` / `window.__dshSessionManager`，
// 由 dsh-session-manager 插件 client.js 提供——补丁与插件之间的隐式契约。
// 本模块把「补丁依赖的宿主能力」显式声明为清单，供 patch-runner 探测并记录
// 降级告警，同时提供注入代码里用的桥表达式（单一数据源）。
//
//   openPath     ：preload 已暴露的宿主能力 window.dshDesktop.openPath（required）；
//   deleteSession：dsh-session-manager 插件提供的 window.__dshSessionManager
//                  .deleteSession（非 required，桥缺失时菜单项隐藏 + 告警）。
// ---------------------------------------------------------------------------

const HOST_CAPABILITIES = {
  openPath: {
    bridge: 'window.dshDesktop.openPath',
    provider: 'preload',
    required: true,
  },
  deleteSession: {
    bridge: 'window.__dshSessionManager.deleteSession',
    provider: 'dsh-session-manager',
    required: false,
  },
};

/** 注入代码里引用的桥表达式（可选链，桥缺失时静默降级到 undefined）。 */
const BRIDGE_EXPRS = {
  openPath: 'window.dshDesktop?.openPath',
  deleteSession: 'window.__dshSessionManager?.deleteSession',
};

/** deleteSession 菜单项可见性守卫（桥缺失时隐藏「删除对话」项）。 */
const DELETE_SESSION_MENU_GUARD = 'window.__dshSessionManager && typeof window.__dshSessionManager.deleteSession === "function"';

/** 桥缺失时的降级告警文案。 */
function missingBridgeWarning(capKey) {
  const cap = HOST_CAPABILITIES[capKey];
  if (!cap) return '';
  if (capKey === 'deleteSession') {
    return '会话删除依赖 dsh-session-manager 插件，未加载；「删除对话」菜单项已隐藏';
  }
  return '宿主能力 ' + cap.bridge + ' 不可用（' + cap.provider + '），相关菜单项已降级';
}

/**
 * 探测宿主能力并生成报告。
 * @param {{[key: string]: (() => boolean)|undefined}} [detectors] 可注入探测器
 * @returns {{[key: string]: {available: boolean|null, provider: string, required: boolean}}}
 *   available: true/false 由探测器给出；探测器缺失时为 null（未知，运行时判定）。
 */
function probe(detectors = {}) {
  const report = {};
  for (const key of Object.keys(HOST_CAPABILITIES)) {
    const cap = HOST_CAPABILITIES[key];
    const detect = detectors[key];
    report[key] = {
      available: typeof detect === 'function' ? !!detect() : null,
      provider: cap.provider,
      required: cap.required,
    };
  }
  return report;
}

module.exports = {
  HOST_CAPABILITIES,
  BRIDGE_EXPRS,
  DELETE_SESSION_MENU_GUARD,
  missingBridgeWarning,
  probe,
};
