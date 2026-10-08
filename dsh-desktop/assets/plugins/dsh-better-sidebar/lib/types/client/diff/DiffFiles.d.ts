import { type DiffFile, type DiffRow, type FoldSegment } from './rows.ts';
export interface DiffFilesProps {
    /** Unified diff text (`git.diff` or `git.commit-diff` payloads). */
    diff: string;
    /** Untracked-file content: when present, renders as a full-file addition instead of parsing. */
    untrackedPath?: string;
    untrackedContent?: string;
    /** Fetch a git gap fold's hidden rows on demand (both sides' contents by
     *  the fold's line ranges); forwarded to every file's DiffRows. Absent
     *  folds without `rows` stay non-expandable (session-op diffs and
     *  untracked additions always carry theirs). */
    resolveFold?: (file: DiffFile, segment: FoldSegment) => Promise<readonly DiffRow[]>;
}
export declare function DiffFiles({ diff, untrackedPath, untrackedContent, resolveFold }: DiffFilesProps): import("react").JSX.Element | null;
