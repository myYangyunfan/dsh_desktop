/**
 * Icons the sidebar needs beyond the primitives set: a terminal glyph (the
 * icon library has none), a diff glyph, and the bottom-workbench toggle.
 * Per-tab icons live on the tab descriptors
 * (`descriptor.icon`), not in a type-keyed switch — the icon mapping was
 * registry-ized with the tab types.
 */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Bottom-panel toggle glyph (the "底栏" button): a frame with a filled strip
 * along its BOTTOM edge, in the app's outline style.
 */
export declare const IconPanelBottomOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/**
 * Terminal glyph in the app's outline style (1.5px stroke, currentColor):
 * a rounded frame with a prompt chevron and underscore cursor.
 */
export declare const IconTerminalOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Diff glyph in the app's outline style: a file frame with a plus and a minus row. */
export declare const IconDiffOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Upload glyph in the app's outline style: an arrow rising into a tray
 *  (the file-manager "upload into the workspace" action). */
export declare const IconUploadOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Markdown viewer glyph: the classic "M with a down arrow" badge. */
export declare const IconMarkdownOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** HTML viewer glyph: a document frame with a "‹/›" tag pair. */
export declare const IconHtmlOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Browser tab glyph: a globe with meridians. */
export declare const IconGlobeOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** History glyph (thread switcher): a clock with a counterclockwise arrow,
 *  in the app's outline style — the "past conversations" mark. */
export declare const IconHistoryOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Save glyph (save-as-new-session): the classic floppy disk, in the app's
 *  outline style. */
export declare const IconSaveOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/**
 * Visual Studio Code brand mark for the file-tree "open with" menu. The
 * path is the Simple Icons `visualstudiocode` glyph (CC0 1.0,
 * simple-icons@11.0.0 — later releases dropped it over Microsoft's brand
 * policy, so it is inlined here rather than pulled from react-icons),
 * rendered monochrome via currentColor to follow the active skin.
 */
export declare const IconVscode16: ({ size, className }: IconProps) => import("react").JSX.Element;
