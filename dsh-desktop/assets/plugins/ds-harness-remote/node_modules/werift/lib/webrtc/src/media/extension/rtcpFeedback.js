"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTWCC = exports.useREMB = exports.usePLI = exports.useNACK = exports.useFIR = void 0;
const useFIR = () => ({ type: "ccm", parameter: "fir" });
exports.useFIR = useFIR;
const useNACK = () => ({ type: "nack" });
exports.useNACK = useNACK;
const usePLI = () => ({ type: "nack", parameter: "pli" });
exports.usePLI = usePLI;
const useREMB = () => ({ type: "goog-remb" });
exports.useREMB = useREMB;
const useTWCC = () => ({ type: "transport-cc" });
exports.useTWCC = useTWCC;
//# sourceMappingURL=rtcpFeedback.js.map