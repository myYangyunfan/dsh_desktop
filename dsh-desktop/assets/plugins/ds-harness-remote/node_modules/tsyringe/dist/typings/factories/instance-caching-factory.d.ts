import FactoryFunction from "./factory-function";
export default function instanceCachingFactory<T>(factoryFunc: FactoryFunction<T>): FactoryFunction<T>;
