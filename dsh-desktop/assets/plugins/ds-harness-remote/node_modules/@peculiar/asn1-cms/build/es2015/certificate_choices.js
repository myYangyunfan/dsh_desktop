var CertificateSet_1;
import { __decorate } from "tslib";
import { AsnType, AsnTypeTypes, AsnProp, AsnPropTypes, AsnArray } from "@peculiar/asn1-schema";
import { Certificate } from "@peculiar/asn1-x509";
import { AttributeCertificate } from "@peculiar/asn1-x509-attr";
export class OtherCertificateFormat {
    otherCertFormat = "";
    otherCert = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], OtherCertificateFormat.prototype, "otherCertFormat", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.Any })
], OtherCertificateFormat.prototype, "otherCert", void 0);
let CertificateChoices = class CertificateChoices {
    certificate;
    v2AttrCert;
    other;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
__decorate([
    AsnProp({ type: Certificate })
], CertificateChoices.prototype, "certificate", void 0);
__decorate([
    AsnProp({
        type: AttributeCertificate,
        context: 2,
        implicit: true,
    })
], CertificateChoices.prototype, "v2AttrCert", void 0);
__decorate([
    AsnProp({
        type: OtherCertificateFormat,
        context: 3,
        implicit: true,
    })
], CertificateChoices.prototype, "other", void 0);
CertificateChoices = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], CertificateChoices);
export { CertificateChoices };
let CertificateSet = CertificateSet_1 = class CertificateSet extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, CertificateSet_1.prototype);
    }
};
CertificateSet = CertificateSet_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Set,
        itemType: CertificateChoices,
    })
], CertificateSet);
export { CertificateSet };
