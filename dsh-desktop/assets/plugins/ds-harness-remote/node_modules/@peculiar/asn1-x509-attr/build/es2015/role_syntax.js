import { __decorate } from "tslib";
import { AsnProp } from "@peculiar/asn1-schema";
import { GeneralNames, GeneralName } from "@peculiar/asn1-x509";
export class RoleSyntax {
    roleAuthority;
    roleName;
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
], RoleSyntax.prototype, "roleAuthority", void 0);
__decorate([
    AsnProp({
        type: GeneralName,
        implicit: true,
        context: 1,
    })
], RoleSyntax.prototype, "roleName", void 0);
