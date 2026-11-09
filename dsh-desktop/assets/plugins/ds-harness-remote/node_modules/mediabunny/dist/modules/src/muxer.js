/*!
 * Copyright (c) 2026-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { AsyncMutex } from './misc.js';
export class Muxer {
    constructor(output) {
        this.mutex = new AsyncMutex();
        this.trackPacketOrderValidators = new WeakMap();
        this.output = output;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onTrackClose(track) { }
    validateTimestamp(track, timestampInSeconds, isKeyPacket) {
        let validator = this.trackPacketOrderValidators.get(track);
        if (!validator) {
            validator = new PacketOrderValidator();
            this.trackPacketOrderValidators.set(track, validator);
        }
        const type = isKeyPacket ? 'key' : 'delta';
        if (validator.digest(timestampInSeconds, type)) {
            return;
        }
        if (validator.maxTimestamp === null) {
            throw new Error('First packet must be a key packet.');
        }
        const largestTimestamp = type === 'key'
            ? validator.maxTimestamp
            : validator.maxTimestampBeforeLastKeyPacket;
        throw new Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a`
            + ` key packet and ends right before the next key packet). Got ${timestampInSeconds}s, but largest`
            + ` timestamp is ${largestTimestamp}s.`);
    }
}
export class PacketOrderValidator {
    constructor() {
        this.maxTimestamp = null;
        this.maxTimestampBeforeLastKeyPacket = null;
    }
    check(timestamp, type) {
        if (this.maxTimestamp === null) {
            return type === 'key';
        }
        // A key packet starts a new GOP, making the current one the previous one
        const maxTimestampOfPreviousGop = type === 'key' ? this.maxTimestamp : this.maxTimestampBeforeLastKeyPacket;
        return maxTimestampOfPreviousGop === null || timestamp >= maxTimestampOfPreviousGop;
    }
    digest(timestamp, type) {
        if (!this.check(timestamp, type)) {
            return false;
        }
        if (type === 'key') {
            this.maxTimestampBeforeLastKeyPacket = this.maxTimestamp;
        }
        this.maxTimestamp = Math.max(this.maxTimestamp ?? -Infinity, timestamp);
        return true;
    }
}
