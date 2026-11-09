import { __decorate } from "tslib";
import { DigestInfo } from "@peculiar/asn1-rsa";
import { AsnProp, AsnPropTypes, OctetString } from "@peculiar/asn1-schema";
export class MacData {
    mac = new DigestInfo();
    macSalt = new OctetString();
    iterations = 1;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: DigestInfo })
], MacData.prototype, "mac", void 0);
__decorate([
    AsnProp({ type: OctetString })
], MacData.prototype, "macSalt", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        defaultValue: 1,
    })
], MacData.prototype, "iterations", void 0);
