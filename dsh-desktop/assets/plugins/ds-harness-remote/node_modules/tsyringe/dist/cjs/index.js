"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
if (typeof Reflect === "undefined" || !Reflect.getMetadata) {
    throw new Error(`tsyringe requires a reflect polyfill. Please add 'import "reflect-metadata"' to the top of your entry point.`);
}
var types_1 = require("./types");
Object.defineProperty(exports, "Lifecycle", { enumerable: true, get: function () { return types_1.Lifecycle; } });
tslib_1.__exportStar(require("./decorators"), exports);
tslib_1.__exportStar(require("./factories"), exports);
tslib_1.__exportStar(require("./providers"), exports);
var lazy_helpers_1 = require("./lazy-helpers");
Object.defineProperty(exports, "delay", { enumerable: true, get: function () { return lazy_helpers_1.delay; } });
var dependency_container_1 = require("./dependency-container");
Object.defineProperty(exports, "container", { enumerable: true, get: function () { return dependency_container_1.instance; } });
