export function isDisposable(value) {
    if (typeof value.dispose !== "function")
        return false;
    const disposeFun = value.dispose;
    if (disposeFun.length > 0) {
        return false;
    }
    return true;
}
