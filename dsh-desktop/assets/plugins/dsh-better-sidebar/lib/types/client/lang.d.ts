/**
 * Syntax highlighting for the file editor: extension → CodeMirror language
 * mapping. The key derivation is pure and unit-tested; the factories pull in
 * the CodeMirror language packages (bundled into the client).
 */
import { Language, LanguageSupport } from '@codemirror/language';
import { extOf } from './paths.ts';
export { extOf };
/** Language key for an extension, or null for plain text. Pure (tested). */
export declare function languageKeyForExt(ext: string): string | null;
/** Every language key the extension table can produce (test seam). */
export declare function supportedLanguageKeys(): readonly string[];
/** The CodeMirror language support for a path, or null for plain text. */
export declare function languageForPath(path: string): Language | LanguageSupport | null;
