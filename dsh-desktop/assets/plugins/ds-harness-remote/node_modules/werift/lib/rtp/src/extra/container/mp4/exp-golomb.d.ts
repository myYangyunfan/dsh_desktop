declare class ExpGolomb {
    private uint8array;
    TAG: string;
    _buffer: Uint8Array;
    _buffer_index: number;
    _total_bytes: number;
    _total_bits: number;
    _current_word: number;
    _current_word_bits_left: number;
    constructor(uint8array: Uint8Array);
    destroy(): void;
    _fillCurrentWord(): void;
    readBits(bits: any): number;
    readBool(): boolean;
    readByte(): number;
    _skipLeadingZero(): any;
    readUEG(): number;
    readSEG(): number;
}
export default ExpGolomb;
