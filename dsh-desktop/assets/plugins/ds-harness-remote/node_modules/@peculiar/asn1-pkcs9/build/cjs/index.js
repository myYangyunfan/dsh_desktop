"use strict";
var ExtensionRequest_1, ExtendedCertificateAttributes_1, SMIMECapabilities_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateOfBirth = exports.UnstructuredAddress = exports.UnstructuredName = exports.EmailAddress = exports.EncryptedPrivateKeyInfo = exports.UserPKCS12 = exports.Pkcs7PDU = exports.PKCS9String = exports.id_at_pseudonym = exports.crlTypes = exports.id_certTypes = exports.id_smime = exports.id_pkcs9_mr_signingTimeMatch = exports.id_pkcs9_mr_caseIgnoreMatch = exports.id_pkcs9_sx_signingTime = exports.id_pkcs9_sx_pkcs9String = exports.id_pkcs9_at_countryOfResidence = exports.id_pkcs9_at_countryOfCitizenship = exports.id_pkcs9_at_gender = exports.id_pkcs9_at_placeOfBirth = exports.id_pkcs9_at_dateOfBirth = exports.id_ietf_at = exports.id_pkcs9_at_pkcs7PDU = exports.id_pkcs9_at_sequenceNumber = exports.id_pkcs9_at_randomNonce = exports.id_pkcs9_at_encryptedPrivateKeyInfo = exports.id_pkcs9_at_pkcs15Token = exports.id_pkcs9_at_userPKCS12 = exports.id_pkcs9_at_localKeyId = exports.id_pkcs9_at_friendlyName = exports.id_pkcs9_at_smimeCapabilities = exports.id_pkcs9_at_extensionRequest = exports.id_pkcs9_at_signingDescription = exports.id_pkcs9_at_extendedCertificateAttributes = exports.id_pkcs9_at_unstructuredAddress = exports.id_pkcs9_at_challengePassword = exports.id_pkcs9_at_counterSignature = exports.id_pkcs9_at_signingTime = exports.id_pkcs9_at_messageDigest = exports.id_pkcs9_at_contentType = exports.id_pkcs9_at_unstructuredName = exports.id_pkcs9_at_emailAddress = exports.id_pkcs9_oc_naturalPerson = exports.id_pkcs9_oc_pkcsEntity = exports.id_pkcs9_mr = exports.id_pkcs9_sx = exports.id_pkcs9_at = exports.id_pkcs9_oc = exports.id_pkcs9_mo = exports.id_pkcs9 = void 0;
exports.SMIMECapabilities = exports.SMIMECapability = exports.SigningDescription = exports.LocalKeyId = exports.FriendlyName = exports.ExtendedCertificateAttributes = exports.ExtensionRequest = exports.ChallengePassword = exports.CounterSignature = exports.SequenceNumber = exports.RandomNonce = exports.SigningTime = exports.MessageDigest = exports.ContentType = exports.Pseudonym = exports.CountryOfResidence = exports.CountryOfCitizenship = exports.Gender = exports.PlaceOfBirth = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const cms = tslib_1.__importStar(require("@peculiar/asn1-cms"));
const pfx = tslib_1.__importStar(require("@peculiar/asn1-pfx"));
const pkcs8 = tslib_1.__importStar(require("@peculiar/asn1-pkcs8"));
const x509 = tslib_1.__importStar(require("@peculiar/asn1-x509"));
const attr = tslib_1.__importStar(require("@peculiar/asn1-x509-attr"));
exports.id_pkcs9 = "1.2.840.113549.1.9";
exports.id_pkcs9_mo = `${exports.id_pkcs9}.0`;
exports.id_pkcs9_oc = `${exports.id_pkcs9}.24`;
exports.id_pkcs9_at = `${exports.id_pkcs9}.25`;
exports.id_pkcs9_sx = `${exports.id_pkcs9}.26`;
exports.id_pkcs9_mr = `${exports.id_pkcs9}.27`;
exports.id_pkcs9_oc_pkcsEntity = `${exports.id_pkcs9_oc}.1`;
exports.id_pkcs9_oc_naturalPerson = `${exports.id_pkcs9_oc}.2`;
exports.id_pkcs9_at_emailAddress = `${exports.id_pkcs9}.1`;
exports.id_pkcs9_at_unstructuredName = `${exports.id_pkcs9}.2`;
exports.id_pkcs9_at_contentType = `${exports.id_pkcs9}.3`;
exports.id_pkcs9_at_messageDigest = `${exports.id_pkcs9}.4`;
exports.id_pkcs9_at_signingTime = `${exports.id_pkcs9}.5`;
exports.id_pkcs9_at_counterSignature = `${exports.id_pkcs9}.6`;
exports.id_pkcs9_at_challengePassword = `${exports.id_pkcs9}.7`;
exports.id_pkcs9_at_unstructuredAddress = `${exports.id_pkcs9}.8`;
exports.id_pkcs9_at_extendedCertificateAttributes = `${exports.id_pkcs9}.9`;
exports.id_pkcs9_at_signingDescription = `${exports.id_pkcs9}.13`;
exports.id_pkcs9_at_extensionRequest = `${exports.id_pkcs9}.14`;
exports.id_pkcs9_at_smimeCapabilities = `${exports.id_pkcs9}.15`;
exports.id_pkcs9_at_friendlyName = `${exports.id_pkcs9}.20`;
exports.id_pkcs9_at_localKeyId = `${exports.id_pkcs9}.21`;
exports.id_pkcs9_at_userPKCS12 = "2.16.840.1.113730.3.1.216";
exports.id_pkcs9_at_pkcs15Token = `${exports.id_pkcs9_at}.1`;
exports.id_pkcs9_at_encryptedPrivateKeyInfo = `${exports.id_pkcs9_at}.2`;
exports.id_pkcs9_at_randomNonce = `${exports.id_pkcs9_at}.3`;
exports.id_pkcs9_at_sequenceNumber = `${exports.id_pkcs9_at}.4`;
exports.id_pkcs9_at_pkcs7PDU = `${exports.id_pkcs9_at}.5`;
exports.id_ietf_at = "1.3.6.1.5.5.7.9";
exports.id_pkcs9_at_dateOfBirth = `${exports.id_ietf_at}.1`;
exports.id_pkcs9_at_placeOfBirth = `${exports.id_ietf_at}.2`;
exports.id_pkcs9_at_gender = `${exports.id_ietf_at}.3`;
exports.id_pkcs9_at_countryOfCitizenship = `${exports.id_ietf_at}.4`;
exports.id_pkcs9_at_countryOfResidence = `${exports.id_ietf_at}.5`;
exports.id_pkcs9_sx_pkcs9String = `${exports.id_pkcs9_sx}.1`;
exports.id_pkcs9_sx_signingTime = `${exports.id_pkcs9_sx}.2`;
exports.id_pkcs9_mr_caseIgnoreMatch = `${exports.id_pkcs9_mr}.1`;
exports.id_pkcs9_mr_signingTimeMatch = `${exports.id_pkcs9_mr}.2`;
exports.id_smime = `${exports.id_pkcs9}.16`;
exports.id_certTypes = `${exports.id_pkcs9}.22`;
exports.crlTypes = `${exports.id_pkcs9}.23`;
exports.id_at_pseudonym = `${attr.id_at}.65`;
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
exports.PKCS9String = PKCS9String;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.IA5String })
], PKCS9String.prototype, "ia5String", void 0);
exports.PKCS9String = PKCS9String = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], PKCS9String);
let Pkcs7PDU = class Pkcs7PDU extends cms.ContentInfo {
};
exports.Pkcs7PDU = Pkcs7PDU;
exports.Pkcs7PDU = Pkcs7PDU = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], Pkcs7PDU);
let UserPKCS12 = class UserPKCS12 extends pfx.PFX {
};
exports.UserPKCS12 = UserPKCS12;
exports.UserPKCS12 = UserPKCS12 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], UserPKCS12);
let EncryptedPrivateKeyInfo = class EncryptedPrivateKeyInfo extends pkcs8.EncryptedPrivateKeyInfo {
};
exports.EncryptedPrivateKeyInfo = EncryptedPrivateKeyInfo;
exports.EncryptedPrivateKeyInfo = EncryptedPrivateKeyInfo = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], EncryptedPrivateKeyInfo);
let EmailAddress = class EmailAddress {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
exports.EmailAddress = EmailAddress;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.IA5String })
], EmailAddress.prototype, "value", void 0);
exports.EmailAddress = EmailAddress = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], EmailAddress);
let UnstructuredName = class UnstructuredName extends PKCS9String {
};
exports.UnstructuredName = UnstructuredName;
exports.UnstructuredName = UnstructuredName = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], UnstructuredName);
let UnstructuredAddress = class UnstructuredAddress extends x509.DirectoryString {
};
exports.UnstructuredAddress = UnstructuredAddress;
exports.UnstructuredAddress = UnstructuredAddress = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], UnstructuredAddress);
let DateOfBirth = class DateOfBirth {
    value;
    constructor(value = new Date()) {
        this.value = value;
    }
};
exports.DateOfBirth = DateOfBirth;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.GeneralizedTime })
], DateOfBirth.prototype, "value", void 0);
exports.DateOfBirth = DateOfBirth = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], DateOfBirth);
let PlaceOfBirth = class PlaceOfBirth extends x509.DirectoryString {
};
exports.PlaceOfBirth = PlaceOfBirth;
exports.PlaceOfBirth = PlaceOfBirth = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], PlaceOfBirth);
let Gender = class Gender {
    value;
    constructor(value = "M") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
exports.Gender = Gender;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.PrintableString })
], Gender.prototype, "value", void 0);
exports.Gender = Gender = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], Gender);
let CountryOfCitizenship = class CountryOfCitizenship {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
exports.CountryOfCitizenship = CountryOfCitizenship;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.PrintableString })
], CountryOfCitizenship.prototype, "value", void 0);
exports.CountryOfCitizenship = CountryOfCitizenship = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], CountryOfCitizenship);
let CountryOfResidence = class CountryOfResidence extends CountryOfCitizenship {
};
exports.CountryOfResidence = CountryOfResidence;
exports.CountryOfResidence = CountryOfResidence = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], CountryOfResidence);
let Pseudonym = class Pseudonym extends x509.DirectoryString {
};
exports.Pseudonym = Pseudonym;
exports.Pseudonym = Pseudonym = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], Pseudonym);
let ContentType = class ContentType {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
exports.ContentType = ContentType;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], ContentType.prototype, "value", void 0);
exports.ContentType = ContentType = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], ContentType);
class MessageDigest extends asn1_schema_1.OctetString {
}
exports.MessageDigest = MessageDigest;
let SigningTime = class SigningTime extends x509.Time {
};
exports.SigningTime = SigningTime;
exports.SigningTime = SigningTime = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], SigningTime);
class RandomNonce extends asn1_schema_1.OctetString {
}
exports.RandomNonce = RandomNonce;
let SequenceNumber = class SequenceNumber {
    value;
    constructor(value = 0) {
        this.value = value;
    }
    toString() {
        return this.value.toString();
    }
};
exports.SequenceNumber = SequenceNumber;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], SequenceNumber.prototype, "value", void 0);
exports.SequenceNumber = SequenceNumber = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], SequenceNumber);
let CounterSignature = class CounterSignature extends cms.SignerInfo {
};
exports.CounterSignature = CounterSignature;
exports.CounterSignature = CounterSignature = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], CounterSignature);
let ChallengePassword = class ChallengePassword extends x509.DirectoryString {
};
exports.ChallengePassword = ChallengePassword;
exports.ChallengePassword = ChallengePassword = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], ChallengePassword);
let ExtensionRequest = ExtensionRequest_1 = class ExtensionRequest extends x509.Extensions {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, ExtensionRequest_1.prototype);
    }
};
exports.ExtensionRequest = ExtensionRequest;
exports.ExtensionRequest = ExtensionRequest = ExtensionRequest_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], ExtensionRequest);
let ExtendedCertificateAttributes = ExtendedCertificateAttributes_1 = class ExtendedCertificateAttributes extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, ExtendedCertificateAttributes_1.prototype);
    }
};
exports.ExtendedCertificateAttributes = ExtendedCertificateAttributes;
exports.ExtendedCertificateAttributes = ExtendedCertificateAttributes = ExtendedCertificateAttributes_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Set,
        itemType: cms.Attribute,
    })
], ExtendedCertificateAttributes);
let FriendlyName = class FriendlyName {
    value;
    constructor(value = "") {
        this.value = value;
    }
    toString() {
        return this.value;
    }
};
exports.FriendlyName = FriendlyName;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.BmpString })
], FriendlyName.prototype, "value", void 0);
exports.FriendlyName = FriendlyName = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], FriendlyName);
class LocalKeyId extends asn1_schema_1.OctetString {
}
exports.LocalKeyId = LocalKeyId;
class SigningDescription extends x509.DirectoryString {
}
exports.SigningDescription = SigningDescription;
let SMIMECapability = class SMIMECapability extends x509.AlgorithmIdentifier {
};
exports.SMIMECapability = SMIMECapability;
exports.SMIMECapability = SMIMECapability = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], SMIMECapability);
let SMIMECapabilities = SMIMECapabilities_1 = class SMIMECapabilities extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, SMIMECapabilities_1.prototype);
    }
};
exports.SMIMECapabilities = SMIMECapabilities;
exports.SMIMECapabilities = SMIMECapabilities = SMIMECapabilities_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: SMIMECapability,
    })
], SMIMECapabilities);
