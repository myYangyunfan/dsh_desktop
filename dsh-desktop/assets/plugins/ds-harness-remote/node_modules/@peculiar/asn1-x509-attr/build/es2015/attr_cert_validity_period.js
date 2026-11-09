import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
export class AttCertValidityPeriod {
    notBeforeTime = new Date();
    notAfterTime = new Date();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.GeneralizedTime })
], AttCertValidityPeriod.prototype, "notBeforeTime", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.GeneralizedTime })
], AttCertValidityPeriod.prototype, "notAfterTime", void 0);
