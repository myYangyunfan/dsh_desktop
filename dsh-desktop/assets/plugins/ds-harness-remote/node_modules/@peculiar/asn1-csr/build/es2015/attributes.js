var Attributes_1;
import { __decorate } from "tslib";
import { AsnArray, AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";
import { Attribute } from "@peculiar/asn1-x509";
let Attributes = Attributes_1 = class Attributes extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, Attributes_1.prototype);
    }
};
Attributes = Attributes_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Sequence,
        itemType: Attribute,
    })
], Attributes);
export { Attributes };
