"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class RegistryBase {
    constructor() {
        this._registryMap = new Map();
    }
    entries() {
        return this._registryMap.entries();
    }
    getAll(key) {
        this.ensure(key);
        return this._registryMap.get(key);
    }
    get(key) {
        this.ensure(key);
        const value = this._registryMap.get(key);
        return value[value.length - 1] || null;
    }
    set(key, value) {
        this.ensure(key);
        this._registryMap.get(key).push(value);
    }
    setAll(key, value) {
        this._registryMap.set(key, value);
    }
    has(key) {
        this.ensure(key);
        return this._registryMap.get(key).length > 0;
    }
    clear() {
        this._registryMap.clear();
    }
    ensure(key) {
        if (!this._registryMap.has(key)) {
            this._registryMap.set(key, []);
        }
    }
}
exports.default = RegistryBase;
