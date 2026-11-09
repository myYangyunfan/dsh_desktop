/** Result envelope for the plugin's local control route. */
export type ControlResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
};
//# sourceMappingURL=control-result.d.ts.map