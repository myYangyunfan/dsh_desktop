/**
 * The zh-HK (Traditional Chinese — Hong Kong) dictionary for the betterSidebar
 * namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. Consumed by better-locale's
 * override store when the active override id is `'zh-HK'` (registered under
 * the `betterSidebar` namespace). Absent that, the existing zh/en chain
 * runs unchanged.
 *
 * Hong Kong regional conventions:
 * - 软件 → 軟件 (NOT 軟體); 网络 → 網絡 (NOT 網路); 鼠标 → 滑鼠
 * - 檔案 (file), 資料夾 (folder), 程式 (program), 程式碼 (code), 螢幕 (screen)
 * - 預設 (default), 儲存 (save), 設定 (settings/config), 唯讀 (read-only)
 * - 資源管理器 → 檔案總管; refresh → 重新整理; cache → 快取
 * - timeout → 逾時; loop → 迴圈; override → 覆寫; built-in → 內建
 * - adapter → 介面卡; interface → 介面; address → 位址; field → 欄位
 * - byte → 位元組; binary → 二進位; character → 字元; hash → 雜湊
 * - rename → 重新命名; archive → 歸檔; idle → 閒置; mount → 掛載
 * - package → 套件; generate → 產生; fetch → 取得; export → 匯出
 * - login → 登入; detect → 偵測; block → 封鎖; access → 存取
 * - port → 連接埠; sensor → 感測器; server → 伺服器; global → 全域
 * - nested → 巢狀; thread → 執行緒; queue → 佇列; tab → 標籤
 * - source code → 原始碼; symlink → 符號連結; recover → 復原
 * - placeholder → 佔位符; template → 範本; variable → 變數
 * - through → 透過; paste → 貼上; project → 專案; account → 帳號
 * - session (会话) → 工作階段; chat (对话) → 對話
 * - quotation marks: "" → 「」
 * - Placeholders keep `{name}` verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH, Git, Chrome) stay as-is.
 */
/** The zh-HK dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const zhMO: Record<string, string>;
