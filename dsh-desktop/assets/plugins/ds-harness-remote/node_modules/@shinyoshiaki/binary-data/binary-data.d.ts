type Types = {
  uint16be: number;
  buffer: any;
  uint8: number;
  uint24be: number;
  array: any;
  uint32be: number;
  uint48be: number;
  string: any;
  when: any;
  select: any;
};
declare const types: Types;
type Encode = (o: object, spec: object) => Buffer;
declare const encode: Encode;

type Decode = (buf: Buffer, spec: object) => any;
declare const decode: Decode;

type CreateDecode = (buf: Buffer) => any;
declare const createDecode: CreateDecode;

export { createDecode, decode, encode, types };
