"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NtpTimeCallback = void 0;
const interface_1 = require("./interface");
const ntpTime_1 = require("./ntpTime");
class NtpTimeCallback extends (0, interface_1.SimpleProcessorCallbackBase)(ntpTime_1.NtpTimeBase) {
}
exports.NtpTimeCallback = NtpTimeCallback;
//# sourceMappingURL=ntpTimeCallback.js.map