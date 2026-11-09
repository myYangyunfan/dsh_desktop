import DependencyContainer from "../types/dependency-container";
import constructor from "../types/constructor";
import FactoryFunction from "./factory-function";
export default function predicateAwareClassFactory<T>(predicate: (dependencyContainer: DependencyContainer) => boolean, trueConstructor: constructor<T>, falseConstructor: constructor<T>, useCaching?: boolean): FactoryFunction<T>;
