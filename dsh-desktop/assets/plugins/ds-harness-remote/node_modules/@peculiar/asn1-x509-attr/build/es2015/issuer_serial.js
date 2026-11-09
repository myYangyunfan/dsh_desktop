import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnIntegerArrayBufferConverter } from "@peculiar/asn1-schema";
import { GeneralNames } from "@peculiar/asn1-x509";
export class IssuerSerial {
    issuer = new GeneralNames();
    serial = new ArrayBuffer(0);
    issuerUID = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: GeneralNames })
], IssuerSerial.prototype, "issuer", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], IssuerSerial.prototype, "serial", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.BitString,
        optional: true,
    })
], IssuerSerial.prototype, "issuerUID", void 0);
