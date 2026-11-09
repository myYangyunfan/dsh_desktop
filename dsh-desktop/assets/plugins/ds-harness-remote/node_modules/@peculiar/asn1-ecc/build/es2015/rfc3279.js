import { __decorate } from "tslib";
import { AsnType, AsnTypeTypes, AsnProp, AsnPropTypes, OctetString, AsnIntegerArrayBufferConverter } from "@peculiar/asn1-schema";
let FieldID = class FieldID {
    fieldType;
    parameters;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], FieldID.prototype, "fieldType", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.Any })
], FieldID.prototype, "parameters", void 0);
FieldID = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], FieldID);
export { FieldID };
export class ECPoint extends OctetString {
}
export class FieldElement extends OctetString {
}
let Curve = class Curve {
    a;
    b;
    seed;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.OctetString })
], Curve.prototype, "a", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.OctetString })
], Curve.prototype, "b", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.BitString,
        optional: true,
    })
], Curve.prototype, "seed", void 0);
Curve = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], Curve);
export { Curve };
export var ECPVer;
(function (ECPVer) {
    ECPVer[ECPVer["ecpVer1"] = 1] = "ecpVer1";
})(ECPVer || (ECPVer = {}));
let SpecifiedECDomain = class SpecifiedECDomain {
    version = ECPVer.ecpVer1;
    fieldID;
    curve;
    base;
    order;
    cofactor;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.Integer })
], SpecifiedECDomain.prototype, "version", void 0);
__decorate([
    AsnProp({ type: FieldID })
], SpecifiedECDomain.prototype, "fieldID", void 0);
__decorate([
    AsnProp({ type: Curve })
], SpecifiedECDomain.prototype, "curve", void 0);
__decorate([
    AsnProp({ type: ECPoint })
], SpecifiedECDomain.prototype, "base", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        converter: AsnIntegerArrayBufferConverter,
    })
], SpecifiedECDomain.prototype, "order", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Integer,
        optional: true,
    })
], SpecifiedECDomain.prototype, "cofactor", void 0);
SpecifiedECDomain = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], SpecifiedECDomain);
export { SpecifiedECDomain };
