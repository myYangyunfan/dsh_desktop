var Attributes_1;
import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnArray, AsnType, AsnTypeTypes, OctetString } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier, Attribute } from "@peculiar/asn1-x509";
export var Version;
(function (Version) {
    Version[Version["v1"] = 0] = "v1";
})(Version || (Version = {}));
export class PrivateKey extends OctetString {
}
let Attributes = Attributes_1 = class Attributes extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, Attributes_1.prototype);
    }
};
Attributes = Attributes_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Sequence,
        itemType: Attribute,
    })
], Attributes);
export { Attributes };
export class PrivateKeyInfo {
    version = Version.v1;
    privateKeyAlgorithm = new AlgorithmIdentifier();
    privateKey = new PrivateKey();
    attributes;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.Integer })
], PrivateKeyInfo.prototype, "version", void 0);
__decorate([
    AsnProp({ type: AlgorithmIdentifier })
], PrivateKeyInfo.prototype, "privateKeyAlgorithm", void 0);
__decorate([
    AsnProp({ type: PrivateKey })
], PrivateKeyInfo.prototype, "privateKey", void 0);
__decorate([
    AsnProp({
        type: Attributes,
        implicit: true,
        context: 0,
        optional: true,
    })
], PrivateKeyInfo.prototype, "attributes", void 0);
