/**
 * M3 (Material Design 3) Theme Manager for DSH Desktop
 * 
 * 职责：
 *   1. 注入 M3 主题 CSS 文件
 *   2. 管理主题状态（保存/读取 localStorage）
 *   3. 监听设置页面渲染，在外观选项中添加 M3 主题按钮（第四个选项）
 *   4. 处理主题切换动画
 */

const M3_THEME_KEY = 'dsh-desktop-m3-theme';
const M3_THEME_ATTR = 'data-m3-theme';
const SETTINGS_OBSERVER_CONFIG = { childList: true, subtree: true };

let m3Enabled = false;
let settingsObserver = null;
let themeStyleEl = null;

// ---------------------------------------------------------------------------
// 主题持久化
// ---------------------------------------------------------------------------

function loadThemePreference() {
  try {
    const saved = localStorage.getItem(M3_THEME_KEY);
    return saved === 'm3';
  } catch {
    return false;
  }
}

function saveThemePreference(enabled) {
  try {
    localStorage.setItem(M3_THEME_KEY, enabled ? 'm3' : 'default');
  } catch {}
}

// ---------------------------------------------------------------------------
// 主题应用
// ---------------------------------------------------------------------------

function applyM3Theme(enabled) {
  m3Enabled = enabled;
  if (enabled) {
    document.body.setAttribute(M3_THEME_ATTR, 'm3');
    document.documentElement.setAttribute(M3_THEME_ATTR, 'm3');
  } else {
    document.body.removeAttribute(M3_THEME_ATTR);
    document.documentElement.removeAttribute(M3_THEME_ATTR);
  }
  // 触发自定义事件，通知页面主题已变更
  window.dispatchEvent(new CustomEvent('m3-theme-change', { detail: { enabled } }));
}

function toggleM3Theme() {
  const next = !m3Enabled;
  saveThemePreference(next);
  applyM3Theme(next);
  return next;
}

// ---------------------------------------------------------------------------
// CSS 注入
// ---------------------------------------------------------------------------

function injectM3ThemeCSS() {
  if (themeStyleEl) return;
  
  // 从 dshDesktop API 获取 CSS 内容
  // 注意：在 preload 沙箱中无法直接读取文件，所以通过 IPC 获取
  // 或者我们直接在这里内联核心变量
  
  const style = document.createElement('style');
  style.id = 'm3-theme-style';
  style.textContent = getM3ThemeCSS();
  document.head.appendChild(style);
  themeStyleEl = style;
}

// ---------------------------------------------------------------------------
// 设置页面集成：在外观选项中添加第四个主题按钮（M3）
// ---------------------------------------------------------------------------

function findAppearanceSection() {
  // 尝试多种选择器来定位设置页面中的外观部分
  const selectors = [
    '[class*="appearance"]',
    '[class*="Appearance"]',
    '[class*="theme-section"]',
    '[class*="themeSection"]',
    '[data-section="appearance"]',
    '[data-testid="appearance"]',
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  
  // 尝试通过文本内容查找
  const labels = document.querySelectorAll('label, div, span');
  for (const el of labels) {
    if (el.textContent && (el.textContent.includes('外观') || el.textContent.includes('Appearance') || el.textContent.includes('主题'))) {
      const section = el.closest('[class*="section"], [class*="Section"], [class*="group"], [class*="Group"], div[class]');
      if (section) return section;
    }
  }
  
  return null;
}

function findThemeButtons(container) {
  // 查找主题切换按钮组（通常是 3 个并排的按钮/卡片）
  const buttons = container.querySelectorAll('button, [role="button"], [class*="theme-option"], [class*="ThemeOption"]');
  return buttons.length >= 2 ? buttons : null;
}

function createM3ThemeButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'm3-theme-option';
  btn.setAttribute('data-theme', 'm3');
  btn.setAttribute('aria-pressed', String(m3Enabled));
  btn.setAttribute('title', 'Material Design 3 (Material You)');
  
  btn.innerHTML = `
    <div class="m3-theme-preview">
      <div class="m3-preview-primary"></div>
      <div class="m3-preview-secondary"></div>
      <div class="m3-preview-tertiary"></div>
      <div class="m3-preview-surface"></div>
    </div>
    <span class="m3-theme-label">M3</span>
  `;
  
  btn.addEventListener('click', () => {
    const enabled = toggleM3Theme();
    updateM3ButtonState(btn, enabled);
    // 更新其他主题按钮的选中状态
    updateAllThemeButtons();
  });
  
  return btn;
}

