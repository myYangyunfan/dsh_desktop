import constructor from "../types/constructor";
import { InjectionToken } from "../providers";
import Lifecycle from "../types/lifecycle";
/**
 * Class decorator factory that registers the class as a scoped dependency within
 * the global container.
 *
 * @return The class decorator
 */
export default function scoped<T>(lifecycle: Lifecycle.ContainerScoped | Lifecycle.ResolutionScoped, token?: InjectionToken<T>): (target: constructor<T>) => void;
