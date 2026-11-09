import { concat, equal } from "../bytes/index.js";
export function assign(target, ...sources) {
    for (const source of sources) {
        if (!source) {
            continue;
        }
        for (const prop in source) {
            target[prop] = source[prop];
        }
    }
    return target;
}
export function combine(...buf) {
    return concat(buf);
}
export function isEqual(bytes1, bytes2) {
    return equal(bytes1, bytes2);
}
