/**
 * The plugin's GLOBAL UI atoms — the one place the files page, the changes
 * page, the tasks page and every future page take their row chrome, badges,
 * state lines and confirmations from.
 *
 * Why they exist: the repo carried 14 duplicated empty/error/hint classes
 * across four stylesheets (two of them byte-identical), two copies of the
 * Cancel/Confirm modal, five icon-button recipes (including a class-NAME
 * collision: `.iconButton` was a 28px circle in one sheet and a 24px square
 * in another) and five chip/toggle recipes. These components own those
 * pictures ONCE, cut to the plugin's native scale (see
 * `docs/plans/2026-09-27-files-changes-uiux.md` §1): 12px body, 11px meta,
 * 28px controls/rows, 2/3/4/8px radii, one accent.
 *
 * Skin contract: every paint comes from `kit.module.css` and resolves to a
 * `--dsw-*` / `--ds-*` token (`tests/theme.spec.ts` scans the sheet).
 */
import { type MouseEvent, type ReactNode } from 'react';
/**
 * A 28px (`md`) or 24px (`sm`) square glyph button — the ONE icon button of
 * the plugin. Callers that need a pressed state pass `active`; the danger
 * tone only recolors the glyph/hover, never the geometry.
 */
export declare function IconButton(props: {
    icon: ReactNode;
    /** Accessible name; also the default hover title. */
    label: string;
    title?: string;
    onClick(event: MouseEvent<HTMLButtonElement>): void;
    size?: 'md' | 'sm';
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    className?: string | undefined;
}): ReactNode;
/**
 * A small toggle chip (filters, list switches). `count` renders as a trailing
 * figure in the meta rung; the chip's rest / hover / selected states are three
 * different pictures (a bare fill swap reads as hover).
 */
export declare function Chip(props: {
    children: ReactNode;
    active?: boolean;
    count?: number;
    title?: string;
    disabled?: boolean;
    onClick(): void;
    className?: string | undefined;
}): ReactNode;
/**
 * A 28px section band: a label (with an optional count) that may carry ONE
 * trailing action. The hairline under it is the page's only section divider.
 */
export declare function SectionHeader(props: {
    label: ReactNode;
    count?: number;
    action?: ReactNode;
    className?: string | undefined;
    children?: ReactNode;
}): ReactNode;
/**
 * The plugin's state lines: empty / loading / error / warn / hint.
 * `tone` picks the geometry (`page` = centered 16px block, `well` = the
 * compact 4/12/8 line inside a list, `inline` = 10px micro copy).
 */
export declare function Notice(props: {
    kind: 'empty' | 'loading' | 'error' | 'warn' | 'hint';
    tone?: 'page' | 'well' | 'inline';
    role?: string;
    className?: string | undefined;
    children: ReactNode;
}): ReactNode;
/**
 * The ONE confirmation dialog: a quiet single-question body and a
 * Cancel/Confirm footer, with `busy` locking both actions while the action
 * runs. Destructive callers pass `danger` so the primary button reads as one.
 */
export declare function ConfirmDialog(props: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm(): void;
    onClose(): void;
}): ReactNode;
/**
 * The status vocabulary shared by git rows, session-op rows and diff kinds.
 * `neutral` is the fallback for a kind the caller has no tone for.
 */
export type StatusTone = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'conflict' | 'read' | 'write' | 'edit' | 'neutral';
/** A compact status badge: a git letter, an op kind, a diff tag. */
export declare function StatusBadge(props: {
    tone: StatusTone;
    title?: string;
    className?: string | undefined;
    children: ReactNode;
}): ReactNode;
