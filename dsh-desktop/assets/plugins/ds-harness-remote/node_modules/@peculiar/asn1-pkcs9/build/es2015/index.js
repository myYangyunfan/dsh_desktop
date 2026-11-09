var ExtensionRequest_1, ExtendedCertificateAttributes_1, SMIMECapabilities_1;
import { __decorate } from "tslib";
import { AsnType, AsnTypeTypes, AsnPropTypes, AsnProp, OctetString, AsnArray } from "@peculiar/asn1-schema";
import * as cms from "@peculiar/asn1-cms";
import * as pfx from "@peculiar/asn1-pfx";
import * as pkcs8 from "@peculiar/asn1-pkcs8";
import * as x509 from "@peculiar/asn1-x509";
import * as attr from "@peculiar/asn1-x509-attr";
export const id_pkcs9 = "1.2.840.113549.1.9";
export const id_pkcs9_mo = `${id_pkcs9}.0`;
export const id_pkcs9_oc = `${id_pkcs9}.24`;
export const id_pkcs9_at = `${id_pkcs9}.25`;
export const id_pkcs9_sx = `${id_pkcs9}.26`;
export const id_pkcs9_mr = `${id_pkcs9}.27`;
export const id_pkcs9_oc_pkcsEntity = `${id_pkcs9_oc}.1`;
export const id_pkcs9_oc_naturalPerson = `${id_pkcs9_oc}.2`;
export const id_pkcs9_at_emailAddress = `${id_pkcs9}.1`;
export const id_pkcs9_at_unstructuredName = `${id_pkcs9}.2`;
export const id_pkcs9_at_contentType = `${id_pkcs9}.3`;
export const id_pkcs9_at_messageDigest = `${id_pkcs9}.4`;
export const id_pkcs9_at_signingTime = `${id_pkcs9}.5`;
export const id_pkcs9_at_counterSignature = `${id_pkcs9}.6`;
export const id_pkcs9_at_challengePassword = `${id_pkcs9}.7`;
export const id_pkcs9_at_unstructuredAddress = `${id_pkcs9}.8`;
export const id_pkcs9_at_extendedCertificateAttributes = `${id_pkcs9}.9`;
export const id_pkcs9_at_signingDescription = `${id_pkcs9}.13`;
export const id_pkcs9_at_extensionRequest = `${id_pkcs9}.14`;
export const id_pkcs9_at_smimeCapabilities = `${id_pkcs9}.15`;
export const id_pkcs9_at_friendlyName = `${id_pkcs9}.20`;
export const id_pkcs9_at_localKeyId = `${id_pkcs9}.21`;
export const id_pkcs9_at_userPKCS12 = "2.16.840.1.113730.3.1.216";
export const id_pkcs9_at_pkcs15Token = `${id_pkcs9_at}.1`;
export const id_pkcs9_at_encryptedPrivateKeyInfo = `${id_pkcs9_at}.2`;
export const id_pkcs9_at_randomNonce = `${id_pkcs9_at}.3`;
export const id_pkcs9_at_sequenceNumber = `${id_pkcs9_at}.4`;
export const id_pkcs9_at_pkcs7PDU = `${id_pkcs9_at}.5`;
export const id_ietf_at = "1.3.6.1.5.5.7.9";
export const id_pkcs9_at_dateOfBirth = `${id_ietf_at}.1`;
export const id_pkcs9_at_placeOfBirth = `${id_ietf_at}.2`;
export const id_pkcs9_at_gender = `${id_ietf_at}.3`;
export const id_pkcs9_at_countryOfCitizenship = `${id_ietf_at}.4`;
export const id_pkcs9_at_countryOfResidence = `${id_ietf_at}.5`;
export const id_pkcs9_sx_pkcs9String = `${id_pkcs9_sx}.1`;
export const id_pkcs9_sx_signingTime = `${id_pkcs9_sx}.2`;
export const id_pkcs9_mr_caseIgnoreMatch = `${id_pkcs9_mr}.1`;
export const id_pkcs9_mr_signingTimeMatch = `${id_pkcs9_mr}.2`;
export const id_smime = `${id_pkcs9}.16`;
export const id_certTypes = `${id_pkcs9}.22`;
export const crlTypes = `${id_pkcs9}.23`;
export const id_at_pseudonym = `${attr.id_at}.65`;
let PKCS9String = class PKCS9String extends x509.DirectoryString {
    ia5String;
    constructor(params = {}) {
        super(params);
    }
    toString() {
        const o = {};
        o.toString();
        return this.ia5String || super.toString();
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.IA5String })
], PKCS9String.prototype, "ia5String", void 0);
PKCS9String = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], PKCS9String);
export { PKCS9String };
let Pkcs7PDU = class Pkcs7PDU extends cms.ContentInfo {
};
Pkcs7PDU = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], Pkcs7PDU);
export { Pkcs7PDU };
let UserPKCS12 = class UserPKCS12 extends pfx.PFX {
};
UserPKCS12 = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], UserPKCS12);
export { UserPKCS12 };
let EncryptedPrivateKeyInfo = class EncryptedPrivateKeyInfo extends pkcs8.EncryptedPrivateKeyInfo {
};
EncryptedPrivateKeyInfo = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], EncryptedPrivateKeyInfo);
export { EncryptedPrivateKeyInfo };
let EmailAddress = class EmailAddress {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.IA5String })
], EmailAddress.prototype, "value", void 0);
EmailAddress = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], EmailAddress);
export { EmailAddress };
let UnstructuredName = class UnstructuredName extends PKCS9String {
};
UnstructuredName = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], UnstructuredName);
export { UnstructuredName };
let UnstructuredAddress = class UnstructuredAddress extends x509.DirectoryString {
};
UnstructuredAddress = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], UnstructuredAddress);
export { UnstructuredAddress };
let DateOfBirth = class DateOfBirth {
    value;
    constructor(value = new Date()) {
        this.value = value;
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.GeneralizedTime })
], DateOfBirth.prototype, "value", void 0);
DateOfBirth = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], DateOfBirth);
export { DateOfBirth };
let PlaceOfBirth = class PlaceOfBirth extends x509.DirectoryString {
};
PlaceOfBirth = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], PlaceOfBirth);
export { PlaceOfBirth };
let Gender = class Gender {
    value;
    constructor(value = "M") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.PrintableString })
], Gender.prototype, "value", void 0);
Gender = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], Gender);
export { Gender };
let CountryOfCitizenship = class CountryOfCitizenship {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.PrintableString })
], CountryOfCitizenship.prototype, "value", void 0);
CountryOfCitizenship = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], CountryOfCitizenship);
export { CountryOfCitizenship };
let CountryOfResidence = class CountryOfResidence extends CountryOfCitizenship {
};
CountryOfResidence = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], CountryOfResidence);
export { CountryOfResidence };
let Pseudonym = class Pseudonym extends x509.DirectoryString {
};
Pseudonym = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], Pseudonym);
export { Pseudonym };
let ContentType = class ContentType {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], ContentType.prototype, "value", void 0);
ContentType = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], ContentType);
export { ContentType };
export class MessageDigest extends OctetString {
}
let SigningTime = class SigningTime extends x509.Time {
};
SigningTime = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], SigningTime);
export { SigningTime };
export class RandomNonce extends OctetString {
}
let SequenceNumber = class SequenceNumber {
    value;
    constructor(value = 0) {
        this.value = value;
    }
    toString() {
        return this.value.toString();
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.Integer })
], SequenceNumber.prototype, "value", void 0);
SequenceNumber = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], SequenceNumber);
export { SequenceNumber };
let CounterSignature = class CounterSignature extends cms.SignerInfo {
};
CounterSignature = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], CounterSignature);
export { CounterSignature };
let ChallengePassword = class ChallengePassword extends x509.DirectoryString {
};
ChallengePassword = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], ChallengePassword);
export { ChallengePassword };
let ExtensionRequest = ExtensionRequest_1 = class ExtensionRequest extends x509.Extensions {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, ExtensionRequest_1.prototype);
    }
};
ExtensionRequest = ExtensionRequest_1 = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], ExtensionRequest);
export { ExtensionRequest };
let ExtendedCertificateAttributes = ExtendedCertificateAttributes_1 = class ExtendedCertificateAttributes extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, ExtendedCertificateAttributes_1.prototype);
    }
};
ExtendedCertificateAttributes = ExtendedCertificateAttributes_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Set,
        itemType: cms.Attribute,
    })
], ExtendedCertificateAttributes);
export { ExtendedCertificateAttributes };
let FriendlyName = class FriendlyName {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
__decorate([
    AsnProp({ type: AsnPropTypes.BmpString })
], FriendlyName.prototype, "value", void 0);
FriendlyName = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], FriendlyName);
export { FriendlyName };
export class LocalKeyId extends OctetString {
}
export class SigningDescription extends x509.DirectoryString {
}
let SMIMECapability = class SMIMECapability extends x509.AlgorithmIdentifier {
};
SMIMECapability = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], SMIMECapability);
export { SMIMECapability };
let SMIMECapabilities = SMIMECapabilities_1 = class SMIMECapabilities extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, SMIMECapabilities_1.prototype);
    }
};
SMIMECapabilities = SMIMECapabilities_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Sequence,
        itemType: SMIMECapability,
    })
], SMIMECapabilities);
export { SMIMECapabilities };
