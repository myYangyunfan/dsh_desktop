import type * as os from "node:os";
/**
 * Interface 辞書から host 候補アドレスを選別する（package-private）。
 * 公開 barrel (`src/index.ts`) からは export しない。
 * テストは本 helper への依存注入で行う。
 */
export declare function selectAddressesFromInterfaces(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[] | undefined>, family: number, options: {
    useLinkLocalAddress?: boolean;
} | undefined, isLinkLocal: (info: os.NetworkInterfaceInfo) => boolean): string[];
