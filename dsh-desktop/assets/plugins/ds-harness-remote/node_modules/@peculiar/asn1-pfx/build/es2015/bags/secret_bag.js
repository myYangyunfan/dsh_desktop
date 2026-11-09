import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
export class SecretBag {
    secretTypeId = "";
    secretValue = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], SecretBag.prototype, "secretTypeId", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        context: 0,
    })
], SecretBag.prototype, "secretValue", void 0);
