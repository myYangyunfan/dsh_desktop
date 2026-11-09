import constructor from "../types/constructor";
/**
 * Class decorator factory that registers the class as a singleton within
 * the global container.
 *
 * @return {Function} The class decorator
 */
declare function singleton<T>(): (target: constructor<T>) => void;
export default singleton;
