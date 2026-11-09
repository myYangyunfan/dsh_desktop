import { isClassProvider } from "./class-provider";
import { isValueProvider } from "./value-provider";
import { isTokenProvider } from "./token-provider";
import { isFactoryProvider } from "./factory-provider";
export function isProvider(provider) {
    return (isClassProvider(provider) ||
        isValueProvider(provider) ||
        isTokenProvider(provider) ||
        isFactoryProvider(provider));
}
