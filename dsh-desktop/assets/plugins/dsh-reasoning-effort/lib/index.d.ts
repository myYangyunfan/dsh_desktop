/**
 * Host half: read-only reasoning-effort guidance.
 *
 * The slider can only offer what the DSH model directory exposes, and the
 * request path validates every submitted effort against that same directory
 * (`UNSUPPORTED_REASONING_EFFORT` otherwise). This half therefore never
 * invents levels and never writes configuration: it diagnoses custom-provider
 * models the directory under-describes and returns copy-ready
 * `reasoningEfforts` declarations (exact when the knowledge base knows the
 * model, a filled template otherwise) for the user to paste into
 * the active DSH configuration document. Built-in catalog models are trusted as-is and never
 * flagged.
 *
 * @module dsh-reasoning-effort
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type KnowledgeEntry } from './knowledge.js';
export declare const name = "dsh-reasoning-effort";
/**
 * Hard dependencies: the loader waits for these services before calling
 * `apply`, so the row never races the boot order of the base bundle rows.
 * `connection` is deliberately absent — only Web profiles provide it, so the
 * RPC channel is mounted through `ctx.inject` instead of blocking this row.
 */
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    entries: z<any[], any[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    entries: z<any[], any[], "defined">;
}>>, "plain">;
interface StoreShape {
    entries?: KnowledgeEntry[];
}
export declare function apply(ctx: Context, config?: StoreShape): void;
export {};
