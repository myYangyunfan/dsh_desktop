import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnIntegerArrayBufferConverter } from "@peculiar/asn1-schema";
export class RSAPublicKey {
    modulus = new ArrayBuffer(0);
    publicExponent = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], RSAPublicKey.prototype, "modulus", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], RSAPublicKey.prototype, "publicExponent", void 0);
