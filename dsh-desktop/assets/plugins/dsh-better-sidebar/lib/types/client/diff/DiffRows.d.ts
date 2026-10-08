import { type DiffRow, type DiffSegment, type FoldSegment } from './rows.ts';
export interface DiffRowsProps {
    /** Precomputed segments (hunks and folds) for one file's diff. */
    segments: readonly DiffSegment[];
    /** Syntax language id (langOfPath); undefined renders plain text. */
    lang?: string;
    /** Fetch a git gap fold's hidden rows on demand (both sides' contents
     *  sliced by the fold's line ranges). Absent folds without `rows` — git's
     *  unemitted gaps without a resolver — stay non-expandable markers. */
    resolveFold?: (segment: FoldSegment) => Promise<readonly DiffRow[]>;
}
/** One file's diff rows: fold chips between hunks, highlighted code rows. */
export declare function DiffRows({ segments, lang, resolveFold }: DiffRowsProps): import("react").JSX.Element;
export interface ReadRowsProps {
    /** The file lines with their real line numbers (parseReadLines output). */
    lines: ReadonlyArray<{
        line: number;
        text: string;
    }>;
    /** Syntax language id (langOfPath); undefined renders plain text. */
    lang?: string;
}
/** The read view: a line-numbered, syntax-colored slice of a read file. */
export declare function ReadRows({ lines, lang }: ReadRowsProps): import("react").JSX.Element;
