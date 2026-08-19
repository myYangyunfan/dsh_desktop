const PACKAGE_NAME = "dsh-skill-manager";
const SERVICE_NAME = "skillManager";
const jsonCodec = {
    mode: "strict",
    typeSymbol: `${PACKAGE_NAME}/json`,
    schema: {
        parse(value) {
            return value;
        }
    }
};
function descriptor(method) {
    return {
        id: `${PACKAGE_NAME}#${SERVICE_NAME}/${method}`,
        service: SERVICE_NAME,
        namespace: SERVICE_NAME,
        method,
        invocation: { kind: "direct" },
        parameters: [{
                name: "request",
                wire: "request",
                source: "json",
                codec: jsonCodec
            }],
        result: jsonCodec
    };
}
export const skillManagerClientDescriptors = [
    descriptor("list"),
    descriptor("create"),
    descriptor("setEnabled"),
    descriptor("getCapabilities"),
    descriptor("searchRepositories"),
    descriptor("browseRepositories"),
    descriptor("inspectRepository"),
    descriptor("installSkill"),
    descriptor("installRepository"),
    descriptor("assessSkillRisk"),
    descriptor("resolveMedia"),
    descriptor("verifyProvenance"),
    descriptor("verifyProvenanceBatch"),
    descriptor("checkUpdates"),
    descriptor("update"),
    descriptor("listBackups"),
    descriptor("rollback"),
    descriptor("delete"),
    descriptor("listTrash"),
    descriptor("restoreTrash"),
    descriptor("discoverExternal"),
    descriptor("importExternal"),
    descriptor("listTargetStates"),
    descriptor("setTargetEnabled")
];
