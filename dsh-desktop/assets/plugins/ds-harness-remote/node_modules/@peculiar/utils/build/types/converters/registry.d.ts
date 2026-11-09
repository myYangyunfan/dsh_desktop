import type { Converter, ConverterRegistry } from "./types.js";
/** Creates a converter registry and optionally seeds it with converters. */
export declare function createConverterRegistry(initialConverters?: Iterable<Converter>): ConverterRegistry;
