export declare class WeriftError extends Error {
    message: string;
    payload?: object;
    path?: string;
    constructor(props: Pick<WeriftError, "message" | "payload" | "path">);
    toJSON(): {
        message: string;
        payload: any;
        path: string | undefined;
    };
}
export declare const debug: any;