function updateM3ButtonState(btn, enabled) {
  btn.setAttribute('aria-pressed', String(enabled));
  if (enabled) {
    btn.classList.add('m3-theme-active');
  } else {
    btn.classList.remove('m3-theme-active');
  }
}

function updateAllThemeButtons() {
  const m3Btn = document.querySelector('.m3-theme-option');
  if (m3Btn) {
    updateM3ButtonState(m3Btn, m3Enabled);
  }
}

function injectM3ThemeButton() {
  if (document.querySelector('.m3-theme-option')) return;
  
  const appearanceSection = findAppearanceSection();
  if (!appearanceSection) return false;
  
  const themeButtons = findThemeButtons(appearanceSection);
  
  if (themeButtons && themeButtons.length >= 2) {
    // 在现有主题按钮组末尾添加 M3 按钮
    const lastBtn = themeButtons[themeButtons.length - 1];
    const m3Btn = createM3ThemeButton();
    lastBtn.parentNode.insertBefore(m3Btn, lastBtn.nextSibling);
    updateM3ButtonState(m3Btn, m3Enabled);
    return true;
  }
  
  // 备选：直接在外观 section 末尾添加
  const m3Btn = createM3ThemeButton();
  appearanceSection.appendChild(m3Btn);
  updateM3ButtonState(m3Btn, m3Enabled);
  return true;
}

// ---------------------------------------------------------------------------
// 设置页面监听：等待设置页面渲染后注入 M3 选项
// ---------------------------------------------------------------------------

function startSettingsObserver() {
  if (settingsObserver) return;
  
  // 防抖（issue #26）：设置页渲染通常伴随大量 DOM 变更，若每批变更都执行
  // 全文档 querySelector 会拖慢页面。与 preload.js 中同功能实现的 300ms
  // 防抖对齐——只在变更停歇后检查一次。
  let observerPending = false;
  settingsObserver = new MutationObserver(() => {
    if (observerPending) return;
    observerPending = true;
    setTimeout(() => {
      observerPending = false;
      // 检查是否有设置相关的元素被添加
      const hasSettings = document.querySelector('[class*="setting"], [class*="Setting"], [class*="appearance"], [class*="Appearance"]');
      if (hasSettings) {
        const injected = injectM3ThemeButton();
        if (injected) {
          // 注入成功后可以暂时断开观察，节省性能
          // 但设置页面可能重新渲染，所以保持观察
        }
      }
    }, 300);
  });
  
  settingsObserver.observe(document.body, SETTINGS_OBSERVER_CONFIG);
}

// ---------------------------------------------------------------------------
// 主题切换按钮的样式（内联，不依赖外部 CSS 文件）
// ---------------------------------------------------------------------------

function getM3ThemeButtonCSS() {
  return `
.m3-theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: 2px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #1a1a2e);
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  min-width: 64px;
}

.m3-theme-option:hover {
  border-color: var(--m3-primary, #6750A4);
  background: var(--dsw-alias-bg-layer-3, #2a2a3e);
  transform: translateY(-1px);
}

.m3-theme-option.m3-theme-active {
  border-color: var(--m3-primary, #6750A4);
  background: color-mix(in srgb, var(--m3-primary, #6750A4) 12%, var(--dsw-alias-bg-layer-2, #1a1a2e));
}

.m3-theme-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
}

.m3-preview-primary {
  background: #6750A4;
  border-radius: 4px 0 0 0;
}
.m3-preview-secondary {
  background: #625B71;
  border-radius: 0 4px 0 0;
}
.m3-preview-tertiary {
  background: #7D5260;
  border-radius: 0 0 0 4px;
}
.m3-preview-surface {
  background: #FFFBFE;
  border-radius: 0 0 4px 0;
}

.m3-theme-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

body[data-m3-theme="m3"] .m3-preview-surface {
  background: #1C1B1F;
}
`;
}

// ---------------------------------------------------------------------------
// 完整 M3 主题 CSS（核心变量）
// ---------------------------------------------------------------------------

