/** Shared config references used by schema validators and plugin runtimes. */
/** Recursively readonly data returned by a volatile config reference. */
export type VolatileSnapshot<T> = T extends object ? {
    readonly [K in keyof T]: VolatileSnapshot<T[K]>;
} : T;
/** A stable reference; keep the reference, or capture its value for one operation only. */
export interface Volatile<T> {
    /** @returns the current immutable snapshot, including undefined for an absent value. */
    get(): VolatileSnapshot<T>;
}
/**
 * Create a detached reference containing an immutable copy of the supplied data.
 * @param value - validated config data; class instances and functions are unsupported.
 * @returns a reference whose value is updated only by its owning runtime.
 */
export declare function createVolatile<T>(value: T): Volatile<T>;
/**
 * Identify references across ESM/CJS copies of the shared library.
 * @param value - a parsed config value.
 * @returns whether the value implements the shared reference protocol.
 */
export declare function isVolatile(value: unknown): value is Volatile<unknown>;
/**
 * Collect config references without descending into their snapshots or opaque objects.
 * @internal
 * @param value - parsed config; cyclic ordinary fields are visited once per path.
 * @returns references and their object-key paths, including an empty path for a root reference.
 */
export declare function volatileEntries(value: unknown): {
    path: string[];
    ref: Volatile<unknown>;
}[];
/**
 * Commit an already validated immutable snapshot from another reference.
 * @internal
 * @param target - the owning plugin's stable reference.
 * @param source - a newly parsed candidate reference.
 */
export declare function updateVolatile(target: Volatile<unknown>, source: Volatile<unknown>): void;
//# sourceMappingURL=volatile.d.ts.map