import { BitString } from "@peculiar/asn1-schema";
export var ClassListFlags;
(function (ClassListFlags) {
    ClassListFlags[ClassListFlags["unmarked"] = 1] = "unmarked";
    ClassListFlags[ClassListFlags["unclassified"] = 2] = "unclassified";
    ClassListFlags[ClassListFlags["restricted"] = 4] = "restricted";
    ClassListFlags[ClassListFlags["confidential"] = 8] = "confidential";
    ClassListFlags[ClassListFlags["secret"] = 16] = "secret";
    ClassListFlags[ClassListFlags["topSecret"] = 32] = "topSecret";
})(ClassListFlags || (ClassListFlags = {}));
export class ClassList extends BitString {
}