function getM3ThemeCSS() {
  return getM3ThemeButtonCSS() + `
/* ============================================================
   M3 Theme Variables — Light Mode
   ============================================================ */
:root {
  /* Tonal Palette - Primary (Purple) */
  --m3-primary-0: #000000;
  --m3-primary-10: #21005D;
  --m3-primary-20: #381E72;
  --m3-primary-30: #4F378B;
  --m3-primary-40: #6750A4;
  --m3-primary-50: #7F67BE;
  --m3-primary-60: #9A82DB;
  --m3-primary-70: #B69DF8;
  --m3-primary-80: #D0BCFF;
  --m3-primary-90: #EADDFF;
  --m3-primary-95: #F6EDFF;
  --m3-primary-99: #FFFBFE;
  --m3-primary-100: #FFFFFF;

  /* Tonal Palette - Secondary */
  --m3-secondary-40: #625B71;
  --m3-secondary-80: #CCC2DC;
  --m3-secondary-90: #E8DEF8;

  /* Tonal Palette - Tertiary (Pink) */
  --m3-tertiary-40: #7D5260;
  --m3-tertiary-80: #EFB8C8;

  /* Tonal Palette - Error */
  --m3-error-40: #B3261E;
  --m3-error-80: #F9DEDC;

  /* Tonal Palette - Neutral */
  --m3-neutral-10: #1C1B1F;
  --m3-neutral-20: #313033;
  --m3-neutral-30: #484649;
  --m3-neutral-40: #605D62;
  --m3-neutral-50: #79777A;
  --m3-neutral-60: #939094;
  --m3-neutral-70: #AEAAAE;
  --m3-neutral-80: #CAC6CA;
  --m3-neutral-90: #E6E0E9;
  --m3-neutral-95: #F4EFF4;
  --m3-neutral-99: #FFFBFE;

  /* Tonal Palette - Neutral Variant */
  --m3-nv-30: #49454F;
  --m3-nv-50: #79747E;
  --m3-nv-60: #938F99;
  --m3-nv-80: #CAC4D0;
  --m3-nv-90: #E7E0EC;

  /* M3 Semantic Colors - Light */
  --m3-primary: var(--m3-primary-40);
  --m3-on-primary: var(--m3-primary-100);
  --m3-primary-container: var(--m3-primary-90);
  --m3-on-primary-container: var(--m3-primary-10);

  --m3-secondary: var(--m3-secondary-40);
  --m3-on-secondary: var(--m3-primary-100);
  --m3-secondary-container: var(--m3-secondary-90);
  --m3-on-secondary-container: #1D192B;

  --m3-tertiary: var(--m3-tertiary-40);
  --m3-on-tertiary: var(--m3-primary-100);
  --m3-tertiary-container: var(--m3-tertiary-90);
  --m3-on-tertiary-container: #31111D;

  --m3-error: var(--m3-error-40);
  --m3-on-error: var(--m3-primary-100);
  --m3-error-container: var(--m3-error-90);
  --m3-on-error-container: #410E0B;

  --m3-background: var(--m3-neutral-99);
  --m3-on-background: var(--m3-neutral-10);

  --m3-surface: var(--m3-neutral-99);
  --m3-on-surface: var(--m3-neutral-10);
  --m3-surface-variant: var(--m3-nv-90);
  --m3-on-surface-variant: var(--m3-nv-30);

  --m3-surface-container-lowest: #FFFFFF;
  --m3-surface-container-low: var(--m3-neutral-95);
  --m3-surface-container: #F3EDF7;
  --m3-surface-container-high: #ECE6F0;
  --m3-surface-container-highest: #E6E0E9;

  --m3-outline: var(--m3-nv-50);
  --m3-outline-variant: var(--m3-nv-80);

  /* Shape */
  --m3-shape-xs: 4px;
  --m3-shape-sm: 8px;
  --m3-shape-md: 12px;
  --m3-shape-lg: 16px;
  --m3-shape-xl: 28px;
  --m3-shape-full: 9999px;

  /* Motion */
  --m3-motion-short: 150ms;
  --m3-motion-medium: 250ms;
  --m3-motion-long: 300ms;
  --m3-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --m3-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);

  /* State layer opacity */
  --m3-state-hover: 0.08;
  --m3-state-focus: 0.12;
  --m3-state-pressed: 0.12;
  --m3-state-dragged: 0.16;
}

/* ============================================================
   M3 Theme — Dark Mode
   ============================================================ */
body[data-m3-theme="m3"][data-ds-dark-theme],
body[data-m3-theme="m3"][data-ds-dark-theme] {
  --m3-primary: var(--m3-primary-80);
  --m3-on-primary: var(--m3-primary-20);
  --m3-primary-container: var(--m3-primary-30);
  --m3-on-primary-container: var(--m3-primary-90);

  --m3-secondary: var(--m3-secondary-80);
  --m3-on-secondary: #332D41;
  --m3-secondary-container: #4A4458;
  --m3-on-secondary-container: var(--m3-secondary-90);

  --m3-tertiary: var(--m3-tertiary-80);
  --m3-on-tertiary: #492532;
  --m3-tertiary-container: #633B48;
  --m3-on-tertiary-container: var(--m3-tertiary-90);

  --m3-error: #F2B8B5;
  --m3-on-error: #601410;
  --m3-error-container: #8C1D18;
  --m3-on-error-container: #F9DEDC;

  --m3-background: var(--m3-neutral-10);
  --m3-on-background: var(--m3-neutral-90);

  --m3-surface: var(--m3-neutral-10);
  --m3-on-surface: var(--m3-neutral-90);
  --m3-surface-variant: var(--m3-nv-30);
  --m3-on-surface-variant: var(--m3-nv-80);

  --m3-surface-container-lowest: #141218;
  --m3-surface-container-low: #1D1B20;
  --m3-surface-container: #211F26;
  --m3-surface-container-high: #2B2930;
  --m3-surface-container-highest: #36343B;

  --m3-outline: var(--m3-nv-60);
  --m3-outline-variant: var(--m3-nv-30);
}

/* ============================================================
   DSW Variable Overrides — Light Mode
   ============================================================ */
body[data-m3-theme="m3"] {
  /* Background layers */
  --dsw-alias-bg-base: var(--m3-background);
  --dsw-alias-bg-layer-1: var(--m3-surface-container-low);
  --dsw-alias-bg-layer-2: var(--m3-surface-container);
  --dsw-alias-bg-layer-3: var(--m3-surface-container-high);
  --dsw-alias-bg-module-platform: var(--m3-surface-container-high);
  --dsw-alias-bg-overlay: color-mix(in srgb, var(--m3-on-surface) 50%, transparent);

  /* Borders */
  --dsw-alias-border-l1: var(--m3-outline-variant);
  --dsw-alias-border-l2: var(--m3-outline);
  --dsw-alias-border-l3: var(--m3-outline);

  /* Text labels */
  --dsw-alias-label-primary: var(--m3-on-surface);
  --dsw-alias-label-secondary: var(--m3-on-surface-variant);
  --dsw-alias-label-tertiary: var(--m3-outline);
  --dsw-alias-label-caption: var(--m3-outline);

  /* Brand / Primary */
  --dsw-alias-brand-primary: var(--m3-primary);
  --dsw-alias-brand-primary-new-color: var(--m3-primary);

  /* Buttons */
  --dsw-alias-button-primary-fill: var(--m3-primary);
  --dsw-alias-button-primary-hover: color-mix(in srgb, var(--m3-primary) 88%, var(--m3-on-primary) 12%);
  --dsw-alias-button-primary-label: var(--m3-on-primary);
  --dsw-alias-button-ghost-active-border: var(--m3-outline);
  --dsw-alias-button-ghost-active-fill: var(--m3-surface-container-high);

  /* Interactive states */
  --dsw-alias-interactive-bg-hover: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
  --dsw-alias-interactive-bg-hover-solid: var(--m3-surface-container-high);
  --dsw-alias-interactive-bg-active: color-mix(in srgb, var(--m3-on-surface) 12%, transparent);

  /* State colors */
  --dsw-alias-state-success-primary: #4CAF50;
  --dsw-alias-state-success-secondary: #81C784;
  --dsw-alias-state-success-tertiary: #C8E6C9;
  --dsw-alias-state-error-primary: var(--m3-error);
  --dsw-alias-state-error-secondary: var(--m3-error);
  --dsw-alias-state-warn-primary: #FF9800;
  --dsw-alias-state-warn-secondary: #FFB74D;
  --dsw-alias-state-warn-tertiary: #FFE0B2;
  --dsw-alias-state-business-primary: var(--m3-tertiary);
  --dsw-alias-state-business-tertiary: var(--m3-tertiary-container);

  /* Sidebar */
  --dsw-specific-sidebar-fill: var(--m3-surface-container-low);
  --dsw-specific-sidebar-nav-item-active: var(--m3-secondary-container);
  --dsw-specific-sidebar-nav-item-active-accent: var(--m3-primary);
  --dsw-specific-sidebar-nav-item-hover: var(--m3-surface-container);

  /* Input */
  --dsw-specific-input-major: var(--m3-surface-container-high);
  --dsw-specific-login-input: var(--m3-surface-container);

  /* Bubble / Chat */
  --dsw-specific-bubble: var(--m3-primary-container);
  --dsw-specific-bubble-highlight: var(--m3-secondary-container);

  /* Menu / Popup */
  --dsw-specific-menu: var(--m3-surface-container-high);
  --dsw-specific-selector: var(--m3-surface-container);

  /* Markdown */
  --dsw-alias-markdown-code-block: var(--m3-surface-container);
  --dsw-alias-markdown-code-block-banner: var(--m3-surface-container-high);
  --dsw-alias-markdown-inline-code: var(--m3-surface-container-high);
  --dsw-alias-markdown-tag: var(--m3-surface-container-high);

  /* Toast / Tooltip */
  --dsw-alias-toast-bg: var(--m3-inverse-surface, #313033);
  --dsw-alias-tooltip-bg: var(--m3-inverse-surface, #313033);

  /* Radius — M3 has more rounded corners */
  --dsw-radius-sm: var(--m3-shape-sm);
  --dsw-radius-md: var(--m3-shape-md);
  --dsw-radius-lg: var(--m3-shape-lg);
  --dsw-radius-xl: var(--m3-shape-xl);

  /* Shadow — M3 uses tonal elevation, reduce shadow */
  --dsw-shadow-lv1: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 3px 0 rgba(0, 0, 0, 0.05);
  --dsw-shadow-lv2: 0 2px 4px 0 rgba(0, 0, 0, 0.04), 0 4px 8px 0 rgba(0, 0, 0, 0.06);
  --dsw-shadow-lv3: 0 4px 8px 0 rgba(0, 0, 0, 0.06), 0 8px 16px 0 rgba(0, 0, 0, 0.08);

  /* Font */
  --dsw-font-family: 'Roboto', 'Noto Sans SC', var(--dsw-font-family, system-ui, sans-serif);

  /* Smooth transitions */
  --dsw-transition-fast: var(--m3-motion-short) var(--m3-easing-standard);
  --dsw-transition-normal: var(--m3-motion-medium) var(--m3-easing-standard);
  --dsw-transition-slow: var(--m3-motion-long) var(--m3-easing-standard);
}

/* ============================================================
   DSW Variable Overrides — Dark Mode
   ============================================================ */
body[data-m3-theme="m3"][data-ds-dark-theme] {
  /* Background layers */
  --dsw-alias-bg-base: var(--m3-background);
  --dsw-alias-bg-layer-1: var(--m3-surface-container-low);
  --dsw-alias-bg-layer-2: var(--m3-surface-container);
  --dsw-alias-bg-layer-3: var(--m3-surface-container-high);

  /* Borders */
  --dsw-alias-border-l1: var(--m3-outline-variant);
  --dsw-alias-border-l2: var(--m3-outline);

  /* Text */
  --dsw-alias-label-primary: var(--m3-on-surface);
  --dsw-alias-label-secondary: var(--m3-on-surface-variant);
  --dsw-alias-label-tertiary: var(--m3-outline);

  /* Buttons */
  --dsw-alias-button-primary-fill: var(--m3-primary);
  --dsw-alias-button-primary-hover: color-mix(in srgb, var(--m3-primary) 88%, var(--m3-on-primary) 12%);
  --dsw-alias-button-primary-label: var(--m3-on-primary);

  /* Interactive states */
  --dsw-alias-interactive-bg-hover: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
  --dsw-alias-interactive-bg-hover-solid: var(--m3-surface-container-high);

  /* Sidebar */
  --dsw-specific-sidebar-fill: var(--m3-surface-container-low);
  --dsw-specific-sidebar-nav-item-active: var(--m3-secondary-container);
  --dsw-specific-sidebar-nav-item-hover: var(--m3-surface-container);

  /* Bubble */
  --dsw-specific-bubble: var(--m3-primary-container);

  /* Input */
  --dsw-specific-input-major: var(--m3-surface-container-high);
}

/* ============================================================
   Global M3 Style Adjustments
   ============================================================ */
body[data-m3-theme="m3"] {
  /* 全局过渡动画：主题切换时的平滑过渡 */
  transition: background-color var(--m3-motion-medium) var(--m3-easing-standard),
              color var(--m3-motion-medium) var(--m3-easing-standard);
}

body[data-m3-theme="m3"] * {
  transition-duration: var(--m3-motion-short);
  transition-timing-function: var(--m3-easing-standard);
}

/* 按钮 M3 化 */
body[data-m3-theme="m3"] button {
  border-radius: var(--m3-shape-full);
}

/* 卡片/面板 M3 化 */
body[data-m3-theme="m3"] [class*="card"],
body[data-m3-theme="m3"] [class*="Card"],
body[data-m3-theme="m3"] [class*="panel"],
body[data-m3-theme="m3"] [class*="Panel"] {
  border-radius: var(--m3-shape-lg);
}

/* 输入框 M3 化 */
body[data-m3-theme="m3"] input,
body[data-m3-theme="m3"] textarea,
body[data-m3-theme="m3"] select {
  border-radius: var(--m3-shape-md);
}

/* 滚动条 M3 化 */
body[data-m3-theme="m3"]::-webkit-scrollbar-thumb {
  border-radius: var(--m3-shape-full);
}

/* 选区颜色 M3 化 */
body[data-m3-theme="m3"] ::selection {
  background: color-mix(in srgb, var(--m3-primary) 30%, transparent);
  color: var(--m3-on-surface);
}

/* 焦点环 M3 化 */
body[data-m3-theme="m3"] :focus-visible {
  outline: 2px solid var(--m3-primary);
  outline-offset: 2px;
  border-radius: var(--m3-shape-sm);
}

/* ============================================================
   DSH Chrome 覆盖（自绘标题栏 M3 化）
   ============================================================ */
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ {
  background: color-mix(in srgb, var(--m3-surface-container-low) 85%, transparent);
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  border-bottom: 1px solid var(--m3-outline-variant);
}

body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-btn {
  border-radius: var(--m3-shape-md);
  transition: background-color var(--m3-motion-short) var(--m3-easing-standard);
}

body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-btn:hover {
  background: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
}

body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-menu {
  background: var(--m3-surface-container-high);
  border: 1px solid var(--m3-outline-variant);
  border-radius: var(--m3-shape-lg);
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.08), 0 12px 32px 0 rgba(0, 0, 0, 0.12);
}

body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-item {
  border-radius: var(--m3-shape-md);
  transition: background-color var(--m3-motion-short) var(--m3-easing-standard);
}

body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-item:hover {
  background: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
}

/* 赞助弹窗 M3 化 */
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-sponsor-card {
  background: var(--m3-surface-container-high);
  border: 1px solid var(--m3-outline-variant);
  border-radius: var(--m3-shape-xl);
}
`;
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

function initM3Theme() {
  // 1. 注入 CSS
  injectM3ThemeCSS();
  
  // 2. 读取保存的偏好
  const savedEnabled = loadThemePreference();
  
  // 3. 应用主题
  applyM3Theme(savedEnabled);
  
  // 4. 启动设置页面观察者
  startSettingsObserver();
  
  // 5. 监听系统主题变化（暗色/浅色），保持同步
  if (window.matchMedia) {
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    darkMedia.addEventListener('change', () => {
      // 主题切换时重新应用以确保变量正确
      if (m3Enabled) {
        applyM3Theme(true);
      }
    });
  }
  
  // 6. 暴露 API 供外部调用
  window.__m3Theme = {
    isEnabled: () => m3Enabled,
    toggle: toggleM3Theme,
    set: (enabled) => {
      saveThemePreference(enabled);
      applyM3Theme(enabled);
      updateAllThemeButtons();
    },
  };
}

// 导出给 preload.js 主模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initM3Theme };
}
