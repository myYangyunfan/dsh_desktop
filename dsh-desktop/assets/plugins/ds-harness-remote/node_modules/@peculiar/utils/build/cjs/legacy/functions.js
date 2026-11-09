"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assign = assign;
exports.combine = combine;
exports.isEqual = isEqual;
const index_js_1 = require("../bytes/index.js");
function assign(target, ...sources) {
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
function combine(...buf) {
    return (0, index_js_1.concat)(buf);
}
function isEqual(bytes1, bytes2) {
    return (0, index_js_1.equal)(bytes1, bytes2);
}
