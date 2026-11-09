import Provider from "../providers/provider";
import InjectionToken from "../providers/injection-token";
import RegistrationOptions from "../types/registration-options";
/**
 * Class decorator factory that allows constructor dependencies to be registered at runtime.
 *
 * @return {Function} The class decorator
 */
declare function registry(registrations?: ({
    token: InjectionToken;
    options?: RegistrationOptions;
} & Provider<any>)[]): (target: any) => any;
export default registry;
