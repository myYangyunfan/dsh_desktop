export declare class Alert {
    level: number;
    description: number;
    static readonly spec: {
        level: number;
        description: number;
    };
    constructor(level: number, description: number);
    static deSerialize(buf: Buffer): Alert;
    serialize(): Buffer<ArrayBuffer>;
}
