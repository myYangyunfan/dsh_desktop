import { __decorate } from "tslib";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import { AsnProp, OctetString } from "@peculiar/asn1-schema";
export class DigestInfo {
    digestAlgorithm = new AlgorithmIdentifier();
    digest = new OctetString();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AlgorithmIdentifier })
], DigestInfo.prototype, "digestAlgorithm", void 0);
__decorate([
    AsnProp({ type: OctetString })
], DigestInfo.prototype, "digest", void 0);
