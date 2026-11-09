import { type NamedCurveAlgorithms } from "./const";
export interface NamedCurveKeyPair {
    curve: NamedCurveAlgorithms;
    publicKey: Buffer;
    privateKey: Buffer;
}
export declare function generateKeyPair(namedCurve: NamedCurveAlgorithms): NamedCurveKeyPair;
