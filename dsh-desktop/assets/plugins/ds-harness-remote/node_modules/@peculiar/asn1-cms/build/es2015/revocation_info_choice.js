var RevocationInfoChoices_1;
import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnType, AsnTypeTypes, AsnArray } from "@peculiar/asn1-schema";
import { id_pkix } from "@peculiar/asn1-x509";
export const id_ri = `${id_pkix}.16`;
export const id_ri_ocsp_response = `${id_ri}.2`;
export const id_ri_scvp = `${id_ri}.4`;
export class OtherRevocationInfoFormat {
    otherRevInfoFormat = "";
    otherRevInfo = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], OtherRevocationInfoFormat.prototype, "otherRevInfoFormat", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.Any })
], OtherRevocationInfoFormat.prototype, "otherRevInfo", void 0);
let RevocationInfoChoice = class RevocationInfoChoice {
    other = new OtherRevocationInfoFormat();
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
__decorate([
    AsnProp({
        type: OtherRevocationInfoFormat,
        context: 1,
        implicit: true,
    })
], RevocationInfoChoice.prototype, "other", void 0);
RevocationInfoChoice = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], RevocationInfoChoice);
export { RevocationInfoChoice };
let RevocationInfoChoices = RevocationInfoChoices_1 = class RevocationInfoChoices extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, RevocationInfoChoices_1.prototype);
    }
};
RevocationInfoChoices = RevocationInfoChoices_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Set,
        itemType: RevocationInfoChoice,
    })
], RevocationInfoChoices);
export { RevocationInfoChoices };
