import { DelayedConstructor } from "../lazy-helpers";
export function isNormalToken(token) {
    return typeof token === "string" || typeof token === "symbol";
}
export function isTokenDescriptor(descriptor) {
    return (typeof descriptor === "object" &&
        "token" in descriptor &&
        "multiple" in descriptor);
}
export function isTransformDescriptor(descriptor) {
    return (typeof descriptor === "object" &&
        "token" in descriptor &&
        "transform" in descriptor);
}
export function isConstructorToken(token) {
    return typeof token === "function" || token instanceof DelayedConstructor;
}
