import DependencyContainer from "../types/dependency-container";
declare type FactoryFunction<T> = (dependencyContainer: DependencyContainer) => T;
export default FactoryFunction;
