import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnIntegerArrayBufferConverter } from "@peculiar/asn1-schema";
export class ECDSASigValue {
    r = new ArrayBuffer(0);
    s = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], ECDSASigValue.prototype, "r", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], ECDSASigValue.prototype, "s", void 0);
