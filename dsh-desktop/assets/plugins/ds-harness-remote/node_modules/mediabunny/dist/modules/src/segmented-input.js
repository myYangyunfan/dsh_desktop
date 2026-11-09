/*!
 * Copyright (c) 2026-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { arrayCount, assert, roundToDivisor } from './misc.js';
export class SegmentedInput {
    constructor(input, path, trackDeclarations) {
        this.nextInputCacheAge = 0;
        this.inputCache = [];
        this.trackBackingsPromise = null;
        this.firstSegment = null;
        // Roughly maps local segment timestamps onto actual packet timestamps
        this.learnedSegmentTimestampOffset = null;
        this.segmentMediaOffsets = new WeakMap();
        this.input = input;
        this.path = path;
        this.trackDeclarations = trackDeclarations;
    }
    async getDurationFromMetadata(options) {
        const lastSegment = await this.getSegmentAt(Infinity, {
            skipLiveWait: options.skipLiveWait,
        });
        if (!lastSegment) {
            return null;
        }
        return (lastSegment.timestamp + await this.getFirstSegmentTimestampOffset()) + lastSegment.duration;
    }
    async getUnixTimeForTimestamp(timestamp) {
        let segment = await this.getSegmentAt(timestamp, {});
        segment ??= await this.getFirstSegment({});
        if (!segment || segment.unixEpochTimestamp === null) {
            return null;
        }
        const elapsed = timestamp - (segment.timestamp + await this.getFirstSegmentTimestampOffset());
        return segment.unixEpochTimestamp + elapsed;
    }
    async getTrackBackings() {
        return this.trackBackingsPromise ??= (async () => {
            const backings = [];
            if (this.trackDeclarations) {
                for (const decl of this.trackDeclarations) {
                    if (decl.type === 'video') {
                        const number = arrayCount(backings, x => x.getType() === 'video') + 1;
                        backings.push(new SegmentedInputInputVideoTrackBacking(this, decl, number));
                    }
                    else if (decl.type === 'audio') {
                        const number = arrayCount(backings, x => x.getType() === 'audio') + 1;
                        backings.push(new SegmentedInputInputAudioTrackBacking(this, decl, number));
                    }
                }
            }
            else {
                // There are no declarations, we must determine the tracks from the first segment
                this.firstSegment = await this.getFirstSegment({});
                if (!this.firstSegment) {
                    return [];
                }
                const input = this.getInputForSegment(this.firstSegment);
                const inputTracks = await input.getTracks();
                for (const track of inputTracks) {
                    if (track.type === 'video') {
                        const number = arrayCount(backings, x => x.getType() === 'video') + 1;
                        backings.push(new SegmentedInputInputVideoTrackBacking(this, {
                            id: backings.length + 1,
                            type: 'video',
                        }, number));
                    }
                    else if (track.type === 'audio') {
                        const number = arrayCount(backings, x => x.getType() === 'audio') + 1;
                        backings.push(new SegmentedInputInputAudioTrackBacking(this, {
                            id: backings.length + 1,
                            type: 'audio',
                        }, number));
                    }
                }
            }
            return backings;
        })();
    }
    getMediaOffset(segment, input) {
        let promise = this.segmentMediaOffsets.get(segment);
        if (promise) {
            return promise;
        }
        promise = (async () => {
            const rawTimestampOffset = await this.getRawTimestampOffset(input);
            if (rawTimestampOffset === null) {
                // Without media timestamps, all we can do is place the media at the segment's timestamp
                return segment.timestamp;
            }
            let mediaOffset = rawTimestampOffset
                + await this.getMediaOffsetForDiscontinuity(segment.discontinuityNumber);
            const period = this.getTimestampWrapPeriod();
            if (period < Infinity) {
                // Media timestamps wrap around periodically (that's how MPEG-TS timestamps work). To make the entire
                // timeline continuous and monotonic (even for live streams that go on forever), we do a simple trick:
                // shift the media timestamps by multiples of the period length so that the first timestamp is closest
                // to the segment's timestamp (which DOES rise monotonically). This even works correctly for
                // non-wrapping formats like fMP4 because for them it's just a noop (or a constant shift for all media).
                const tracks = await input.getTracks();
                const track = tracks.find(x => x.type === 'video') ?? tracks[0];
                assert(track);
                const mediaStart = await track.getFirstTimestamp() + mediaOffset;
                mediaOffset += period * Math.round((segment.timestamp - mediaStart) / period);
            }
            return mediaOffset;
        })();
        this.segmentMediaOffsets.set(segment, promise);
        return promise;
    }
    dispose() {
        for (const entry of this.inputCache) {
            entry.input.dispose();
        }
        this.inputCache.length = 0;
    }
}
class SegmentedInputInputTrackBacking {
    constructor(segmentedInput, decl, number) {
        this.packetInfos = new WeakMap();
        this.hydrationPromise = null;
        this.firstInputTrack = null;
        this.firstSegment = null;
        this.segmentedInput = segmentedInput;
        this.decl = decl;
        this.number = number;
    }
    hydrate() {
        return this.hydrationPromise ??= (async () => {
            this.segmentedInput.firstSegment ??= await this.segmentedInput.getFirstSegment({});
            if (!this.segmentedInput.firstSegment) {
                throw new Error('Missing first segment, can\'t retrieve track.');
            }
            let currentSegment = this.segmentedInput.firstSegment;
            let track = null;
            // For playlists with sparse tracks (rare af!!), not every segment has every track, so we need to loop to
            // find the first segment that actually contains the track we want.
            while (currentSegment) {
                const input = this.segmentedInput.getInputForSegment(currentSegment);
                const inputTracks = await input.getTracks();
                track = inputTracks.find(x => x.type === this.decl.type && x.number === this.number) ?? null;
                if (track) {
                    break;
                }
                currentSegment = await this.segmentedInput.getNextSegment(currentSegment, {});
            }
            if (!track) {
                throw new Error('No matching track found in underlying media data.');
            }
            this.firstInputTrack = track;
            this.firstSegment = currentSegment;
        })();
    }
    getId() {
        return this.decl.id;
    }
    getType() {
        return this.decl.type;
    }
    getNumber() {
        return this.number;
    }
    /** If the backing track is already present, delegate synchronously; otherwise, hydrate first. */
    delegate(fn) {
        if (this.firstInputTrack) {
            return fn();
        }
        return this.hydrate().then(fn);
    }
    async getDecoderConfig() {
        return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
    }
    getHasOnlyKeyPackets() {
        return this.delegate(() => this.firstInputTrack._backing.getHasOnlyKeyPackets?.() ?? null);
    }
    getPairingMask() {
        return 1n;
    }
    getCodec() {
        return this.delegate(() => this.firstInputTrack._backing.getCodec());
    }
    getInternalCodecId() {
        return this.delegate(() => this.firstInputTrack._backing.getInternalCodecId());
    }
    getDisposition() {
        return this.delegate(() => this.firstInputTrack._backing.getDisposition());
    }
    getLanguageCode() {
        return this.delegate(() => this.firstInputTrack._backing.getLanguageCode());
    }
    getName() {
        return this.delegate(() => this.firstInputTrack._backing.getName());
    }
    getTimeResolution() {
        return this.delegate(() => this.firstInputTrack._backing.getTimeResolution());
    }
    async isRelativeToUnixEpoch() {
        await this.hydrate();
        assert(this.segmentedInput.firstSegment);
        return this.segmentedInput.firstSegment.unixEpochTimestamp === this.segmentedInput.firstSegment.timestamp;
    }
    getUnixTimeForTimestamp(timestamp) {
        return this.segmentedInput.getUnixTimeForTimestamp(timestamp);
    }
    getBitrate() {
        return this.delegate(() => this.firstInputTrack._backing.getBitrate());
    }
    getAverageBitrate() {
        return this.delegate(() => this.firstInputTrack._backing.getAverageBitrate());
    }
    getDurationFromMetadata(options) {
        return this.segmentedInput.getDurationFromMetadata(options);
    }
    getLiveRefreshInterval() {
        return this.segmentedInput.getLiveRefreshInterval();
    }
    async createAdjustedPacket(packet, segment, track) {
        assert(packet.sequenceNumber >= 0);
        assert(this.segmentedInput.firstSegment);
        const mediaOffset = await this.segmentedInput.getMediaOffset(segment, track.input);
        // If we didn't do this then sequence numbers would exceed Number.MAX_SAFE_INTEGER for Unix-timestamped segments
        const segmentTimestampRelativeToFirst = segment.timestamp - this.segmentedInput.firstSegment.timestamp;
        const modified = packet.clone({
            timestamp: roundToDivisor(packet.timestamp + mediaOffset, await track.getTimeResolution()),
            // The 1e8 assumes a max of 100 MB per second, highly unlikely to be hit, so this should guarantee
            // monotonically increasing sequence numbers across segments.
            sequenceNumber: Math.floor(1e8 * segmentTimestampRelativeToFirst) + packet.sequenceNumber,
        });
        this.packetInfos.set(modified, {
            segment,
            track,
            sourcePacket: packet,
        });
        return modified;
    }
    async getFirstPacket(options) {
        await this.hydrate();
        assert(this.firstInputTrack);
        assert(this.firstSegment);
        let currentTrack = this.firstInputTrack;
        let currentSegment = this.firstSegment;
        // Loop until we found a segment with a packet (segments may contain zero packets in rare cases)
        while (true) {
            if (currentTrack) {
                const packet = await currentTrack._backing.getFirstPacket(options);
                if (packet) {
                    return this.createAdjustedPacket(packet, currentSegment, currentTrack);
                }
            }
            currentSegment = await this.segmentedInput.getNextSegment(currentSegment, {
                skipLiveWait: options.skipLiveWait,
            });
            if (!currentSegment) {
                break;
            }
            const nextInput = this.segmentedInput.getInputForSegment(currentSegment);
            const nextTracks = await nextInput.getTracks();
            currentTrack = nextTracks.find(t => (t.type === this.firstInputTrack.type && t.number === this.firstInputTrack.number)) ?? null;
        }
        return null;
    }
    getNextPacket(packet, options) {
        return this._getNextInternal(packet, options, false);
    }
    getNextKeyPacket(packet, options) {
        return this._getNextInternal(packet, options, true);
    }
    async _getNextInternal(packet, options, keyframesOnly) {
        const info = this.packetInfos.get(packet);
        if (!info) {
            throw new Error('Packet was not created from this track.');
        }
        const nextPacket = keyframesOnly
            ? await info.track._backing.getNextKeyPacket(info.sourcePacket, options)
            : await info.track._backing.getNextPacket(info.sourcePacket, options);
        if (nextPacket) {
            return this.createAdjustedPacket(nextPacket, info.segment, info.track);
        }
        let currentSegment = info.segment;
        while (true) {
            const nextSegment = await this.segmentedInput.getNextSegment(currentSegment, {
                skipLiveWait: options.skipLiveWait,
            });
            if (!nextSegment) {
                return null;
            }
            const nextInput = this.segmentedInput.getInputForSegment(nextSegment);
            const nextTracks = await nextInput.getTracks();
            const nextTrack = nextTracks.find(t => t.type === info.track.type && t.number === info.track.number);
            if (!nextTrack) {
                currentSegment = nextSegment;
                continue;
            }
            let packet = await nextTrack._backing.getFirstPacket(options);
            if (packet && keyframesOnly && packet.type !== 'key') {
                packet = await nextTrack._backing.getNextKeyPacket(packet, options);
            }
            if (!packet) {
                // Segments may contain zero packets for a track, so, move on
                currentSegment = nextSegment;
                continue;
            }
            return this.createAdjustedPacket(packet, nextSegment, nextTrack);
        }
    }
    getPacket(timestamp, options) {
        return this._getPacketInternal(timestamp, options, false);
    }
    getKeyPacket(timestamp, options) {
        return this._getPacketInternal(timestamp, options, true);
    }
    async _getPacketInternal(timestamp, options, keyframesOnly) {
        let currentSegment = await this.segmentedInput.getSegmentAt(timestamp, {
            skipLiveWait: options.skipLiveWait,
        });
        if (!currentSegment) {
            return null;
        }
        await this.hydrate();
        while (currentSegment) {
            const input = this.segmentedInput.getInputForSegment(currentSegment);
            const tracks = await input.getTracks();
            const track = tracks.find(t => (t.type === this.firstInputTrack.type && t.number === this.firstInputTrack.number));
            if (!track) {
                // Search the previous segment
                currentSegment = await this.segmentedInput.getPreviousSegment(currentSegment, {
                    skipLiveWait: options.skipLiveWait,
                });
                continue;
            }
            const mediaOffset = await this.segmentedInput.getMediaOffset(currentSegment, input);
            // If we don't know the segment timestamp offset yet, learn it once from where this segment's media
            // actually lies. If the timestamp is more than a segment's duration away from the segment, the lookup was
            // way off, so redo it with the learned offset instead of walking there segment by segment. Note that it's
            // fine if the result is still off, because we follow it with a correction step that finds the correct
            // packet.
            const firstPacket = this.segmentedInput.learnedSegmentTimestampOffset === null
                ? await track._backing.getFirstPacket({ ...options, metadataOnly: true })
                : null;
            if (firstPacket) {
                const segmentStart = firstPacket.timestamp + mediaOffset;
                this.segmentedInput.learnedSegmentTimestampOffset = segmentStart - currentSegment.timestamp;
                const distance = timestamp - segmentStart;
                if (distance < -currentSegment.duration || distance >= 2 * currentSegment.duration) {
                    const segment = await this.segmentedInput.getSegmentAt(timestamp, {
                        skipLiveWait: options.skipLiveWait,
                    });
                    if (segment !== currentSegment) {
                        currentSegment = segment;
                        continue;
                    }
                }
            }
            const offsetTimestamp = timestamp - mediaOffset;
            const packet = keyframesOnly
                ? await track._backing.getKeyPacket(offsetTimestamp, options)
                : await track._backing.getPacket(offsetTimestamp, options);
            if (!packet) {
                // Search the previous segment
                currentSegment = await this.segmentedInput.getPreviousSegment(currentSegment, {
                    skipLiveWait: options.skipLiveWait,
                });
                continue;
            }
            // The playlist may claim the segment to be longer than its media actually is, in which case the timestamp
            // can lie in the next segment instead. That's only possible if it lies past this segment's media.
            const lastPacket = keyframesOnly
                ? await track._backing.getPacket(offsetTimestamp, { ...options, metadataOnly: true })
                : packet;
            assert(lastPacket);
            if (offsetTimestamp >= lastPacket.timestamp + lastPacket.duration) {
                const nextSegment = await this.segmentedInput.getNextSegment(currentSegment, {
                    skipLiveWait: options.skipLiveWait,
                });
                if (nextSegment) {
                    const nextInput = this.segmentedInput.getInputForSegment(nextSegment);
                    const nextTracks = await nextInput.getTracks();
                    const nextTrack = nextTracks.find(t => (t.type === this.firstInputTrack.type && t.number === this.firstInputTrack.number));
                    let nextPacket = nextTrack
                        ? await nextTrack._backing.getFirstPacket({ ...options, metadataOnly: true })
                        : null;
                    if (nextPacket && keyframesOnly && nextPacket.type !== 'key') {
                        nextPacket = await nextTrack._backing.getNextKeyPacket(nextPacket, {
                            ...options,
                            metadataOnly: true,
                        });
                    }
                    if (nextPacket) {
                        const nextMediaOffset = await this.segmentedInput.getMediaOffset(nextSegment, nextInput);
                        if (nextPacket.timestamp + nextMediaOffset <= timestamp) {
                            currentSegment = nextSegment;
                            continue;
                        }
                    }
                }
            }
            return this.createAdjustedPacket(packet, currentSegment, track);
        }
        return null;
    }
}
class SegmentedInputInputVideoTrackBacking extends SegmentedInputInputTrackBacking {
    getType() {
        return 'video';
    }
    getCodec() {
        return this.delegate(() => this.firstInputTrack._backing.getCodec());
    }
    getCodedWidth() {
        return this.delegate(() => this.firstInputTrack._backing.getCodedWidth());
    }
    getCodedHeight() {
        return this.delegate(() => this.firstInputTrack._backing.getCodedHeight());
    }
    getSquarePixelWidth() {
        return this.delegate(() => this.firstInputTrack._backing.getSquarePixelWidth());
    }
    getSquarePixelHeight() {
        return this.delegate(() => this.firstInputTrack._backing.getSquarePixelHeight());
    }
    getTransformationMatrix() {
        return this.delegate(() => this.firstInputTrack._backing.getTransformationMatrix());
    }
    async getColorSpace() {
        return this.delegate(() => this.firstInputTrack._backing.getColorSpace());
    }
    async canBeTransparent() {
        return this.delegate(() => this.firstInputTrack._backing.canBeTransparent());
    }
    async getDecoderConfig() {
        return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
    }
}
class SegmentedInputInputAudioTrackBacking extends SegmentedInputInputTrackBacking {
    getType() {
        return 'audio';
    }
    getCodec() {
        return this.delegate(() => this.firstInputTrack._backing.getCodec());
    }
    getNumberOfChannels() {
        return this.delegate(() => this.firstInputTrack._backing.getNumberOfChannels());
    }
    getSampleRate() {
        return this.delegate(() => this.firstInputTrack._backing.getSampleRate());
    }
    async getDecoderConfig() {
        return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
    }
}
