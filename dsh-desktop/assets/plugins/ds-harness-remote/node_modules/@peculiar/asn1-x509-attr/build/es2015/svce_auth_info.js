import { __decorate } from "tslib";
import { AsnProp, OctetString } from "@peculiar/asn1-schema";
import { GeneralName } from "@peculiar/asn1-x509";
export class SvceAuthInfo {
    service = new GeneralName();
    ident = new GeneralName();
    authInfo;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: GeneralName })
], SvceAuthInfo.prototype, "service", void 0);
__decorate([
    AsnProp({ type: GeneralName })
], SvceAuthInfo.prototype, "ident", void 0);
__decorate([
    AsnProp({
        type: OctetString,
        optional: true,
    })
], SvceAuthInfo.prototype, "authInfo", void 0);
