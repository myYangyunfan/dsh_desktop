import InjectionToken from "../providers/injection-token";
import Transform from "../types/transform";
/**
 * Parameter decorator factory that allows for interface information to be stored in the constructor's metadata
 *
 * @return {Function} The parameter decorator
 */
declare function injectAllWithTransform(token: InjectionToken<any>, transformer: InjectionToken<Transform<[any], any>>, ...args: any[]): (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => any;
export default injectAllWithTransform;
