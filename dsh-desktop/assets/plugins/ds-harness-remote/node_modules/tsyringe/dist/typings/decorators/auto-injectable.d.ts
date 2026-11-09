import constructor from "../types/constructor";
/**
 * Class decorator factory that replaces the decorated class' constructor with
 * a parameterless constructor that has dependencies auto-resolved
 *
 * Note: Resolution is performed using the global container
 *
 * @return {Function} The class decorator
 */
declare function autoInjectable(): (target: constructor<any>) => any;
export default autoInjectable;
