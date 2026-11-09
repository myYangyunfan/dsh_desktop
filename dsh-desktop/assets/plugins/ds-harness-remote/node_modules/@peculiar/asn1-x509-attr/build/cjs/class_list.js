"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassList = exports.ClassListFlags = void 0;
const asn1_schema_1 = require("@peculiar/asn1-schema");
var ClassListFlags;
(function (ClassListFlags) {
    ClassListFlags[ClassListFlags["unmarked"] = 1] = "unmarked";
    ClassListFlags[ClassListFlags["unclassified"] = 2] = "unclassified";
    ClassListFlags[ClassListFlags["restricted"] = 4] = "restricted";
    ClassListFlags[ClassListFlags["confidential"] = 8] = "confidential";
    ClassListFlags[ClassListFlags["secret"] = 16] = "secret";
    ClassListFlags[ClassListFlags["topSecret"] = 32] = "topSecret";
})(ClassListFlags || (exports.ClassListFlags = ClassListFlags = {}));
class ClassList extends asn1_schema_1.BitString {
}
exports.ClassList = ClassList;
