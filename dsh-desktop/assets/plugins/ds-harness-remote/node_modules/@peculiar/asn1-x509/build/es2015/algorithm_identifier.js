import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
import { equal } from "@peculiar/utils/bytes";
export class AlgorithmIdentifier {
    algorithm = "";
    parameters;
    constructor(params = {}) {
        Object.assign(this, params);
    }
    isEqual(data) {
        return (data instanceof AlgorithmIdentifier &&
            data.algorithm == this.algorithm &&
            ((data.parameters && this.parameters && equal(data.parameters, this.parameters)) || data.parameters === this.parameters));
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], AlgorithmIdentifier.prototype, "algorithm", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        optional: true,
    })
], AlgorithmIdentifier.prototype, "parameters", void 0);
