var AttrSpec_1;
import { __decorate } from "tslib";
import { AsnType, AsnTypeTypes, AsnPropTypes, AsnArray } from "@peculiar/asn1-schema";
let AttrSpec = AttrSpec_1 = class AttrSpec extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, AttrSpec_1.prototype);
    }
};
AttrSpec = AttrSpec_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Sequence,
        itemType: AsnPropTypes.ObjectIdentifier,
    })
], AttrSpec);
export { AttrSpec };
