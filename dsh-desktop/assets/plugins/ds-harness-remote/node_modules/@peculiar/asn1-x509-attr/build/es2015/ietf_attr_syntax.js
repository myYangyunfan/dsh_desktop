import { __decorate } from "tslib";
import { AsnProp, OctetString, AsnPropTypes } from "@peculiar/asn1-schema";
import { GeneralNames } from "@peculiar/asn1-x509";
export class IetfAttrSyntaxValueChoices {
    cotets;
    oid;
    string;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: OctetString })
], IetfAttrSyntaxValueChoices.prototype, "cotets", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], IetfAttrSyntaxValueChoices.prototype, "oid", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.Utf8String })
], IetfAttrSyntaxValueChoices.prototype, "string", void 0);
export class IetfAttrSyntax {
    policyAuthority;
    values = [];
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({
        type: GeneralNames,
        implicit: true,
        context: 0,
        optional: true,
    })
], IetfAttrSyntax.prototype, "policyAuthority", void 0);
__decorate([
    AsnProp({
        type: IetfAttrSyntaxValueChoices,
        repeated: "sequence",
    })
], IetfAttrSyntax.prototype, "values", void 0);
