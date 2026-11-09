export declare const p256Keypair: () => {
    privateKey: Buffer;
    publicKey: Buffer;
};
export declare const p256PreMasterSecret: ({ publicKey, privateKey, }: {
    publicKey: Buffer;
    privateKey: Buffer;
}) => Buffer;
