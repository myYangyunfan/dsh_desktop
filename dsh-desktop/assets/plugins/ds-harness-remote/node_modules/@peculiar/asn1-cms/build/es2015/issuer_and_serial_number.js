import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnIntegerArrayBufferConverter } from "@peculiar/asn1-schema";
import { Name } from "@peculiar/asn1-x509";
export class IssuerAndSerialNumber {
    issuer = new Name();
    serialNumber = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: Name })
], IssuerAndSerialNumber.prototype, "issuer", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], IssuerAndSerialNumber.prototype, "serialNumber", void 0);
