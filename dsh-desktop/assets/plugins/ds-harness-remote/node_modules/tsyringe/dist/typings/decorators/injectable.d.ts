import constructor from "../types/constructor";
import InjectionToken from "../providers/injection-token";
/**
 * Class decorator factory that allows the class' dependencies to be injected
 * at runtime.
 *
 * @return {Function} The class decorator
 */
declare function injectable<T>(options?: {
    token?: InjectionToken<T> | InjectionToken<T>[];
}): (target: constructor<T>) => void;
export default injectable;
