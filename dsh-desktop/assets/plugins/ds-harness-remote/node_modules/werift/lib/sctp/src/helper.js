"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enumerate = enumerate;
exports.createEventsFromList = createEventsFromList;
const common_1 = require("./imports/common");
function enumerate(arr) {
    return arr.map((v, i) => [i, v]);
}
function createEventsFromList(list) {
    return list.reduce((acc, cur) => {
        acc[cur] = new common_1.Event();
        return acc;
    }, {});
}
//# sourceMappingURL=helper.js.map