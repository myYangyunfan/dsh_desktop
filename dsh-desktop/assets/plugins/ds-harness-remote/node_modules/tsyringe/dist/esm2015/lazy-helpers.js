export class DelayedConstructor {
    constructor(wrap) {
        this.wrap = wrap;
        this.reflectMethods = [
            "get",
            "getPrototypeOf",
            "setPrototypeOf",
            "getOwnPropertyDescriptor",
            "defineProperty",
            "has",
            "set",
            "deleteProperty",
            "apply",
            "construct",
            "ownKeys"
        ];
    }
    createProxy(createObject) {
        const target = {};
        let init = false;
        let value;
        const delayedObject = () => {
            if (!init) {
                value = createObject(this.wrap());
                init = true;
            }
            return value;
        };
        return new Proxy(target, this.createHandler(delayedObject));
    }
    createHandler(delayedObject) {
        const handler = {};
        const install = (name) => {
            handler[name] = (...args) => {
                args[0] = delayedObject();
                const method = Reflect[name];
                return method(...args);
            };
        };
        this.reflectMethods.forEach(install);
        return handler;
    }
}
export function delay(wrappedConstructor) {
    if (typeof wrappedConstructor === "undefined") {
        throw new Error("Attempt to `delay` undefined. Constructor must be wrapped in a callback");
    }
    return new DelayedConstructor(wrappedConstructor);
}
