import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
export class ContentInfo {
    contentType = "";
    content = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], ContentInfo.prototype, "contentType", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        context: 0,
    })
], ContentInfo.prototype, "content", void 0);
