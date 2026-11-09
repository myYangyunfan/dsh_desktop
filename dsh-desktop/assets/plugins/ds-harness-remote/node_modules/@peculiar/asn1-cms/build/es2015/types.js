import { __decorate } from "tslib";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import { AsnTypeTypes, AsnType } from "@peculiar/asn1-schema";
export var CMSVersion;
(function (CMSVersion) {
    CMSVersion[CMSVersion["v0"] = 0] = "v0";
    CMSVersion[CMSVersion["v1"] = 1] = "v1";
    CMSVersion[CMSVersion["v2"] = 2] = "v2";
    CMSVersion[CMSVersion["v3"] = 3] = "v3";
    CMSVersion[CMSVersion["v4"] = 4] = "v4";
    CMSVersion[CMSVersion["v5"] = 5] = "v5";
})(CMSVersion || (CMSVersion = {}));
let DigestAlgorithmIdentifier = class DigestAlgorithmIdentifier extends AlgorithmIdentifier {
};
DigestAlgorithmIdentifier = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], DigestAlgorithmIdentifier);
export { DigestAlgorithmIdentifier };
let SignatureAlgorithmIdentifier = class SignatureAlgorithmIdentifier extends AlgorithmIdentifier {
};
SignatureAlgorithmIdentifier = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], SignatureAlgorithmIdentifier);
export { SignatureAlgorithmIdentifier };
let KeyEncryptionAlgorithmIdentifier = class KeyEncryptionAlgorithmIdentifier extends AlgorithmIdentifier {
};
KeyEncryptionAlgorithmIdentifier = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], KeyEncryptionAlgorithmIdentifier);
export { KeyEncryptionAlgorithmIdentifier };
let ContentEncryptionAlgorithmIdentifier = class ContentEncryptionAlgorithmIdentifier extends AlgorithmIdentifier {
};
ContentEncryptionAlgorithmIdentifier = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], ContentEncryptionAlgorithmIdentifier);
export { ContentEncryptionAlgorithmIdentifier };
let MessageAuthenticationCodeAlgorithm = class MessageAuthenticationCodeAlgorithm extends AlgorithmIdentifier {
};
MessageAuthenticationCodeAlgorithm = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], MessageAuthenticationCodeAlgorithm);
export { MessageAuthenticationCodeAlgorithm };
let KeyDerivationAlgorithmIdentifier = class KeyDerivationAlgorithmIdentifier extends AlgorithmIdentifier {
};
KeyDerivationAlgorithmIdentifier = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], KeyDerivationAlgorithmIdentifier);
export { KeyDerivationAlgorithmIdentifier };
