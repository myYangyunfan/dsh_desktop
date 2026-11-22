"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
    mod
  ));

  // node_modules/qrcode/lib/can-promise.js
  var require_can_promise = __commonJS({
    "node_modules/qrcode/lib/can-promise.js"(exports, module) {
      module.exports = function() {
        return typeof Promise == "function" && Promise.prototype && Promise.prototype.then;
      };
    }
  });

  // node_modules/qrcode/lib/core/utils.js
  var require_utils = __commonJS({
    "node_modules/qrcode/lib/core/utils.js"(exports) {
      var toSJISFunction, CODEWORDS_COUNT = [
        0,
        // Not used
        26,
        44,
        70,
        100,
        134,
        172,
        196,
        242,
        292,
        346,
        404,
        466,
        532,
        581,
        655,
        733,
        815,
        901,
        991,
        1085,
        1156,
        1258,
        1364,
        1474,
        1588,
        1706,
        1828,
        1921,
        2051,
        2185,
        2323,
        2465,
        2611,
        2761,
        2876,
        3034,
        3196,
        3362,
        3532,
        3706
      ];
      exports.getSymbolSize = function(version) {
        if (!version) throw new Error('"version" cannot be null or undefined');
        if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40');
        return version * 4 + 17;
      };
      exports.getSymbolTotalCodewords = function(version) {
        return CODEWORDS_COUNT[version];
      };
      exports.getBCHDigit = function(data) {
        let digit = 0;
        for (; data !== 0; )
          digit++, data >>>= 1;
        return digit;
      };
      exports.setToSJISFunction = function(f) {
        if (typeof f != "function")
          throw new Error('"toSJISFunc" is not a valid function.');
        toSJISFunction = f;
      };
      exports.isKanjiModeEnabled = function() {
        return typeof toSJISFunction < "u";
      };
      exports.toSJIS = function(kanji) {
        return toSJISFunction(kanji);
      };
    }
  });

  // node_modules/qrcode/lib/core/error-correction-level.js
  var require_error_correction_level = __commonJS({
    "node_modules/qrcode/lib/core/error-correction-level.js"(exports) {
      exports.L = { bit: 1 };
      exports.M = { bit: 0 };
      exports.Q = { bit: 3 };
      exports.H = { bit: 2 };
      function fromString(string) {
        if (typeof string != "string")
          throw new Error("Param is not a string");
        switch (string.toLowerCase()) {
          case "l":
          case "low":
            return exports.L;
          case "m":
          case "medium":
            return exports.M;
          case "q":
          case "quartile":
            return exports.Q;
          case "h":
          case "high":
            return exports.H;
          default:
            throw new Error("Unknown EC Level: " + string);
        }
      }
      exports.isValid = function(level) {
        return level && typeof level.bit < "u" && level.bit >= 0 && level.bit < 4;
      };
      exports.from = function(value, defaultValue) {
        if (exports.isValid(value))
          return value;
        try {
          return fromString(value);
        } catch {
          return defaultValue;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/bit-buffer.js
  var require_bit_buffer = __commonJS({
    "node_modules/qrcode/lib/core/bit-buffer.js"(exports, module) {
      function BitBuffer() {
        this.buffer = [], this.length = 0;
      }
      BitBuffer.prototype = {
        get: function(index) {
          let bufIndex = Math.floor(index / 8);
          return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
        },
        put: function(num, length) {
          for (let i = 0; i < length; i++)
            this.putBit((num >>> length - i - 1 & 1) === 1);
        },
        getLengthInBits: function() {
          return this.length;
        },
        putBit: function(bit) {
          let bufIndex = Math.floor(this.length / 8);
          this.buffer.length <= bufIndex && this.buffer.push(0), bit && (this.buffer[bufIndex] |= 128 >>> this.length % 8), this.length++;
        }
      };
      module.exports = BitBuffer;
    }
  });

  // node_modules/qrcode/lib/core/bit-matrix.js
  var require_bit_matrix = __commonJS({
    "node_modules/qrcode/lib/core/bit-matrix.js"(exports, module) {
      function BitMatrix(size) {
        if (!size || size < 1)
          throw new Error("BitMatrix size must be defined and greater than 0");
        this.size = size, this.data = new Uint8Array(size * size), this.reservedBit = new Uint8Array(size * size);
      }
      BitMatrix.prototype.set = function(row, col, value, reserved) {
        let index = row * this.size + col;
        this.data[index] = value, reserved && (this.reservedBit[index] = !0);
      };
      BitMatrix.prototype.get = function(row, col) {
        return this.data[row * this.size + col];
      };
      BitMatrix.prototype.xor = function(row, col, value) {
        this.data[row * this.size + col] ^= value;
      };
      BitMatrix.prototype.isReserved = function(row, col) {
        return this.reservedBit[row * this.size + col];
      };
      module.exports = BitMatrix;
    }
  });

  // node_modules/qrcode/lib/core/alignment-pattern.js
  var require_alignment_pattern = __commonJS({
    "node_modules/qrcode/lib/core/alignment-pattern.js"(exports) {
      var getSymbolSize = require_utils().getSymbolSize;
      exports.getRowColCoords = function(version) {
        if (version === 1) return [];
        let posCount = Math.floor(version / 7) + 2, size = getSymbolSize(version), intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2, positions = [size - 7];
        for (let i = 1; i < posCount - 1; i++)
          positions[i] = positions[i - 1] - intervals;
        return positions.push(6), positions.reverse();
      };
      exports.getPositions = function(version) {
        let coords = [], pos = exports.getRowColCoords(version), posLength = pos.length;
        for (let i = 0; i < posLength; i++)
          for (let j = 0; j < posLength; j++)
            i === 0 && j === 0 || // top-left
            i === 0 && j === posLength - 1 || // bottom-left
            i === posLength - 1 && j === 0 || coords.push([pos[i], pos[j]]);
        return coords;
      };
    }
  });

  // node_modules/qrcode/lib/core/finder-pattern.js
  var require_finder_pattern = __commonJS({
    "node_modules/qrcode/lib/core/finder-pattern.js"(exports) {
      var getSymbolSize = require_utils().getSymbolSize, FINDER_PATTERN_SIZE = 7;
      exports.getPositions = function(version) {
        let size = getSymbolSize(version);
        return [
          // top-left
          [0, 0],
          // top-right
          [size - FINDER_PATTERN_SIZE, 0],
          // bottom-left
          [0, size - FINDER_PATTERN_SIZE]
        ];
      };
    }
  });

  // node_modules/qrcode/lib/core/mask-pattern.js
  var require_mask_pattern = __commonJS({
    "node_modules/qrcode/lib/core/mask-pattern.js"(exports) {
      exports.Patterns = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var PenaltyScores = {
        N1: 3,
        N2: 3,
        N3: 40,
        N4: 10
      };
      exports.isValid = function(mask) {
        return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
      };
      exports.from = function(value) {
        return exports.isValid(value) ? parseInt(value, 10) : void 0;
      };
      exports.getPenaltyN1 = function(data) {
        let size = data.size, points = 0, sameCountCol = 0, sameCountRow = 0, lastCol = null, lastRow = null;
        for (let row = 0; row < size; row++) {
          sameCountCol = sameCountRow = 0, lastCol = lastRow = null;
          for (let col = 0; col < size; col++) {
            let module2 = data.get(row, col);
            module2 === lastCol ? sameCountCol++ : (sameCountCol >= 5 && (points += PenaltyScores.N1 + (sameCountCol - 5)), lastCol = module2, sameCountCol = 1), module2 = data.get(col, row), module2 === lastRow ? sameCountRow++ : (sameCountRow >= 5 && (points += PenaltyScores.N1 + (sameCountRow - 5)), lastRow = module2, sameCountRow = 1);
          }
          sameCountCol >= 5 && (points += PenaltyScores.N1 + (sameCountCol - 5)), sameCountRow >= 5 && (points += PenaltyScores.N1 + (sameCountRow - 5));
        }
        return points;
      };
      exports.getPenaltyN2 = function(data) {
        let size = data.size, points = 0;
        for (let row = 0; row < size - 1; row++)
          for (let col = 0; col < size - 1; col++) {
            let last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
            (last === 4 || last === 0) && points++;
          }
        return points * PenaltyScores.N2;
      };
      exports.getPenaltyN3 = function(data) {
        let size = data.size, points = 0, bitsCol = 0, bitsRow = 0;
        for (let row = 0; row < size; row++) {
          bitsCol = bitsRow = 0;
          for (let col = 0; col < size; col++)
            bitsCol = bitsCol << 1 & 2047 | data.get(row, col), col >= 10 && (bitsCol === 1488 || bitsCol === 93) && points++, bitsRow = bitsRow << 1 & 2047 | data.get(col, row), col >= 10 && (bitsRow === 1488 || bitsRow === 93) && points++;
        }
        return points * PenaltyScores.N3;
      };
      exports.getPenaltyN4 = function(data) {
        let darkCount = 0, modulesCount = data.data.length;
        for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
        return Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10) * PenaltyScores.N4;
      };
      function getMaskAt(maskPattern, i, j) {
        switch (maskPattern) {
          case exports.Patterns.PATTERN000:
            return (i + j) % 2 === 0;
          case exports.Patterns.PATTERN001:
            return i % 2 === 0;
          case exports.Patterns.PATTERN010:
            return j % 3 === 0;
          case exports.Patterns.PATTERN011:
            return (i + j) % 3 === 0;
          case exports.Patterns.PATTERN100:
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case exports.Patterns.PATTERN101:
            return i * j % 2 + i * j % 3 === 0;
          case exports.Patterns.PATTERN110:
            return (i * j % 2 + i * j % 3) % 2 === 0;
          case exports.Patterns.PATTERN111:
            return (i * j % 3 + (i + j) % 2) % 2 === 0;
          default:
            throw new Error("bad maskPattern:" + maskPattern);
        }
      }
      exports.applyMask = function(pattern, data) {
        let size = data.size;
        for (let col = 0; col < size; col++)
          for (let row = 0; row < size; row++)
            data.isReserved(row, col) || data.xor(row, col, getMaskAt(pattern, row, col));
      };
      exports.getBestMask = function(data, setupFormatFunc) {
        let numPatterns = Object.keys(exports.Patterns).length, bestPattern = 0, lowerPenalty = 1 / 0;
        for (let p = 0; p < numPatterns; p++) {
          setupFormatFunc(p), exports.applyMask(p, data);
          let penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
          exports.applyMask(p, data), penalty < lowerPenalty && (lowerPenalty = penalty, bestPattern = p);
        }
        return bestPattern;
      };
    }
  });

  // node_modules/qrcode/lib/core/error-correction-code.js
  var require_error_correction_code = __commonJS({
    "node_modules/qrcode/lib/core/error-correction-code.js"(exports) {
      var ECLevel = require_error_correction_level(), EC_BLOCKS_TABLE = [
        // L  M  Q  H
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
        1,
        2,
        2,
        4,
        1,
        2,
        4,
        4,
        2,
        4,
        4,
        4,
        2,
        4,
        6,
        5,
        2,
        4,
        6,
        6,
        2,
        5,
        8,
        8,
        4,
        5,
        8,
        8,
        4,
        5,
        8,
        11,
        4,
        8,
        10,
        11,
        4,
        9,
        12,
        16,
        4,
        9,
        16,
        16,
        6,
        10,
        12,
        18,
        6,
        10,
        17,
        16,
        6,
        11,
        16,
        19,
        6,
        13,
        18,
        21,
        7,
        14,
        21,
        25,
        8,
        16,
        20,
        25,
        8,
        17,
        23,
        25,
        9,
        17,
        23,
        34,
        9,
        18,
        25,
        30,
        10,
        20,
        27,
        32,
        12,
        21,
        29,
        35,
        12,
        23,
        34,
        37,
        12,
        25,
        34,
        40,
        13,
        26,
        35,
        42,
        14,
        28,
        38,
        45,
        15,
        29,
        40,
        48,
        16,
        31,
        43,
        51,
        17,
        33,
        45,
        54,
        18,
        35,
        48,
        57,
        19,
        37,
        51,
        60,
        19,
        38,
        53,
        63,
        20,
        40,
        56,
        66,
        21,
        43,
        59,
        70,
        22,
        45,
        62,
        74,
        24,
        47,
        65,
        77,
        25,
        49,
        68,
        81
      ], EC_CODEWORDS_TABLE = [
        // L  M  Q  H
        7,
        10,
        13,
        17,
        10,
        16,
        22,
        28,
        15,
        26,
        36,
        44,
        20,
        36,
        52,
        64,
        26,
        48,
        72,
        88,
        36,
        64,
        96,
        112,
        40,
        72,
        108,
        130,
        48,
        88,
        132,
        156,
        60,
        110,
        160,
        192,
        72,
        130,
        192,
        224,
        80,
        150,
        224,
        264,
        96,
        176,
        260,
        308,
        104,
        198,
        288,
        352,
        120,
        216,
        320,
        384,
        132,
        240,
        360,
        432,
        144,
        280,
        408,
        480,
        168,
        308,
        448,
        532,
        180,
        338,
        504,
        588,
        196,
        364,
        546,
        650,
        224,
        416,
        600,
        700,
        224,
        442,
        644,
        750,
        252,
        476,
        690,
        816,
        270,
        504,
        750,
        900,
        300,
        560,
        810,
        960,
        312,
        588,
        870,
        1050,
        336,
        644,
        952,
        1110,
        360,
        700,
        1020,
        1200,
        390,
        728,
        1050,
        1260,
        420,
        784,
        1140,
        1350,
        450,
        812,
        1200,
        1440,
        480,
        868,
        1290,
        1530,
        510,
        924,
        1350,
        1620,
        540,
        980,
        1440,
        1710,
        570,
        1036,
        1530,
        1800,
        570,
        1064,
        1590,
        1890,
        600,
        1120,
        1680,
        1980,
        630,
        1204,
        1770,
        2100,
        660,
        1260,
        1860,
        2220,
        720,
        1316,
        1950,
        2310,
        750,
        1372,
        2040,
        2430
      ];
      exports.getBlocksCount = function(version, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case ECLevel.L:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
          case ECLevel.M:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
          case ECLevel.Q:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
          case ECLevel.H:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
          default:
            return;
        }
      };
      exports.getTotalCodewordsCount = function(version, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case ECLevel.L:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
          case ECLevel.M:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
          case ECLevel.Q:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
          case ECLevel.H:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
          default:
            return;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/galois-field.js
  var require_galois_field = __commonJS({
    "node_modules/qrcode/lib/core/galois-field.js"(exports) {
      var EXP_TABLE = new Uint8Array(512), LOG_TABLE = new Uint8Array(256);
      (function() {
        let x = 1;
        for (let i = 0; i < 255; i++)
          EXP_TABLE[i] = x, LOG_TABLE[x] = i, x <<= 1, x & 256 && (x ^= 285);
        for (let i = 255; i < 512; i++)
          EXP_TABLE[i] = EXP_TABLE[i - 255];
      })();
      exports.log = function(n) {
        if (n < 1) throw new Error("log(" + n + ")");
        return LOG_TABLE[n];
      };
      exports.exp = function(n) {
        return EXP_TABLE[n];
      };
      exports.mul = function(x, y) {
        return x === 0 || y === 0 ? 0 : EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
      };
    }
  });

  // node_modules/qrcode/lib/core/polynomial.js
  var require_polynomial = __commonJS({
    "node_modules/qrcode/lib/core/polynomial.js"(exports) {
      var GF = require_galois_field();
      exports.mul = function(p1, p2) {
        let coeff = new Uint8Array(p1.length + p2.length - 1);
        for (let i = 0; i < p1.length; i++)
          for (let j = 0; j < p2.length; j++)
            coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        return coeff;
      };
      exports.mod = function(divident, divisor) {
        let result = new Uint8Array(divident);
        for (; result.length - divisor.length >= 0; ) {
          let coeff = result[0];
          for (let i = 0; i < divisor.length; i++)
            result[i] ^= GF.mul(divisor[i], coeff);
          let offset = 0;
          for (; offset < result.length && result[offset] === 0; ) offset++;
          result = result.slice(offset);
        }
        return result;
      };
      exports.generateECPolynomial = function(degree) {
        let poly = new Uint8Array([1]);
        for (let i = 0; i < degree; i++)
          poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
        return poly;
      };
    }
  });

  // node_modules/qrcode/lib/core/reed-solomon-encoder.js
  var require_reed_solomon_encoder = __commonJS({
    "node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports, module) {
      var Polynomial = require_polynomial();
      function ReedSolomonEncoder(degree) {
        this.genPoly = void 0, this.degree = degree, this.degree && this.initialize(this.degree);
      }
      ReedSolomonEncoder.prototype.initialize = function(degree) {
        this.degree = degree, this.genPoly = Polynomial.generateECPolynomial(this.degree);
      };
      ReedSolomonEncoder.prototype.encode = function(data) {
        if (!this.genPoly)
          throw new Error("Encoder not initialized");
        let paddedData = new Uint8Array(data.length + this.degree);
        paddedData.set(data);
        let remainder = Polynomial.mod(paddedData, this.genPoly), start = this.degree - remainder.length;
        if (start > 0) {
          let buff = new Uint8Array(this.degree);
          return buff.set(remainder, start), buff;
        }
        return remainder;
      };
      module.exports = ReedSolomonEncoder;
    }
  });

  // node_modules/qrcode/lib/core/version-check.js
  var require_version_check = __commonJS({
    "node_modules/qrcode/lib/core/version-check.js"(exports) {
      exports.isValid = function(version) {
        return !isNaN(version) && version >= 1 && version <= 40;
      };
    }
  });

  // node_modules/qrcode/lib/core/regex.js
  var require_regex = __commonJS({
    "node_modules/qrcode/lib/core/regex.js"(exports) {
      var numeric = "[0-9]+", alphanumeric = "[A-Z $%*+\\-./:]+", kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
      kanji = kanji.replace(/u/g, "\\u");
      var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + `)(?:.|[\r
]))+`;
      exports.KANJI = new RegExp(kanji, "g");
      exports.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
      exports.BYTE = new RegExp(byte, "g");
      exports.NUMERIC = new RegExp(numeric, "g");
      exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
      var TEST_KANJI = new RegExp("^" + kanji + "$"), TEST_NUMERIC = new RegExp("^" + numeric + "$"), TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
      exports.testKanji = function(str) {
        return TEST_KANJI.test(str);
      };
      exports.testNumeric = function(str) {
        return TEST_NUMERIC.test(str);
      };
      exports.testAlphanumeric = function(str) {
        return TEST_ALPHANUMERIC.test(str);
      };
    }
  });

  // node_modules/qrcode/lib/core/mode.js
  var require_mode = __commonJS({
    "node_modules/qrcode/lib/core/mode.js"(exports) {
      var VersionCheck = require_version_check(), Regex = require_regex();
      exports.NUMERIC = {
        id: "Numeric",
        bit: 1,
        ccBits: [10, 12, 14]
      };
      exports.ALPHANUMERIC = {
        id: "Alphanumeric",
        bit: 2,
        ccBits: [9, 11, 13]
      };
      exports.BYTE = {
        id: "Byte",
        bit: 4,
        ccBits: [8, 16, 16]
      };
      exports.KANJI = {
        id: "Kanji",
        bit: 8,
        ccBits: [8, 10, 12]
      };
      exports.MIXED = {
        bit: -1
      };
      exports.getCharCountIndicator = function(mode, version) {
        if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
        if (!VersionCheck.isValid(version))
          throw new Error("Invalid version: " + version);
        return version >= 1 && version < 10 ? mode.ccBits[0] : version < 27 ? mode.ccBits[1] : mode.ccBits[2];
      };
      exports.getBestModeForData = function(dataStr) {
        return Regex.testNumeric(dataStr) ? exports.NUMERIC : Regex.testAlphanumeric(dataStr) ? exports.ALPHANUMERIC : Regex.testKanji(dataStr) ? exports.KANJI : exports.BYTE;
      };
      exports.toString = function(mode) {
        if (mode && mode.id) return mode.id;
        throw new Error("Invalid mode");
      };
      exports.isValid = function(mode) {
        return mode && mode.bit && mode.ccBits;
      };
      function fromString(string) {
        if (typeof string != "string")
          throw new Error("Param is not a string");
        switch (string.toLowerCase()) {
          case "numeric":
            return exports.NUMERIC;
          case "alphanumeric":
            return exports.ALPHANUMERIC;
          case "kanji":
            return exports.KANJI;
          case "byte":
            return exports.BYTE;
          default:
            throw new Error("Unknown mode: " + string);
        }
      }
      exports.from = function(value, defaultValue) {
        if (exports.isValid(value))
          return value;
        try {
          return fromString(value);
        } catch {
          return defaultValue;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/version.js
  var require_version = __commonJS({
    "node_modules/qrcode/lib/core/version.js"(exports) {
      var Utils = require_utils(), ECCode = require_error_correction_code(), ECLevel = require_error_correction_level(), Mode = require_mode(), VersionCheck = require_version_check(), G18 = 7973, G18_BCH = Utils.getBCHDigit(G18);
      function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
        for (let currentVersion = 1; currentVersion <= 40; currentVersion++)
          if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode))
            return currentVersion;
      }
      function getReservedBitsCount(mode, version) {
        return Mode.getCharCountIndicator(mode, version) + 4;
      }
      function getTotalBitsFromDataArray(segments, version) {
        let totalBits = 0;
        return segments.forEach(function(data) {
          let reservedBits = getReservedBitsCount(data.mode, version);
          totalBits += reservedBits + data.getBitsLength();
        }), totalBits;
      }
      function getBestVersionForMixedData(segments, errorCorrectionLevel) {
        for (let currentVersion = 1; currentVersion <= 40; currentVersion++)
          if (getTotalBitsFromDataArray(segments, currentVersion) <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED))
            return currentVersion;
      }
      exports.from = function(value, defaultValue) {
        return VersionCheck.isValid(value) ? parseInt(value, 10) : defaultValue;
      };
      exports.getCapacity = function(version, errorCorrectionLevel, mode) {
        if (!VersionCheck.isValid(version))
          throw new Error("Invalid QR Code version");
        typeof mode > "u" && (mode = Mode.BYTE);
        let totalCodewords = Utils.getSymbolTotalCodewords(version), ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel), dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
        if (mode === Mode.MIXED) return dataTotalCodewordsBits;
        let usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
        switch (mode) {
          case Mode.NUMERIC:
            return Math.floor(usableBits / 10 * 3);
          case Mode.ALPHANUMERIC:
            return Math.floor(usableBits / 11 * 2);
          case Mode.KANJI:
            return Math.floor(usableBits / 13);
          case Mode.BYTE:
          default:
            return Math.floor(usableBits / 8);
        }
      };
      exports.getBestVersionForData = function(data, errorCorrectionLevel) {
        let seg, ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
        if (Array.isArray(data)) {
          if (data.length > 1)
            return getBestVersionForMixedData(data, ecl);
          if (data.length === 0)
            return 1;
          seg = data[0];
        } else
          seg = data;
        return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
      };
      exports.getEncodedBits = function(version) {
        if (!VersionCheck.isValid(version) || version < 7)
          throw new Error("Invalid QR Code version");
        let d = version << 12;
        for (; Utils.getBCHDigit(d) - G18_BCH >= 0; )
          d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
        return version << 12 | d;
      };
    }
  });

  // node_modules/qrcode/lib/core/format-info.js
  var require_format_info = __commonJS({
    "node_modules/qrcode/lib/core/format-info.js"(exports) {
      var Utils = require_utils(), G15 = 1335, G15_MASK = 21522, G15_BCH = Utils.getBCHDigit(G15);
      exports.getEncodedBits = function(errorCorrectionLevel, mask) {
        let data = errorCorrectionLevel.bit << 3 | mask, d = data << 10;
        for (; Utils.getBCHDigit(d) - G15_BCH >= 0; )
          d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
        return (data << 10 | d) ^ G15_MASK;
      };
    }
  });

  // node_modules/qrcode/lib/core/numeric-data.js
  var require_numeric_data = __commonJS({
    "node_modules/qrcode/lib/core/numeric-data.js"(exports, module) {
      var Mode = require_mode();
      function NumericData(data) {
        this.mode = Mode.NUMERIC, this.data = data.toString();
      }
      NumericData.getBitsLength = function(length) {
        return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
      };
      NumericData.prototype.getLength = function() {
        return this.data.length;
      };
      NumericData.prototype.getBitsLength = function() {
        return NumericData.getBitsLength(this.data.length);
      };
      NumericData.prototype.write = function(bitBuffer) {
        let i, group, value;
        for (i = 0; i + 3 <= this.data.length; i += 3)
          group = this.data.substr(i, 3), value = parseInt(group, 10), bitBuffer.put(value, 10);
        let remainingNum = this.data.length - i;
        remainingNum > 0 && (group = this.data.substr(i), value = parseInt(group, 10), bitBuffer.put(value, remainingNum * 3 + 1));
      };
      module.exports = NumericData;
    }
  });

  // node_modules/qrcode/lib/core/alphanumeric-data.js
  var require_alphanumeric_data = __commonJS({
    "node_modules/qrcode/lib/core/alphanumeric-data.js"(exports, module) {
      var Mode = require_mode(), ALPHA_NUM_CHARS = [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
        "M",
        "N",
        "O",
        "P",
        "Q",
        "R",
        "S",
        "T",
        "U",
        "V",
        "W",
        "X",
        "Y",
        "Z",
        " ",
        "$",
        "%",
        "*",
        "+",
        "-",
        ".",
        "/",
        ":"
      ];
      function AlphanumericData(data) {
        this.mode = Mode.ALPHANUMERIC, this.data = data;
      }
      AlphanumericData.getBitsLength = function(length) {
        return 11 * Math.floor(length / 2) + 6 * (length % 2);
      };
      AlphanumericData.prototype.getLength = function() {
        return this.data.length;
      };
      AlphanumericData.prototype.getBitsLength = function() {
        return AlphanumericData.getBitsLength(this.data.length);
      };
      AlphanumericData.prototype.write = function(bitBuffer) {
        let i;
        for (i = 0; i + 2 <= this.data.length; i += 2) {
          let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
          value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]), bitBuffer.put(value, 11);
        }
        this.data.length % 2 && bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
      };
      module.exports = AlphanumericData;
    }
  });

  // node_modules/qrcode/lib/core/byte-data.js
  var require_byte_data = __commonJS({
    "node_modules/qrcode/lib/core/byte-data.js"(exports, module) {
      var Mode = require_mode();
      function ByteData(data) {
        this.mode = Mode.BYTE, typeof data == "string" ? this.data = new TextEncoder().encode(data) : this.data = new Uint8Array(data);
      }
      ByteData.getBitsLength = function(length) {
        return length * 8;
      };
      ByteData.prototype.getLength = function() {
        return this.data.length;
      };
      ByteData.prototype.getBitsLength = function() {
        return ByteData.getBitsLength(this.data.length);
      };
      ByteData.prototype.write = function(bitBuffer) {
        for (let i = 0, l = this.data.length; i < l; i++)
          bitBuffer.put(this.data[i], 8);
      };
      module.exports = ByteData;
    }
  });

  // node_modules/qrcode/lib/core/kanji-data.js
  var require_kanji_data = __commonJS({
    "node_modules/qrcode/lib/core/kanji-data.js"(exports, module) {
      var Mode = require_mode(), Utils = require_utils();
      function KanjiData(data) {
        this.mode = Mode.KANJI, this.data = data;
      }
      KanjiData.getBitsLength = function(length) {
        return length * 13;
      };
      KanjiData.prototype.getLength = function() {
        return this.data.length;
      };
      KanjiData.prototype.getBitsLength = function() {
        return KanjiData.getBitsLength(this.data.length);
      };
      KanjiData.prototype.write = function(bitBuffer) {
        let i;
        for (i = 0; i < this.data.length; i++) {
          let value = Utils.toSJIS(this.data[i]);
          if (value >= 33088 && value <= 40956)
            value -= 33088;
          else if (value >= 57408 && value <= 60351)
            value -= 49472;
          else
            throw new Error(
              "Invalid SJIS character: " + this.data[i] + `
Make sure your charset is UTF-8`
            );
          value = (value >>> 8 & 255) * 192 + (value & 255), bitBuffer.put(value, 13);
        }
      };
      module.exports = KanjiData;
    }
  });

  // node_modules/dijkstrajs/dijkstra.js
  var require_dijkstra = __commonJS({
    "node_modules/dijkstrajs/dijkstra.js"(exports, module) {
      "use strict";
      var dijkstra = {
        single_source_shortest_paths: function(graph, s, d) {
          var predecessors = {}, costs = {};
          costs[s] = 0;
          var open = dijkstra.PriorityQueue.make();
          open.push(s, 0);
          for (var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit; !open.empty(); ) {
            closest = open.pop(), u = closest.value, cost_of_s_to_u = closest.cost, adjacent_nodes = graph[u] || {};
            for (v in adjacent_nodes)
              adjacent_nodes.hasOwnProperty(v) && (cost_of_e = adjacent_nodes[v], cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e, cost_of_s_to_v = costs[v], first_visit = typeof costs[v] > "u", (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) && (costs[v] = cost_of_s_to_u_plus_cost_of_e, open.push(v, cost_of_s_to_u_plus_cost_of_e), predecessors[v] = u));
          }
          if (typeof d < "u" && typeof costs[d] > "u") {
            var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
            throw new Error(msg);
          }
          return predecessors;
        },
        extract_shortest_path_from_predecessor_list: function(predecessors, d) {
          for (var nodes = [], u = d, predecessor; u; )
            nodes.push(u), predecessor = predecessors[u], u = predecessors[u];
          return nodes.reverse(), nodes;
        },
        find_path: function(graph, s, d) {
          var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
          return dijkstra.extract_shortest_path_from_predecessor_list(
            predecessors,
            d
          );
        },
        /**
         * A very naive priority queue implementation.
         */
        PriorityQueue: {
          make: function(opts) {
            var T = dijkstra.PriorityQueue, t = {}, key;
            opts = opts || {};
            for (key in T)
              T.hasOwnProperty(key) && (t[key] = T[key]);
            return t.queue = [], t.sorter = opts.sorter || T.default_sorter, t;
          },
          default_sorter: function(a, b) {
            return a.cost - b.cost;
          },
          /**
           * Add a new item to the queue and ensure the highest priority element
           * is at the front of the queue.
           */
          push: function(value, cost) {
            var item = { value, cost };
            this.queue.push(item), this.queue.sort(this.sorter);
          },
          /**
           * Return the highest priority element in the queue.
           */
          pop: function() {
            return this.queue.shift();
          },
          empty: function() {
            return this.queue.length === 0;
          }
        }
      };
      typeof module < "u" && (module.exports = dijkstra);
    }
  });

  // node_modules/qrcode/lib/core/segments.js
  var require_segments = __commonJS({
    "node_modules/qrcode/lib/core/segments.js"(exports) {
      var Mode = require_mode(), NumericData = require_numeric_data(), AlphanumericData = require_alphanumeric_data(), ByteData = require_byte_data(), KanjiData = require_kanji_data(), Regex = require_regex(), Utils = require_utils(), dijkstra = require_dijkstra();
      function getStringByteLength(str) {
        return unescape(encodeURIComponent(str)).length;
      }
      function getSegments(regex, mode, str) {
        let segments = [], result;
        for (; (result = regex.exec(str)) !== null; )
          segments.push({
            data: result[0],
            index: result.index,
            mode,
            length: result[0].length
          });
        return segments;
      }
      function getSegmentsFromString(dataStr) {
        let numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr), alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr), byteSegs, kanjiSegs;
        return Utils.isKanjiModeEnabled() ? (byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr), kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr)) : (byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr), kanjiSegs = []), numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs).sort(function(s1, s2) {
          return s1.index - s2.index;
        }).map(function(obj) {
          return {
            data: obj.data,
            mode: obj.mode,
            length: obj.length
          };
        });
      }
      function getSegmentBitsLength(length, mode) {
        switch (mode) {
          case Mode.NUMERIC:
            return NumericData.getBitsLength(length);
          case Mode.ALPHANUMERIC:
            return AlphanumericData.getBitsLength(length);
          case Mode.KANJI:
            return KanjiData.getBitsLength(length);
          case Mode.BYTE:
            return ByteData.getBitsLength(length);
        }
      }
      function mergeSegments(segs) {
        return segs.reduce(function(acc, curr) {
          let prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
          return prevSeg && prevSeg.mode === curr.mode ? (acc[acc.length - 1].data += curr.data, acc) : (acc.push(curr), acc);
        }, []);
      }
      function buildNodes(segs) {
        let nodes = [];
        for (let i = 0; i < segs.length; i++) {
          let seg = segs[i];
          switch (seg.mode) {
            case Mode.NUMERIC:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
                { data: seg.data, mode: Mode.BYTE, length: seg.length }
              ]);
              break;
            case Mode.ALPHANUMERIC:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.BYTE, length: seg.length }
              ]);
              break;
            case Mode.KANJI:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
              ]);
              break;
            case Mode.BYTE:
              nodes.push([
                { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
              ]);
          }
        }
        return nodes;
      }
      function buildGraph(nodes, version) {
        let table = {}, graph = { start: {} }, prevNodeIds = ["start"];
        for (let i = 0; i < nodes.length; i++) {
          let nodeGroup = nodes[i], currentNodeIds = [];
          for (let j = 0; j < nodeGroup.length; j++) {
            let node = nodeGroup[j], key = "" + i + j;
            currentNodeIds.push(key), table[key] = { node, lastCount: 0 }, graph[key] = {};
            for (let n = 0; n < prevNodeIds.length; n++) {
              let prevNodeId = prevNodeIds[n];
              table[prevNodeId] && table[prevNodeId].node.mode === node.mode ? (graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode), table[prevNodeId].lastCount += node.length) : (table[prevNodeId] && (table[prevNodeId].lastCount = node.length), graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version));
            }
          }
          prevNodeIds = currentNodeIds;
        }
        for (let n = 0; n < prevNodeIds.length; n++)
          graph[prevNodeIds[n]].end = 0;
        return { map: graph, table };
      }
      function buildSingleSegment(data, modesHint) {
        let mode, bestMode = Mode.getBestModeForData(data);
        if (mode = Mode.from(modesHint, bestMode), mode !== Mode.BYTE && mode.bit < bestMode.bit)
          throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode) + `.
 Suggested mode is: ` + Mode.toString(bestMode));
        switch (mode === Mode.KANJI && !Utils.isKanjiModeEnabled() && (mode = Mode.BYTE), mode) {
          case Mode.NUMERIC:
            return new NumericData(data);
          case Mode.ALPHANUMERIC:
            return new AlphanumericData(data);
          case Mode.KANJI:
            return new KanjiData(data);
          case Mode.BYTE:
            return new ByteData(data);
        }
      }
      exports.fromArray = function(array) {
        return array.reduce(function(acc, seg) {
          return typeof seg == "string" ? acc.push(buildSingleSegment(seg, null)) : seg.data && acc.push(buildSingleSegment(seg.data, seg.mode)), acc;
        }, []);
      };
      exports.fromString = function(data, version) {
        let segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled()), nodes = buildNodes(segs), graph = buildGraph(nodes, version), path = dijkstra.find_path(graph.map, "start", "end"), optimizedSegs = [];
        for (let i = 1; i < path.length - 1; i++)
          optimizedSegs.push(graph.table[path[i]].node);
        return exports.fromArray(mergeSegments(optimizedSegs));
      };
      exports.rawSplit = function(data) {
        return exports.fromArray(
          getSegmentsFromString(data, Utils.isKanjiModeEnabled())
        );
      };
    }
  });

  // node_modules/qrcode/lib/core/qrcode.js
  var require_qrcode = __commonJS({
    "node_modules/qrcode/lib/core/qrcode.js"(exports) {
      var Utils = require_utils(), ECLevel = require_error_correction_level(), BitBuffer = require_bit_buffer(), BitMatrix = require_bit_matrix(), AlignmentPattern = require_alignment_pattern(), FinderPattern = require_finder_pattern(), MaskPattern = require_mask_pattern(), ECCode = require_error_correction_code(), ReedSolomonEncoder = require_reed_solomon_encoder(), Version = require_version(), FormatInfo = require_format_info(), Mode = require_mode(), Segments = require_segments();
      function setupFinderPattern(matrix, version) {
        let size = matrix.size, pos = FinderPattern.getPositions(version);
        for (let i = 0; i < pos.length; i++) {
          let row = pos[i][0], col = pos[i][1];
          for (let r = -1; r <= 7; r++)
            if (!(row + r <= -1 || size <= row + r))
              for (let c = -1; c <= 7; c++)
                col + c <= -1 || size <= col + c || (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4 ? matrix.set(row + r, col + c, !0, !0) : matrix.set(row + r, col + c, !1, !0));
        }
      }
      function setupTimingPattern(matrix) {
        let size = matrix.size;
        for (let r = 8; r < size - 8; r++) {
          let value = r % 2 === 0;
          matrix.set(r, 6, value, !0), matrix.set(6, r, value, !0);
        }
      }
      function setupAlignmentPattern(matrix, version) {
        let pos = AlignmentPattern.getPositions(version);
        for (let i = 0; i < pos.length; i++) {
          let row = pos[i][0], col = pos[i][1];
          for (let r = -2; r <= 2; r++)
            for (let c = -2; c <= 2; c++)
              r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0 ? matrix.set(row + r, col + c, !0, !0) : matrix.set(row + r, col + c, !1, !0);
        }
      }
      function setupVersionInfo(matrix, version) {
        let size = matrix.size, bits = Version.getEncodedBits(version), row, col, mod;
        for (let i = 0; i < 18; i++)
          row = Math.floor(i / 3), col = i % 3 + size - 8 - 3, mod = (bits >> i & 1) === 1, matrix.set(row, col, mod, !0), matrix.set(col, row, mod, !0);
      }
      function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
        let size = matrix.size, bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern), i, mod;
        for (i = 0; i < 15; i++)
          mod = (bits >> i & 1) === 1, i < 6 ? matrix.set(i, 8, mod, !0) : i < 8 ? matrix.set(i + 1, 8, mod, !0) : matrix.set(size - 15 + i, 8, mod, !0), i < 8 ? matrix.set(8, size - i - 1, mod, !0) : i < 9 ? matrix.set(8, 15 - i - 1 + 1, mod, !0) : matrix.set(8, 15 - i - 1, mod, !0);
        matrix.set(size - 8, 8, 1, !0);
      }
      function setupData(matrix, data) {
        let size = matrix.size, inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0;
        for (let col = size - 1; col > 0; col -= 2)
          for (col === 6 && col--; ; ) {
            for (let c = 0; c < 2; c++)
              if (!matrix.isReserved(row, col - c)) {
                let dark = !1;
                byteIndex < data.length && (dark = (data[byteIndex] >>> bitIndex & 1) === 1), matrix.set(row, col - c, dark), bitIndex--, bitIndex === -1 && (byteIndex++, bitIndex = 7);
              }
            if (row += inc, row < 0 || size <= row) {
              row -= inc, inc = -inc;
              break;
            }
          }
      }
      function createData(version, errorCorrectionLevel, segments) {
        let buffer = new BitBuffer();
        segments.forEach(function(data) {
          buffer.put(data.mode.bit, 4), buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version)), data.write(buffer);
        });
        let totalCodewords = Utils.getSymbolTotalCodewords(version), ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel), dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
        for (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits && buffer.put(0, 4); buffer.getLengthInBits() % 8 !== 0; )
          buffer.putBit(0);
        let remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
        for (let i = 0; i < remainingByte; i++)
          buffer.put(i % 2 ? 17 : 236, 8);
        return createCodewords(buffer, version, errorCorrectionLevel);
      }
      function createCodewords(bitBuffer, version, errorCorrectionLevel) {
        let totalCodewords = Utils.getSymbolTotalCodewords(version), ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel), dataTotalCodewords = totalCodewords - ecTotalCodewords, ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel), blocksInGroup2 = totalCodewords % ecTotalBlocks, blocksInGroup1 = ecTotalBlocks - blocksInGroup2, totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks), dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks), dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1, ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1, rs = new ReedSolomonEncoder(ecCount), offset = 0, dcData = new Array(ecTotalBlocks), ecData = new Array(ecTotalBlocks), maxDataSize = 0, buffer = new Uint8Array(bitBuffer.buffer);
        for (let b = 0; b < ecTotalBlocks; b++) {
          let dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
          dcData[b] = buffer.slice(offset, offset + dataSize), ecData[b] = rs.encode(dcData[b]), offset += dataSize, maxDataSize = Math.max(maxDataSize, dataSize);
        }
        let data = new Uint8Array(totalCodewords), index = 0, i, r;
        for (i = 0; i < maxDataSize; i++)
          for (r = 0; r < ecTotalBlocks; r++)
            i < dcData[r].length && (data[index++] = dcData[r][i]);
        for (i = 0; i < ecCount; i++)
          for (r = 0; r < ecTotalBlocks; r++)
            data[index++] = ecData[r][i];
        return data;
      }
      function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
        let segments;
        if (Array.isArray(data))
          segments = Segments.fromArray(data);
        else if (typeof data == "string") {
          let estimatedVersion = version;
          if (!estimatedVersion) {
            let rawSegments = Segments.rawSplit(data);
            estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
          }
          segments = Segments.fromString(data, estimatedVersion || 40);
        } else
          throw new Error("Invalid data");
        let bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
        if (!bestVersion)
          throw new Error("The amount of data is too big to be stored in a QR Code");
        if (!version)
          version = bestVersion;
        else if (version < bestVersion)
          throw new Error(
            `
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: ` + bestVersion + `.
`
          );
        let dataBits = createData(version, errorCorrectionLevel, segments), moduleCount = Utils.getSymbolSize(version), modules = new BitMatrix(moduleCount);
        return setupFinderPattern(modules, version), setupTimingPattern(modules), setupAlignmentPattern(modules, version), setupFormatInfo(modules, errorCorrectionLevel, 0), version >= 7 && setupVersionInfo(modules, version), setupData(modules, dataBits), isNaN(maskPattern) && (maskPattern = MaskPattern.getBestMask(
          modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel)
        )), MaskPattern.applyMask(maskPattern, modules), setupFormatInfo(modules, errorCorrectionLevel, maskPattern), {
          modules,
          version,
          errorCorrectionLevel,
          maskPattern,
          segments
        };
      }
      exports.create = function(data, options) {
        if (typeof data > "u" || data === "")
          throw new Error("No input text");
        let errorCorrectionLevel = ECLevel.M, version, mask;
        return typeof options < "u" && (errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M), version = Version.from(options.version), mask = MaskPattern.from(options.maskPattern), options.toSJISFunc && Utils.setToSJISFunction(options.toSJISFunc)), createSymbol(data, version, errorCorrectionLevel, mask);
      };
    }
  });

  // node_modules/qrcode/lib/renderer/utils.js
  var require_utils2 = __commonJS({
    "node_modules/qrcode/lib/renderer/utils.js"(exports) {
      function hex2rgba(hex) {
        if (typeof hex == "number" && (hex = hex.toString()), typeof hex != "string")
          throw new Error("Color should be defined as hex string");
        let hexCode = hex.slice().replace("#", "").split("");
        if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8)
          throw new Error("Invalid hex color: " + hex);
        (hexCode.length === 3 || hexCode.length === 4) && (hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }))), hexCode.length === 6 && hexCode.push("F", "F");
        let hexValue = parseInt(hexCode.join(""), 16);
        return {
          r: hexValue >> 24 & 255,
          g: hexValue >> 16 & 255,
          b: hexValue >> 8 & 255,
          a: hexValue & 255,
          hex: "#" + hexCode.slice(0, 6).join("")
        };
      }
      exports.getOptions = function(options) {
        options || (options = {}), options.color || (options.color = {});
        let margin = typeof options.margin > "u" || options.margin === null || options.margin < 0 ? 4 : options.margin, width = options.width && options.width >= 21 ? options.width : void 0, scale = options.scale || 4;
        return {
          width,
          scale: width ? 4 : scale,
          margin,
          color: {
            dark: hex2rgba(options.color.dark || "#000000ff"),
            light: hex2rgba(options.color.light || "#ffffffff")
          },
          type: options.type,
          rendererOpts: options.rendererOpts || {}
        };
      };
      exports.getScale = function(qrSize, opts) {
        return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
      };
      exports.getImageWidth = function(qrSize, opts) {
        let scale = exports.getScale(qrSize, opts);
        return Math.floor((qrSize + opts.margin * 2) * scale);
      };
      exports.qrToImageData = function(imgData, qr, opts) {
        let size = qr.modules.size, data = qr.modules.data, scale = exports.getScale(size, opts), symbolSize = Math.floor((size + opts.margin * 2) * scale), scaledMargin = opts.margin * scale, palette = [opts.color.light, opts.color.dark];
        for (let i = 0; i < symbolSize; i++)
          for (let j = 0; j < symbolSize; j++) {
            let posDst = (i * symbolSize + j) * 4, pxColor = opts.color.light;
            if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
              let iSrc = Math.floor((i - scaledMargin) / scale), jSrc = Math.floor((j - scaledMargin) / scale);
              pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
            }
            imgData[posDst++] = pxColor.r, imgData[posDst++] = pxColor.g, imgData[posDst++] = pxColor.b, imgData[posDst] = pxColor.a;
          }
      };
    }
  });

  // node_modules/qrcode/lib/renderer/canvas.js
  var require_canvas = __commonJS({
    "node_modules/qrcode/lib/renderer/canvas.js"(exports) {
      var Utils = require_utils2();
      function clearCanvas(ctx, canvas, size) {
        ctx.clearRect(0, 0, canvas.width, canvas.height), canvas.style || (canvas.style = {}), canvas.height = size, canvas.width = size, canvas.style.height = size + "px", canvas.style.width = size + "px";
      }
      function getCanvasElement() {
        try {
          return document.createElement("canvas");
        } catch {
          throw new Error("You need to specify a canvas element");
        }
      }
      exports.render = function(qrData, canvas, options) {
        let opts = options, canvasEl = canvas;
        typeof opts > "u" && (!canvas || !canvas.getContext) && (opts = canvas, canvas = void 0), canvas || (canvasEl = getCanvasElement()), opts = Utils.getOptions(opts);
        let size = Utils.getImageWidth(qrData.modules.size, opts), ctx = canvasEl.getContext("2d"), image = ctx.createImageData(size, size);
        return Utils.qrToImageData(image.data, qrData, opts), clearCanvas(ctx, canvasEl, size), ctx.putImageData(image, 0, 0), canvasEl;
      };
      exports.renderToDataURL = function(qrData, canvas, options) {
        let opts = options;
        typeof opts > "u" && (!canvas || !canvas.getContext) && (opts = canvas, canvas = void 0), opts || (opts = {});
        let canvasEl = exports.render(qrData, canvas, opts), type = opts.type || "image/png", rendererOpts = opts.rendererOpts || {};
        return canvasEl.toDataURL(type, rendererOpts.quality);
      };
    }
  });

  // node_modules/qrcode/lib/renderer/svg-tag.js
  var require_svg_tag = __commonJS({
    "node_modules/qrcode/lib/renderer/svg-tag.js"(exports) {
      var Utils = require_utils2();
      function getColorAttrib(color, attrib) {
        let alpha = color.a / 255, str = attrib + '="' + color.hex + '"';
        return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
      }
      function svgCmd(cmd, x, y) {
        let str = cmd + x;
        return typeof y < "u" && (str += " " + y), str;
      }
      function qrToPath(data, size, margin) {
        let path = "", moveBy = 0, newRow = !1, lineLength = 0;
        for (let i = 0; i < data.length; i++) {
          let col = Math.floor(i % size), row = Math.floor(i / size);
          !col && !newRow && (newRow = !0), data[i] ? (lineLength++, i > 0 && col > 0 && data[i - 1] || (path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0), moveBy = 0, newRow = !1), col + 1 < size && data[i + 1] || (path += svgCmd("h", lineLength), lineLength = 0)) : moveBy++;
        }
        return path;
      }
      exports.render = function(qrData, options, cb) {
        let opts = Utils.getOptions(options), size = qrData.modules.size, data = qrData.modules.data, qrcodesize = size + opts.margin * 2, bg = opts.color.light.a ? "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>' : "", path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>', viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"', svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + (opts.width ? 'width="' + opts.width + '" height="' + opts.width + '" ' : "") + viewBox + ' shape-rendering="crispEdges">' + bg + path + `</svg>
`;
        return typeof cb == "function" && cb(null, svgTag), svgTag;
      };
    }
  });

  // node_modules/qrcode/lib/browser.js
  var require_browser = __commonJS({
    "node_modules/qrcode/lib/browser.js"(exports) {
      var canPromise = require_can_promise(), QRCode4 = require_qrcode(), CanvasRenderer = require_canvas(), SvgRenderer = require_svg_tag();
      function renderCanvas(renderFunc, canvas, text, opts, cb) {
        let args = [].slice.call(arguments, 1), argsNum = args.length, isLastArgCb = typeof args[argsNum - 1] == "function";
        if (!isLastArgCb && !canPromise())
          throw new Error("Callback required as last argument");
        if (isLastArgCb) {
          if (argsNum < 2)
            throw new Error("Too few arguments provided");
          argsNum === 2 ? (cb = text, text = canvas, canvas = opts = void 0) : argsNum === 3 && (canvas.getContext && typeof cb > "u" ? (cb = opts, opts = void 0) : (cb = opts, opts = text, text = canvas, canvas = void 0));
        } else {
          if (argsNum < 1)
            throw new Error("Too few arguments provided");
          return argsNum === 1 ? (text = canvas, canvas = opts = void 0) : argsNum === 2 && !canvas.getContext && (opts = text, text = canvas, canvas = void 0), new Promise(function(resolve, reject) {
            try {
              let data = QRCode4.create(text, opts);
              resolve(renderFunc(data, canvas, opts));
            } catch (e) {
              reject(e);
            }
          });
        }
        try {
          let data = QRCode4.create(text, opts);
          cb(null, renderFunc(data, canvas, opts));
        } catch (e) {
          cb(e);
        }
      }
      exports.create = QRCode4.create;
      exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
      exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
      exports.toString = renderCanvas.bind(null, function(data, _, opts) {
        return SvgRenderer.render(data, opts);
      });
    }
  });

  // packages/plugin/src/control-route.ts
  var CONTROL_RPC_PREFIX = "/ds-harness-remote", STATUS_STREAM_ENDPOINT = "status.events", STATUS_STREAM_PATH = `${CONTROL_RPC_PREFIX}/${STATUS_STREAM_ENDPOINT}`;

  // packages/plugin/src/remote-upload-client.ts
  var REMOTE_UPLOAD_MAX_BYTES = 192 * 1024 * 1024;
  function createRemoteUploadFetch(original, baseUrl) {
    let sequence = 0, control = async (method, payload, signal) => {
      let rpcId = `remote-upload-${++sequence}`, response = await original(new URL(`${CONTROL_RPC_PREFIX.slice(1)}/${method}`, baseUrl), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
        signal
      });
      if (!response.ok) throw new Error(`Remote upload control failed (HTTP ${response.status}).`);
      let envelope = await response.json();
      if (envelope.type !== "server-response" || envelope.rpcId !== rpcId || envelope.result?.ok !== !0)
        throw new Error(envelope.result?.error?.message ?? "Remote upload requires an updated Host plugin.");
      return envelope.result.value;
    };
    return async (input, init) => {
      let url = new URL(input instanceof Request ? input.url : String(input), baseUrl), target = new URL("api/session/uploadFileBinary", baseUrl);
      if (url.origin !== target.origin || url.pathname !== target.pathname) return original(input, init);
      let request = new Request(url, input instanceof Request ? new Request(input, init) : init);
      if (request.method !== "POST") return original(input, init);
      let signal = AbortSignal.any([request.signal, AbortSignal.timeout(6e4)]), status = await control("status", {}, signal);
      if (status.mode === "local") return original(input, init);
      if (status.mode !== "remote" || !status.connected) throw new Error("Remote Host is disconnected. Reconnect before uploading a file.");
      if (status.backend !== void 0 && status.backend !== "harness") throw new Error("Remote attachment receipts require a Harness session.");
      let sessionId = url.searchParams.get("sessionId"), mediaType = url.searchParams.get("mediaType");
      if (!sessionId || mediaType !== null && !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType))
        throw new Error("A Session and a supported image media type, when provided, are required.");
      let reader = request.body?.getReader(), abortRead = () => {
        reader?.cancel(signal.reason).catch(() => {
        });
      };
      signal.addEventListener("abort", abortRead, { once: !0 });
      let chunks = [], size = 0;
      try {
        for (; reader !== void 0; ) {
          signal.throwIfAborted();
          let next = await reader.read();
          if (next.done) break;
          if (size += next.value.byteLength, size > REMOTE_UPLOAD_MAX_BYTES) throw new Error("Remote upload exceeds the Remote transfer safety limit.");
          chunks.push(next.value);
        }
      } finally {
        signal.removeEventListener("abort", abortRead), await reader?.cancel().catch(() => {
        }), reader?.releaseLock();
      }
      signal.throwIfAborted();
      let binary = "";
      for (let chunk of chunks) for (let i = 0; i < chunk.length; i += 32768) binary += String.fromCharCode(...chunk.subarray(i, i + 32768));
      let result = await control("plugin.route", { route: "api/session/uploadFileBinary", targetDeviceId: status.target?.deviceId, body: {
        endpoint: mediaType === null ? "file" : "image",
        payload: {
          sessionId,
          ...mediaType === null ? {} : { mediaType },
          data: btoa(binary),
          ...url.searchParams.has("name") ? { name: url.searchParams.get("name") } : {}
        }
      } }, signal);
      return new Response(JSON.stringify(result.json), { status: result.status, headers: { "content-type": "application/json" } });
    };
  }

  // packages/plugin/src/client/portal.ts
  function renderBodyPortal(portal, children) {
    if (typeof portal != "function" || typeof document > "u" || document === null) return children;
    let body = document.body;
    if (body == null) return children;
    try {
      return portal(children, body);
    } catch {
      return children;
    }
  }

  // packages/plugin/src/client-locale.ts
  var localeNamespace = "ds-harness-remote", en = {
    serverSavedLive: "Server address saved and applied.",
    saveServerBeforeLogin: "Save the Server address before continuing sign-in or pairing.",
    pairingLoginTab: "DSH Go",
    pairingTitle: "Pair with DSH Go",
    pairingHint: `Scan in DSH Go and confirm on your phone.
Then enter the phone code on this computer and confirm binding.`,
    pairingHostOnly: "New Hosts accept connections only. Pairing does not enable control of other devices.",
    pairingSaveServer: "Save the Server address before pairing.",
    pairingScan: "Scan this QR code in DSH Go and confirm on your phone.",
    pairingEnter: "Check the requesting phone, then enter its code.",
    pairingComplete: "Paired. DSH Go can now connect to this Host.",
    pairingPending: "Recover the original submission without changing the code.",
    pairingClosed: "Pairing ended. Generate a new QR code to start again.",
    pairingQr: "One-time DSH Go pairing QR code",
    pairingExpires: "Expires in {time}",
    pairingExpired: "Expired",
    pairingCode: "8-digit code shown on your phone",
    pairingWarning: "Only one submission is allowed. A wrong code invalidates this QR code; scan a new one.",
    pairingConfirm: "Confirm binding",
    pairingRetry: "Recover original submission",
    pairingCancel: "Cancel pairing",
    pairingStart: "Generate pairing QR code",
    pairingBusy: "Please wait\u2026",
    pairingUnsupported: "This Server does not support device pairing.",
    pairingError: `Could not finish pairing. Check the connection.
If a code was sent, recover the original submission without changing it.`,
    remoteTools: "Inject Remote Tools",
    remoteToolsHint: "Expose remote_* tools in sessions. On by default; turn it off when you do not need them. Changes apply after restarting the Host.",
    remoteToolsSaved: "Remote Tools setting saved.",
    debugLogging: "Debug logging",
    debugLoggingHint: "Record detailed connection diagnostics in the Host log (Info and above are recorded by default). Applies immediately; turn off after troubleshooting.",
    debugLoggingLevelDebug: "Debug",
    debugLoggingLevelInfo: "Info",
    debugLogsToggleOpen: "View logs",
    debugLogsToggleClose: "Hide logs",
    debugLogsFilterAll: "All",
    debugLogsFilterWarn: "Warnings & Errors",
    debugLogsRefresh: "Refresh",
    debugLogsRefreshing: "Refreshing\u2026",
    debugLogsCopy: "Copy",
    debugLogsCopied: "Copied",
    debugLogsCopyFailed: "Copy failed",
    debugLogsExport: "Export",
    debugLogsClear: "Clear",
    debugLogsLoading: "Loading logs\u2026",
    debugLogsEmpty: "No matching log entries yet.",
    debugLogsFileLabel: "Log file:",
    debugLogsFileFallback: "Memory only ({error})",
    debugLogsCount: "{count} entries",
    terminalRemote: "Remote terminal",
    terminalRemoteHint: "Allow trusted Remote devices to run an interactive shell as this Host user. On by default; independent of Agent approvals. Toggling saves and applies immediately.",
    terminalRemoteUnavailable: "Remote terminal is unavailable. Enable Remote terminal in the Host Remote settings; the switch applies immediately.",
    terminalSaved: "Remote terminal setting saved. Applies immediately.",
    sidebarEntry: "Sidebar entry",
    sidebarEntryHint: "Standard keeps the Remote button in the sidebar footer. Compact moves it to the account row: an icon locally, or the Host name and Exit when remote. Toggling applies immediately.",
    sidebarEntryStandard: "Standard",
    sidebarEntryCompact: "Compact",
    sidebarEntrySaved: "Sidebar entry style saved.",
    previewOpen: "Preview service",
    previewPort: "Host port",
    previewLocalOnly: "Preview requires Desktop or a browser connected to Harness on this computer.",
    hostReferenceName: "Name",
    hostReferenceSystem: "System",
    hostReferenceDeviceId: "Device ID",
    hostReferenceInvocation: "Invocation",
    settings: "Settings",
    pluginTitle: "DeepSeek Remote",
    pluginDescription: "P2P-based, end-to-end encrypted remote access to DeepSeek Harness, CodeX, Claude Code, Pi, and other workspaces from web and mobile clients.",
    openPluginSettings: "Remote settings",
    expandSettings: "Show settings: {name}",
    collapseSettings: "Hide settings: {name}",
    unsaved: "Unsaved",
    associated: "Authorized",
    authorizationComplete: "Authorization complete",
    loadingSettings: "Loading DeepSeek Remote settings\u2026",
    mode: "Mode",
    pluginMode: "Plugin mode",
    host: "Host",
    client: "Client",
    authorization: "Authorization",
    account: "Account",
    hostRegistrationCode: "One-time device authorization code",
    ownedDeviceAuthorization: "Owned device",
    authorizedOn: "{role} is authorized on {serverUrl}.",
    readOnly: "This DSH profile does not provide writable user settings.",
    discard: "Discard",
    save: "Save",
    saving: "Saving\u2026",
    signOut: "Sign out",
    signingOut: "Signing out\u2026",
    hostName: "Host name",
    deviceId: "Device ID",
    serverUrl: "Server URL",
    serverUrlHint: "HTTPS origin used for account authorization and encrypted relay.",
    serverSaved: "Server address saved. Restart DSH to apply it.",
    codexRemote: "Codex Remote",
    codexRemoteHint: "Connect to CodeX projects on this Host.",
    codexSaved: "Codex Remote setting saved. Restart DSH to apply it.",
    cursorRemote: "Cursor ACP adapter (experimental)",
    cursorRemoteHint: "Enable the Cursor `agent acp` backend for the Agent ACP gateway. Requires local `agent login`. Restart DSH after changing this setting.",
    cursorSaved: "Cursor ACP adapter setting saved. Restart DSH to apply it.",
    authorizeFromRemote: "Sign in to manage this device and connect to your remote Hosts.",
    signInAccount: "Sign in",
    saveServerBeforeSignIn: "Save the Server address before signing in.",
    authorizationMethod: "Authorization method",
    accountPassword: "Account password",
    registrationCode: "Device authorization code",
    registrationCodeHint: "Generate it after signing in on the Server website. Use it once to connect this device.",
    accountHint: "The account must belong to the selected Server.",
    password: "Password",
    passwordHint: "Only DSH Remote Web or self-hosted service accounts; not DeepSeek Harness official.",
    modeSavedNeedsAuthorization: "Mode saved. Authorize {role} before connecting. Existing registrations were kept.",
    modeSavedReused: "Mode saved. Existing registration reused. Restart Harness to apply.",
    modeSavedOwnedRole: "Mode saved. This owned device was authorized automatically. Restart Harness to apply.",
    enterRegistrationCode: "Enter the device authorization code.",
    enterAccountPassword: "Enter the Server account and password.",
    associationSaved: "Associated. Restart Harness to apply.",
    signedOut: "Signed out and disconnected from Remote.",
    remoteRequestFailed: "Remote mode request failed.",
    remoteControlUnavailable: "Remote plugin control is still starting. Restart DSH if it stays unavailable.",
    identityCorrupted: "Local Remote identity is corrupted. Reset the identity in Settings to recover.",
    credentialsCorrupted: "Local Remote credentials are corrupted. Sign out or reset the identity in Settings to recover.",
    identityLocked: "Local Remote identity is locked by another process. Stop other DSH instances and retry.",
    storageConflict: "Conflicting or unverified legacy Remote storage found. Stop all DSH instances and inspect it manually.",
    storageConflictEntry: 'Conflicting or unverified legacy Remote storage found. Unexpected entry "{name}" was found. Stop all DSH instances and inspect it manually.',
    retryStartup: "Retry Remote startup",
    retryStartupSuccess: "Remote startup completed.",
    resetIdentity: "Reset Remote Identity",
    resetIdentityHint: "Recreate local device key pairs if they are corrupted. You will need to sign in again.",
    resetIdentityConfirm: "Are you sure you want to reset the local Remote identity? You will need to sign in again.",
    resetIdentitySuccess: "Remote identity has been reset.",
    resettingAction: "Resetting\u2026",
    remoteStartupFailed: "Remote plugin failed to start.",
    switchTarget: "Switch Local / Remote Harness target",
    harnessTarget: "Harness target",
    close: "Close",
    refreshRemote: "Refresh remote hosts",
    refreshRemoteShort: "Refresh",
    local: "Local",
    remoteTarget: "Remote \xB7 {name}",
    remoteHostMention: "Remote \xB7 {platform}",
    thisMachineLocal: "This machine (Local)",
    currentDevice: "Current device",
    noRemoteHosts: "No remote hosts are currently available.",
    online: "Online",
    offline: "Offline",
    thisMachineHost: "This machine as Remote Host",
    connected: "Connected",
    connectedAs: "Connected as {account}",
    connection: "Connection",
    checkingConnection: "Checking connection\u2026",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    lastActive: "Last active: {time}",
    neverConnected: "No successful connection yet.",
    reconnect: "Reconnect",
    reconnectingAction: "Reconnecting\u2026",
    reconnectStarted: "Reconnect requested.",
    connectionAuthorizationExpired: "Authorization expired. Sign out and authorize this Host again.",
    connectionReplaced: "Another instance is using this Host identity. Stop it or use a separate DSH_HOME before reconnecting.",
    connectionCredentialsBusy: "Credential refresh is busy. The Host will retry. Remove a legacy refresh lock only after every instance stops.",
    connectionDeviceRevoked: "This Host was revoked on the Server. Sign out and authorize it again.",
    connectionOwnershipRequired: "The Server no longer recognizes this Host as an owned device.",
    connectionRateLimited: "The Server is receiving too many requests. Automatic retry will continue.",
    connectionVersionMismatch: "The Plugin and Server protocol versions are incompatible.",
    connectionInvalidResponse: "The Server returned an invalid control message.",
    connectionReachability: "Cannot reach the Server. Check the network and Server address.",
    connectionUnexpected: "The connection stopped unexpectedly. Automatic retry will continue.",
    hostSignInHint: "Sign in to authorize this Host on the selected Server.",
    checkingHost: "Checking Host registration\u2026",
    hostUnavailable: "Host unavailable: {error}",
    serverAccountEmail: "Server account email",
    serverAccountPassword: "Server account password",
    signInRegisterHost: "Sign in and register Host",
    signingIn: "Signing in\u2026",
    loginWaitingAuthorization: "Waiting for authorization",
    loginLoadingDevices: "Signed in. Loading devices",
    loginLoadingSettings: "Signed in. Loading settings",
    useRegistrationCode: "Use connection code",
    registering: "Registering\u2026",
    remoteEntry: "Remote",
    remoteTitle: "DS Harness Remote - Remote Workspace",
    remoteDescription: "Choose one of your Hosts, then select a working directory. The Harness interface stays on this device.",
    starProject: "Open source project, stars welcome~",
    chooseHost: "Host",
    manageHosts: "Manage Hosts",
    chooseDirectory: "Working directory",
    selectHostHint: "Select an online Host to browse its directories.",
    emptyDirectory: "This directory has no visible subdirectories.",
    openWorkspace: "Open workspace",
    openingWorkspace: "Opening\u2026",
    loadingDirectory: "Loading directories\u2026",
    remoteProgressCheckingHost: "Checking Host",
    remoteProgressCheckingHostDetail: "Finding the selected device and checking whether it is online.",
    remoteProgressAuthorizingPeer: "Verifying authorization",
    remoteProgressAuthorizingPeerDetail: "Confirming account membership and pinned Host identity.",
    remoteProgressOpeningChannel: "Opening encrypted channel",
    remoteProgressOpeningChannelDetail: "Trying LAN, P2P, TURN, then Relay if needed.",
    remoteProgressProbeLan: "Probing LAN",
    remoteProgressProbeLanDetail: "Checking whether the Host is reachable on the local network.",
    remoteProgressProbeP2p: "Probing P2P",
    remoteProgressProbeP2pDetail: "Checking direct internet candidates between this device and the Host.",
    remoteProgressProbeTurn: "Probing TURN",
    remoteProgressProbeTurnDetail: "Checking the TURN relay path for restricted networks.",
    remoteProgressProbeRelay: "Preparing Relay",
    remoteProgressProbeRelayDetail: "Preparing the encrypted Server Relay fallback if direct paths do not open.",
    remoteProgressTryingPrefix: "Trying ",
    remoteProgressUsingPrefix: "Using ",
    remoteProgressLoadingWorkspaces: "Loading workspaces",
    remoteProgressLoadingWorkspacesDetail: "Reading the remote Harness workspace list through the tunnel.",
    remoteProgressSwitchingWorkspace: "Switching interface",
    remoteProgressSwitchingWorkspaceDetail: "Handing the remote workspace to the local Harness UI.",
    remoteProgressReady: "Ready",
    remoteProgressReadyDetail: "The remote Host is connected and encrypted.",
    backToHosts: "Choose another Host",
    currentDirectory: "Selected directory",
    directoryTruncated: "Only part of this directory could be shown.",
    pluginVersion: "Plugin {version}",
    harnessVersion: "Harness {version}",
    updateAvailable: "\u2B06 Remote {latest} is available (current {current})",
    updateShort: "\u2B06 {version}",
    updateAvailableShort: "{version} available",
    pluginUpdating: "Updating\u2026",
    pluginUpdateReload: "Updating, Remote will reload",
    pluginUpdateFailed: "Update failed",
    pluginUpdateUnknown: "Update status unknown, click to retry",
    pluginUpdateManual: "Releases",
    updateBadge: "Update available",
    updateAvailableTag: "\u2B06 Update available",
    existingWorkspaces: "DSH workspaces",
    remotePathPlaceholder: "/home/user/project",
    remotePathHint: "Enter an absolute directory path on the selected Host.",
    noRemoteWorkspaces: "No remote workspaces yet. Use + to add one.",
    activeRemote: "{name}",
    exitRemote: "Exit",
    addRemoteWorkspace: "Add remote workspace",
    addCodexWorkspace: "Add CodeX workspace",
    addCursorWorkspace: "Add Cursor workspace",
    addAntigravityWorkspace: "Add Antigravity workspace",
    addPiWorkspace: "Add Pi workspace",
    addOpencodeWorkspace: "Add OpenCode workspace",
    addClaudeWorkspace: "Add Claude workspace",
    addHermesWorkspace: "Add Hermes workspace",
    noCodexWorkspaces: "No CodeX workspaces yet.",
    noCursorWorkspaces: "No Cursor workspaces yet. Add a project directory to start.",
    noAntigravityWorkspaces: "No Antigravity workspaces yet. Add a project directory to start.",
    noPiWorkspaces: "No Pi workspaces yet. Add a project directory to start.",
    noOpencodeWorkspaces: "No OpenCode workspaces yet. Add a project directory to start.",
    noClaudeWorkspaces: "No Claude workspaces yet. Add a project directory to start.",
    noHermesWorkspaces: "No Hermes workspaces yet. Add a project directory to start.",
    cancelAddWorkspace: "Cancel",
    confirmAddWorkspace: "Add and open",
    showAllWorkspaces: "Show all DSH workspaces",
    showAllCodexWorkspaces: "Show all CodeX workspaces",
    showAllCursorWorkspaces: "Show all Cursor workspaces",
    showAllAntigravityWorkspaces: "Show all Antigravity workspaces",
    showAllPiWorkspaces: "Show all Pi workspaces",
    showAllOpencodeWorkspaces: "Show all OpenCode workspaces",
    showAllClaudeWorkspaces: "Show all Claude workspaces",
    showAllHermesWorkspaces: "Show all Hermes workspaces",
    remoteModeLabel: "Remote mode \xB7 {name}",
    remoteNetworkP2p: "P2P",
    remoteNetworkTurn: "TURN",
    remoteNetworkRelay: "Relay",
    remoteNetworkLan: "LAN",
    remoteNetworkOffline: "Disconnected",
    clientSignInAgain: "Authorization expired \xB7 Sign in again",
    remoteLinkEncrypted: "End-to-end encrypted",
    connectionRouteTitle: "Connection route",
    connectionRouteFrom: "From",
    connectionRouteVia: "Via",
    connectionRouteTo: "To",
    connectionRouteCurrentDevice: "This device",
    connectionRouteLan: "Local network",
    connectionRouteP2p: "Direct internet path",
    connectionRouteTurn: "TURN relay service",
    connectionRouteRelay: "Remote Server",
    connectionRouteHost: "Work computer running Harness",
    connectionRouteLanDetail: "Direct transfer over the local network",
    connectionRouteP2pDetail: "Direct transfer over the internet",
    connectionRouteTurnDetail: "Encrypted transfer through the TURN service",
    connectionRouteRelayDetail: "Encrypted transfer through the Remote Server",
    connectionRouteEncrypted: "Application data remains end-to-end encrypted along this route.",
    connectionDetailsConnection: "Connection",
    connectionDetailsWebRtc: "Network details \xB7 WebRTC / ICE",
    connectionId: "Connection ID",
    connectedAt: "Established",
    preferredTransports: "Attempt order",
    controlChannel: "Control channel",
    controlAddress: "Control address",
    serverUnavailableError: "Service unavailable. Please try again later.",
    connectionHoldCountdown: "Connection expires in {seconds}s",
    serverUnavailableCountdown: "Service unavailable \xB7 Connection expires in {seconds}s",
    unavailable: "Unavailable",
    serverUnavailableShort: "Service unavailable",
    serverUnavailable: "Server unavailable. Reconnecting.",
    serverUnavailableConnected: "Server unavailable. Device link active. Reconnecting.",
    serverLeaseExpiring: "Connection expires in {seconds}s.",
    serverRestored: "Server restored.",
    serverLinkDisconnected: "Connection lost.",
    controlStateConnecting: "Connecting",
    controlStateOpen: "Connected",
    controlStateClosing: "Closing",
    controlStateClosed: "Closed",
    peerState: "Peer connection",
    dataChannel: "DataChannel",
    localCandidate: "Local candidate",
    remoteCandidate: "Remote candidate",
    localAddress: "Local address",
    remoteAddress: "Remote address",
    networkProtocol: "Network protocol",
    relayProtocol: "TURN protocol",
    roundTripTime: "Round-trip time",
    availableBitrate: "Available outgoing bitrate",
    bytesSent: "WebRTC bytes sent",
    bytesReceived: "WebRTC bytes received",
    notProvided: "Not provided",
    candidateHost: "Local address \xB7 host",
    candidateSrflx: "Public address \xB7 srflx",
    candidatePrflx: "Peer address \xB7 prflx",
    candidateRelay: "TURN address \xB7 relay",
    openLocalWorkspaces: "Open local workspaces",
    clientSignInHint: "Sign in to this Server to list your remote Hosts.",
    signInClient: "DS Harness Remote:",
    signInClientDescription: "Connect once. Available anytime.",
    startSignIn: "Start sign-in",
    allowControlCurrentDevice: "Allow control of this device",
    allowControlDevice: "Allow control of this device",
    connectedClientCount: "{count} connected",
    checkAcp: "Check backend",
    checkingAcp: "Checking ACP\u2026",
    acpAvailable: "ACP available",
    acpUnavailable: "ACP unavailable",
    agentBackends: "More Coding Agents",
    acpDocumentation: "Read the documentation.",
    acpHint: "Connect through ACP. ",
    acpCheckPassed: "Check passed",
    acpCheckFailed: "Check failed",
    installOrConfigureAcp: "Install / Configure",
    configureAcp: "Auto-configure",
    installAcp: "Install & Configure",
    installingAcp: "Configuring\u2026",
    acpConfiguredNotice: "ACP backend automatically configured and enabled.",
    acpInstalledNotice: "ACP backend installed and enabled.",
    acpDownloadRequired: "Please download and install {backend} first: {url}",
    addAcp: "Add ACP",
    acpName: "Service name",
    acpCommand: "Command",
    acpArguments: "Arguments",
    removeAcp: "Remove",
    currentConnectedDevices: "Currently connected devices",
    noConnectedClients: "No devices are currently connected to this Host.",
    unknownDevice: "Unknown device",
    exitRemoteAccount: "Sign out",
    githubLogin: "Github",
    providerLogin: "{provider}",
    scanWithProvider: "Scan to continue with {provider}",
    loadingLoginProviders: "Loading sign-in methods\u2026",
    retryLoginProviders: "Retry loading sign-in methods",
    serverApplied: "Server address applied.",
    noLoginProviders: "QR sign-in is unavailable. Use email and password.",
    zhihuLogin: "Zhihu",
    scanWithGitHub: "Scan to continue with GitHub",
    scanWithZhihu: "Scan to continue with Zhihu",
    openInBrowser: "Continue in browser",
    scanLoginHint: "Authorize on your phone. This window will continue automatically.",
    currentServiceAddress: "Authorization service domain:",
    editServiceAddress: "Edit service address",
    restoreDefaultServiceAddress: "Restore default",
    cancelServiceAddressEdit: "Cancel",
    accountPasswordLogin: "Password",
    qrLoginExpired: "This QR code expired. Refresh it to continue.",
    refreshQrCode: "Refresh QR code",
    codexVirtualWorkspace: "CodeX virtual workspace",
    cursorVirtualWorkspace: "Cursor virtual workspace",
    antigravityVirtualWorkspace: "Antigravity virtual workspace",
    piVirtualWorkspace: "Pi virtual workspace",
    opencodeVirtualWorkspace: "OpenCode virtual workspace",
    claudeVirtualWorkspace: "Claude virtual workspace",
    hermesVirtualWorkspace: "Hermes virtual workspace",
    codexVirtualSessions: "Sessions"
  }, zh = {
    serverSavedLive: "\u670D\u52A1\u5668\u5730\u5740\u5DF2\u4FDD\u5B58\u5E76\u751F\u6548\u3002",
    saveServerBeforeLogin: "\u8BF7\u5148\u4FDD\u5B58\u670D\u52A1\u5668\u5730\u5740\uFF0C\u518D\u7EE7\u7EED\u767B\u5F55\u6216\u914D\u5BF9\u3002",
    pairingLoginTab: "DSH Go",
    pairingTitle: "\u4E0E DSH Go \u914D\u5BF9",
    pairingHint: `\u8BF7\u4F7F\u7528 DSH Go \u626B\u7801\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u3002
\u5F53\u524D\u4E3B\u673A\u4EC5\u88AB\u63A7\uFF0C\u5982\u9700\u8981\u4E3B\u63A7\u8BF7\u4F7F\u7528\u5176\u4ED6\u767B\u5F55\u65B9\u5F0F\u3002`,
    pairingHostOnly: "\u6B64\u6388\u6743\u4E3B\u673A\u53EA\u5141\u8BB8\u88AB\u63A7\uFF0C\u65E0\u6CD5\u63A7\u5236\u5176\u4ED6\u8BBE\u5907\u3002",
    pairingSaveServer: "\u8BF7\u5148\u4FDD\u5B58\u670D\u52A1\u5668\u5730\u5740\uFF0C\u518D\u5F00\u59CB\u914D\u5BF9\u3002",
    pairingScan: `\u8BF7\u4F7F\u7528 DSH Go \u626B\u7801\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u3002
\u5F53\u524D\u4E3B\u673A\u4EC5\u88AB\u63A7\uFF0C\u5982\u9700\u8981\u4E3B\u63A7\u8BF7\u4F7F\u7528\u5176\u4ED6\u767B\u5F55\u65B9\u5F0F\u3002`,
    pairingEnter: "\u8BF7\u6838\u5B9E\u7533\u8BF7\u624B\u673A",
    pairingComplete: "\u914D\u5BF9\u5B8C\u6210\uFF0CDSH Go \u73B0\u5728\u53EF\u4EE5\u8FDE\u63A5\u6B64 Host\u3002",
    pairingPending: "\u8BF7\u6062\u590D\u539F\u63D0\u4EA4\u7ED3\u679C\uFF0C\u4E0D\u8981\u66F4\u6362\u9A8C\u8BC1\u7801\u3002",
    pairingClosed: "\u914D\u5BF9\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801\u3002",
    pairingQr: "DSH Go \u4E00\u6B21\u6027\u914D\u5BF9\u4E8C\u7EF4\u7801",
    pairingExpires: "\u5269\u4F59 {time}",
    pairingExpired: "\u5DF2\u8FC7\u671F",
    pairingCode: "\u624B\u673A\u663E\u793A\u7684 8 \u4F4D\u9A8C\u8BC1\u7801",
    pairingWarning: "\u4EC5\u5141\u8BB8\u63D0\u4EA4\u4E00\u6B21\u3002\u9A8C\u8BC1\u7801\u9519\u8BEF\u540E\uFF0C\u672C\u4E8C\u7EF4\u7801\u7ACB\u5373\u5931\u6548\uFF0C\u5FC5\u987B\u91CD\u65B0\u626B\u7801\u3002",
    pairingConfirm: "\u786E\u8BA4\u7ED1\u5B9A",
    pairingRetry: "\u6062\u590D\u539F\u63D0\u4EA4\u7ED3\u679C",
    pairingCancel: "\u53D6\u6D88\u914D\u5BF9",
    pairingStart: "\u751F\u6210\u914D\u5BF9\u4E8C\u7EF4\u7801",
    pairingBusy: "\u8BF7\u7A0D\u5019\u2026",
    pairingUnsupported: "\u5F53\u524D\u670D\u52A1\u5668\u4E0D\u652F\u6301\u8BBE\u5907\u626B\u7801\u914D\u5BF9\u3002",
    pairingError: `\u6682\u65F6\u65E0\u6CD5\u5B8C\u6210\u914D\u5BF9\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3002
\u82E5\u5DF2\u63D0\u4EA4\u9A8C\u8BC1\u7801\uFF0C\u8BF7\u6062\u590D\u539F\u63D0\u4EA4\uFF0C\u4E0D\u8981\u66F4\u6362\u9A8C\u8BC1\u7801\u3002`,
    remoteTools: "\u6CE8\u5165 Remote Tools",
    remoteToolsHint: "\u5728\u4F1A\u8BDD\u4E2D\u6CE8\u5165 remote_* \u5DE5\u5177\u3002\u9ED8\u8BA4\u5F00\u542F\uFF1B\u4E0D\u9700\u8981\u65F6\u53EF\u5173\u95ED\uFF0C\u91CD\u542F Host \u540E\u751F\u6548\u3002",
    remoteToolsSaved: "Remote Tools \u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002",
    debugLogging: "Debug \u65E5\u5FD7",
    debugLoggingHint: "\u5F00\u542F\u540E\u8BB0\u5F55\u8BE6\u7EC6\u8FDE\u63A5\u8BCA\u65AD\uFF08\u9ED8\u8BA4\u4E5F\u4F1A\u8BB0\u5F55 Info \u53CA\u4EE5\u4E0A\u65E5\u5FD7\uFF09\uFF0C\u7ACB\u5373\u751F\u6548\uFF1B\u6392\u67E5\u5B8C\u6210\u540E\u53EF\u5173\u95ED\u3002",
    debugLoggingLevelDebug: "Debug",
    debugLoggingLevelInfo: "Info",
    debugLogsToggleOpen: "\u67E5\u770B\u65E5\u5FD7",
    debugLogsToggleClose: "\u6536\u8D77\u65E5\u5FD7",
    debugLogsFilterAll: "\u5168\u90E8",
    debugLogsFilterWarn: "\u8B66\u544A\u4E0E\u9519\u8BEF",
    debugLogsRefresh: "\u5237\u65B0",
    debugLogsRefreshing: "\u5237\u65B0\u4E2D\u2026",
    debugLogsCopy: "\u590D\u5236",
    debugLogsCopied: "\u5DF2\u590D\u5236",
    debugLogsCopyFailed: "\u590D\u5236\u5931\u8D25",
    debugLogsExport: "\u5BFC\u51FA",
    debugLogsClear: "\u6E05\u7A7A",
    debugLogsLoading: "\u6B63\u5728\u52A0\u8F7D\u65E5\u5FD7\u2026",
    debugLogsEmpty: "\u6682\u65E0\u5339\u914D\u65E5\u5FD7\u3002",
    debugLogsFileLabel: "\u65E5\u5FD7\u6587\u4EF6\uFF1A",
    debugLogsFileFallback: "\u4EC5\u5185\u5B58\u6A21\u5F0F\uFF08{error}\uFF09",
    debugLogsCount: "{count} \u6761",
    terminalRemote: "\u8FDC\u7A0B\u7EC8\u7AEF",
    terminalRemoteHint: "\u5141\u8BB8\u53D7\u4FE1\u4EFB\u7684 Remote \u8BBE\u5907\u4EE5\u6B64 Host \u7528\u6237\u8EAB\u4EFD\u8FD0\u884C\u4EA4\u4E92\u5F0F Shell\u3002\u9ED8\u8BA4\u5F00\u542F\uFF0C\u72EC\u7ACB\u4E8E Agent \u5BA1\u6279\uFF1B\u5207\u6362\u540E\u7ACB\u5373\u4FDD\u5B58\u5E76\u751F\u6548\u3002",
    terminalRemoteUnavailable: "\u8FDC\u7A0B\u7EC8\u7AEF\u4E0D\u53EF\u7528\u3002\u8BF7\u5728 Host \u7684 Remote \u8BBE\u7F6E\u4E2D\u5F00\u542F\u300C\u8FDC\u7A0B\u7EC8\u7AEF\u300D\uFF0C\u5F00\u5173\u4F1A\u7ACB\u5373\u751F\u6548\u3002",
    terminalSaved: "\u8FDC\u7A0B\u7EC8\u7AEF\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u7ACB\u5373\u751F\u6548\u3002",
    sidebarEntry: "\u4FA7\u680F\u5165\u53E3\u6837\u5F0F",
    sidebarEntryHint: "\u300C\u6807\u51C6\u300D\u628A Remote \u6309\u94AE\u7559\u5728\u4FA7\u680F\u5E95\u90E8\uFF1B\u300C\u7B80\u6D01\u300D\u628A\u5B83\u6536\u8FDB\u8D26\u53F7\u884C\u53F3\u4FA7\uFF0C\u672C\u5730\u663E\u793A\u56FE\u6807\uFF0C\u8FDC\u7A0B\u663E\u793A\u4E3B\u673A\u540D\u548C\u9000\u51FA\u3002\u5207\u6362\u540E\u7ACB\u5373\u751F\u6548\u3002",
    sidebarEntryStandard: "\u6807\u51C6",
    sidebarEntryCompact: "\u7B80\u6D01",
    sidebarEntrySaved: "\u4FA7\u680F\u5165\u53E3\u6837\u5F0F\u5DF2\u4FDD\u5B58\u3002",
    previewOpen: "\u9884\u89C8\u670D\u52A1",
    previewPort: "Host \u7AEF\u53E3",
    previewLocalOnly: "\u9884\u89C8\u9700\u8981 Desktop\uFF0C\u6216\u8FDE\u63A5\u5230\u672C\u673A Harness \u7684\u6D4F\u89C8\u5668\u3002",
    hostReferenceName: "\u540D\u79F0",
    hostReferenceSystem: "\u7CFB\u7EDF",
    hostReferenceDeviceId: "\u8BBE\u5907 ID",
    hostReferenceInvocation: "\u8C03\u7528\u5185\u5BB9",
    settings: "\u8BBE\u7F6E",
    pluginTitle: "DeepSeek \u8FDC\u7A0B\u8FDE\u63A5",
    pluginDescription: "\u57FA\u4E8E P2P \u7F51\u7EDC\uFF0C\u4F7F\u7528\u7AEF\u5230\u7AEF\u52A0\u5BC6\u8FDC\u7A0B\u8BBF\u95EE DeepSeek Harness\u3001CodeX\u3001Claude Code\u3001Pi \u7B49\u5DE5\u4F5C\u533A\uFF0C\u652F\u6301Web\u548C\u79FB\u52A8\u7AEF\u3002",
    openPluginSettings: "\u8FDC\u7A0B\u8BBE\u7F6E",
    expandSettings: "\u5C55\u5F00\u8BBE\u7F6E\uFF1A{name}",
    collapseSettings: "\u6536\u8D77\u8BBE\u7F6E\uFF1A{name}",
    unsaved: "\u672A\u4FDD\u5B58",
    associated: "\u5DF2\u6388\u6743",
    authorizationComplete: "\u5DF2\u5B8C\u6210\u6388\u6743",
    loadingSettings: "\u6B63\u5728\u52A0\u8F7D DeepSeek \u8FDC\u7A0B\u8FDE\u63A5\u8BBE\u7F6E\u2026",
    mode: "\u6A21\u5F0F",
    pluginMode: "\u63D2\u4EF6\u6A21\u5F0F",
    host: "\u4E3B\u673A",
    client: "Client",
    authorization: "\u6388\u6743",
    account: "\u8D26\u53F7",
    hostRegistrationCode: "\u4E00\u6B21\u6027\u8BBE\u5907\u6388\u6743\u7801",
    ownedDeviceAuthorization: "\u81EA\u6709\u8BBE\u5907",
    authorizedOn: "{role}\u5DF2\u7ECF\u5728 {serverUrl} \u5B8C\u6210\u6388\u6743\u3002",
    readOnly: "\u6B64 DSH profile \u4E0D\u63D0\u4F9B\u53EF\u5199\u7684\u7528\u6237\u8BBE\u7F6E\u3002",
    discard: "\u653E\u5F03\u4FEE\u6539",
    save: "\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D\u2026",
    signOut: "\u9000\u51FA\u6388\u6743",
    signingOut: "\u6B63\u5728\u9000\u51FA\u2026",
    hostName: "\u4E3B\u673A\u540D\u79F0",
    deviceId: "\u8BBE\u5907 ID",
    serverUrl: "Server \u5730\u5740",
    serverUrlHint: "\u7528\u4E8E\u8D26\u53F7\u6388\u6743\u548C\u52A0\u5BC6\u4E2D\u7EE7\u7684 HTTPS \u5730\u5740\u3002",
    serverSaved: "Server \u5730\u5740\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548\u3002",
    codexRemote: "Codex Remote",
    codexRemoteHint: "\u8FDE\u63A5\u8FD9\u53F0 Host \u4E0A\u7684 CodeX \u9879\u76EE\u3002",
    codexSaved: "Codex Remote \u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548\u3002",
    cursorRemote: "Cursor ACP adapter\uFF08\u5B9E\u9A8C\u6027\uFF09",
    cursorRemoteHint: "\u4E3A Agent ACP gateway \u542F\u7528 Cursor `agent acp` backend\u3002\u9700\u672C\u673A\u5B8C\u6210 `agent login`\u3002\u4FEE\u6539\u540E\u9700\u91CD\u542F DSH \u751F\u6548\u3002",
    cursorSaved: "Cursor ACP adapter \u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548\u3002",
    authorizeFromRemote: "\u767B\u5F55\u540E\u53EF\u7BA1\u7406\u5F53\u524D\u8BBE\u5907\uFF0C\u5E76\u8FDE\u63A5\u8D26\u53F7\u4E0B\u7684\u8FDC\u7A0B\u4E3B\u673A\u3002",
    signInAccount: "\u767B\u5F55\u8D26\u53F7",
    saveServerBeforeSignIn: "\u8BF7\u5148\u4FDD\u5B58 Server \u5730\u5740\uFF0C\u518D\u767B\u5F55\u8D26\u53F7\u3002",
    authorizationMethod: "\u6388\u6743\u65B9\u5F0F",
    accountPassword: "\u8D26\u53F7\u5BC6\u7801",
    registrationCode: "\u8BBE\u5907\u6388\u6743\u7801",
    registrationCodeHint: "\u767B\u5F55 Server \u7F51\u9875\u540E\u751F\u6210\uFF0C\u7528\u4E00\u6B21\u5373\u53EF\u8FDE\u63A5\u8FD9\u53F0\u8BBE\u5907\u3002",
    accountHint: "\u8D26\u53F7\u5FC5\u987B\u5C5E\u4E8E\u6240\u9009 Server\u3002",
    password: "\u5BC6\u7801",
    passwordHint: "\u4EC5\u9650DSH Remote Web\u8D26\u53F7\u6216\u81EA\u6258\u7BA1\u670D\u52A1\u8D26\u53F7\uFF0C\u975E DeepSeek Harness\u5B98\u65B9\u3002",
    modeSavedNeedsAuthorization: "\u6A21\u5F0F\u5DF2\u4FDD\u5B58\u3002\u8FDE\u63A5\u524D\u8BF7\u5148\u6388\u6743 {role}\uFF1B\u5DF2\u6709\u6CE8\u518C\u4FE1\u606F\u5DF2\u4FDD\u7559\u3002",
    modeSavedReused: "\u6A21\u5F0F\u5DF2\u4FDD\u5B58\u5E76\u590D\u7528\u5DF2\u6709\u6CE8\u518C\u4FE1\u606F\u3002\u91CD\u542F Harness \u540E\u751F\u6548\u3002",
    modeSavedOwnedRole: "\u6A21\u5F0F\u5DF2\u4FDD\u5B58\uFF0C\u5E76\u5DF2\u81EA\u52A8\u6388\u6743\u6B64\u81EA\u6709\u8BBE\u5907\u3002\u91CD\u542F Harness \u540E\u751F\u6548\u3002",
    enterRegistrationCode: "\u8BF7\u8F93\u5165\u8BBE\u5907\u6388\u6743\u7801\u3002",
    enterAccountPassword: "\u8BF7\u8F93\u5165 Server \u8D26\u53F7\u548C\u5BC6\u7801\u3002",
    associationSaved: "\u5173\u8054\u6210\u529F\u3002\u91CD\u542F Harness \u540E\u751F\u6548\u3002",
    signedOut: "\u5DF2\u9000\u51FA\u8D26\u53F7\u5E76\u65AD\u5F00 Remote \u8FDE\u63A5\u3002",
    remoteRequestFailed: "\u8FDC\u7A0B\u6A21\u5F0F\u8BF7\u6C42\u5931\u8D25\u3002",
    remoteControlUnavailable: "Remote \u63D2\u4EF6\u63A7\u5236\u901A\u9053\u4ECD\u5728\u542F\u52A8\uFF1B\u5982\u679C\u4E00\u76F4\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u542F DSH\u3002",
    identityCorrupted: "\u672C\u673A Remote \u8EAB\u4EFD\u6587\u4EF6\u635F\u574F\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u91CD\u7F6E\u8EAB\u4EFD\u3002",
    credentialsCorrupted: "\u672C\u673A Remote \u767B\u5F55\u51ED\u636E\u5DF2\u635F\u574F\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u9000\u51FA\u8D26\u53F7\u6216\u91CD\u7F6E\u8EAB\u4EFD\u3002",
    identityLocked: "\u672C\u673A Remote \u8EAB\u4EFD\u6B63\u88AB\u5176\u4ED6\u8FDB\u7A0B\u5360\u7528\uFF0C\u8BF7\u5B8C\u5168\u9000\u51FA\u5176\u4ED6 DSH \u5B9E\u4F8B\u540E\u91CD\u8BD5\u3002",
    storageConflict: "\u68C0\u6D4B\u5230\u51B2\u7A81\u6216\u65E0\u6CD5\u786E\u8BA4\u5F52\u5C5E\u7684\u65E7\u7248 Remote \u5B58\u50A8\u76EE\u5F55\uFF0C\u8BF7\u505C\u6B62\u6240\u6709 DSH \u5B9E\u4F8B\u540E\u624B\u52A8\u68C0\u67E5\u5904\u7406\u3002",
    storageConflictEntry: "\u68C0\u6D4B\u5230\u51B2\u7A81\u6216\u65E0\u6CD5\u786E\u8BA4\u5F52\u5C5E\u7684\u65E7\u7248 Remote \u5B58\u50A8\u76EE\u5F55\uFF0C\u53D1\u73B0\u5F02\u5E38\u6587\u4EF6\u201C{name}\u201D\u3002\u8BF7\u505C\u6B62\u6240\u6709 DSH \u5B9E\u4F8B\u540E\u624B\u52A8\u68C0\u67E5\u5904\u7406\u3002",
    retryStartup: "\u91CD\u8BD5\u542F\u52A8 Remote",
    retryStartupSuccess: "Remote \u5DF2\u6210\u529F\u542F\u52A8\u3002",
    resetIdentity: "\u91CD\u7F6E\u672C\u673A Remote \u8EAB\u4EFD",
    resetIdentityHint: "\u5F53\u672C\u673A\u8EAB\u4EFD\u5BC6\u94A5\u5BF9\u635F\u574F\u65F6\u91CD\u5EFA\u8EAB\u4EFD\u3002\u91CD\u7F6E\u540E\u9700\u8981\u91CD\u65B0\u767B\u5F55\u3002",
    resetIdentityConfirm: "\u786E\u5B9A\u8981\u91CD\u7F6E\u672C\u673A Remote \u8EAB\u4EFD\u5417\uFF1F\u91CD\u7F6E\u540E\u9700\u8981\u91CD\u65B0\u767B\u5F55\u3002",
    resetIdentitySuccess: "\u672C\u673A Remote \u8EAB\u4EFD\u5DF2\u91CD\u7F6E\u3002",
    resettingAction: "\u6B63\u5728\u91CD\u7F6E\u2026",
    remoteStartupFailed: "Remote \u63D2\u4EF6\u542F\u52A8\u5931\u8D25\u3002",
    switchTarget: "\u5207\u6362\u672C\u5730\u6216\u8FDC\u7A0B Harness",
    harnessTarget: "Harness \u76EE\u6807",
    close: "\u5173\u95ED",
    refreshRemote: "\u5237\u65B0\u8FDC\u7A0B\u4E3B\u673A",
    refreshRemoteShort: "\u5237\u65B0",
    local: "\u672C\u5730",
    remoteTarget: "\u8FDC\u7A0B \xB7 {name}",
    remoteHostMention: "Remote \xB7 {platform}",
    thisMachineLocal: "\u6B64\u8BBE\u5907\uFF08\u672C\u5730\uFF09",
    currentDevice: "\u5F53\u524D\u8BBE\u5907",
    noRemoteHosts: "\u5F53\u524D\u65E0\u53EF\u7528\u7684\u8FDC\u7A0B\u4E3B\u673A\u3002",
    online: "\u5728\u7EBF",
    offline: "\u79BB\u7EBF",
    thisMachineHost: "\u5C06\u6B64\u8BBE\u5907\u4F5C\u4E3A\u8FDC\u7A0B Host",
    connected: "\u5DF2\u8FDE\u63A5",
    connectedAs: "\u5DF2\u4F7F\u7528 {account} \u8FDE\u63A5",
    connection: "\u8FDE\u63A5\u72B6\u6001",
    checkingConnection: "\u6B63\u5728\u68C0\u67E5\u8FDE\u63A5\u2026",
    connecting: "\u6B63\u5728\u8FDE\u63A5",
    reconnecting: "\u6B63\u5728\u91CD\u8FDE",
    lastActive: "\u6700\u540E\u6D3B\u8DC3\uFF1A{time}",
    neverConnected: "\u5C1A\u672A\u6210\u529F\u8FDE\u63A5\u8FC7\u3002",
    reconnect: "\u624B\u52A8\u91CD\u8FDE",
    reconnectingAction: "\u6B63\u5728\u91CD\u8FDE\u2026",
    reconnectStarted: "\u5DF2\u53D1\u8D77\u91CD\u8FDE\u3002",
    connectionAuthorizationExpired: "\u6388\u6743\u5DF2\u5931\u6548\uFF0C\u8BF7\u9000\u51FA\u6388\u6743\u540E\u91CD\u65B0\u8FDE\u63A5\u6B64 Host\u3002",
    connectionReplaced: "\u53E6\u4E00\u5B9E\u4F8B\u6B63\u5728\u4F7F\u7528\u6B64 Host \u8EAB\u4EFD\u3002\u8BF7\u505C\u6B62\u8BE5\u5B9E\u4F8B\uFF0C\u6216\u4F7F\u7528\u72EC\u7ACB\u7684 DSH_HOME \u540E\u91CD\u65B0\u8FDE\u63A5\u3002",
    connectionCredentialsBusy: "\u51ED\u636E\u5237\u65B0\u6B63\u5FD9\uFF0C\u4E3B\u673A\u5C06\u91CD\u8BD5\u3002\u53EA\u6709\u505C\u6B62\u6240\u6709\u5B9E\u4F8B\u540E\uFF0C\u624D\u80FD\u79FB\u9664\u65E7\u7248\u6B8B\u7559\u7684\u5237\u65B0\u9501\u3002",
    connectionDeviceRevoked: "\u6B64 Host \u5DF2\u5728 Server \u4E0A\u88AB\u64A4\u9500\uFF0C\u8BF7\u9000\u51FA\u6388\u6743\u540E\u91CD\u65B0\u8FDE\u63A5\u3002",
    connectionOwnershipRequired: "Server \u5DF2\u4E0D\u518D\u5C06\u6B64 Host \u8BC6\u522B\u4E3A\u5F53\u524D\u8D26\u53F7\u7684\u8BBE\u5907\u3002",
    connectionRateLimited: "Server \u8BF7\u6C42\u8FC7\u591A\uFF0C\u63D2\u4EF6\u5C06\u7EE7\u7EED\u81EA\u52A8\u91CD\u8BD5\u3002",
    connectionVersionMismatch: "Plugin \u4E0E Server \u7684\u534F\u8BAE\u7248\u672C\u4E0D\u517C\u5BB9\u3002",
    connectionInvalidResponse: "Server \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u63A7\u5236\u6D88\u606F\u3002",
    connectionReachability: "\u65E0\u6CD5\u8FDE\u63A5 Server\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u548C Server \u5730\u5740\u3002",
    connectionUnexpected: "\u8FDE\u63A5\u610F\u5916\u4E2D\u65AD\uFF0C\u63D2\u4EF6\u5C06\u7EE7\u7EED\u81EA\u52A8\u91CD\u8BD5\u3002",
    hostSignInHint: "\u767B\u5F55\u540E\u5728\u6240\u9009 Server \u4E0A\u6388\u6743\u6B64 Host\u3002",
    checkingHost: "\u6B63\u5728\u68C0\u67E5 Host \u6CE8\u518C\u72B6\u6001\u2026",
    hostUnavailable: "Host \u4E0D\u53EF\u7528\uFF1A{error}",
    serverAccountEmail: "Server \u8D26\u53F7\u90AE\u7BB1",
    serverAccountPassword: "Server \u8D26\u53F7\u5BC6\u7801",
    signInRegisterHost: "\u767B\u5F55\u5E76\u6CE8\u518C Host",
    signingIn: "\u6B63\u5728\u767B\u5F55\u2026",
    loginWaitingAuthorization: "\u6B63\u5728\u7B49\u5F85\u6388\u6743\u7ED3\u679C",
    loginLoadingDevices: "\u767B\u5F55\u6210\u529F\uFF0C\u6B63\u5728\u52A0\u8F7D\u8BBE\u5907",
    loginLoadingSettings: "\u767B\u5F55\u6210\u529F\uFF0C\u6B63\u5728\u52A0\u8F7D\u8BBE\u7F6E",
    useRegistrationCode: "\u4F7F\u7528\u8FDE\u63A5\u7801",
    registering: "\u6B63\u5728\u6CE8\u518C\u2026",
    remoteEntry: "Remote",
    remoteTitle: "DS Harness Remote - \u8FDC\u7A0B\u5DE5\u4F5C\u53F0",
    remoteDescription: "\u9009\u62E9\u60F3\u8981\u8FDE\u63A5\u4E3B\u673A\u548C\u5DE5\u4F5C\u76EE\u5F55\u3002",
    starProject: "\u5F00\u6E90\u9879\u76EE\uFF0C\u6B22\u8FCEStar~",
    chooseHost: "\u4E3B\u673A",
    manageHosts: "\u7BA1\u7406\u8BBE\u5907",
    chooseDirectory: "\u5DE5\u4F5C\u76EE\u5F55",
    selectHostHint: "\u9009\u62E9\u4E00\u53F0\u5728\u7EBF\u4E3B\u673A\u4EE5\u6D4F\u89C8\u5176\u76EE\u5F55\u3002",
    emptyDirectory: "\u8FD9\u4E2A\u76EE\u5F55\u4E0B\u6CA1\u6709\u53EF\u89C1\u7684\u5B50\u76EE\u5F55\u3002",
    openWorkspace: "\u6253\u5F00\u5DE5\u4F5C\u533A",
    openingWorkspace: "\u6B63\u5728\u6253\u5F00\u2026",
    loadingDirectory: "\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026",
    remoteProgressCheckingHost: "\u6B63\u5728\u68C0\u67E5 Host",
    remoteProgressCheckingHostDetail: "\u6B63\u5728\u67E5\u627E\u6240\u9009\u8BBE\u5907\u5E76\u786E\u8BA4\u662F\u5426\u5728\u7EBF\u3002",
    remoteProgressAuthorizingPeer: "\u6B63\u5728\u9A8C\u8BC1\u6388\u6743",
    remoteProgressAuthorizingPeerDetail: "\u6B63\u5728\u786E\u8BA4\u8D26\u53F7\u6210\u5458\u5173\u7CFB\u548C\u5DF2\u56FA\u5B9A\u7684 Host \u8EAB\u4EFD\u3002",
    remoteProgressOpeningChannel: "\u6B63\u5728\u5EFA\u7ACB\u52A0\u5BC6\u901A\u9053",
    remoteProgressOpeningChannelDetail: "\u4F9D\u6B21\u5C1D\u8BD5\u5C40\u57DF\u7F51\u3001P2P\u3001TURN\uFF0C\u5FC5\u8981\u65F6\u56DE\u843D\u5230 Relay\u3002",
    remoteProgressProbeLan: "\u6B63\u5728\u63A2\u6D4B\u5C40\u57DF\u7F51",
    remoteProgressProbeLanDetail: "\u68C0\u67E5\u5F53\u524D\u8BBE\u5907\u662F\u5426\u80FD\u901A\u8FC7\u672C\u5730\u7F51\u7EDC\u76F4\u8FDE Host\u3002",
    remoteProgressProbeP2p: "\u6B63\u5728\u63A2\u6D4B P2P",
    remoteProgressProbeP2pDetail: "\u68C0\u67E5\u5F53\u524D\u8BBE\u5907\u548C Host \u4E4B\u95F4\u7684\u4E92\u8054\u7F51\u76F4\u8FDE\u5019\u9009\u8DEF\u5F84\u3002",
    remoteProgressProbeTurn: "\u6B63\u5728\u63A2\u6D4B TURN",
    remoteProgressProbeTurnDetail: "\u68C0\u67E5\u53D7\u9650\u7F51\u7EDC\u4E0B\u53EF\u7528\u7684 TURN \u4E2D\u7EE7\u8DEF\u5F84\u3002",
    remoteProgressProbeRelay: "\u6B63\u5728\u51C6\u5907 Relay",
    remoteProgressProbeRelayDetail: "\u5982\u679C\u76F4\u8FDE\u8DEF\u5F84\u672A\u6253\u5F00\uFF0C\u5C06\u56DE\u843D\u5230\u52A0\u5BC6\u7684 Server Relay\u3002",
    remoteProgressTryingPrefix: "\u6B63\u5728\u5C1D\u8BD5 ",
    remoteProgressUsingPrefix: "\u5DF2\u8FDE\u63A5 ",
    remoteProgressLoadingWorkspaces: "\u6B63\u5728\u52A0\u8F7D\u5DE5\u4F5C\u533A",
    remoteProgressLoadingWorkspacesDetail: "\u901A\u8FC7\u96A7\u9053\u8BFB\u53D6\u8FDC\u7AEF Harness \u5DE5\u4F5C\u533A\u5217\u8868\u3002",
    remoteProgressSwitchingWorkspace: "\u6B63\u5728\u5207\u6362\u754C\u9762",
    remoteProgressSwitchingWorkspaceDetail: "\u6B63\u5728\u628A\u8FDC\u7AEF\u5DE5\u4F5C\u533A\u4EA4\u7ED9\u672C\u5730 Harness UI\u3002",
    remoteProgressReady: "\u5DF2\u5C31\u7EEA",
    remoteProgressReadyDetail: "\u8FDC\u7AEF Host \u5DF2\u8FDE\u63A5\uFF0C\u7AEF\u5230\u7AEF\u52A0\u5BC6\u5DF2\u5EFA\u7ACB\u3002",
    backToHosts: "\u9009\u62E9\u5176\u4ED6\u4E3B\u673A",
    currentDirectory: "\u5DF2\u9009\u76EE\u5F55",
    directoryTruncated: "\u76EE\u5F55\u5185\u5BB9\u8F83\u591A\uFF0C\u76EE\u524D\u53EA\u663E\u793A\u4E86\u4E00\u90E8\u5206\u3002",
    pluginVersion: "\u63D2\u4EF6 {version}",
    harnessVersion: "Harness {version}",
    updateAvailable: "\u2B06 Remote {latest} \u53EF\u7528\uFF08\u5F53\u524D {current}\uFF09",
    updateShort: "\u2B06 {version}",
    updateAvailableShort: "{version} \u53EF\u7528",
    pluginUpdating: "\u6B63\u5728\u5347\u7EA7\u2026",
    pluginUpdateReload: "\u6B63\u5728\u5347\u7EA7\uFF0CRemote \u5373\u5C06\u91CD\u65B0\u52A0\u8F7D",
    pluginUpdateFailed: "\u5347\u7EA7\u5931\u8D25",
    pluginUpdateUnknown: "\u5347\u7EA7\u72B6\u6001\u672A\u77E5\uFF0C\u70B9\u51FB\u91CD\u8BD5",
    pluginUpdateManual: "\u53D1\u5E03\u9875",
    updateBadge: "\u6709\u53EF\u7528\u66F4\u65B0",
    updateAvailableTag: "\u2B06 \u53EF\u66F4\u65B0",
    existingWorkspaces: "DSH \u5DE5\u4F5C\u533A",
    remotePathPlaceholder: "/home/user/project",
    remotePathHint: "\u8F93\u5165\u6240\u9009\u4E3B\u673A\u4E0A\u7684\u7EDD\u5BF9\u76EE\u5F55\u8DEF\u5F84\u3002",
    noRemoteWorkspaces: "\u8FD9\u53F0\u4E3B\u673A\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u533A\uFF0C\u70B9\u51FB + \u6DFB\u52A0\u3002",
    activeRemote: "{name}",
    exitRemote: "\u9000\u51FA",
    addRemoteWorkspace: "\u6DFB\u52A0\u8FDC\u7A0B\u5DE5\u4F5C\u533A",
    addCodexWorkspace: "\u6DFB\u52A0 CodeX \u5DE5\u4F5C\u533A",
    addCursorWorkspace: "\u6DFB\u52A0 Cursor \u5DE5\u4F5C\u533A",
    addAntigravityWorkspace: "\u6DFB\u52A0 Antigravity \u5DE5\u4F5C\u533A",
    addPiWorkspace: "\u6DFB\u52A0 Pi \u5DE5\u4F5C\u533A",
    addOpencodeWorkspace: "\u6DFB\u52A0 OpenCode \u5DE5\u4F5C\u533A",
    addClaudeWorkspace: "\u6DFB\u52A0 Claude \u5DE5\u4F5C\u533A",
    addHermesWorkspace: "\u6DFB\u52A0 Hermes \u5DE5\u4F5C\u533A",
    noCodexWorkspaces: "\u8FD8\u6CA1\u6709 CodeX \u5DE5\u4F5C\u533A\u3002",
    noCursorWorkspaces: "\u8FD8\u6CA1\u6709 Cursor \u5DE5\u4F5C\u533A\u3002\u6DFB\u52A0\u9879\u76EE\u76EE\u5F55\u5373\u53EF\u5F00\u59CB\u3002",
    noAntigravityWorkspaces: "\u8FD8\u6CA1\u6709 Antigravity \u5DE5\u4F5C\u533A\u3002\u6DFB\u52A0\u9879\u76EE\u76EE\u5F55\u5373\u53EF\u5F00\u59CB\u3002",
    noPiWorkspaces: "\u8FD8\u6CA1\u6709 Pi \u5DE5\u4F5C\u533A\u3002\u6DFB\u52A0\u9879\u76EE\u76EE\u5F55\u5373\u53EF\u5F00\u59CB\u3002",
    noOpencodeWorkspaces: "\u8FD8\u6CA1\u6709 OpenCode \u5DE5\u4F5C\u533A\u3002\u6DFB\u52A0\u9879\u76EE\u76EE\u5F55\u5373\u53EF\u5F00\u59CB\u3002",
    noClaudeWorkspaces: "\u8FD8\u6CA1\u6709 Claude \u5DE5\u4F5C\u533A\u3002\u6DFB\u52A0\u9879\u76EE\u76EE\u5F55\u5373\u53EF\u5F00\u59CB\u3002",
    noHermesWorkspaces: "\u8FD8\u6CA1\u6709 Hermes \u5DE5\u4F5C\u533A\u3002\u6DFB\u52A0\u9879\u76EE\u76EE\u5F55\u5373\u53EF\u5F00\u59CB\u3002",
    cancelAddWorkspace: "\u53D6\u6D88",
    confirmAddWorkspace: "\u786E\u8BA4\u5E76\u6253\u5F00",
    showAllWorkspaces: "\u663E\u793A\u5168\u90E8 DSH \u5DE5\u4F5C\u533A",
    showAllCodexWorkspaces: "\u663E\u793A\u5168\u90E8 CodeX \u5DE5\u4F5C\u533A",
    showAllCursorWorkspaces: "\u663E\u793A\u5168\u90E8 Cursor \u5DE5\u4F5C\u533A",
    showAllAntigravityWorkspaces: "\u663E\u793A\u5168\u90E8 Antigravity \u5DE5\u4F5C\u533A",
    showAllPiWorkspaces: "\u663E\u793A\u5168\u90E8 Pi \u5DE5\u4F5C\u533A",
    showAllOpencodeWorkspaces: "\u663E\u793A\u5168\u90E8 OpenCode \u5DE5\u4F5C\u533A",
    showAllClaudeWorkspaces: "\u663E\u793A\u5168\u90E8 Claude \u5DE5\u4F5C\u533A",
    showAllHermesWorkspaces: "\u663E\u793A\u5168\u90E8 Hermes \u5DE5\u4F5C\u533A",
    remoteModeLabel: "\u8FDC\u7A0B\u6A21\u5F0F \xB7 {name}",
    remoteNetworkP2p: "P2P",
    remoteNetworkTurn: "TURN",
    remoteNetworkRelay: "\u4E2D\u7EE7",
    remoteNetworkLan: "\u5C40\u57DF\u7F51",
    remoteNetworkOffline: "\u5DF2\u65AD\u5F00",
    clientSignInAgain: "\u6388\u6743\u5DF2\u5931\u6548 \xB7 \u91CD\u65B0\u767B\u5F55",
    remoteLinkEncrypted: "\u7AEF\u5230\u7AEF\u52A0\u5BC6",
    connectionRouteTitle: "\u8FDE\u63A5\u7EBF\u8DEF",
    connectionRouteFrom: "\u8D77\u70B9",
    connectionRouteVia: "\u7ECF\u8FC7",
    connectionRouteTo: "\u7EC8\u70B9",
    connectionRouteCurrentDevice: "\u5F53\u524D\u8BBE\u5907",
    connectionRouteLan: "\u540C\u4E00\u5C40\u57DF\u7F51",
    connectionRouteP2p: "\u4E92\u8054\u7F51\u76F4\u8FDE",
    connectionRouteTurn: "TURN \u4E2D\u7EE7\u670D\u52A1",
    connectionRouteRelay: "Remote Server",
    connectionRouteHost: "\u8FD0\u884C Harness \u7684\u5DE5\u4F5C\u7535\u8111",
    connectionRouteLanDetail: "\u5728\u672C\u5730\u7F51\u7EDC\u4E2D\u76F4\u63A5\u4F20\u8F93",
    connectionRouteP2pDetail: "\u901A\u8FC7\u4E92\u8054\u7F51\u76F4\u63A5\u4F20\u8F93",
    connectionRouteTurnDetail: "\u901A\u8FC7 TURN \u670D\u52A1\u8F6C\u53D1\u52A0\u5BC6\u6570\u636E",
    connectionRouteRelayDetail: "\u901A\u8FC7 Remote Server \u8F6C\u53D1\u52A0\u5BC6\u6570\u636E",
    connectionRouteEncrypted: "\u7EBF\u8DEF\u4E0A\u7684\u4E1A\u52A1\u6570\u636E\u4FDD\u6301\u7AEF\u5230\u7AEF\u52A0\u5BC6\u3002",
    connectionDetailsConnection: "\u8FDE\u63A5",
    connectionDetailsWebRtc: "\u7F51\u7EDC\u8BE6\u60C5 \xB7 WebRTC / ICE",
    connectionId: "\u8FDE\u63A5\u7F16\u53F7",
    connectedAt: "\u5EFA\u7ACB\u65F6\u95F4",
    preferredTransports: "\u5C1D\u8BD5\u987A\u5E8F",
    controlChannel: "\u63A7\u5236\u901A\u9053",
    controlAddress: "\u63A7\u5236\u5730\u5740",
    serverUnavailableError: "\u670D\u52A1\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    connectionHoldCountdown: "\u8FDE\u63A5\u5269\u4F59 {seconds} \u79D2",
    serverUnavailableCountdown: "\u670D\u52A1\u4E0D\u53EF\u7528 \xB7 \u8FDE\u63A5\u5269\u4F59 {seconds} \u79D2",
    unavailable: "\u4E0D\u53EF\u7528",
    serverUnavailableShort: "\u670D\u52A1\u4E0D\u53EF\u7528",
    serverUnavailable: "Server \u6682\u4E0D\u53EF\u7528\uFF0C\u6B63\u5728\u91CD\u8FDE\u3002",
    serverUnavailableConnected: "Server \u6682\u4E0D\u53EF\u7528\uFF0C\u8BBE\u5907\u901A\u4FE1\u6B63\u5E38\uFF0C\u6B63\u5728\u91CD\u8FDE\u3002",
    serverLeaseExpiring: "\u8FDE\u63A5\u5C06\u5728 {seconds} \u79D2\u540E\u5931\u6548\u3002",
    serverRestored: "Server \u5DF2\u6062\u590D\u3002",
    serverLinkDisconnected: "\u8FDE\u63A5\u5DF2\u65AD\u5F00\u3002",
    controlStateConnecting: "\u8FDE\u63A5\u4E2D",
    controlStateOpen: "\u5DF2\u8FDE\u63A5",
    controlStateClosing: "\u6B63\u5728\u5173\u95ED",
    controlStateClosed: "\u5DF2\u5173\u95ED",
    peerState: "\u8FDE\u63A5\u72B6\u6001",
    dataChannel: "DataChannel",
    localCandidate: "\u672C\u5730\u5019\u9009",
    remoteCandidate: "\u8FDC\u7AEF\u5019\u9009",
    localAddress: "\u672C\u5730\u5730\u5740",
    remoteAddress: "\u8FDC\u7AEF\u5730\u5740",
    networkProtocol: "\u4F20\u8F93\u534F\u8BAE",
    relayProtocol: "TURN \u534F\u8BAE",
    roundTripTime: "\u5F80\u8FD4\u65F6\u5EF6",
    availableBitrate: "\u53EF\u7528\u4E0A\u884C\u5E26\u5BBD",
    bytesSent: "WebRTC \u5DF2\u53D1\u9001",
    bytesReceived: "WebRTC \u5DF2\u63A5\u6536",
    notProvided: "\u672A\u63D0\u4F9B",
    candidateHost: "\u672C\u5730\u5730\u5740 \xB7 host",
    candidateSrflx: "\u516C\u7F51\u5730\u5740 \xB7 srflx",
    candidatePrflx: "\u5BF9\u7AEF\u5730\u5740 \xB7 prflx",
    candidateRelay: "TURN \u5730\u5740 \xB7 relay",
    openLocalWorkspaces: "\u6253\u5F00\u672C\u5730\u5DE5\u4F5C\u533A",
    clientSignInHint: "\u767B\u5F55 Server \u540E\u5373\u53EF\u67E5\u770B\u81EA\u5DF1\u7684\u8FDC\u7AEF\u4E3B\u673A\u3002",
    signInClient: "DS Harness Remote\uFF1A",
    signInClientDescription: "\u4E00\u6B21\u8FDE\u63A5\uFF0C\u968F\u65F6\u53EF\u7528\u3002",
    startSignIn: "\u5F00\u59CB\u767B\u5F55",
    allowControlCurrentDevice: "\u5141\u8BB8\u63A7\u5236\u672C\u673A",
    allowControlDevice: "\u5141\u8BB8\u63A7\u5236\u672C\u673A",
    connectedClientCount: "{count} \u53F0\u5DF2\u8FDE\u63A5",
    checkAcp: "\u68C0\u6D4B\u540E\u7AEF",
    checkingAcp: "\u6B63\u5728\u68C0\u6D4B ACP\u2026",
    acpAvailable: "ACP \u53EF\u7528",
    acpUnavailable: "ACP \u4E0D\u53EF\u7528",
    agentBackends: "\u66F4\u591A Coding Agent",
    acpDocumentation: "\u8BE6\u7EC6\u8BF7\u67E5\u9605\u3002",
    acpHint: "\u901A\u8FC7 ACP \u7EDF\u4E00\u63A5\u5165\uFF0C",
    acpCheckPassed: "\u68C0\u6D4B\u901A\u8FC7",
    acpCheckFailed: "\u68C0\u6D4B\u5931\u8D25",
    installOrConfigureAcp: "\u4E00\u952E\u914D\u7F6E/\u5B89\u88C5",
    configureAcp: "\u81EA\u52A8\u626B\u63CF\u914D\u7F6E",
    installAcp: "\u4E00\u952E\u5B89\u88C5\u914D\u7F6E",
    installingAcp: "\u6B63\u5728\u914D\u7F6E\u2026",
    acpConfiguredNotice: "\u5DF2\u81EA\u52A8\u5B9A\u4F4D\u5E76\u542F\u7528 ACP \u540E\u7AEF\u3002",
    acpInstalledNotice: "\u5DF2\u5B8C\u6210\u9759\u9ED8\u5B89\u88C5\u5E76\u81EA\u52A8\u542F\u7528\u3002",
    acpDownloadRequired: "\u8BF7\u5148\u4E0B\u8F7D\u5B89\u88C5 {backend}\uFF1A{url}",
    addAcp: "\u6DFB\u52A0 ACP",
    acpName: "\u670D\u52A1\u540D\u79F0",
    acpCommand: "\u542F\u52A8\u547D\u4EE4",
    acpArguments: "\u547D\u4EE4\u53C2\u6570",
    removeAcp: "\u79FB\u9664",
    currentConnectedDevices: "\u5F53\u524D\u8FDE\u63A5\u7684\u8BBE\u5907",
    noConnectedClients: "\u76EE\u524D\u6CA1\u6709\u8BBE\u5907\u8FDE\u63A5\u5230\u8FD9\u53F0\u4E3B\u673A\u3002",
    unknownDevice: "\u672A\u77E5\u8BBE\u5907",
    exitRemoteAccount: "\u9000\u51FA\u8D26\u53F7",
    githubLogin: "Github",
    providerLogin: "{provider}",
    scanWithProvider: "\u4F7F\u7528 {provider} \u626B\u7801\u767B\u5F55",
    loadingLoginProviders: "\u6B63\u5728\u83B7\u53D6\u767B\u5F55\u65B9\u5F0F\u2026",
    retryLoginProviders: "\u91CD\u65B0\u83B7\u53D6\u767B\u5F55\u65B9\u5F0F",
    serverApplied: "Server \u5730\u5740\u5DF2\u751F\u6548\u3002",
    noLoginProviders: "\u6682\u65E0\u53EF\u7528\u7684\u626B\u7801\u767B\u5F55\u65B9\u5F0F\uFF0C\u8BF7\u4F7F\u7528\u90AE\u7BB1\u548C\u5BC6\u7801\u3002",
    zhihuLogin: "\u77E5\u4E4E",
    scanWithGitHub: "\u4F7F\u7528 GitHub \u626B\u7801\u767B\u5F55",
    scanWithZhihu: "\u4F7F\u7528\u77E5\u4E4E\u626B\u7801\u767B\u5F55",
    openInBrowser: "\u5728\u6D4F\u89C8\u5668\u4E2D\u7EE7\u7EED",
    scanLoginHint: "\u8BF7\u5728\u624B\u673A\u4E0A\u5B8C\u6210\u6388\u6743\uFF0C\u6B64\u7A97\u53E3\u4F1A\u81EA\u52A8\u7EE7\u7EED\u3002",
    currentServiceAddress: "\u6388\u6743\u670D\u52A1\u57DF\u540D\uFF1A",
    editServiceAddress: "\u4FEE\u6539\u670D\u52A1\u5730\u5740",
    restoreDefaultServiceAddress: "\u6062\u590D\u9ED8\u8BA4",
    cancelServiceAddressEdit: "\u53D6\u6D88",
    accountPasswordLogin: "\u8D26\u53F7\u5BC6\u7801",
    qrLoginExpired: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
    refreshQrCode: "\u5237\u65B0\u4E8C\u7EF4\u7801",
    codexVirtualWorkspace: "CodeX \u5DE5\u4F5C\u533A",
    cursorVirtualWorkspace: "Cursor \u5DE5\u4F5C\u533A",
    antigravityVirtualWorkspace: "Antigravity \u5DE5\u4F5C\u533A",
    piVirtualWorkspace: "Pi \u5DE5\u4F5C\u533A",
    opencodeVirtualWorkspace: "OpenCode \u5DE5\u4F5C\u533A",
    claudeVirtualWorkspace: "Claude \u5DE5\u4F5C\u533A",
    hermesVirtualWorkspace: "Hermes \u5DE5\u4F5C\u533A",
    codexVirtualSessions: "Sessions"
  }, ru = {
    serverSavedLive: "\u0410\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D.",
    saveServerBeforeLogin: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430, \u043F\u0440\u0435\u0436\u0434\u0435 \u0447\u0435\u043C \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0432\u0445\u043E\u0434 \u0438\u043B\u0438 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435.",
    pairingLoginTab: "DSH Go",
    pairingTitle: "\u0421\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u0441 DSH Go",
    pairingHint: `\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 \u043A\u043E\u0434 \u0432 DSH Go \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435.
\u0417\u0430\u0442\u0435\u043C \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u0441 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430 \u043D\u0430 \u044D\u0442\u043E\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0443.`,
    pairingHostOnly: "\u041D\u043E\u0432\u044B\u0435 \u0445\u043E\u0441\u0442\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u044E\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F. \u0421\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u0434\u0430\u0451\u0442 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0434\u0440\u0443\u0433\u0438\u043C\u0438 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430\u043C\u0438.",
    pairingSaveServer: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0435\u0440\u0435\u0434 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435\u043C.",
    pairingScan: "\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 \u044D\u0442\u043E\u0442 QR-\u043A\u043E\u0434 \u0432 DSH Go \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435.",
    pairingEnter: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0442\u0435\u043B\u0435\u0444\u043E\u043D, \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0432\u0448\u0438\u0439 \u0437\u0430\u043F\u0440\u043E\u0441, \u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0435\u0433\u043E \u043A\u043E\u0434.",
    pairingComplete: "\u0421\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E. \u0422\u0435\u043F\u0435\u0440\u044C DSH Go \u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u044C\u0441\u044F \u043A \u044D\u0442\u043E\u043C\u0443 \u0445\u043E\u0441\u0442\u0443.",
    pairingPending: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443, \u043D\u0435 \u043C\u0435\u043D\u044F\u044F \u043A\u043E\u0434.",
    pairingClosed: "\u0421\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E. \u0427\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E, \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 QR-\u043A\u043E\u0434.",
    pairingQr: "\u041E\u0434\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u044B\u0439 QR-\u043A\u043E\u0434 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F DSH Go",
    pairingExpires: "\u0418\u0441\u0442\u0435\u043A\u0430\u0435\u0442 \u0447\u0435\u0440\u0435\u0437 {time}",
    pairingExpired: "\u0421\u0440\u043E\u043A \u0438\u0441\u0442\u0451\u043A",
    pairingCode: "8-\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u043A\u043E\u0434 \u0441 \u044D\u043A\u0440\u0430\u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430",
    pairingWarning: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u0434 \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0434\u0438\u043D \u0440\u0430\u0437. \u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434 \u0430\u043D\u043D\u0443\u043B\u0438\u0440\u0443\u0435\u0442 \u044D\u0442\u043E\u0442 QR-\u043A\u043E\u0434 \u2014 \u043E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439.",
    pairingConfirm: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0443",
    pairingRetry: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443",
    pairingCancel: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435",
    pairingStart: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C QR-\u043A\u043E\u0434 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F",
    pairingBusy: "\u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435\u2026",
    pairingUnsupported: "\u042D\u0442\u043E\u0442 \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432.",
    pairingError: `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.
\u0415\u0441\u043B\u0438 \u043A\u043E\u0434 \u0443\u0436\u0435 \u0431\u044B\u043B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443, \u043D\u0435 \u043C\u0435\u043D\u044F\u044F \u0435\u0433\u043E.`,
    remoteTools: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u044C Remote Tools",
    remoteToolsHint: "\u0414\u0435\u043B\u0430\u0435\u0442 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B remote_* \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u043C\u0438 \u0432 \u0441\u0435\u0441\u0441\u0438\u044F\u0445. \u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E; \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u0435, \u0435\u0441\u043B\u0438 \u043E\u043D\u0438 \u043D\u0435 \u043D\u0443\u0436\u043D\u044B. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0445\u043E\u0441\u0442\u0430.",
    remoteToolsSaved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 Remote Tools \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430.",
    debugLogging: "\u041E\u0442\u043B\u0430\u0434\u043E\u0447\u043D\u044B\u0439 \u0436\u0443\u0440\u043D\u0430\u043B",
    debugLoggingHint: "\u0417\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0443\u044E \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0443 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0432 \u0436\u0443\u0440\u043D\u0430\u043B \u0445\u043E\u0441\u0442\u0430 (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0443\u0440\u043E\u0432\u043D\u0438 Info \u0438 \u0432\u044B\u0448\u0435). \u041F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0441\u0440\u0430\u0437\u0443; \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043F\u043E\u0441\u043B\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0438.",
    debugLoggingLevelDebug: "Debug",
    debugLoggingLevelInfo: "Info",
    debugLogsToggleOpen: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0436\u0443\u0440\u043D\u0430\u043B",
    debugLogsToggleClose: "\u0421\u043A\u0440\u044B\u0442\u044C \u0436\u0443\u0440\u043D\u0430\u043B",
    debugLogsFilterAll: "\u0412\u0441\u0435",
    debugLogsFilterWarn: "\u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F \u0438 \u043E\u0448\u0438\u0431\u043A\u0438",
    debugLogsRefresh: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    debugLogsRefreshing: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u2026",
    debugLogsCopy: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    debugLogsCopied: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
    debugLogsCopyFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    debugLogsExport: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442",
    debugLogsClear: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C",
    debugLogsLoading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0436\u0443\u0440\u043D\u0430\u043B\u0430\u2026",
    debugLogsEmpty: "\u041F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
    debugLogsFileLabel: "\u0424\u0430\u0439\u043B \u0436\u0443\u0440\u043D\u0430\u043B\u0430:",
    debugLogsFileFallback: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 ({error})",
    debugLogsCount: "\u0417\u0430\u043F\u0438\u0441\u0435\u0439: {count}",
    terminalRemote: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B",
    terminalRemoteHint: "\u0420\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442 \u0434\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430\u043C Remote \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u043E\u0431\u043E\u043B\u043E\u0447\u043A\u0443 \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430. \u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E; \u043D\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0439 \u0430\u0433\u0435\u043D\u0442\u0430. \u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0441\u0440\u0430\u0437\u0443.",
    terminalRemoteUnavailable: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \xAB\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\xBB \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 Remote \u043D\u0430 \u0445\u043E\u0441\u0442\u0435; \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0442\u0435\u043B\u044C \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0441\u0440\u0430\u0437\u0443.",
    terminalSaved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0430.",
    sidebarEntry: "\u041A\u043D\u043E\u043F\u043A\u0430 \u043D\u0430 \u0431\u043E\u043A\u043E\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438",
    sidebarEntryHint: "\xAB\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439\xBB \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043A\u043D\u043E\u043F\u043A\u0443 Remote \u0432\u043D\u0438\u0437\u0443 \u0431\u043E\u043A\u043E\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438. \xAB\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439\xBB \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u0435\u0451 \u0432 \u0441\u0442\u0440\u043E\u043A\u0443 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u2014 \u0437\u043D\u0430\u0447\u043E\u043A, \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u043C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0438 \u2014 \u0438\u043C\u044F \u0445\u043E\u0441\u0442\u0430 \u0438 \xAB\u0412\u044B\u0439\u0442\u0438\xBB. \u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0441\u0440\u0430\u0437\u0443.",
    sidebarEntryStandard: "\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439",
    sidebarEntryCompact: "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439",
    sidebarEntrySaved: "\u0412\u0438\u0434 \u043A\u043D\u043E\u043F\u043A\u0438 \u043D\u0430 \u0431\u043E\u043A\u043E\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D.",
    previewOpen: "\u0421\u0435\u0440\u0432\u0438\u0441 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430",
    previewPort: "\u041F\u043E\u0440\u0442 \u0445\u043E\u0441\u0442\u0430",
    previewLocalOnly: "\u0414\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u043D\u0443\u0436\u0435\u043D Desktop \u0438\u043B\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440, \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u0439 \u043A Harness \u043D\u0430 \u044D\u0442\u043E\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435.",
    hostReferenceName: "\u0418\u043C\u044F",
    hostReferenceSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    hostReferenceDeviceId: "ID \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    hostReferenceInvocation: "\u0412\u044B\u0437\u043E\u0432",
    settings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    pluginTitle: "DeepSeek Remote",
    pluginDescription: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F \u043A DeepSeek Harness, CodeX, Claude Code, Pi \u0438 \u0434\u0440\u0443\u0433\u0438\u043C \u0440\u0430\u0431\u043E\u0447\u0438\u043C \u043E\u0431\u043B\u0430\u0441\u0442\u044F\u043C \u0438\u0437 \u0432\u0435\u0431- \u0438 \u043C\u043E\u0431\u0438\u043B\u044C\u043D\u044B\u0445 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u0447\u0435\u0440\u0435\u0437 P2P \u0441\u043E \u0441\u043A\u0432\u043E\u0437\u043D\u044B\u043C \u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0438\u0435\u043C.",
    openPluginSettings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 Remote",
    expandSettings: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: {name}",
    collapseSettings: "\u0421\u043A\u0440\u044B\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: {name}",
    unsaved: "\u041D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E",
    associated: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E",
    authorizationComplete: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430",
    loadingSettings: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A DeepSeek Remote\u2026",
    mode: "\u0420\u0435\u0436\u0438\u043C",
    pluginMode: "\u0420\u0435\u0436\u0438\u043C \u043F\u043B\u0430\u0433\u0438\u043D\u0430",
    host: "\u0425\u043E\u0441\u0442",
    client: "\u041A\u043B\u0438\u0435\u043D\u0442",
    authorization: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F",
    account: "\u0410\u043A\u043A\u0430\u0443\u043D\u0442",
    hostRegistrationCode: "\u041E\u0434\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u044B\u0439 \u043A\u043E\u0434 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    ownedDeviceAuthorization: "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E",
    authorizedOn: "{role}: \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0430 {serverUrl} \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430.",
    readOnly: "\u042D\u0442\u043E\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u044C DSH \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A.",
    discard: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
    saving: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u2026",
    signOut: "\u0412\u044B\u0439\u0442\u0438",
    signingOut: "\u0412\u044B\u0445\u043E\u0434\u2026",
    hostName: "\u0418\u043C\u044F \u0445\u043E\u0441\u0442\u0430",
    deviceId: "ID \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    serverUrl: "URL \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    serverUrlHint: "HTTPS-\u0430\u0434\u0440\u0435\u0441 \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0438 \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0438\u0438.",
    serverSaved: "\u0410\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 DSH, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0435\u0433\u043E.",
    codexRemote: "Codex Remote",
    codexRemoteHint: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043A \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u043C CodeX \u043D\u0430 \u044D\u0442\u043E\u043C \u0445\u043E\u0441\u0442\u0435.",
    codexSaved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 Codex Remote \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 DSH, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0435\u0451.",
    cursorRemote: "\u0410\u0434\u0430\u043F\u0442\u0435\u0440 Cursor ACP (\u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u043E)",
    cursorRemoteHint: "\u0412\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0431\u044D\u043A\u0435\u043D\u0434 Cursor `agent acp` \u0434\u043B\u044F \u0448\u043B\u044E\u0437\u0430 Agent ACP. \u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 `agent login`. \u041F\u043E\u0441\u043B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 DSH.",
    cursorSaved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u0430\u0434\u0430\u043F\u0442\u0435\u0440\u0430 Cursor ACP \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 DSH, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0435\u0451.",
    authorizeFromRemote: "\u0412\u043E\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u044D\u0442\u0438\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u044C\u0441\u044F \u043A \u0441\u0432\u043E\u0438\u043C \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u043C \u0445\u043E\u0441\u0442\u0430\u043C.",
    signInAccount: "\u0412\u043E\u0439\u0442\u0438",
    saveServerBeforeSignIn: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0435\u0440\u0435\u0434 \u0432\u0445\u043E\u0434\u043E\u043C.",
    authorizationMethod: "\u0421\u043F\u043E\u0441\u043E\u0431 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
    accountPassword: "\u041F\u0430\u0440\u043E\u043B\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430",
    registrationCode: "\u041A\u043E\u0434 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    registrationCodeHint: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0435\u0433\u043E \u043F\u043E\u0441\u043B\u0435 \u0432\u0445\u043E\u0434\u0430 \u043D\u0430 \u0441\u0430\u0439\u0442\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u0430. \u041A\u043E\u0434 \u043E\u0434\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u044B\u0439 \u0438 \u0441\u043B\u0443\u0436\u0438\u0442 \u0434\u043B\u044F \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u044D\u0442\u043E\u0433\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430.",
    accountHint: "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0430\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0443.",
    password: "\u041F\u0430\u0440\u043E\u043B\u044C",
    passwordHint: "\u0422\u043E\u043B\u044C\u043A\u043E \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u044B DSH Remote Web \u0438\u043B\u0438 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0438\u0441\u0430; \u043D\u0435 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u044B DeepSeek Harness.",
    modeSavedNeedsAuthorization: "\u0420\u0435\u0436\u0438\u043C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D. \u041F\u0435\u0440\u0435\u0434 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\u043C \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044E ({role}). \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B.",
    modeSavedReused: "\u0420\u0435\u0436\u0438\u043C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0430 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0430\u044F \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 Harness, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C.",
    modeSavedOwnedRole: "\u0420\u0435\u0436\u0438\u043C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D. \u042D\u0442\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 Harness, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C.",
    enterRegistrationCode: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430.",
    enterAccountPassword: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u0438 \u043F\u0430\u0440\u043E\u043B\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    associationSaved: "\u041F\u0440\u0438\u0432\u044F\u0437\u043A\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 Harness, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C.",
    signedOut: "\u0412\u044B \u0432\u044B\u0448\u043B\u0438 \u0438\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u043B\u0438\u0441\u044C \u043E\u0442 Remote.",
    remoteRequestFailed: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0440\u0435\u0436\u0438\u043C\u0430.",
    remoteControlUnavailable: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u043C Remote \u0435\u0449\u0451 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F. \u0415\u0441\u043B\u0438 \u043E\u043D\u043E \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u043C, \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 DSH.",
    identityCorrupted: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C Remote \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0430. \u0427\u0442\u043E\u0431\u044B \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0443, \u0441\u0431\u0440\u043E\u0441\u044C\u0442\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445.",
    credentialsCorrupted: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0443\u0447\u0451\u0442\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 Remote \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u044B. \u0427\u0442\u043E\u0431\u044B \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0443, \u0432\u044B\u0439\u0434\u0438\u0442\u0435 \u0438\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0438\u043B\u0438 \u0441\u0431\u0440\u043E\u0441\u044C\u0442\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445.",
    identityLocked: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C Remote \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0434\u0440\u0443\u0433\u0438\u043C \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u043E\u043C. \u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u0438\u0435 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u044B DSH \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
    storageConflict: "\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0443\u044E\u0449\u0435\u0435 \u0438\u043B\u0438 \u043D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0435\u0435 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 Remote. \u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0432\u0441\u0435 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u044B DSH \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0435\u0433\u043E \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
    storageConflictEntry: "\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0443\u044E\u0449\u0435\u0435 \u0438\u043B\u0438 \u043D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0435\u0435 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 Remote: \u043D\u0430\u0439\u0434\u0435\u043D \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \xAB{name}\xBB. \u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0432\u0441\u0435 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u044B DSH \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0435\u0433\u043E \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
    retryStartup: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0437\u0430\u043F\u0443\u0441\u043A Remote",
    retryStartupSuccess: "Remote \u0437\u0430\u043F\u0443\u0449\u0435\u043D.",
    resetIdentity: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C Remote",
    resetIdentityHint: "\u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u0437\u0430\u043D\u043E\u0432\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0430\u0440\u044B \u043A\u043B\u044E\u0447\u0435\u0439 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430, \u0435\u0441\u043B\u0438 \u043E\u043D\u0438 \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u044B. \u041F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u043E\u0439\u0442\u0438 \u0441\u043D\u043E\u0432\u0430.",
    resetIdentityConfirm: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C Remote? \u041F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u043E\u0439\u0442\u0438 \u0441\u043D\u043E\u0432\u0430.",
    resetIdentitySuccess: "\u0418\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C Remote \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u0430.",
    resettingAction: "\u0421\u0431\u0440\u043E\u0441\u2026",
    remoteStartupFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043F\u043B\u0430\u0433\u0438\u043D Remote.",
    switchTarget: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0446\u0435\u043B\u044C Harness: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F / \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u0430\u044F",
    harnessTarget: "\u0426\u0435\u043B\u044C Harness",
    close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    refreshRemote: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0435 \u0445\u043E\u0441\u0442\u044B",
    refreshRemoteShort: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    local: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u043E",
    remoteTarget: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u043E \xB7 {name}",
    remoteHostMention: "Remote \xB7 {platform}",
    thisMachineLocal: "\u042D\u0442\u043E\u0442 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440 (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E)",
    currentDevice: "\u0422\u0435\u043A\u0443\u0449\u0435\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E",
    noRemoteHosts: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0445 \u0445\u043E\u0441\u0442\u043E\u0432.",
    online: "\u0412 \u0441\u0435\u0442\u0438",
    offline: "\u041D\u0435 \u0432 \u0441\u0435\u0442\u0438",
    thisMachineHost: "\u042D\u0442\u043E\u0442 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440 \u043A\u0430\u043A \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0445\u043E\u0441\u0442",
    connected: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    connectedAs: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043A\u0430\u043A {account}",
    connection: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
    checkingConnection: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F\u2026",
    connecting: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
    reconnecting: "\u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
    lastActive: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C: {time}",
    neverConnected: "\u0423\u0441\u043F\u0435\u0448\u043D\u044B\u0445 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439 \u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E.",
    reconnect: "\u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F",
    reconnectingAction: "\u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\u2026",
    reconnectStarted: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043E \u043F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.",
    connectionAuthorizationExpired: "\u0421\u0440\u043E\u043A \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0438\u0441\u0442\u0451\u043A. \u0412\u044B\u0439\u0434\u0438\u0442\u0435 \u0438 \u0441\u043D\u043E\u0432\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u044D\u0442\u043E\u0442 \u0445\u043E\u0441\u0442.",
    connectionReplaced: "\u0418\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u044D\u0442\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0434\u0440\u0443\u0433\u043E\u0439 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440. \u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0435\u0433\u043E \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 DSH_HOME, \u043F\u0440\u0435\u0436\u0434\u0435 \u0447\u0435\u043C \u043F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u044C\u0441\u044F.",
    connectionCredentialsBusy: "\u0423\u0447\u0451\u0442\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u044E\u0442\u0441\u044F. \u0425\u043E\u0441\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442 \u043F\u043E\u043F\u044B\u0442\u043A\u0443. \u0423\u0434\u0430\u043B\u044F\u0439\u0442\u0435 \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0443\u044E \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0443 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0432\u0441\u0435\u0445 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u043E\u0432.",
    connectionDeviceRevoked: "\u0414\u043E\u0441\u0442\u0443\u043F \u044D\u0442\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430 \u043E\u0442\u043E\u0437\u0432\u0430\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0412\u044B\u0439\u0434\u0438\u0442\u0435 \u0438 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u0435\u0433\u043E \u0441\u043D\u043E\u0432\u0430.",
    connectionOwnershipRequired: "\u0421\u0435\u0440\u0432\u0435\u0440 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u0435\u0442 \u044D\u0442\u043E\u0442 \u0445\u043E\u0441\u0442 \u0432\u0430\u0448\u0438\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C.",
    connectionRateLimited: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u0441\u044F.",
    connectionVersionMismatch: "\u0412\u0435\u0440\u0441\u0438\u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043D\u0435\u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u044B.",
    connectionInvalidResponse: "\u0421\u0435\u0440\u0432\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u043D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0435 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0435\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435.",
    connectionReachability: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0435\u0442\u044C \u0438 \u0430\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    connectionUnexpected: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u043E \u043F\u0440\u0435\u0440\u0432\u0430\u043B\u043E\u0441\u044C. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u0441\u044F.",
    hostSignInHint: "\u0412\u043E\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u0442\u044C \u044D\u0442\u043E\u0442 \u0445\u043E\u0441\u0442 \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u0441\u0435\u0440\u0432\u0435\u0440\u0435.",
    checkingHost: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u0445\u043E\u0441\u0442\u0430\u2026",
    hostUnavailable: "\u0425\u043E\u0441\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: {error}",
    serverAccountEmail: "Email \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    serverAccountPassword: "\u041F\u0430\u0440\u043E\u043B\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    signInRegisterHost: "\u0412\u043E\u0439\u0442\u0438 \u0438 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0445\u043E\u0441\u0442",
    signingIn: "\u0412\u0445\u043E\u0434\u2026",
    loginWaitingAuthorization: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
    loginLoadingDevices: "\u0412\u0445\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D. \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432",
    loginLoadingSettings: "\u0412\u0445\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D. \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A",
    useRegistrationCode: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u0434 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
    registering: "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F\u2026",
    remoteEntry: "Remote",
    remoteTitle: "DS Harness Remote \u2014 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C",
    remoteDescription: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0434\u0438\u043D \u0438\u0437 \u0441\u0432\u043E\u0438\u0445 \u0445\u043E\u0441\u0442\u043E\u0432, \u0437\u0430\u0442\u0435\u043C \u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433. \u0418\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 Harness \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043D\u0430 \u044D\u0442\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.",
    starProject: "\u041F\u0440\u043E\u0435\u043A\u0442 \u0441 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u043C \u043A\u043E\u0434\u043E\u043C \u2014 \u0431\u0443\u0434\u0435\u043C \u0440\u0430\u0434\u044B \u0437\u0432\u0451\u0437\u0434\u0430\u043C~",
    chooseHost: "\u0425\u043E\u0441\u0442",
    manageHosts: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0445\u043E\u0441\u0442\u0430\u043C\u0438",
    chooseDirectory: "\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433",
    selectHostHint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0441\u0442 \u0432 \u0441\u0435\u0442\u0438, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0435\u0433\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0438.",
    emptyDirectory: "\u0412 \u044D\u0442\u043E\u043C \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 \u043D\u0435\u0442 \u0432\u0438\u0434\u0438\u043C\u044B\u0445 \u043F\u043E\u0434\u043A\u0430\u0442\u0430\u043B\u043E\u0433\u043E\u0432.",
    openWorkspace: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C",
    openingWorkspace: "\u041E\u0442\u043A\u0440\u044B\u0442\u0438\u0435\u2026",
    loadingDirectory: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u043E\u0432\u2026",
    remoteProgressCheckingHost: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0445\u043E\u0441\u0442\u0430",
    remoteProgressCheckingHostDetail: "\u041F\u043E\u0438\u0441\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430, \u0432 \u0441\u0435\u0442\u0438 \u043B\u0438 \u043E\u043D\u043E.",
    remoteProgressAuthorizingPeer: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
    remoteProgressAuthorizingPeerDetail: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u043D\u043E\u0441\u0442\u0438 \u043A \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0443 \u0438 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u043E\u0439 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u0438 \u0445\u043E\u0441\u0442\u0430.",
    remoteProgressOpeningChannel: "\u041E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u043A\u0430\u043D\u0430\u043B\u0430",
    remoteProgressOpeningChannelDetail: "\u041F\u043E\u043F\u044B\u0442\u043A\u0438 \u043F\u043E \u043E\u0447\u0435\u0440\u0435\u0434\u0438: LAN, P2P, TURN, \u043F\u0440\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 Relay.",
    remoteProgressProbeLan: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 LAN",
    remoteProgressProbeLanDetail: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u0438 \u0445\u043E\u0441\u0442\u0430 \u0432 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0435\u0442\u0438.",
    remoteProgressProbeP2p: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 P2P",
    remoteProgressProbeP2pDetail: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u043E\u0432 \u043F\u0440\u044F\u043C\u043E\u0433\u043E \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442-\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F \u043C\u0435\u0436\u0434\u0443 \u044D\u0442\u0438\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C \u0438 \u0445\u043E\u0441\u0442\u043E\u043C.",
    remoteProgressProbeTurn: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 TURN",
    remoteProgressProbeTurnDetail: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0438\u0438 \u0447\u0435\u0440\u0435\u0437 TURN \u0434\u043B\u044F \u0441\u0435\u0442\u0435\u0439 \u0441 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F\u043C\u0438.",
    remoteProgressProbeRelay: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 Relay",
    remoteProgressProbeRelayDetail: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0437\u0430\u043F\u0430\u0441\u043D\u043E\u0433\u043E \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E Relay \u0447\u0435\u0440\u0435\u0437 \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0430 \u0441\u043B\u0443\u0447\u0430\u0439, \u0435\u0441\u043B\u0438 \u043F\u0440\u044F\u043C\u044B\u0435 \u043F\u0443\u0442\u0438 \u043D\u0435 \u043E\u0442\u043A\u0440\u043E\u044E\u0442\u0441\u044F.",
    remoteProgressTryingPrefix: "\u041F\u043E\u043F\u044B\u0442\u043A\u0430: ",
    remoteProgressUsingPrefix: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F: ",
    remoteProgressLoadingWorkspaces: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439",
    remoteProgressLoadingWorkspacesDetail: "\u0427\u0442\u0435\u043D\u0438\u0435 \u0441\u043F\u0438\u0441\u043A\u0430 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E Harness \u0447\u0435\u0440\u0435\u0437 \u0442\u0443\u043D\u043D\u0435\u043B\u044C.",
    remoteProgressSwitchingWorkspace: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430",
    remoteProgressSwitchingWorkspaceDetail: "\u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u0432 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 Harness.",
    remoteProgressReady: "\u0413\u043E\u0442\u043E\u0432\u043E",
    remoteProgressReadyDetail: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0445\u043E\u0441\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D, \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043E.",
    backToHosts: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0439 \u0445\u043E\u0441\u0442",
    currentDirectory: "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433",
    directoryTruncated: "\u0423\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0430\u0441\u0442\u044C \u044D\u0442\u043E\u0433\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430.",
    pluginVersion: "\u041F\u043B\u0430\u0433\u0438\u043D {version}",
    harnessVersion: "Harness {version}",
    updateAvailable: "\u2B06 \u0414\u043E\u0441\u0442\u0443\u043F\u0435\u043D Remote {latest} (\u0442\u0435\u043A\u0443\u0449\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F {current})",
    updateShort: "\u2B06 {version}",
    updateAvailableShort: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0432\u0435\u0440\u0441\u0438\u044F {version}",
    pluginUpdating: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u2026",
    pluginUpdateReload: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435, Remote \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0441\u044F",
    pluginUpdateFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    pluginUpdateUnknown: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D, \u043D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C",
    pluginUpdateManual: "\u0420\u0435\u043B\u0438\u0437\u044B",
    updateBadge: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435",
    updateAvailableTag: "\u2B06 \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435",
    existingWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 DSH",
    remotePathPlaceholder: "/home/user/project",
    remotePathHint: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0430\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0443 \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u0445\u043E\u0441\u0442\u0435.",
    noRemoteWorkspaces: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0445 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 +, \u0447\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C.",
    activeRemote: "{name}",
    exitRemote: "\u0412\u044B\u0439\u0442\u0438",
    addRemoteWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u0443\u044E \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C",
    addCodexWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C CodeX",
    addCursorWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C Cursor",
    addAntigravityWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C Antigravity",
    addPiWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C Pi",
    addOpencodeWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C OpenCode",
    addClaudeWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C Claude",
    addHermesWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C Hermes",
    noCodexWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 CodeX \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
    noCursorWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 Cursor \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
    noAntigravityWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 Antigravity \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
    noPiWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 Pi \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
    noOpencodeWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 OpenCode \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
    noClaudeWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 Claude \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
    noHermesWorkspaces: "\u0420\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 Hermes \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
    cancelAddWorkspace: "\u041E\u0442\u043C\u0435\u043D\u0430",
    confirmAddWorkspace: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C",
    showAllWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 DSH",
    showAllCodexWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 CodeX",
    showAllCursorWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 Cursor",
    showAllAntigravityWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 Antigravity",
    showAllPiWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 Pi",
    showAllOpencodeWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 OpenCode",
    showAllClaudeWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 Claude",
    showAllHermesWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 Hermes",
    remoteModeLabel: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C \xB7 {name}",
    remoteNetworkP2p: "P2P",
    remoteNetworkTurn: "TURN",
    remoteNetworkRelay: "Relay",
    remoteNetworkLan: "LAN",
    remoteNetworkOffline: "\u041E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    clientSignInAgain: "\u0421\u0440\u043E\u043A \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0438\u0441\u0442\u0451\u043A \xB7 \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430",
    remoteLinkEncrypted: "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0435 \u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    connectionRouteTitle: "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
    connectionRouteFrom: "\u041E\u0442\u043A\u0443\u0434\u0430",
    connectionRouteVia: "\u0427\u0435\u0440\u0435\u0437",
    connectionRouteTo: "\u041A\u0443\u0434\u0430",
    connectionRouteCurrentDevice: "\u042D\u0442\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E",
    connectionRouteLan: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0435\u0442\u044C",
    connectionRouteP2p: "\u041F\u0440\u044F\u043C\u043E\u0439 \u043F\u0443\u0442\u044C \u0447\u0435\u0440\u0435\u0437 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442",
    connectionRouteTurn: "\u0421\u0435\u0440\u0432\u0438\u0441 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0438\u0438 TURN",
    connectionRouteRelay: "\u0421\u0435\u0440\u0432\u0435\u0440 Remote",
    connectionRouteHost: "\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440 \u0441 Harness",
    connectionRouteLanDetail: "\u041F\u0440\u044F\u043C\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043F\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0435\u0442\u0438",
    connectionRouteP2pDetail: "\u041F\u0440\u044F\u043C\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442",
    connectionRouteTurnDetail: "\u0417\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u0441\u0435\u0440\u0432\u0438\u0441 TURN",
    connectionRouteRelayDetail: "\u0417\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u0441\u0435\u0440\u0432\u0435\u0440 Remote",
    connectionRouteEncrypted: "\u041D\u0430 \u0432\u0441\u0451\u043C \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043F\u043E\u0434 \u0441\u043A\u0432\u043E\u0437\u043D\u044B\u043C \u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0438\u0435\u043C.",
    connectionDetailsConnection: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
    connectionDetailsWebRtc: "\u0421\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E \u0441\u0435\u0442\u0438 \xB7 WebRTC / ICE",
    connectionId: "ID \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
    connectedAt: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    preferredTransports: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u043F\u043E\u043F\u044B\u0442\u043E\u043A",
    controlChannel: "\u041A\u0430\u043D\u0430\u043B \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
    controlAddress: "\u0410\u0434\u0440\u0435\u0441 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
    serverUnavailableError: "\u0421\u0435\u0440\u0432\u0438\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u043F\u043E\u0437\u0436\u0435.",
    connectionHoldCountdown: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u0442\u0435\u0447\u0451\u0442 \u0447\u0435\u0440\u0435\u0437 {seconds} \u0441",
    serverUnavailableCountdown: "\u0421\u0435\u0440\u0432\u0438\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \xB7 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u0442\u0435\u0447\u0451\u0442 \u0447\u0435\u0440\u0435\u0437 {seconds} \u0441",
    unavailable: "\u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E",
    serverUnavailableShort: "\u0421\u0435\u0440\u0432\u0438\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D",
    serverUnavailable: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.",
    serverUnavailableConnected: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0421\u0432\u044F\u0437\u044C \u0441 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C \u0430\u043A\u0442\u0438\u0432\u043D\u0430. \u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.",
    serverLeaseExpiring: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u0442\u0435\u0447\u0451\u0442 \u0447\u0435\u0440\u0435\u0437 {seconds} \u0441.",
    serverRestored: "\u0421\u0435\u0440\u0432\u0435\u0440 \u0441\u043D\u043E\u0432\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D.",
    serverLinkDisconnected: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u043E.",
    controlStateConnecting: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
    controlStateOpen: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    controlStateClosing: "\u0417\u0430\u043A\u0440\u044B\u0442\u0438\u0435",
    controlStateClosed: "\u0417\u0430\u043A\u0440\u044B\u0442\u043E",
    peerState: "Peer-\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435",
    dataChannel: "DataChannel",
    localCandidate: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442",
    remoteCandidate: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442",
    localAddress: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441",
    remoteAddress: "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441",
    networkProtocol: "\u0421\u0435\u0442\u0435\u0432\u043E\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B",
    relayProtocol: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B TURN",
    roundTripTime: "\u0412\u0440\u0435\u043C\u044F \u043F\u0440\u0438\u0451\u043C\u0430-\u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438",
    availableBitrate: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0430\u044F \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0430\u044F \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C",
    bytesSent: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u0447\u0435\u0440\u0435\u0437 WebRTC",
    bytesReceived: "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0447\u0435\u0440\u0435\u0437 WebRTC",
    notProvided: "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E",
    candidateHost: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \xB7 host",
    candidateSrflx: "\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \xB7 srflx",
    candidatePrflx: "\u0410\u0434\u0440\u0435\u0441 \u043F\u0438\u0440\u0430 \xB7 prflx",
    candidateRelay: "\u0410\u0434\u0440\u0435\u0441 TURN \xB7 relay",
    openLocalWorkspaces: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438",
    clientSignInHint: "\u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 \u044D\u0442\u043E\u0442 \u0441\u0435\u0440\u0432\u0435\u0440, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0441\u0432\u043E\u0438\u0445 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0445 \u0445\u043E\u0441\u0442\u043E\u0432.",
    signInClient: "DS Harness Remote:",
    signInClientDescription: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u0441\u044C \u043E\u0434\u0438\u043D \u0440\u0430\u0437 \u2014 \u0434\u043E\u0441\u0442\u0443\u043F \u0432 \u043B\u044E\u0431\u043E\u0435 \u0432\u0440\u0435\u043C\u044F.",
    startSignIn: "\u041D\u0430\u0447\u0430\u0442\u044C \u0432\u0445\u043E\u0434",
    allowControlCurrentDevice: "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u044D\u0442\u0438\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C",
    allowControlDevice: "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u044D\u0442\u0438\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C",
    connectedClientCount: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E: {count}",
    checkAcp: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0431\u044D\u043A\u0435\u043D\u0434",
    checkingAcp: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 ACP\u2026",
    acpAvailable: "ACP \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D",
    acpUnavailable: "ACP \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D",
    agentBackends: "\u0414\u0440\u0443\u0433\u0438\u0435 \u0430\u0433\u0435\u043D\u0442\u044B \u0434\u043B\u044F \u043A\u043E\u0434\u0430",
    acpDocumentation: "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435 \u0432 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438.",
    acpHint: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 ACP. ",
    acpCheckPassed: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430",
    acpCheckFailed: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430",
    installOrConfigureAcp: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C / \u043D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C",
    configureAcp: "\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438",
    installAcp: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C",
    installingAcp: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u2026",
    acpConfiguredNotice: "\u0411\u044D\u043A\u0435\u043D\u0434 ACP \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u0438 \u0432\u043A\u043B\u044E\u0447\u0451\u043D.",
    acpInstalledNotice: "\u0411\u044D\u043A\u0435\u043D\u0434 ACP \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0438 \u0432\u043A\u043B\u044E\u0447\u0451\u043D.",
    acpDownloadRequired: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 {backend}: {url}",
    addAcp: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C ACP",
    acpName: "\u0418\u043C\u044F \u0441\u0435\u0440\u0432\u0438\u0441\u0430",
    acpCommand: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430",
    acpArguments: "\u0410\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u044B",
    removeAcp: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
    currentConnectedDevices: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    noConnectedClients: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043A \u044D\u0442\u043E\u043C\u0443 \u0445\u043E\u0441\u0442\u0443 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430.",
    unknownDevice: "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E",
    exitRemoteAccount: "\u0412\u044B\u0439\u0442\u0438",
    githubLogin: "Github",
    providerLogin: "{provider}",
    scanWithProvider: "\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0447\u0435\u0440\u0435\u0437 {provider}",
    loadingLoginProviders: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u043F\u043E\u0441\u043E\u0431\u043E\u0432 \u0432\u0445\u043E\u0434\u0430\u2026",
    retryLoginProviders: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0441\u043F\u043E\u0441\u043E\u0431\u043E\u0432 \u0432\u0445\u043E\u0434\u0430",
    serverApplied: "\u0410\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D.",
    noLoginProviders: "\u0412\u0445\u043E\u0434 \u043F\u043E QR-\u043A\u043E\u0434\u0443 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 email \u0438 \u043F\u0430\u0440\u043E\u043B\u044C.",
    zhihuLogin: "Zhihu",
    scanWithGitHub: "\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0447\u0435\u0440\u0435\u0437 GitHub",
    scanWithZhihu: "\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0447\u0435\u0440\u0435\u0437 Zhihu",
    openInBrowser: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435",
    scanLoginHint: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044E \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435. \u042D\u0442\u043E \u043E\u043A\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442 \u0440\u0430\u0431\u043E\u0442\u0443 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
    currentServiceAddress: "\u0414\u043E\u043C\u0435\u043D \u0441\u0435\u0440\u0432\u0438\u0441\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438:",
    editServiceAddress: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0438\u0441\u0430",
    restoreDefaultServiceAddress: "\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
    cancelServiceAddressEdit: "\u041E\u0442\u043C\u0435\u043D\u0430",
    accountPasswordLogin: "\u041F\u0430\u0440\u043E\u043B\u044C",
    qrLoginExpired: "\u0421\u0440\u043E\u043A \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F QR-\u043A\u043E\u0434\u0430 \u0438\u0441\u0442\u0451\u043A. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0435\u0433\u043E, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C.",
    refreshQrCode: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C QR-\u043A\u043E\u0434",
    codexVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C CodeX",
    cursorVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C Cursor",
    antigravityVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C Antigravity",
    piVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C Pi",
    opencodeVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C OpenCode",
    claudeVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C Claude",
    hermesVirtualWorkspace: "\u0412\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C Hermes",
    codexVirtualSessions: "\u0421\u0435\u0441\u0441\u0438\u0438"
  }, uk = {
    serverSavedLive: "\u0410\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u0439 \u0437\u0430\u0441\u0442\u043E\u0441\u043E\u0432\u0430\u043D\u043E.",
    saveServerBeforeLogin: "\u0417\u0431\u0435\u0440\u0435\u0436\u0456\u0442\u044C \u0430\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430, \u043F\u0435\u0440\u0448 \u043D\u0456\u0436 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u0438 \u0432\u0445\u0456\u0434 \u0430\u0431\u043E \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F.",
    pairingLoginTab: "DSH Go",
    pairingTitle: "\u0421\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F \u0437 DSH Go",
    pairingHint: `\u0412\u0456\u0434\u0441\u043A\u0430\u043D\u0443\u0439\u0442\u0435 \u043A\u043E\u0434 \u0443 DSH Go \u0456 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0456.
\u041F\u043E\u0442\u0456\u043C \u0432\u0432\u0435\u0434\u0456\u0442\u044C \u043A\u043E\u0434 \u0456\u0437 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430 \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u043A\u043E\u043C\u043F\u02BC\u044E\u0442\u0435\u0440\u0456 \u0439 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u043F\u0440\u0438\u0432\u02BC\u044F\u0437\u043A\u0443.`,
    pairingHostOnly: "\u041D\u043E\u0432\u0456 \u0445\u043E\u0441\u0442\u0438 \u043B\u0438\u0448\u0435 \u043F\u0440\u0438\u0439\u043C\u0430\u044E\u0442\u044C \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F. \u0421\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F \u043D\u0435 \u0434\u0430\u0454 \u0437\u043C\u043E\u0433\u0438 \u043A\u0435\u0440\u0443\u0432\u0430\u0442\u0438 \u0456\u043D\u0448\u0438\u043C\u0438 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044F\u043C\u0438.",
    pairingSaveServer: "\u0417\u0431\u0435\u0440\u0435\u0436\u0456\u0442\u044C \u0430\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0435\u0440\u0435\u0434 \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F\u043C.",
    pairingScan: "\u0412\u0456\u0434\u0441\u043A\u0430\u043D\u0443\u0439\u0442\u0435 \u0446\u0435\u0439 QR-\u043A\u043E\u0434 \u0443 DSH Go \u0456 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0456.",
    pairingEnter: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u0442\u0435\u043B\u0435\u0444\u043E\u043D, \u0449\u043E \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0432 \u0437\u0430\u043F\u0438\u0442, \u0456 \u0432\u0432\u0435\u0434\u0456\u0442\u044C \u0439\u043E\u0433\u043E \u043A\u043E\u0434.",
    pairingComplete: "\u0421\u043F\u0430\u0440\u0435\u043D\u043E. \u0422\u0435\u043F\u0435\u0440 DSH Go \u043C\u043E\u0436\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u0438\u0441\u044F \u0434\u043E \u0446\u044C\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430.",
    pairingPending: "\u0412\u0456\u0434\u043D\u043E\u0432\u0456\u0442\u044C \u043F\u043E\u0447\u0430\u0442\u043A\u043E\u0432\u0435 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u043D\u043D\u044F, \u043D\u0435 \u0437\u043C\u0456\u043D\u044E\u044E\u0447\u0438 \u043A\u043E\u0434.",
    pairingClosed: "\u0421\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E. \u0417\u0433\u0435\u043D\u0435\u0440\u0443\u0439\u0442\u0435 \u043D\u043E\u0432\u0438\u0439 QR-\u043A\u043E\u0434, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438 \u0437\u043D\u043E\u0432\u0443.",
    pairingQr: "\u041E\u0434\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u0438\u0439 QR-\u043A\u043E\u0434 \u0434\u043B\u044F \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F \u0437 DSH Go",
    pairingExpires: "\u0421\u043F\u043B\u0438\u0432\u0430\u0454 \u0447\u0435\u0440\u0435\u0437 {time}",
    pairingExpired: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u043C\u0438\u043D\u0443\u0432",
    pairingCode: "8-\u0437\u043D\u0430\u0447\u043D\u0438\u0439 \u043A\u043E\u0434, \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u0438\u0439 \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0456",
    pairingWarning: "\u0414\u043E\u0437\u0432\u043E\u043B\u0435\u043D\u043E \u043B\u0438\u0448\u0435 \u043E\u0434\u043D\u0435 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u043D\u043D\u044F. \u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u043A\u043E\u0434 \u0440\u043E\u0431\u0438\u0442\u044C \u0446\u0435\u0439 QR-\u043A\u043E\u0434 \u043D\u0435\u0434\u0456\u0439\u0441\u043D\u0438\u043C; \u0432\u0456\u0434\u0441\u043A\u0430\u043D\u0443\u0439\u0442\u0435 \u043D\u043E\u0432\u0438\u0439.",
    pairingConfirm: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u043F\u0440\u0438\u0432\u02BC\u044F\u0437\u043A\u0443",
    pairingRetry: "\u0412\u0456\u0434\u043D\u043E\u0432\u0438\u0442\u0438 \u043F\u043E\u0447\u0430\u0442\u043A\u043E\u0432\u0435 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u043D\u043D\u044F",
    pairingCancel: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438 \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F",
    pairingStart: "\u0417\u0433\u0435\u043D\u0435\u0440\u0443\u0432\u0430\u0442\u0438 QR-\u043A\u043E\u0434 \u0434\u043B\u044F \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F",
    pairingBusy: "\u0417\u0430\u0447\u0435\u043A\u0430\u0439\u0442\u0435\u2026",
    pairingUnsupported: "\u0426\u0435\u0439 \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u043F\u0456\u0434\u0442\u0440\u0438\u043C\u0443\u0454 \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457\u0432.",
    pairingError: `\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438 \u0441\u043F\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F. \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F.
\u042F\u043A\u0449\u043E \u043A\u043E\u0434 \u0443\u0436\u0435 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E, \u0432\u0456\u0434\u043D\u043E\u0432\u0456\u0442\u044C \u043F\u043E\u0447\u0430\u0442\u043A\u043E\u0432\u0435 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u043D\u043D\u044F, \u043D\u0435 \u0437\u043C\u0456\u043D\u044E\u044E\u0447\u0438 \u0439\u043E\u0433\u043E.`,
    remoteTools: "\u0412\u043F\u0440\u043E\u0432\u0430\u0434\u0436\u0443\u0432\u0430\u0442\u0438 Remote Tools",
    remoteToolsHint: "\u041D\u0430\u0434\u0430\u0432\u0430\u0442\u0438 \u0456\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0438 remote_* \u0443 \u0441\u0435\u0441\u0456\u044F\u0445. \u0422\u0438\u043F\u043E\u0432\u043E \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E; \u0432\u0438\u043C\u043A\u043D\u0456\u0442\u044C, \u044F\u043A\u0449\u043E \u0432\u043E\u043D\u0438 \u043D\u0435 \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u0456. \u0417\u043C\u0456\u043D\u0438 \u043D\u0430\u0431\u0443\u0434\u0443\u0442\u044C \u0447\u0438\u043D\u043D\u043E\u0441\u0442\u0456 \u043F\u0456\u0441\u043B\u044F \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0443 \u0445\u043E\u0441\u0442\u0430.",
    remoteToolsSaved: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F Remote Tools \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E.",
    debugLogging: "\u0416\u0443\u0440\u043D\u0430\u043B \u043D\u0430\u043B\u0430\u0433\u043E\u0434\u0436\u0435\u043D\u043D\u044F",
    debugLoggingHint: "\u0417\u0430\u043F\u0438\u0441\u0443\u0432\u0430\u0442\u0438 \u0434\u0435\u0442\u0430\u043B\u044C\u043D\u0443 \u0434\u0456\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0443 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0434\u043E \u0436\u0443\u0440\u043D\u0430\u043B\u0443 \u0445\u043E\u0441\u0442\u0430 (\u0442\u0438\u043F\u043E\u0432\u043E \u0437\u0430\u043F\u0438\u0441\u0443\u044E\u0442\u044C\u0441\u044F \u0440\u0456\u0432\u043D\u0456 Info \u0456 \u0432\u0438\u0449\u0435). \u0414\u0456\u0454 \u043E\u0434\u0440\u0430\u0437\u0443; \u0432\u0438\u043C\u043A\u043D\u0456\u0442\u044C \u043F\u0456\u0441\u043B\u044F \u0443\u0441\u0443\u043D\u0435\u043D\u043D\u044F \u043D\u0435\u0441\u043F\u0440\u0430\u0432\u043D\u043E\u0441\u0442\u0435\u0439.",
    debugLoggingLevelDebug: "Debug",
    debugLoggingLevelInfo: "Info",
    debugLogsToggleOpen: "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0436\u0443\u0440\u043D\u0430\u043B",
    debugLogsToggleClose: "\u0421\u0445\u043E\u0432\u0430\u0442\u0438 \u0436\u0443\u0440\u043D\u0430\u043B",
    debugLogsFilterAll: "\u0423\u0441\u0456",
    debugLogsFilterWarn: "\u041F\u043E\u043F\u0435\u0440\u0435\u0434\u0436\u0435\u043D\u043D\u044F \u0439 \u043F\u043E\u043C\u0438\u043B\u043A\u0438",
    debugLogsRefresh: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438",
    debugLogsRefreshing: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F\u2026",
    debugLogsCopy: "\u041A\u043E\u043F\u0456\u044E\u0432\u0430\u0442\u0438",
    debugLogsCopied: "\u0421\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E",
    debugLogsCopyFailed: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0441\u043A\u043E\u043F\u0456\u044E\u0432\u0430\u0442\u0438",
    debugLogsExport: "\u0415\u043A\u0441\u043F\u043E\u0440\u0442\u0443\u0432\u0430\u0442\u0438",
    debugLogsClear: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438",
    debugLogsLoading: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0436\u0443\u0440\u043D\u0430\u043B\u0443\u2026",
    debugLogsEmpty: "\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u0438\u0445 \u0437\u0430\u043F\u0438\u0441\u0456\u0432 \u0443 \u0436\u0443\u0440\u043D\u0430\u043B\u0456 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454.",
    debugLogsFileLabel: "\u0424\u0430\u0439\u043B \u0436\u0443\u0440\u043D\u0430\u043B\u0443:",
    debugLogsFileFallback: "\u041B\u0438\u0448\u0435 \u0432 \u043F\u0430\u043C\u02BC\u044F\u0442\u0456 ({error})",
    debugLogsCount: "\u0417\u0430\u043F\u0438\u0441\u0456\u0432: {count}",
    terminalRemote: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0442\u0435\u0440\u043C\u0456\u043D\u0430\u043B",
    terminalRemoteHint: "\u0414\u043E\u0437\u0432\u043E\u043B\u0438\u0442\u0438 \u0434\u043E\u0432\u0456\u0440\u0435\u043D\u0438\u043C \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044F\u043C Remote \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u0438 \u0456\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u0443 \u043E\u0431\u043E\u043B\u043E\u043D\u043A\u0443 \u0432\u0456\u0434 \u0456\u043C\u0435\u043D\u0456 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447\u0430 \u0446\u044C\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430. \u0422\u0438\u043F\u043E\u0432\u043E \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E; \u043D\u0435 \u0437\u0430\u043B\u0435\u0436\u0438\u0442\u044C \u0432\u0456\u0434 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u044C \u0434\u043B\u044F \u0430\u0433\u0435\u043D\u0442\u0430. \u041F\u0435\u0440\u0435\u043C\u0438\u043A\u0430\u043D\u043D\u044F \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454\u0442\u044C\u0441\u044F \u0439 \u0434\u0456\u0454 \u043E\u0434\u0440\u0430\u0437\u0443.",
    terminalRemoteUnavailable: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0442\u0435\u0440\u043C\u0456\u043D\u0430\u043B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439. \u0423\u0432\u0456\u043C\u043A\u043D\u0456\u0442\u044C \xAB\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0442\u0435\u0440\u043C\u0456\u043D\u0430\u043B\xBB \u0443 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445 Remote \u043D\u0430 \u0445\u043E\u0441\u0442\u0456; \u043F\u0435\u0440\u0435\u043C\u0438\u043A\u0430\u0447 \u0434\u0456\u0454 \u043E\u0434\u0440\u0430\u0437\u0443.",
    terminalSaved: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u043E\u0433\u043E \u0442\u0435\u0440\u043C\u0456\u043D\u0430\u043B\u0430 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u0414\u0456\u0454 \u043E\u0434\u0440\u0430\u0437\u0443.",
    sidebarEntry: "\u041A\u043D\u043E\u043F\u043A\u0430 \u043D\u0430 \u0431\u0456\u0447\u043D\u0456\u0439 \u043F\u0430\u043D\u0435\u043B\u0456",
    sidebarEntryHint: "\xAB\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u0438\u0439\xBB \u0437\u0430\u043B\u0438\u0448\u0430\u0454 \u043A\u043D\u043E\u043F\u043A\u0443 Remote \u0432\u043D\u0438\u0437\u0443 \u0431\u0456\u0447\u043D\u043E\u0457 \u043F\u0430\u043D\u0435\u043B\u0456. \xAB\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u0438\u0439\xBB \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C \u0457\u0457 \u0432 \u0440\u044F\u0434\u043E\u043A \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u2014 \u0437\u043D\u0430\u0447\u043E\u043A, \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u043E \u2014 \u0456\u043C\u02BC\u044F \u0445\u043E\u0441\u0442\u0430 \u0439 \xAB\u0412\u0438\u0439\u0442\u0438\xBB. \u041F\u0435\u0440\u0435\u043C\u0438\u043A\u0430\u043D\u043D\u044F \u0434\u0456\u0454 \u043E\u0434\u0440\u0430\u0437\u0443.",
    sidebarEntryStandard: "\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u0438\u0439",
    sidebarEntryCompact: "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u0438\u0439",
    sidebarEntrySaved: "\u0421\u0442\u0438\u043B\u044C \u043A\u043D\u043E\u043F\u043A\u0438 \u043D\u0430 \u0431\u0456\u0447\u043D\u0456\u0439 \u043F\u0430\u043D\u0435\u043B\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E.",
    previewOpen: "\u0421\u0435\u0440\u0432\u0456\u0441 \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0443",
    previewPort: "\u041F\u043E\u0440\u0442 \u0445\u043E\u0441\u0442\u0430",
    previewLocalOnly: "\u0414\u043B\u044F \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0443 \u043F\u043E\u0442\u0440\u0456\u0431\u0435\u043D Desktop \u0430\u0431\u043E \u0431\u0440\u0430\u0443\u0437\u0435\u0440, \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439 \u0434\u043E Harness \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u043A\u043E\u043C\u043F\u02BC\u044E\u0442\u0435\u0440\u0456.",
    hostReferenceName: "\u0406\u043C\u02BC\u044F",
    hostReferenceSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    hostReferenceDeviceId: "ID \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E",
    hostReferenceInvocation: "\u0412\u0438\u043A\u043B\u0438\u043A",
    settings: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F",
    pluginTitle: "DeepSeek Remote",
    pluginDescription: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0456 P2P \u0456\u0437 \u043D\u0430\u0441\u043A\u0440\u0456\u0437\u043D\u0438\u043C \u0448\u0438\u0444\u0440\u0443\u0432\u0430\u043D\u043D\u044F\u043C \u0434\u043E DeepSeek Harness, CodeX, Claude Code, Pi \u0442\u0430 \u0456\u043D\u0448\u0438\u0445 \u0440\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 \u0456\u0437 \u0432\u0435\u0431\u0443 \u0439 \u043C\u043E\u0431\u0456\u043B\u044C\u043D\u0438\u0445 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457\u0432.",
    openPluginSettings: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F Remote",
    expandSettings: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F: {name}",
    collapseSettings: "\u0421\u0445\u043E\u0432\u0430\u0442\u0438 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F: {name}",
    unsaved: "\u041D\u0435 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E",
    associated: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E",
    authorizationComplete: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u044E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E",
    loadingSettings: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u044C DeepSeek Remote\u2026",
    mode: "\u0420\u0435\u0436\u0438\u043C",
    pluginMode: "\u0420\u0435\u0436\u0438\u043C \u043F\u043B\u0430\u0433\u0456\u043D\u0430",
    host: "\u0425\u043E\u0441\u0442",
    client: "\u041A\u043B\u0456\u0454\u043D\u0442",
    authorization: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u044F",
    account: "\u041E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441",
    hostRegistrationCode: "\u041E\u0434\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u0438\u0439 \u043A\u043E\u0434 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E",
    ownedDeviceAuthorization: "\u0412\u043B\u0430\u0441\u043D\u0438\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439",
    authorizedOn: "{role} \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E \u043D\u0430 {serverUrl}.",
    readOnly: "\u0426\u0435\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C DSH \u043D\u0435 \u043C\u0430\u0454 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u044C \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447\u0430, \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0445 \u0434\u043B\u044F \u0437\u0430\u043F\u0438\u0441\u0443.",
    discard: "\u0412\u0456\u0434\u043A\u0438\u043D\u0443\u0442\u0438",
    save: "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438",
    saving: "\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043D\u044F\u2026",
    signOut: "\u0412\u0438\u0439\u0442\u0438",
    signingOut: "\u0412\u0438\u0445\u0456\u0434\u2026",
    hostName: "\u0406\u043C\u02BC\u044F \u0445\u043E\u0441\u0442\u0430",
    deviceId: "ID \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E",
    serverUrl: "URL \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    serverUrlHint: "HTTPS-\u0430\u0434\u0440\u0435\u0441\u0430 \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 \u0439 \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043E\u0457 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0456\u0457.",
    serverSaved: "\u0410\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C DSH, \u0449\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438 \u0457\u0457.",
    codexRemote: "Codex Remote",
    codexRemoteHint: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u0438\u0441\u044F \u0434\u043E \u043F\u0440\u043E\u0454\u043A\u0442\u0456\u0432 CodeX \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u0445\u043E\u0441\u0442\u0456.",
    codexSaved: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F Codex Remote \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C DSH, \u0449\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438 \u0439\u043E\u0433\u043E.",
    cursorRemote: "\u0410\u0434\u0430\u043F\u0442\u0435\u0440 Cursor ACP (\u0435\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u0438\u0439)",
    cursorRemoteHint: "\u0423\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0431\u0435\u043A\u0435\u043D\u0434 Cursor `agent acp` \u0434\u043B\u044F \u0448\u043B\u044E\u0437\u0443 Agent ACP. \u041F\u043E\u0442\u0440\u0456\u0431\u0435\u043D \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0438\u0439 `agent login`. \u041F\u0456\u0441\u043B\u044F \u0437\u043C\u0456\u043D\u0438 \u0446\u044C\u043E\u0433\u043E \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C DSH.",
    cursorSaved: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F \u0430\u0434\u0430\u043F\u0442\u0435\u0440\u0430 Cursor ACP \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C DSH, \u0449\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438 \u0439\u043E\u0433\u043E.",
    authorizeFromRemote: "\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C, \u0449\u043E\u0431 \u043A\u0435\u0440\u0443\u0432\u0430\u0442\u0438 \u0446\u0438\u043C \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0454\u043C \u0456 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u0438\u0441\u044F \u0434\u043E \u0441\u0432\u043E\u0457\u0445 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0445 \u0445\u043E\u0441\u0442\u0456\u0432.",
    signInAccount: "\u0423\u0432\u0456\u0439\u0442\u0438",
    saveServerBeforeSignIn: "\u0417\u0431\u0435\u0440\u0435\u0436\u0456\u0442\u044C \u0430\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0435\u0440\u0435\u0434 \u0432\u0445\u043E\u0434\u043E\u043C.",
    authorizationMethod: "\u0421\u043F\u043E\u0441\u0456\u0431 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457",
    accountPassword: "\u041F\u0430\u0440\u043E\u043B\u044C \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443",
    registrationCode: "\u041A\u043E\u0434 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E",
    registrationCodeHint: "\u0417\u0433\u0435\u043D\u0435\u0440\u0443\u0439\u0442\u0435 \u0439\u043E\u0433\u043E \u043F\u0456\u0441\u043B\u044F \u0432\u0445\u043E\u0434\u0443 \u043D\u0430 \u0441\u0430\u0439\u0442\u0456 \u0441\u0435\u0440\u0432\u0435\u0440\u0430. \u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435 \u043E\u0434\u0438\u043D \u0440\u0430\u0437, \u0449\u043E\u0431 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0438 \u0446\u0435\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439.",
    accountHint: "\u041E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 \u043C\u0430\u0454 \u043D\u0430\u043B\u0435\u0436\u0430\u0442\u0438 \u0434\u043E \u0432\u0438\u0431\u0440\u0430\u043D\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    password: "\u041F\u0430\u0440\u043E\u043B\u044C",
    passwordHint: "\u041B\u0438\u0448\u0435 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0456 \u0437\u0430\u043F\u0438\u0441\u0438 DSH Remote Web \u0430\u0431\u043E \u0432\u043B\u0430\u0441\u043D\u043E\u0433\u043E \u0440\u043E\u0437\u0433\u043E\u0440\u043D\u0443\u0442\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0456\u0441\u0443; \u043D\u0435 \u043E\u0444\u0456\u0446\u0456\u0439\u043D\u0456 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0456 \u0437\u0430\u043F\u0438\u0441\u0438 DeepSeek Harness.",
    modeSavedNeedsAuthorization: "\u0420\u0435\u0436\u0438\u043C \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435 {role} \u043F\u0435\u0440\u0435\u0434 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F\u043C. \u041D\u0430\u044F\u0432\u043D\u0456 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u0457 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E.",
    modeSavedReused: "\u0420\u0435\u0436\u0438\u043C \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u043E \u043D\u0430\u044F\u0432\u043D\u0443 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C Harness, \u0449\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438.",
    modeSavedOwnedRole: "\u0420\u0435\u0436\u0438\u043C \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u0426\u0435\u0439 \u0432\u043B\u0430\u0441\u043D\u0438\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C Harness, \u0449\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438.",
    enterRegistrationCode: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043A\u043E\u0434 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E.",
    enterAccountPassword: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 \u0456 \u043F\u0430\u0440\u043E\u043B\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    associationSaved: "\u041F\u0440\u0438\u0432\u02BC\u044F\u0437\u0430\u043D\u043E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C Harness, \u0449\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438.",
    signedOut: "\u0412\u0438 \u0432\u0438\u0439\u0448\u043B\u0438 \u0437 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 \u0439 \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0438\u043B\u0438\u0441\u044F \u0432\u0456\u0434 Remote.",
    remoteRequestFailed: "\u041F\u043E\u043C\u0438\u043B\u043A\u0430 \u0437\u0430\u043F\u0438\u0442\u0443 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u043E\u0433\u043E \u0440\u0435\u0436\u0438\u043C\u0443.",
    remoteControlUnavailable: "\u041A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F \u043F\u043B\u0430\u0433\u0456\u043D\u043E\u043C Remote \u0449\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0454\u0442\u044C\u0441\u044F. \u042F\u043A\u0449\u043E \u0432\u043E\u043D\u043E \u0437\u0430\u043B\u0438\u0448\u0430\u0454\u0442\u044C\u0441\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u043C, \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0456\u0442\u044C DSH.",
    identityCorrupted: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0443 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C Remote \u043F\u043E\u0448\u043A\u043E\u0434\u0436\u0435\u043D\u043E. \u0429\u043E\u0431 \u0432\u0456\u0434\u043D\u043E\u0432\u0438\u0442\u0438 \u0440\u043E\u0431\u043E\u0442\u0443, \u0441\u043A\u0438\u043D\u044C\u0442\u0435 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C \u0443 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445.",
    credentialsCorrupted: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0456 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0456 \u0434\u0430\u043D\u0456 Remote \u043F\u043E\u0448\u043A\u043E\u0434\u0436\u0435\u043D\u043E. \u0429\u043E\u0431 \u0432\u0456\u0434\u043D\u043E\u0432\u0438\u0442\u0438 \u0440\u043E\u0431\u043E\u0442\u0443, \u0432\u0438\u0439\u0434\u0456\u0442\u044C \u0430\u0431\u043E \u0441\u043A\u0438\u043D\u044C\u0442\u0435 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C \u0443 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445.",
    identityLocked: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0443 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C Remote \u0437\u0430\u0431\u043B\u043E\u043A\u043E\u0432\u0430\u043D\u043E \u0456\u043D\u0448\u0438\u043C \u043F\u0440\u043E\u0446\u0435\u0441\u043E\u043C. \u0417\u0443\u043F\u0438\u043D\u0456\u0442\u044C \u0456\u043D\u0448\u0456 \u0435\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u0438 DSH \u0456 \u043F\u043E\u0432\u0442\u043E\u0440\u0456\u0442\u044C \u0441\u043F\u0440\u043E\u0431\u0443.",
    storageConflict: "\u0412\u0438\u044F\u0432\u043B\u0435\u043D\u043E \u043A\u043E\u043D\u0444\u043B\u0456\u043A\u0442\u043D\u0435 \u0430\u0431\u043E \u043D\u0435\u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0435\u043D\u0435 \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435 Remote. \u0417\u0443\u043F\u0438\u043D\u0456\u0442\u044C \u0443\u0441\u0456 \u0435\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u0438 DSH \u0456 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u0439\u043E\u0433\u043E \u0432\u0440\u0443\u0447\u043D\u0443.",
    storageConflictEntry: "\u0412\u0438\u044F\u0432\u043B\u0435\u043D\u043E \u043A\u043E\u043D\u0444\u043B\u0456\u043A\u0442\u043D\u0435 \u0430\u0431\u043E \u043D\u0435\u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0435\u043D\u0435 \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435 Remote. \u0417\u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043D\u0435\u043E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 \xAB{name}\xBB. \u0417\u0443\u043F\u0438\u043D\u0456\u0442\u044C \u0443\u0441\u0456 \u0435\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u0438 DSH \u0456 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u0439\u043E\u0433\u043E \u0432\u0440\u0443\u0447\u043D\u0443.",
    retryStartup: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0438 \u0437\u0430\u043F\u0443\u0441\u043A Remote",
    retryStartupSuccess: "Remote \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u043E.",
    resetIdentity: "\u0421\u043A\u0438\u043D\u0443\u0442\u0438 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C Remote",
    resetIdentityHint: "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u0441\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0456 \u043F\u0430\u0440\u0438 \u043A\u043B\u044E\u0447\u0456\u0432 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E, \u044F\u043A\u0449\u043E \u0457\u0445 \u043F\u043E\u0448\u043A\u043E\u0434\u0436\u0435\u043D\u043E. \u041F\u043E\u0442\u0440\u0456\u0431\u043D\u043E \u0431\u0443\u0434\u0435 \u0443\u0432\u0456\u0439\u0442\u0438 \u0437\u043D\u043E\u0432\u0443.",
    resetIdentityConfirm: "\u0421\u043F\u0440\u0430\u0432\u0434\u0456 \u0441\u043A\u0438\u043D\u0443\u0442\u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C Remote? \u041F\u043E\u0442\u0440\u0456\u0431\u043D\u043E \u0431\u0443\u0434\u0435 \u0443\u0432\u0456\u0439\u0442\u0438 \u0437\u043D\u043E\u0432\u0443.",
    resetIdentitySuccess: "\u0406\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C Remote \u0441\u043A\u0438\u043D\u0443\u0442\u043E.",
    resettingAction: "\u0421\u043A\u0438\u0434\u0430\u043D\u043D\u044F\u2026",
    remoteStartupFailed: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0438 \u043F\u043B\u0430\u0433\u0456\u043D Remote.",
    switchTarget: "\u041F\u0435\u0440\u0435\u043C\u043A\u043D\u0443\u0442\u0438 \u0446\u0456\u043B\u044C Harness: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430 / \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0430",
    harnessTarget: "\u0426\u0456\u043B\u044C Harness",
    close: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438",
    refreshRemote: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0456 \u0445\u043E\u0441\u0442\u0438",
    refreshRemoteShort: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438",
    local: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u043E",
    remoteTarget: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u043E \xB7 {name}",
    remoteHostMention: "Remote \xB7 {platform}",
    thisMachineLocal: "\u0426\u0435\u0439 \u043A\u043E\u043C\u043F\u02BC\u044E\u0442\u0435\u0440 (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E)",
    currentDevice: "\u041F\u043E\u0442\u043E\u0447\u043D\u0438\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439",
    noRemoteHosts: "\u0417\u0430\u0440\u0430\u0437 \u043D\u0435\u043C\u0430\u0454 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0445 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0445 \u0445\u043E\u0441\u0442\u0456\u0432.",
    online: "\u0423 \u043C\u0435\u0440\u0435\u0436\u0456",
    offline: "\u041D\u0435 \u0432 \u043C\u0435\u0440\u0435\u0436\u0456",
    thisMachineHost: "\u0426\u0435\u0439 \u043A\u043E\u043C\u043F\u02BC\u044E\u0442\u0435\u0440 \u044F\u043A \u0445\u043E\u0441\u0442 Remote",
    connected: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    connectedAs: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u044F\u043A {account}",
    connection: "\u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F",
    checkingConnection: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F\u2026",
    connecting: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F",
    reconnecting: "\u041F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F",
    lastActive: "\u041E\u0441\u0442\u0430\u043D\u043D\u044F \u0430\u043A\u0442\u0438\u0432\u043D\u0456\u0441\u0442\u044C: {time}",
    neverConnected: "\u0429\u0435 \u043D\u0435 \u0431\u0443\u043B\u043E \u0436\u043E\u0434\u043D\u043E\u0433\u043E \u0443\u0441\u043F\u0456\u0448\u043D\u043E\u0433\u043E \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F.",
    reconnect: "\u041F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0438\u0441\u044F",
    reconnectingAction: "\u041F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F\u2026",
    reconnectStarted: "\u0417\u0430\u043F\u0438\u0442 \u043D\u0430 \u043F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E.",
    connectionAuthorizationExpired: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457 \u043C\u0438\u043D\u0443\u0432. \u0412\u0438\u0439\u0434\u0456\u0442\u044C \u0456 \u0437\u043D\u043E\u0432\u0443 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u0446\u0435\u0439 \u0445\u043E\u0441\u0442.",
    connectionReplaced: "\u0406\u043D\u0448\u0438\u0439 \u0435\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0454 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0456\u0441\u0442\u044C \u0446\u044C\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430. \u041F\u0435\u0440\u0448 \u043D\u0456\u0436 \u043F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0442\u0438\u0441\u044F, \u0437\u0443\u043F\u0438\u043D\u0456\u0442\u044C \u0439\u043E\u0433\u043E \u0430\u0431\u043E \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435 \u043E\u043A\u0440\u0435\u043C\u0438\u0439 DSH_HOME.",
    connectionCredentialsBusy: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0445 \u0434\u0430\u043D\u0438\u0445 \u0437\u0430\u0439\u043D\u044F\u0442\u0435. \u0425\u043E\u0441\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0441\u043F\u0440\u043E\u0431\u0443. \u0412\u0438\u0434\u0430\u043B\u044F\u0439\u0442\u0435 \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0435 \u0431\u043B\u043E\u043A\u0443\u0432\u0430\u043D\u043D\u044F \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043B\u0438\u0448\u0435 \u043F\u0456\u0441\u043B\u044F \u0437\u0443\u043F\u0438\u043D\u043A\u0438 \u0432\u0441\u0456\u0445 \u0435\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u0456\u0432.",
    connectionDeviceRevoked: "\u0426\u0435\u0439 \u0445\u043E\u0441\u0442 \u0432\u0456\u0434\u043A\u043B\u0438\u043A\u0430\u043D\u043E \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0456. \u0412\u0438\u0439\u0434\u0456\u0442\u044C \u0456 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u0439\u043E\u0433\u043E \u0437\u043D\u043E\u0432\u0443.",
    connectionOwnershipRequired: "\u0421\u0435\u0440\u0432\u0435\u0440 \u0431\u0456\u043B\u044C\u0448\u0435 \u043D\u0435 \u0440\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u0454 \u0446\u0435\u0439 \u0445\u043E\u0441\u0442 \u044F\u043A \u0432\u043B\u0430\u0441\u043D\u0438\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439.",
    connectionRateLimited: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043E\u0442\u0440\u0438\u043C\u0443\u0454 \u0437\u0430\u0431\u0430\u0433\u0430\u0442\u043E \u0437\u0430\u043F\u0438\u0442\u0456\u0432. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u0456 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0456 \u0441\u043F\u0440\u043E\u0431\u0438 \u0442\u0440\u0438\u0432\u0430\u044E\u0442\u044C.",
    connectionVersionMismatch: "\u0412\u0435\u0440\u0441\u0456\u0457 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0443 \u043F\u043B\u0430\u0433\u0456\u043D\u0430 \u0439 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043D\u0435\u0441\u0443\u043C\u0456\u0441\u043D\u0456.",
    connectionInvalidResponse: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0432 \u043D\u0435\u0434\u0456\u0439\u0441\u043D\u0435 \u043A\u0435\u0440\u0443\u0432\u0430\u043B\u044C\u043D\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F.",
    connectionReachability: "\u041D\u0435 \u0432\u0434\u0430\u0454\u0442\u044C\u0441\u044F \u0437\u0432\u02BC\u044F\u0437\u0430\u0442\u0438\u0441\u044F \u0456\u0437 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C. \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u043C\u0435\u0440\u0435\u0436\u0443 \u0442\u0430 \u0430\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    connectionUnexpected: "\u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u043D\u0435\u043E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u043E \u043F\u0435\u0440\u0435\u0440\u0432\u0430\u043B\u043E\u0441\u044F. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u0456 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0456 \u0441\u043F\u0440\u043E\u0431\u0438 \u0442\u0440\u0438\u0432\u0430\u044E\u0442\u044C.",
    hostSignInHint: "\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C, \u0449\u043E\u0431 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0432\u0430\u0442\u0438 \u0446\u0435\u0439 \u0445\u043E\u0441\u0442 \u043D\u0430 \u0432\u0438\u0431\u0440\u0430\u043D\u043E\u043C\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0456.",
    checkingHost: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u0457 \u0445\u043E\u0441\u0442\u0430\u2026",
    hostUnavailable: "\u0425\u043E\u0441\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439: {error}",
    serverAccountEmail: "\u0415\u043B. \u043F\u043E\u0448\u0442\u0430 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    serverAccountPassword: "\u041F\u0430\u0440\u043E\u043B\u044C \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    signInRegisterHost: "\u0423\u0432\u0456\u0439\u0442\u0438 \u0439 \u0437\u0430\u0440\u0435\u0454\u0441\u0442\u0440\u0443\u0432\u0430\u0442\u0438 \u0445\u043E\u0441\u0442",
    signingIn: "\u0412\u0445\u0456\u0434\u2026",
    loginWaitingAuthorization: "\u041E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u043D\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457",
    loginLoadingDevices: "\u0412\u0445\u0456\u0434 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E. \u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457\u0432",
    loginLoadingSettings: "\u0412\u0445\u0456\u0434 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E. \u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u044C",
    useRegistrationCode: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0442\u0438 \u043A\u043E\u0434 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F",
    registering: "\u0420\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044F\u2026",
    remoteEntry: "Remote",
    remoteTitle: "DS Harness Remote \u2014 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440",
    remoteDescription: "\u0412\u0438\u0431\u0435\u0440\u0456\u0442\u044C \u043E\u0434\u0438\u043D \u0437\u0456 \u0441\u0432\u043E\u0457\u0445 \u0445\u043E\u0441\u0442\u0456\u0432, \u0430 \u043F\u043E\u0442\u0456\u043C \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433. \u0406\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 Harness \u0437\u0430\u043B\u0438\u0448\u0430\u0454\u0442\u044C\u0441\u044F \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457.",
    starProject: "\u041F\u0440\u043E\u0454\u043A\u0442 \u0437 \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438\u043C \u043A\u043E\u0434\u043E\u043C \u2014 \u0431\u0443\u0434\u0435\u043C\u043E \u0440\u0430\u0434\u0456 \u0432\u0430\u0448\u0438\u043C \u0437\u0456\u0440\u043A\u0430\u043C~",
    chooseHost: "\u0425\u043E\u0441\u0442",
    manageHosts: "\u041A\u0435\u0440\u0443\u0432\u0430\u0442\u0438 \u0445\u043E\u0441\u0442\u0430\u043C\u0438",
    chooseDirectory: "\u0420\u043E\u0431\u043E\u0447\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433",
    selectHostHint: "\u0412\u0438\u0431\u0435\u0440\u0456\u0442\u044C \u0445\u043E\u0441\u0442 \u0443 \u043C\u0435\u0440\u0435\u0436\u0456, \u0449\u043E\u0431 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0439\u043E\u0433\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0438.",
    emptyDirectory: "\u0423 \u0446\u044C\u043E\u043C\u0443 \u043A\u0430\u0442\u0430\u043B\u043E\u0437\u0456 \u043D\u0435\u043C\u0430\u0454 \u0432\u0438\u0434\u0438\u043C\u0438\u0445 \u043F\u0456\u0434\u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0456\u0432.",
    openWorkspace: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440",
    openingWorkspace: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0442\u044F\u2026",
    loadingDirectory: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0456\u0432\u2026",
    remoteProgressCheckingHost: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u0445\u043E\u0441\u0442\u0430",
    remoteProgressCheckingHostDetail: "\u041F\u043E\u0448\u0443\u043A \u0432\u0438\u0431\u0440\u0430\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E \u0439 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430, \u0447\u0438 \u0432\u0456\u043D \u0443 \u043C\u0435\u0440\u0435\u0436\u0456.",
    remoteProgressAuthorizingPeer: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457",
    remoteProgressAuthorizingPeerDetail: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F \u043D\u0430\u043B\u0435\u0436\u043D\u043E\u0441\u0442\u0456 \u0434\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 \u0442\u0430 \u0437\u0430\u043A\u0440\u0456\u043F\u043B\u0435\u043D\u043E\u0457 \u0456\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u0456 \u0445\u043E\u0441\u0442\u0430.",
    remoteProgressOpeningChannel: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0442\u044F \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043E\u0433\u043E \u043A\u0430\u043D\u0430\u043B\u0443",
    remoteProgressOpeningChannelDetail: "\u0421\u043F\u0440\u043E\u0431\u0430 LAN, P2P, TURN, \u0430 \u0437\u0430 \u043F\u043E\u0442\u0440\u0435\u0431\u0438 \u2014 Relay.",
    remoteProgressProbeLan: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 LAN",
    remoteProgressProbeLanDetail: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430, \u0447\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0445\u043E\u0441\u0442 \u0443 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0456\u0439 \u043C\u0435\u0440\u0435\u0436\u0456.",
    remoteProgressProbeP2p: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 P2P",
    remoteProgressProbeP2pDetail: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0456\u0432 \u043F\u0440\u044F\u043C\u043E\u0433\u043E \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0447\u0435\u0440\u0435\u0437 \u0456\u043D\u0442\u0435\u0440\u043D\u0435\u0442 \u043C\u0456\u0436 \u0446\u0438\u043C \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0454\u043C \u0456 \u0445\u043E\u0441\u0442\u043E\u043C.",
    remoteProgressProbeTurn: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 TURN",
    remoteProgressProbeTurnDetail: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u0448\u043B\u044F\u0445\u0443 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0456\u0457 TURN \u0434\u043B\u044F \u043C\u0435\u0440\u0435\u0436 \u0437 \u043E\u0431\u043C\u0435\u0436\u0435\u043D\u043D\u044F\u043C\u0438.",
    remoteProgressProbeRelay: "\u041F\u0456\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 Relay",
    remoteProgressProbeRelayDetail: "\u041F\u0456\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0433\u043E \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043E\u0433\u043E Relay \u0447\u0435\u0440\u0435\u0437 \u0441\u0435\u0440\u0432\u0435\u0440, \u044F\u043A\u0449\u043E \u043F\u0440\u044F\u043C\u0456 \u0448\u043B\u044F\u0445\u0438 \u043D\u0435 \u0432\u0456\u0434\u043A\u0440\u0438\u044E\u0442\u044C\u0441\u044F.",
    remoteProgressTryingPrefix: "\u0421\u043F\u0440\u043E\u0431\u0430 ",
    remoteProgressUsingPrefix: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0454\u0442\u044C\u0441\u044F ",
    remoteProgressLoadingWorkspaces: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0440\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432",
    remoteProgressLoadingWorkspacesDetail: "\u0427\u0438\u0442\u0430\u043D\u043D\u044F \u0441\u043F\u0438\u0441\u043A\u0443 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0445 \u0440\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 Harness \u0447\u0435\u0440\u0435\u0437 \u0442\u0443\u043D\u0435\u043B\u044C.",
    remoteProgressSwitchingWorkspace: "\u041F\u0435\u0440\u0435\u043C\u0438\u043A\u0430\u043D\u043D\u044F \u0456\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0443",
    remoteProgressSwitchingWorkspaceDetail: "\u041F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u043D\u043D\u044F \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u043E\u0433\u043E \u0440\u043E\u0431\u043E\u0447\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0443 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0456\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0443 Harness.",
    remoteProgressReady: "\u0413\u043E\u0442\u043E\u0432\u043E",
    remoteProgressReadyDetail: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0445\u043E\u0441\u0442 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0435.",
    backToHosts: "\u0412\u0438\u0431\u0440\u0430\u0442\u0438 \u0456\u043D\u0448\u0438\u0439 \u0445\u043E\u0441\u0442",
    currentDirectory: "\u0412\u0438\u0431\u0440\u0430\u043D\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433",
    directoryTruncated: "\u0412\u0434\u0430\u043B\u043E\u0441\u044F \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u043B\u0438\u0448\u0435 \u0447\u0430\u0441\u0442\u0438\u043D\u0443 \u0446\u044C\u043E\u0433\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0443.",
    pluginVersion: "\u041F\u043B\u0430\u0433\u0456\u043D {version}",
    harnessVersion: "Harness {version}",
    updateAvailable: "\u2B06 \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0432\u0435\u0440\u0441\u0456\u044F Remote {latest} (\u043F\u043E\u0442\u043E\u0447\u043D\u0430 {current})",
    updateShort: "\u2B06 {version}",
    updateAvailableShort: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0430 {version}",
    pluginUpdating: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F\u2026",
    pluginUpdateReload: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F. Remote \u0431\u0443\u0434\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043E",
    pluginUpdateFailed: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043E\u043D\u043E\u0432\u0438\u0442\u0438",
    pluginUpdateUnknown: "\u0421\u0442\u0430\u043D \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043D\u0435\u0432\u0456\u0434\u043E\u043C\u0438\u0439, \u043D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C, \u0449\u043E\u0431 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0438",
    pluginUpdateManual: "\u0412\u0438\u043F\u0443\u0441\u043A\u0438",
    updateBadge: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F",
    updateAvailableTag: "\u2B06 \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F",
    existingWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 DSH",
    remotePathPlaceholder: "/home/user/project",
    remotePathHint: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u0430\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u0438\u0439 \u0448\u043B\u044F\u0445 \u0434\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0443 \u043D\u0430 \u0432\u0438\u0431\u0440\u0430\u043D\u043E\u043C\u0443 \u0445\u043E\u0441\u0442\u0456.",
    noRemoteWorkspaces: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0445 \u0440\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u0457\u0445 \u043A\u043D\u043E\u043F\u043A\u043E\u044E +.",
    activeRemote: "{name}",
    exitRemote: "\u0412\u0438\u0439\u0442\u0438",
    addRemoteWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440",
    addCodexWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 CodeX",
    addCursorWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Cursor",
    addAntigravityWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Antigravity",
    addPiWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Pi",
    addOpencodeWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 OpenCode",
    addClaudeWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Claude",
    addHermesWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Hermes",
    noCodexWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 CodeX \u0449\u0435 \u043D\u0435\u043C\u0430\u0454.",
    noCursorWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 Cursor \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0454\u043A\u0442\u0443, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438.",
    noAntigravityWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 Antigravity \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0454\u043A\u0442\u0443, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438.",
    noPiWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 Pi \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0454\u043A\u0442\u0443, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438.",
    noOpencodeWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 OpenCode \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0454\u043A\u0442\u0443, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438.",
    noClaudeWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 Claude \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0454\u043A\u0442\u0443, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438.",
    noHermesWorkspaces: "\u0420\u043E\u0431\u043E\u0447\u0438\u0445 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0456\u0432 Hermes \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u043E\u0454\u043A\u0442\u0443, \u0449\u043E\u0431 \u043F\u043E\u0447\u0430\u0442\u0438.",
    cancelAddWorkspace: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438",
    confirmAddWorkspace: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0439 \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438",
    showAllWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 DSH",
    showAllCodexWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 CodeX",
    showAllCursorWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 Cursor",
    showAllAntigravityWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 Antigravity",
    showAllPiWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 Pi",
    showAllOpencodeWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 OpenCode",
    showAllClaudeWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 Claude",
    showAllHermesWorkspaces: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438 Hermes",
    remoteModeLabel: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u0440\u0435\u0436\u0438\u043C \xB7 {name}",
    remoteNetworkP2p: "P2P",
    remoteNetworkTurn: "TURN",
    remoteNetworkRelay: "Relay",
    remoteNetworkLan: "LAN",
    remoteNetworkOffline: "\u0412\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    clientSignInAgain: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457 \u043C\u0438\u043D\u0443\u0432 \xB7 \u0423\u0432\u0456\u0439\u0442\u0438 \u0437\u043D\u043E\u0432\u0443",
    remoteLinkEncrypted: "\u041D\u0430\u0441\u043A\u0440\u0456\u0437\u043D\u0435 \u0448\u0438\u0444\u0440\u0443\u0432\u0430\u043D\u043D\u044F",
    connectionRouteTitle: "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F",
    connectionRouteFrom: "\u0417\u0432\u0456\u0434\u043A\u0438",
    connectionRouteVia: "\u0427\u0435\u0440\u0435\u0437",
    connectionRouteTo: "\u041A\u0443\u0434\u0438",
    connectionRouteCurrentDevice: "\u0426\u0435\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439",
    connectionRouteLan: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430 \u043C\u0435\u0440\u0435\u0436\u0430",
    connectionRouteP2p: "\u041F\u0440\u044F\u043C\u0435 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0447\u0435\u0440\u0435\u0437 \u0456\u043D\u0442\u0435\u0440\u043D\u0435\u0442",
    connectionRouteTurn: "\u0421\u0435\u0440\u0432\u0456\u0441 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0446\u0456\u0457 TURN",
    connectionRouteRelay: "\u0421\u0435\u0440\u0432\u0435\u0440 Remote",
    connectionRouteHost: "\u0420\u043E\u0431\u043E\u0447\u0438\u0439 \u043A\u043E\u043C\u043F\u02BC\u044E\u0442\u0435\u0440 \u0456\u0437 Harness",
    connectionRouteLanDetail: "\u041F\u0440\u044F\u043C\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443 \u043C\u0435\u0440\u0435\u0436\u0443",
    connectionRouteP2pDetail: "\u041F\u0440\u044F\u043C\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u0456\u043D\u0442\u0435\u0440\u043D\u0435\u0442",
    connectionRouteTurnDetail: "\u0417\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u0441\u0435\u0440\u0432\u0456\u0441 TURN",
    connectionRouteRelayDetail: "\u0417\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 \u0441\u0435\u0440\u0432\u0435\u0440 Remote",
    connectionRouteEncrypted: "\u041D\u0430 \u0432\u0441\u044C\u043E\u043C\u0443 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0456 \u0434\u0430\u043D\u0456 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043A\u0443 \u0437\u0430\u043B\u0438\u0448\u0430\u044E\u0442\u044C\u0441\u044F \u043D\u0430\u0441\u043A\u0440\u0456\u0437\u043D\u043E \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0438\u043C\u0438.",
    connectionDetailsConnection: "\u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F",
    connectionDetailsWebRtc: "\u0412\u0456\u0434\u043E\u043C\u043E\u0441\u0442\u0456 \u043F\u0440\u043E \u043C\u0435\u0440\u0435\u0436\u0443 \xB7 WebRTC / ICE",
    connectionId: "ID \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F",
    connectedAt: "\u0412\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    preferredTransports: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0441\u043F\u0440\u043E\u0431",
    controlChannel: "\u041A\u0430\u043D\u0430\u043B \u043A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F",
    controlAddress: "\u0410\u0434\u0440\u0435\u0441\u0430 \u043A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F",
    serverUnavailableError: "\u0421\u0435\u0440\u0432\u0456\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u0456\u0437\u043D\u0456\u0448\u0435.",
    connectionHoldCountdown: "\u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0441\u043F\u043B\u0438\u0432\u0430\u0454 \u0447\u0435\u0440\u0435\u0437 {seconds} \u0441",
    serverUnavailableCountdown: "\u0421\u0435\u0440\u0432\u0456\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \xB7 \u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0441\u043F\u043B\u0438\u0432\u0430\u0454 \u0447\u0435\u0440\u0435\u0437 {seconds} \u0441",
    unavailable: "\u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E",
    serverUnavailableShort: "\u0421\u0435\u0440\u0432\u0456\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439",
    serverUnavailable: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439. \u041F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F.",
    serverUnavailableConnected: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439. \u0417\u0432\u02BC\u044F\u0437\u043E\u043A \u043C\u0456\u0436 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044F\u043C\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u0438\u0439. \u041F\u0435\u0440\u0435\u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F.",
    serverLeaseExpiring: "\u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0441\u043F\u043B\u0438\u0432\u0430\u0454 \u0447\u0435\u0440\u0435\u0437 {seconds} \u0441.",
    serverRestored: "\u0421\u0435\u0440\u0432\u0435\u0440 \u0432\u0456\u0434\u043D\u043E\u0432\u043B\u0435\u043D\u043E.",
    serverLinkDisconnected: "\u0417\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0432\u0442\u0440\u0430\u0447\u0435\u043D\u043E.",
    controlStateConnecting: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F",
    controlStateOpen: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    controlStateClosing: "\u0417\u0430\u043A\u0440\u0438\u0442\u0442\u044F",
    controlStateClosed: "\u0417\u0430\u043A\u0440\u0438\u0442\u043E",
    peerState: "\u041E\u0434\u043D\u043E\u0440\u0430\u043D\u0433\u043E\u0432\u0435 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F",
    dataChannel: "DataChannel",
    localCandidate: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0438\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442",
    remoteCandidate: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0438\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442",
    localAddress: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u0430",
    remoteAddress: "\u0412\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u0430",
    networkProtocol: "\u041C\u0435\u0440\u0435\u0436\u0435\u0432\u0438\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B",
    relayProtocol: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B TURN",
    roundTripTime: "\u0417\u0430\u0442\u0440\u0438\u043C\u043A\u0430 \u0442\u0443\u0434\u0438 \u0439 \u043D\u0430\u0437\u0430\u0434",
    availableBitrate: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0432\u0438\u0445\u0456\u0434\u043D\u0430 \u0448\u0432\u0438\u0434\u043A\u0456\u0441\u0442\u044C",
    bytesSent: "\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E \u0431\u0430\u0439\u0442\u0456\u0432 WebRTC",
    bytesReceived: "\u041E\u0442\u0440\u0438\u043C\u0430\u043D\u043E \u0431\u0430\u0439\u0442\u0456\u0432 WebRTC",
    notProvided: "\u041D\u0435 \u043D\u0430\u0434\u0430\u043D\u043E",
    candidateHost: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u0430 \xB7 host",
    candidateSrflx: "\u041F\u0443\u0431\u043B\u0456\u0447\u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u0430 \xB7 srflx",
    candidatePrflx: "\u0410\u0434\u0440\u0435\u0441\u0430 \u0432\u0443\u0437\u043B\u0430 \xB7 prflx",
    candidateRelay: "\u0410\u0434\u0440\u0435\u0441\u0430 TURN \xB7 relay",
    openLocalWorkspaces: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0456 \u0440\u043E\u0431\u043E\u0447\u0456 \u043F\u0440\u043E\u0441\u0442\u043E\u0440\u0438",
    clientSignInHint: "\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0456, \u0449\u043E\u0431 \u043F\u043E\u0431\u0430\u0447\u0438\u0442\u0438 \u0441\u0432\u043E\u0457 \u0432\u0456\u0434\u0434\u0430\u043B\u0435\u043D\u0456 \u0445\u043E\u0441\u0442\u0438.",
    signInClient: "DS Harness Remote:",
    signInClientDescription: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0456\u0442\u044C\u0441\u044F \u043E\u0434\u0438\u043D \u0440\u0430\u0437. \u0414\u043E\u0441\u0442\u0443\u043F \u0431\u0443\u0434\u044C-\u043A\u043E\u043B\u0438.",
    startSignIn: "\u041F\u043E\u0447\u0430\u0442\u0438 \u0432\u0445\u0456\u0434",
    allowControlCurrentDevice: "\u0414\u043E\u0437\u0432\u043E\u043B\u0438\u0442\u0438 \u043A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F \u0446\u0438\u043C \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0454\u043C",
    allowControlDevice: "\u0414\u043E\u0437\u0432\u043E\u043B\u0438\u0442\u0438 \u043A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F \u0446\u0438\u043C \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0454\u043C",
    connectedClientCount: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E: {count}",
    checkAcp: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0431\u0435\u043A\u0435\u043D\u0434",
    checkingAcp: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 ACP\u2026",
    acpAvailable: "ACP \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439",
    acpUnavailable: "ACP \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439",
    agentBackends: "\u0406\u043D\u0448\u0456 \u0430\u0433\u0435\u043D\u0442\u0438 \u0434\u043B\u044F \u043A\u043E\u0434\u0443\u0432\u0430\u043D\u043D\u044F",
    acpDocumentation: "\u041E\u0437\u043D\u0430\u0439\u043E\u043C\u0442\u0435\u0441\u044F \u0437 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0456\u0454\u044E.",
    acpHint: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u0447\u0435\u0440\u0435\u0437 ACP. ",
    acpCheckPassed: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0443 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u043E",
    acpCheckFailed: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0443 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u043E",
    installOrConfigureAcp: "\u0412\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0438 / \u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u0442\u0438",
    configureAcp: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u0442\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E",
    installAcp: "\u0412\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0438 \u0439 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u0442\u0438",
    installingAcp: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u2026",
    acpConfiguredNotice: "\u0411\u0435\u043A\u0435\u043D\u0434 ACP \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u043D\u0430\u043B\u0430\u0448\u0442\u043E\u0432\u0430\u043D\u043E \u0439 \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E.",
    acpInstalledNotice: "\u0411\u0435\u043A\u0435\u043D\u0434 ACP \u0432\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0439 \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E.",
    acpDownloadRequired: "\u0421\u043F\u043E\u0447\u0430\u0442\u043A\u0443 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0442\u0435 \u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0456\u0442\u044C {backend}: {url}",
    addAcp: "\u0414\u043E\u0434\u0430\u0442\u0438 ACP",
    acpName: "\u041D\u0430\u0437\u0432\u0430 \u0441\u0435\u0440\u0432\u0456\u0441\u0443",
    acpCommand: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430",
    acpArguments: "\u0410\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u0438",
    removeAcp: "\u0412\u0438\u043B\u0443\u0447\u0438\u0442\u0438",
    currentConnectedDevices: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0456 \u0437\u0430\u0440\u0430\u0437 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457",
    noConnectedClients: "\u0417\u0430\u0440\u0430\u0437 \u0434\u043E \u0446\u044C\u043E\u0433\u043E \u0445\u043E\u0441\u0442\u0430 \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u0436\u043E\u0434\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E.",
    unknownDevice: "\u041D\u0435\u0432\u0456\u0434\u043E\u043C\u0438\u0439 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439",
    exitRemoteAccount: "\u0412\u0438\u0439\u0442\u0438",
    githubLogin: "Github",
    providerLogin: "{provider}",
    scanWithProvider: "\u0412\u0456\u0434\u0441\u043A\u0430\u043D\u0443\u0439\u0442\u0435, \u0449\u043E\u0431 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 {provider}",
    loadingLoginProviders: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0441\u043F\u043E\u0441\u043E\u0431\u0456\u0432 \u0432\u0445\u043E\u0434\u0443\u2026",
    retryLoginProviders: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0438 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0441\u043F\u043E\u0441\u043E\u0431\u0456\u0432 \u0432\u0445\u043E\u0434\u0443",
    serverApplied: "\u0410\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0437\u0430\u0441\u0442\u043E\u0441\u043E\u0432\u0430\u043D\u043E.",
    noLoginProviders: "\u0412\u0445\u0456\u0434 \u0447\u0435\u0440\u0435\u0437 QR-\u043A\u043E\u0434 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439. \u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435 \u0435\u043B. \u043F\u043E\u0448\u0442\u0443 \u0439 \u043F\u0430\u0440\u043E\u043B\u044C.",
    zhihuLogin: "Zhihu",
    scanWithGitHub: "\u0412\u0456\u0434\u0441\u043A\u0430\u043D\u0443\u0439\u0442\u0435, \u0449\u043E\u0431 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 GitHub",
    scanWithZhihu: "\u0412\u0456\u0434\u0441\u043A\u0430\u043D\u0443\u0439\u0442\u0435, \u0449\u043E\u0431 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Zhihu",
    openInBrowser: "\u041F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u0438 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0456",
    scanLoginHint: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435\u0441\u044F \u043D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0456. \u0426\u0435 \u0432\u0456\u043A\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u044C \u0440\u043E\u0431\u043E\u0442\u0443 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E.",
    currentServiceAddress: "\u0414\u043E\u043C\u0435\u043D \u0441\u0435\u0440\u0432\u0456\u0441\u0443 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u0457:",
    editServiceAddress: "\u0417\u043C\u0456\u043D\u0438\u0442\u0438 \u0430\u0434\u0440\u0435\u0441\u0443 \u0441\u0435\u0440\u0432\u0456\u0441\u0443",
    restoreDefaultServiceAddress: "\u0412\u0456\u0434\u043D\u043E\u0432\u0438\u0442\u0438 \u0442\u0438\u043F\u043E\u0432\u0443",
    cancelServiceAddressEdit: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438",
    accountPasswordLogin: "\u041F\u0430\u0440\u043E\u043B\u044C",
    qrLoginExpired: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0446\u044C\u043E\u0433\u043E QR-\u043A\u043E\u0434\u0443 \u043C\u0438\u043D\u0443\u0432. \u041E\u043D\u043E\u0432\u0456\u0442\u044C \u0439\u043E\u0433\u043E, \u0449\u043E\u0431 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0438\u0442\u0438.",
    refreshQrCode: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438 QR-\u043A\u043E\u0434",
    codexVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 CodeX",
    cursorVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Cursor",
    antigravityVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Antigravity",
    piVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Pi",
    opencodeVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 OpenCode",
    claudeVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Claude",
    hermesVirtualWorkspace: "\u0412\u0456\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0441\u0442\u0456\u0440 Hermes",
    codexVirtualSessions: "\u0421\u0435\u0441\u0456\u0457"
  };

  // packages/plugin/src/client/server-notice.ts
  function createServerNotice(React) {
    return function(props) {
      let { offline, linked, expiresAt, t } = props, wasOffline = React.useRef(!1), hadLink = React.useRef(linked), [restored, setRestored] = React.useState(!1), [now, setNow] = React.useState(Date.now());
      React.useEffect(() => {
        if (linked && (hadLink.current = !0), offline) {
          wasOffline.current = !0, setRestored(!1), setNow(Date.now());
          let timer2 = setInterval(() => setNow(Date.now()), 1e3);
          return () => clearInterval(timer2);
        }
        if (!wasOffline.current) return;
        wasOffline.current = !1, setRestored(!0);
        let timer = setTimeout(() => setRestored(!1), 4e3);
        return () => clearTimeout(timer);
      }, [offline, linked]);
      let seconds = expiresAt === void 0 ? void 0 : Math.max(0, Math.ceil((expiresAt - now) / 1e3)), lost = hadLink.current && (!linked || offline && seconds === 0), text = props.compact ? lost ? t("serverLinkDisconnected") : offline ? linked && seconds !== void 0 ? t("serverUnavailableCountdown", { seconds }) : t("serverUnavailableShort") : linked ? t("remoteLinkEncrypted") : void 0 : lost ? t("serverLinkDisconnected") : offline && linked && seconds !== void 0 ? t(props.countdownOnly ? "connectionHoldCountdown" : "serverUnavailableCountdown", { seconds }) : offline ? t("serverUnavailableShort") : restored ? t("serverRestored") : void 0;
      return text === void 0 ? null : React.createElement("span", {
        className: props.compact && !offline && !lost ? "dshRemoteEncrypted" : `dshRemoteServerNotice${lost ? " isError" : offline ? " isWarning" : " isRestored"}`,
        role: "status",
        "aria-live": "polite"
      }, text, lost && props.onReconnect ? React.createElement("button", {
        type: "button",
        onClick: props.onReconnect
      }, t("reconnect")) : null);
    };
  }

  // packages/plugin/src/client/presentation.ts
  var defaultPreferredTransports = ["lan", "p2p", "turn", "relay"];
  function normalizedPreferredTransports(value) {
    return value === void 0 || value.length === 0 ? [...defaultPreferredTransports] : [...value];
  }
  function formatLocalTime(value) {
    let date = new Date(value);
    return Number.isNaN(date.getTime()) ? "\u2014" : date.toLocaleString();
  }
  function formatByteSize(value) {
    if (value < 1024) return `${value.toLocaleString()} B`;
    let units = ["KiB", "MiB", "GiB"], amount = value, unit = "B";
    for (let nextUnit of units)
      if (amount /= 1024, unit = nextUnit, amount < 1024) break;
    return `${amount.toLocaleString(void 0, { maximumFractionDigits: 1 })} ${unit}`;
  }
  function formatBitrate(value) {
    let units = ["bit/s", "Kbit/s", "Mbit/s", "Gbit/s"], amount = value, unitIndex = 0;
    for (; amount >= 1e3 && unitIndex < units.length - 1; )
      amount /= 1e3, unitIndex += 1;
    return `${amount.toLocaleString(void 0, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
  }
  function shortDeviceId(value) {
    return value.length <= 14 ? value : `${value.slice(0, 8)}\u2026${value.slice(-4)}`;
  }
  function transportLabel(value, t) {
    return t(value === "lan" ? "remoteNetworkLan" : value === "p2p" ? "remoteNetworkP2p" : value === "turn" ? "remoteNetworkTurn" : "remoteNetworkRelay");
  }
  function transportDiagnosticLabel(value) {
    return value === "lan" ? "LAN" : value === "p2p" ? "P2P" : value === "turn" ? "TURN" : "Relay";
  }
  function transportProgressCopy(value) {
    return value === "lan" ? { label: "remoteProgressProbeLan", detail: "remoteProgressProbeLanDetail" } : value === "p2p" ? { label: "remoteProgressProbeP2p", detail: "remoteProgressProbeP2pDetail" } : value === "turn" ? { label: "remoteProgressProbeTurn", detail: "remoteProgressProbeTurnDetail" } : { label: "remoteProgressProbeRelay", detail: "remoteProgressProbeRelayDetail" };
  }
  function statusTransportPreference(status) {
    if (status?.transport === "LAN") return "lan";
    if (status?.transport === "P2P") return "p2p";
    if (status?.transport === "TURN") return "turn";
    if (status?.transport === "Relay") return "relay";
  }
  function connectedProgress(status) {
    let activeTransport = statusTransportPreference(status);
    if (activeTransport !== void 0)
      return {
        label: "remoteProgressReady",
        detail: "remoteProgressReadyDetail",
        percent: 100,
        transports: normalizedPreferredTransports(status?.preferredTransports),
        activeTransports: [activeTransport],
        routeVerb: "using"
      };
  }
  function loadingProgressPercent(elapsedMs) {
    return elapsedMs >= 6800 ? 96 : elapsedMs >= 3800 ? 93 : elapsedMs >= 1600 ? 89 : 84;
  }
  function observedConnectionProgress(status, targetDeviceId, preferredTransports, connectedStep, connectedAt) {
    let transports = normalizedPreferredTransports(status.preferredTransports ?? preferredTransports), connection = status.connectionProgress;
    if (connection?.targetDeviceId === targetDeviceId) {
      if (connection.phase === "checking-host")
        return { label: "remoteProgressCheckingHost", detail: "remoteProgressCheckingHostDetail", percent: 12 };
      if (connection.phase === "authorizing-peer")
        return { label: "remoteProgressAuthorizingPeer", detail: "remoteProgressAuthorizingPeerDetail", percent: 30 };
      let activeTransports = connection.activeTransports?.filter((transport) => transports.includes(transport)) ?? [];
      if (connection.phase === "probing") {
        let activeIndex = Math.max(0, ...activeTransports.map((transport) => transports.indexOf(transport)));
        return {
          ...activeTransports.length === 1 ? transportProgressCopy(activeTransports[0]) : { label: "remoteProgressOpeningChannel", detail: "remoteProgressOpeningChannelDetail" },
          percent: Math.min(76, 42 + activeIndex * 10),
          transports,
          activeTransports,
          routeVerb: "trying"
        };
      }
      return {
        ...connectedStep,
        percent: loadingProgressPercent(connectedAt === void 0 ? 0 : Date.now() - connectedAt),
        transports,
        activeTransports,
        routeVerb: "using"
      };
    }
    if (status.connectedTargetDeviceId !== targetDeviceId) return;
    let activeTransport = statusTransportPreference(status);
    return {
      ...connectedStep,
      percent: loadingProgressPercent(connectedAt === void 0 ? 0 : Date.now() - connectedAt),
      transports,
      ...activeTransport === void 0 ? {} : { activeTransports: [activeTransport], routeVerb: "using" }
    };
  }
  function connectionErrorMessage(code, t) {
    return t(code === "ACCOUNT_AUTH_REQUIRED" || code === "AUTH_REQUIRED" ? "hostSignInHint" : code === "AUTH_INVALID" || code === "TOKEN_EXPIRED" ? "connectionAuthorizationExpired" : code === "CONNECTION_REPLACED" ? "connectionReplaced" : code === "SERVER_CREDENTIALS_BUSY" ? "connectionCredentialsBusy" : code === "DEVICE_REVOKED" ? "connectionDeviceRevoked" : code === "DEVICE_OWNERSHIP_REQUIRED" ? "connectionOwnershipRequired" : code === "RATE_LIMITED" ? "connectionRateLimited" : code === "UNSUPPORTED_VERSION" ? "connectionVersionMismatch" : code === "INVALID_MESSAGE" ? "connectionInvalidResponse" : code === "CONNECTION_FAILED" ? "serverUnavailableError" : code === "SERVER_NOT_CONFIGURED" ? "connectionReachability" : "connectionUnexpected");
  }
  function connectionStatusLabel(status, t) {
    return status === void 0 ? t("checkingConnection") : status.online ? t("online") : status.error !== void 0 ? connectionErrorMessage(status.error, t) : status.reconnecting ? t(status.lastActiveAt === void 0 ? "connecting" : "serverUnavailableShort") : t("offline");
  }
  function connectionStatusClass(status) {
    return status?.online ? " isOnline" : status?.reconnecting ? " isReconnecting" : status === void 0 ? "" : " isOffline";
  }
  function startupErrorMessage(error, t) {
    return error.code === "IDENTITY_INVALID" ? t("identityCorrupted") : error.code === "SERVER_CREDENTIALS_INVALID" ? t("credentialsCorrupted") : error.code === "IDENTITY_LOCKED" ? t("identityLocked") : error.code === "STORAGE_CONFLICT" ? storageConflictMessage(error.message, t) : error.code === "SERVER_CREDENTIALS_BUSY" ? t("connectionCredentialsBusy") : error.message || t("remoteStartupFailed");
  }
  function storageConflictMessage(message, t) {
    let match = /^Remote storage ownership could not be verified; nothing was moved\. Inspect the legacy directory manually\. Unexpected entry "([A-Za-z0-9._-]{1,160})" was found\.$/.exec(message);
    return match === null ? t("storageConflict") : t("storageConflictEntry", { name: match[1] });
  }
  function messageOf(reason, t) {
    if (typeof reason == "object" && reason !== null && "code" in reason && typeof reason.code == "string") {
      if (reason.code === "CONNECTION_FAILED") return t("serverUnavailableError");
      if (reason.code === "IDENTITY_INVALID") return t("identityCorrupted");
      if (reason.code === "SERVER_CREDENTIALS_INVALID") return t("credentialsCorrupted");
      if (reason.code === "IDENTITY_LOCKED") return t("identityLocked");
      if (reason.code === "STORAGE_CONFLICT") {
        let message = "message" in reason && typeof reason.message == "string" ? reason.message : "";
        return storageConflictMessage(message, t);
      }
      if (reason.code === "SERVER_CREDENTIALS_BUSY") return t("connectionCredentialsBusy");
    }
    return reason instanceof Error ? reason.message : String(reason);
  }
  function formatPlatform(value) {
    let normalized = value.toLowerCase();
    return normalized === "darwin" || normalized === "macos" ? "macOS" : normalized === "win32" || normalized === "windows" ? "Windows" : normalized === "linux" ? "Linux" : normalized === "android" ? "Android" : value;
  }
  function connectedClientModeLabel(mode, t) {
    return t(mode === "LAN" ? "remoteNetworkLan" : mode === "P2P" ? "remoteNetworkP2p" : mode === "TURN" ? "remoteNetworkTurn" : mode === "Relay" ? "remoteNetworkRelay" : "connected");
  }
  function displayRemoteAccount(account) {
    return account.replace(/^device:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, "dsh-device:$1");
  }

  // packages/plugin/src/client/header.ts
  function createRemoteSessionHeaderAction(React, portal) {
    let ServerNotice = createServerNotice(React);
    function RemoteSessionHeaderAction(props) {
      let { t } = props, status = React.useSyncExternalStore(
        props.statusFeed.subscribe,
        props.statusFeed.getSnapshot,
        props.statusFeed.getSnapshot
      ), [busy, setBusy] = React.useState(!1), [routeOpen, setRouteOpen] = React.useState(!1), [hostReference, setHostReference] = React.useState(void 0);
      React.useEffect(() => {
        let onReference = (event) => {
          let detail = event.detail;
          detail === null || typeof detail != "object" || typeof detail.label != "string" || typeof detail.platform != "string" || typeof detail.deviceId != "string" || typeof detail.invocation != "string" || setHostReference(detail);
        };
        return window.addEventListener("dsh-remote-host-reference", onReference), () => window.removeEventListener("dsh-remote-host-reference", onReference);
      }, []), React.useEffect(() => {
        if (status?.mode === "remote")
          return hideLocalSessionActions();
      }, [status?.mode]), React.useEffect(() => (document.documentElement.classList.toggle(
        "dshRemoteCodexTargetActive",
        status?.mode === "remote" && status.backend === "codex"
      ), document.documentElement.classList.toggle(
        "dshRemoteCursorTargetActive",
        status?.mode === "remote" && status.backend === "cursor"
      ), document.documentElement.classList.toggle(
        "dshRemoteAntigravityTargetActive",
        status?.mode === "remote" && status.backend === "antigravity"
      ), document.documentElement.classList.toggle(
        "dshRemotePiTargetActive",
        status?.mode === "remote" && status.backend === "pi"
      ), document.documentElement.classList.toggle(
        "dshRemoteOpencodeTargetActive",
        status?.mode === "remote" && status.backend === "opencode"
      ), () => {
        document.documentElement.classList.remove("dshRemoteCodexTargetActive"), document.documentElement.classList.remove("dshRemoteCursorTargetActive"), document.documentElement.classList.remove("dshRemoteAntigravityTargetActive"), document.documentElement.classList.remove("dshRemotePiTargetActive"), document.documentElement.classList.remove("dshRemoteOpencodeTargetActive");
      }), [status?.mode, status?.backend]), React.useEffect(() => {
        if (!routeOpen) return;
        let closeOnEscape = (event) => {
          event.key === "Escape" && setRouteOpen(!1);
        };
        return document.addEventListener("keydown", closeOnEscape), () => document.removeEventListener("keydown", closeOnEscape);
      }, [routeOpen]);
      let renderHostReference = () => hostReference === void 0 ? null : renderBodyPortal(portal, React.createElement(
        "aside",
        { className: "dshRemoteHostReferencePanel", role: "dialog", "aria-label": "Remote Host" },
        React.createElement(
          "header",
          null,
          React.createElement("strong", null, "Remote Host"),
          React.createElement("button", { type: "button", "aria-label": t("close"), onClick: () => setHostReference(void 0) }, "\xD7")
        ),
        React.createElement(
          "dl",
          null,
          React.createElement("div", null, React.createElement("dt", null, t("hostReferenceName")), React.createElement("dd", null, hostReference.label)),
          React.createElement("div", null, React.createElement("dt", null, t("hostReferenceSystem")), React.createElement("dd", null, hostReference.platform)),
          React.createElement("div", null, React.createElement("dt", null, t("hostReferenceDeviceId")), React.createElement("dd", { className: "isMono" }, hostReference.deviceId)),
          React.createElement("div", null, React.createElement("dt", null, t("hostReferenceInvocation")), React.createElement("dd", { className: "isMono" }, hostReference.invocation))
        )
      ));
      if (status?.mode !== "remote") return renderHostReference();
      let exit = async () => {
        setBusy(!0);
        try {
          await props.control("mode.set", { mode: "local" }), window.location.reload();
        } finally {
          setBusy(!1);
        }
      }, transport = status.network?.webRtc?.mode ?? status.transport ?? "Disconnected", networkLabel = t(transport === "P2P" ? "remoteNetworkP2p" : transport === "TURN" ? "remoteNetworkTurn" : transport === "Relay" ? "remoteNetworkRelay" : transport === "LAN" ? "remoteNetworkLan" : "remoteNetworkOffline"), networkOnline = status.connected === !0 && transport !== "Disconnected", routeVia = t(transport === "P2P" ? "connectionRouteP2p" : transport === "TURN" ? "connectionRouteTurn" : transport === "Relay" ? "connectionRouteRelay" : "connectionRouteLan"), routeViaDetail = t(transport === "P2P" ? "connectionRouteP2pDetail" : transport === "TURN" ? "connectionRouteTurnDetail" : transport === "Relay" ? "connectionRouteRelayDetail" : "connectionRouteLanDetail"), network = status.network, webRtc = network?.webRtc, controlStateLabel = network?.controlChannelState === "connecting" ? t("controlStateConnecting") : network?.controlChannelState === "open" ? t("controlStateOpen") : network?.controlChannelState === "closing" ? t("controlStateClosing") : t("controlStateClosed"), detailValue = (value) => value === void 0 || value === "" ? t("notProvided") : String(value), candidateLabel = (value) => value === "host" ? t("candidateHost") : value === "srflx" ? t("candidateSrflx") : value === "prflx" ? t("candidatePrflx") : value === "relay" ? t("candidateRelay") : detailValue(value), fact = (label, value, mono = !1) => React.createElement(
        "div",
        null,
        React.createElement("dt", null, label),
        React.createElement("dd", { className: mono ? "isMono" : void 0, title: mono ? value : void 0 }, value)
      );
      return React.createElement(
        "div",
        { className: "dshRemoteSessionHeader", role: "status" },
        React.createElement("svg", {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": !0
        }, React.createElement("rect", { x: 3, y: 4, width: 18, height: 13, rx: 2 }), React.createElement("path", { d: "M8 21h8M12 17v4" })),
        React.createElement("span", { className: "dshRemoteSessionTarget" }, t("remoteModeLabel", { name: status.target?.name ?? t("host") })),
        status.clientAuthRequired ? React.createElement("button", {
          type: "button",
          className: "dshRemoteNetwork isOffline",
          onClick: props.onSignIn
        }, t("clientSignInAgain")) : React.createElement("button", {
          type: "button",
          className: `dshRemoteNetwork${networkOnline ? " isOnline" : " isOffline"}`,
          title: networkLabel,
          "aria-haspopup": "dialog",
          "aria-expanded": routeOpen,
          onClick: () => setRouteOpen((value) => !value)
        }, React.createElement("i", { "aria-hidden": !0 }), networkLabel),
        React.createElement(ServerNotice, {
          compact: !0,
          offline: network !== void 0 && network.controlChannelState !== "open",
          linked: networkOnline,
          expiresAt: network?.recoveryExpiresAt,
          t
        }),
        renderHostReference(),
        React.createElement("button", { type: "button", className: "dshRemoteHeaderExitLink", disabled: busy, onClick: () => void exit() }, t("exitRemote")),
        !routeOpen || !networkOnline ? null : renderBodyPortal(portal, React.createElement("div", {
          className: "dshRemoteRouteBackdrop",
          role: "presentation",
          onMouseDown: (event) => {
            event.target === event.currentTarget && setRouteOpen(!1);
          }
        }, React.createElement(
          "section",
          {
            className: "dshRemoteRoutePanel",
            role: "dialog",
            "aria-label": t("connectionRouteTitle")
          },
          React.createElement(
            "header",
            null,
            React.createElement("strong", null, t("connectionRouteTitle")),
            React.createElement("button", { type: "button", "aria-label": t("close"), onClick: () => setRouteOpen(!1) }, "\xD7")
          ),
          React.createElement(ServerNotice, {
            offline: network !== void 0 && network.controlChannelState !== "open",
            linked: networkOnline,
            expiresAt: network?.recoveryExpiresAt,
            t,
            onReconnect: () => {
              props.control("mode.set", { mode: "remote", targetDeviceId: status.target?.deviceId }).catch(() => {
              });
            }
          }),
          React.createElement(
            "ol",
            null,
            React.createElement(
              "li",
              null,
              React.createElement("small", null, t("connectionRouteFrom")),
              React.createElement("strong", null, network?.local.name ?? t("connectionRouteCurrentDevice")),
              network === void 0 ? null : React.createElement("span", null, `${network.local.platform} \xB7 ${shortDeviceId(network.local.deviceId)}`)
            ),
            React.createElement(
              "li",
              null,
              React.createElement("small", null, t("connectionRouteVia")),
              React.createElement("strong", null, routeVia),
              React.createElement("span", null, routeViaDetail)
            ),
            React.createElement(
              "li",
              null,
              React.createElement("small", null, t("connectionRouteTo")),
              React.createElement("strong", null, network?.remote.name ?? status.target?.name ?? t("host")),
              React.createElement("span", null, network === void 0 ? t("connectionRouteHost") : `${network.remote.platform} \xB7 ${shortDeviceId(network.remote.deviceId)}`)
            )
          ),
          network === void 0 ? null : React.createElement(
            "section",
            { className: "dshRemoteRouteSection" },
            React.createElement("h3", null, t("connectionDetailsConnection")),
            React.createElement(
              "dl",
              null,
              fact(t("connectionId"), detailValue(network.connectionId), !0),
              fact(t("connectedAt"), network.connectedAt === void 0 ? t("notProvided") : formatLocalTime(network.connectedAt)),
              fact(t("preferredTransports"), network.preferredTransports.map((value) => transportLabel(value, t)).join(" \u2192 ")),
              fact(t("controlChannel"), `WebSocket \xB7 ${controlStateLabel}`),
              fact(t("controlAddress"), network.controlChannelUrl, !0)
            )
          ),
          webRtc === void 0 ? null : React.createElement(
            "section",
            { className: "dshRemoteRouteSection" },
            React.createElement("h3", null, t("connectionDetailsWebRtc")),
            React.createElement(
              "dl",
              null,
              fact(t("peerState"), `${webRtc.connectionState} \xB7 ICE ${webRtc.iceConnectionState}`),
              fact(t("dataChannel"), detailValue(webRtc.dataChannelState)),
              fact(t("localCandidate"), candidateLabel(webRtc.localCandidateType)),
              fact(t("remoteCandidate"), candidateLabel(webRtc.remoteCandidateType)),
              fact(t("localAddress"), detailValue(webRtc.localAddress), !0),
              fact(t("remoteAddress"), detailValue(webRtc.remoteAddress), !0),
              fact(t("networkProtocol"), detailValue(webRtc.protocol?.toUpperCase())),
              fact(t("relayProtocol"), detailValue(webRtc.relayProtocol?.toUpperCase())),
              fact(t("roundTripTime"), webRtc.currentRoundTripTimeMs === void 0 ? t("notProvided") : `${webRtc.currentRoundTripTimeMs.toLocaleString()} ms`),
              fact(t("availableBitrate"), webRtc.availableOutgoingBitrate === void 0 ? t("notProvided") : formatBitrate(webRtc.availableOutgoingBitrate)),
              fact(t("bytesSent"), webRtc.bytesSent === void 0 ? t("notProvided") : formatByteSize(webRtc.bytesSent)),
              fact(t("bytesReceived"), webRtc.bytesReceived === void 0 ? t("notProvided") : formatByteSize(webRtc.bytesReceived))
            )
          ),
          React.createElement("p", null, t("connectionRouteEncrypted"))
        )))
      );
    }
    return RemoteSessionHeaderAction;
  }
  function hideLocalSessionActions() {
    let selector = 'button,a,[role="button"]', hiddenAttribute = "data-dsh-remote-hidden-action", localAction = /(?:open|打开).{0,12}vs\s*code|vs\s*code.{0,12}(?:open|打开)|session\s*logs?|download.{0,12}session\s*logs?|会话日志|下载.{0,8}日志/i, inspect = (root) => {
      let candidates = root instanceof Element && root.matches(selector) ? [root, ...Array.from(root.querySelectorAll(selector))] : Array.from(root.querySelectorAll(selector));
      for (let candidate of candidates) {
        if (candidate.closest(".dshRemoteSessionHeader") !== null) continue;
        let label = [
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("title"),
          candidate.getAttribute("data-tooltip"),
          candidate.textContent
        ].filter(Boolean).join(" ");
        localAction.test(label) && candidate.setAttribute(hiddenAttribute, "");
      }
    };
    inspect(document.body);
    let observer = new MutationObserver((records) => {
      for (let record of records) {
        record.type === "attributes" && inspect(record.target);
        for (let node of Array.from(record.addedNodes))
          node instanceof Element && inspect(node);
      }
    });
    return observer.observe(document.body, {
      subtree: !0,
      childList: !0,
      attributes: !0,
      attributeFilter: ["aria-label", "title", "data-tooltip"]
    }), () => {
      observer.disconnect(), document.querySelectorAll(`[${hiddenAttribute}]`).forEach((element) => element.removeAttribute(hiddenAttribute));
    };
  }

  // packages/plugin/src/client/control-result.ts
  function unwrapControlResult(result, fallbackMessage) {
    if (!result.ok) {
      let remoteCode = result.error?.details?.remoteCode;
      throw Object.assign(new Error(result.error?.message ?? fallbackMessage), {
        code: typeof remoteCode == "string" ? remoteCode : result.error?.code,
        details: result.error?.details
      });
    }
    return result.value;
  }

  // packages/plugin/src/client/navigation.ts
  var pendingWorkspaceSelectionKey = "dsh-remote:pending-workspace-selection";
  function storedWorkspaceSelection() {
    let raw = window.sessionStorage.getItem(pendingWorkspaceSelectionKey);
    if (raw !== null)
      try {
        let value = JSON.parse(raw);
        if (typeof value.targetDeviceId != "string" || typeof value.workspaceId != "string") throw new Error("invalid");
        if (value.backend !== void 0 && value.backend !== "harness" && value.backend !== "codex" && value.backend !== "cursor" && value.backend !== "antigravity" && value.backend !== "pi" && value.backend !== "claude" && value.backend !== "opencode" && value.backend !== "hermes") throw new Error("invalid");
        if (value.sessionId !== void 0 && typeof value.sessionId != "string") throw new Error("invalid");
        return value;
      } catch {
        window.sessionStorage.removeItem(pendingWorkspaceSelectionKey);
        return;
      }
  }
  function workspacesReady(snapshot) {
    return snapshot.baselinesReady === !0 || snapshot.phase === "ready";
  }

  // packages/plugin/src/client/progress.ts
  function createRemoteProgressView(React) {
    function RemoteProgressView(props) {
      let progress = props.progress;
      if (progress === void 0) return null;
      let percent = Math.max(0, Math.min(100, Math.round(progress.percent))), activeTransports = new Set(progress.activeTransports ?? []), detail = progress.transports !== void 0 && activeTransports.size > 0 ? React.createElement(
        "span",
        { className: "dshRemoteProgressRoute" },
        props.t(progress.routeVerb === "using" ? "remoteProgressUsingPrefix" : "remoteProgressTryingPrefix"),
        progress.transports.map((transport, index) => React.createElement(
          React.Fragment,
          { key: `${transport}:${index}` },
          index === 0 ? null : React.createElement("span", { className: "dshRemoteProgressRouteArrow", "aria-hidden": !0 }, " -> "),
          React.createElement("span", {
            className: activeTransports.has(transport) ? "isActive" : void 0
          }, transportDiagnosticLabel(transport))
        ))
      ) : props.t(progress.detail);
      return React.createElement(
        "div",
        {
          className: "dshRemoteProgress",
          role: "status",
          "aria-live": "polite"
        },
        React.createElement(
          "div",
          { className: "dshRemoteProgressHeader" },
          React.createElement("strong", null, props.t(progress.label)),
          React.createElement(
            "span",
            { className: "dshRemoteProgressStatus" },
            React.createElement("span", { className: "dshRemoteLoginSpinner", "aria-hidden": !0 }),
            `${percent}%`
          )
        ),
        React.createElement("p", null, detail),
        React.createElement("div", {
          className: "dshRemoteProgressBar",
          role: "progressbar",
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": percent,
          "aria-label": props.t(progress.label)
        }, React.createElement("span", { style: { transform: `scaleX(${percent / 100})` } }))
      );
    }
    return RemoteProgressView;
  }
  async function runConnectHostProgress(preferredTransports, targetDeviceId, control, connectedStep, setProgress, progressRun, action, readyProgress) {
    let runId = progressRun.current + 1;
    progressRun.current = runId;
    let polling = !0, pollTimer, connectedAt, apply = (next) => {
      progressRun.current === runId && setProgress(next);
    }, poll = async () => {
      try {
        let status = await control("status");
        if (!polling || progressRun.current !== runId) return;
        (status.connectionProgress?.phase === "connected" || status.connectedTargetDeviceId === targetDeviceId) && connectedAt === void 0 && (connectedAt = Date.now());
        let next = observedConnectionProgress(status, targetDeviceId, preferredTransports, connectedStep, connectedAt);
        next !== void 0 && apply(next);
      } catch {
      } finally {
        polling && progressRun.current === runId && (pollTimer = window.setTimeout(() => {
          poll();
        }, 300));
      }
    };
    apply({ label: "remoteProgressCheckingHost", detail: "remoteProgressCheckingHostDetail", percent: 12 });
    let pending = action();
    poll();
    try {
      let result = await pending;
      return polling = !1, pollTimer !== void 0 && window.clearTimeout(pollTimer), apply(readyProgress?.(result) ?? { label: "remoteProgressReady", detail: "remoteProgressReadyDetail", percent: 100 }), await new Promise((resolve) => window.setTimeout(resolve, 520)), result;
    } finally {
      polling = !1, pollTimer !== void 0 && window.clearTimeout(pollTimer), progressRun.current === runId && setProgress(void 0);
    }
  }

  // packages/plugin/src/client/pairing.ts
  var import_qrcode = __toESM(require_browser(), 1);
  function createHostPairingPanel(React) {
    return function(props) {
      let { t } = props, [view, setView] = React.useState(void 0), [image, setImage] = React.useState(void 0), [now, setNow] = React.useState(Date.now()), [code, setCode] = React.useState(""), [busy, setBusy] = React.useState(!1), [locked, setLocked] = React.useState(!1), [error, setError] = React.useState(void 0), mounted = React.useRef(!1), flight = React.useRef(!1), attempts = React.useRef(/* @__PURE__ */ new Set()), completed = React.useRef(void 0), completion = React.useRef(props.onComplete);
      completion.current = props.onComplete;
      let apply = (next) => {
        mounted.current && (next && !["created", "claimed", "approved"].includes(next.state) && attempts.current.delete(next.sessionId), setView(next), setLocked(next?.canRetry === !0 || next !== void 0 && attempts.current.has(next.sessionId)), next?.localSaved && completed.current !== next.sessionId && (completed.current = next.sessionId, completion.current()));
      };
      React.useEffect(() => {
        mounted.current = !0;
        let timer, poll = async () => {
          if (!flight.current && !props.disabled && props.serverUrl)
            try {
              apply(await props.control("host.pairing.status"));
            } catch {
            }
          mounted.current && (timer = setTimeout(() => void poll(), 2500));
        };
        return poll(), () => {
          mounted.current = !1, timer && clearTimeout(timer);
        };
      }, [props.serverUrl, props.disabled]), React.useEffect(() => {
        let current = !0;
        return setImage(void 0), view?.qrPayload && import_qrcode.default.toDataURL(view.qrPayload, { width: 184, margin: 1, errorCorrectionLevel: "L" }).then((value) => {
          current && setImage(value);
        }).catch(() => {
          current && setError(t("pairingError"));
        }), () => {
          current = !1;
        };
      }, [view?.qrPayload]);
      let run = async (action, retry2 = !1) => {
        if (!flight.current) {
          flight.current = !0, setBusy(!0), setError(void 0), action === "confirm" && (view && attempts.current.add(view.sessionId), setLocked(!0), setCode(""));
          try {
            apply(await props.control("host.pairing." + action, action === "start" ? {} : {
              sessionId: view?.sessionId,
              ...action === "confirm" && !retry2 ? { verificationCode: code } : {}
            }));
          } catch (reason) {
            if (mounted.current) {
              let e = reason;
              setError(t(e.code === "PAIRING_UNSUPPORTED" || e.details?.remoteCode === "PAIRING_UNSUPPORTED" ? "pairingUnsupported" : "pairingError"));
            }
          } finally {
            flight.current = !1, mounted.current && setBusy(!1);
          }
        }
      }, active = view !== void 0 && ["created", "claimed", "approved"].includes(view.state);
      React.useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        let timer = setInterval(() => setNow(Date.now()), 1e3);
        return () => clearInterval(timer);
      }, [active, view?.expiresAt]);
      let remaining = view === void 0 ? 0 : Math.max(0, Math.ceil((new Date(view.expiresAt).getTime() - now) / 1e3)), remainingText = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`, retry = locked || view?.canRetry || view?.state === "approved", status = view === void 0 ? "pairingHint" : view.state === "created" ? "pairingScan" : view.state === "claimed" ? "pairingEnter" : view.state === "completed" ? "pairingComplete" : view.state === "approved" ? "pairingPending" : "pairingClosed", instructionLines = t(status).split(`
`), countdown = active ? React.createElement("span", { className: "dshRemotePairingCountdown", role: "timer" }, remaining > 0 ? t("pairingExpires", { time: remainingText }) : t("pairingExpired")) : null;
      return React.createElement(
        "section",
        { className: "dshRemotePairing", "aria-label": t("pairingTitle") },
        React.createElement(
          "div",
          { className: "dshRemotePairingHeading" },
          React.createElement("p", { role: "status", "aria-live": "polite", className: "dshRemotePairingInstructions" }, ...instructionLines.flatMap((line, lineIndex) => [React.createElement("span", { key: lineIndex, className: lineIndex === 0 ? "dshRemotePairingInstructionPrimary" : "dshRemotePairingInstructionSecondary" }, ...line.split("DSH Go").flatMap((part, index) => index === 0 ? [part] : [React.createElement("a", { key: index, href: "https://github.com/ccch1mneyyy/dsh-go", target: "_blank", rel: "noopener noreferrer" }, "DSH Go"), part])), lineIndex < instructionLines.length - 1 ? React.createElement("br", { key: `break-${lineIndex}` }) : null])),
          active && view?.state !== "created" ? countdown : null
        ),
        props.disabled ? React.createElement("p", null, t("pairingSaveServer")) : null,
        image === void 0 ? null : React.createElement("img", { src: image, width: 200, height: 200, alt: t("pairingQr"), className: "dshRemotePairingQr" }),
        view?.state !== "created" ? null : React.createElement(
          "div",
          { className: "dshRemotePairingQrActions" },
          countdown,
          React.createElement("button", {
            type: "button",
            className: "dshRemoteDiscard",
            disabled: busy || props.disabled,
            onClick: () => void run("cancel")
          }, t(busy ? "pairingBusy" : "pairingCancel"))
        ),
        view?.mobile === void 0 ? null : React.createElement("p", { className: "dshRemotePairingIdentity" }, React.createElement("strong", null, view.mobile.name), React.createElement("br"), React.createElement("code", null, view.mobile.fingerprint)),
        view?.state !== "claimed" || retry ? null : React.createElement(
          "form",
          { className: "dshRemotePairingCodeForm", onSubmit: (event) => {
            event.preventDefault(), event.nativeEvent?.isTrusted && /^[0-9]{8}$/.test(code) && run("confirm");
          } },
          React.createElement("label", null, t("pairingCode"), React.createElement("input", {
            type: "text",
            inputMode: "numeric",
            autoComplete: "off",
            pattern: "[0-9]{8}",
            maxLength: 8,
            value: code,
            disabled: busy,
            onChange: (event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 8))
          })),
          React.createElement("p", { className: "dshRemotePairingCodeWarning" }, t("pairingWarning")),
          React.createElement("div", { className: "dshRemotePairingCodeActions" }, React.createElement("button", { type: "submit", className: "dshRemoteSave", disabled: busy || props.disabled || !/^[0-9]{8}$/.test(code) }, t("pairingConfirm")), React.createElement("button", { type: "button", className: "dshRemoteDiscard", disabled: busy || props.disabled, onClick: () => void run("cancel") }, t("pairingCancel")))
        ),
        error === void 0 ? null : React.createElement("p", { role: "alert", className: "dshRemoteError" }, error),
        React.createElement(
          "div",
          { className: "dshRemotePairingActions" },
          active && retry ? React.createElement("button", {
            type: "button",
            disabled: busy || props.disabled,
            className: "dshRemoteSave",
            onClick: (event) => {
              event.nativeEvent?.isTrusted && run("confirm", !0);
            }
          }, t("pairingRetry")) : null,
          active && retry ? React.createElement("button", { type: "button", className: "dshRemoteDiscard", disabled: busy || props.disabled, onClick: () => void run("cancel") }, t("pairingCancel")) : null,
          active || view?.state === "completed" ? null : React.createElement("button", {
            type: "button",
            className: "dshRemoteSave",
            disabled: busy || props.disabled || !props.serverUrl,
            onClick: () => void run(active ? "cancel" : "start")
          }, t(busy ? "pairingBusy" : active ? "pairingCancel" : "pairingStart"))
        )
      );
    };
  }

  // packages/plugin/src/client/settings.ts
  var import_qrcode2 = __toESM(require_browser(), 1);
  var sidebarEntryChoices = [
    { value: "standard", label: "sidebarEntryStandard" },
    { value: "compact", label: "sidebarEntryCompact" }
  ];
  function createRemotePluginOptions(React) {
    let ServerNotice = createServerNotice(React), HostPairingPanel = createHostPairingPanel(React);
    function RemotePluginOptions(props) {
      let { t } = props, subscribeStatus = typeof props.statusFeed?.subscribe == "function" ? props.statusFeed.subscribe : () => () => {
      }, getStatusSnapshot = typeof props.statusFeed?.getSnapshot == "function" ? props.statusFeed.getSnapshot : () => {
      }, modeStatus = React.useSyncExternalStore(
        subscribeStatus,
        getStatusSnapshot,
        getStatusSnapshot
      ), [open, setOpen] = React.useState(props.view === "page"), [serverUrl, setServerUrl] = React.useState(""), [savingServer, setSavingServer] = React.useState(!1), [editingServer, setEditingServer] = React.useState(!1), serverDraftEdited = React.useRef(!1), [remoteToolsBusy, setRemoteToolsBusy] = React.useState(!1), [remoteToolsEnabled, setRemoteToolsEnabled] = React.useState(!0), [associations, setAssociations] = React.useState({}), [loaded, setLoaded] = React.useState(!1), [writable, setWritable] = React.useState(!1), [busy, setBusy] = React.useState(!1), [terminalEnabled, setTerminalEnabled] = React.useState(!1), [debugBusy, setDebugBusy] = React.useState(!1), [debugLogging, setDebugLogging] = React.useState(!1), [logsOpen, setLogsOpen] = React.useState(!1), [logsFilter, setLogsFilter] = React.useState("all"), [logsLoading, setLogsLoading] = React.useState(!1), [logsClearing, setLogsClearing] = React.useState(!1), [logsSnapshot, setLogsSnapshot] = React.useState(void 0), [logsError, setLogsError] = React.useState(void 0), [logsCopyState, setLogsCopyState] = React.useState("idle"), logsRequestRun = React.useRef(0), logsCopyTimer = React.useRef(void 0), logsViewportRef = React.useRef(null), [resetBusy, setResetBusy] = React.useState(!1), [retryStartupBusy, setRetryStartupBusy] = React.useState(!1), [terminalBusy, setTerminalBusy] = React.useState(!1), [sidebarEntry, setSidebarEntry] = React.useState(() => props.sidebarEntry?.read?.() ?? "standard"), [sidebarEntryBusy, setSidebarEntryBusy] = React.useState(!1), [acpBackends, setAcpBackends] = React.useState([]), [acpAvailability, setAcpAvailability] = React.useState({}), [acpChecking, setAcpChecking] = React.useState({}), [acpInstalling, setAcpInstalling] = React.useState({}), [acpCheckResults, setAcpCheckResults] = React.useState({}), [reconnectBusy, setReconnectBusy] = React.useState(!1), [hostStatus, setHostStatus] = React.useState(void 0), [hostName, setHostName] = React.useState(""), [hostDeviceId, setHostDeviceId] = React.useState(""), [notice, setNotice] = React.useState(void 0), [error, setError] = React.useState(void 0), [settingsView, setSettingsView] = React.useState(void 0), [signInOpen, setSignInOpen] = React.useState(!1), [loginEmail, setLoginEmail] = React.useState(""), [loginPassword, setLoginPassword] = React.useState(""), [loginMethod, setLoginMethod] = React.useState("password"), [oauthProviders, setOAuthProviders] = React.useState([]), [providersLoading, setProvidersLoading] = React.useState(!1), [providersFailed, setProvidersFailed] = React.useState(!1), [pairingServerUrl, setPairingServerUrl] = React.useState(void 0), [qrSession, setQrSession] = React.useState(void 0), [qrImage, setQrImage] = React.useState(void 0), [qrExpired, setQrExpired] = React.useState(!1), [qrFailed, setQrFailed] = React.useState(!1), [qrBusy, setQrBusy] = React.useState(!1), [qrCompleted, setQrCompleted] = React.useState(!1), [providerReload, setProviderReload] = React.useState(0), [completionReload, setCompletionReload] = React.useState(0), qrFlowRun = React.useRef(0), providerRequestRun = React.useRef(0), loginMethodManuallySelected = React.useRef(!1), associationReadRun = React.useRef(0), association = associations.client ?? associations.host;
      React.useEffect(() => {
        association !== void 0 && setSignInOpen(!1);
      }, [association]);
      let savedServerUrl = settingsView?.config.serverUrl, pairingAvailable = pairingServerUrl !== void 0 && pairingServerUrl === savedServerUrl, serverDirty = savedServerUrl === void 0 || serverUrl.trim() !== savedServerUrl;
      React.useEffect(() => {
        setPairingServerUrl(void 0), setLoginMethod((current) => current === "device_pairing" ? "password" : current);
      }, [savedServerUrl]);
      let applyAssociations = (view) => {
        setAssociations(view.associations ?? (view.association === void 0 ? {} : { host: view.association }));
      }, applyView = (view, updateAssociations = !0) => {
        setSettingsView(view), serverDraftEdited.current || setServerUrl(view.config.serverUrl ?? "https://dsh.r2049.cn"), setTerminalEnabled(view.config.terminal?.enabled ?? !0), setDebugLogging(view.config.logLevel === "debug"), setRemoteToolsEnabled(view.config.remoteTools?.enabled ?? !0), setSidebarEntry(view.config.sidebar?.entry ?? "standard"), props.sidebarEntry?.publish(view.config.sidebar?.entry ?? "standard"), setAcpBackends((view.config.acp?.backends ?? []).map((item) => ({ id: item.id, enabled: item.enabled !== !1 }))), setAcpAvailability(view.acpAvailability ?? {}), updateAssociations && applyAssociations(view), setWritable(view.writable), setLoaded(!0);
      }, load = async () => {
        let run = ++associationReadRun.current, [view, status] = await Promise.all([
          props.control("settings.get"),
          props.control("status").catch(() => {
          })
        ]);
        applyView(view, run === associationReadRun.current), setHostStatus(status?.host), setHostName(status?.deviceName ?? ""), setHostDeviceId(status?.host?.deviceId ?? "");
      };
      React.useEffect(() => {
        load().catch((reason) => setError(messageOf(reason, t)));
      }, []), React.useEffect(() => {
        let active = !0, authorizationKey, unsubscribe = props.statusFeed.subscribe((status) => {
          setHostStatus(status.host), setHostName(status.deviceName ?? ""), setHostDeviceId(status.host?.deviceId ?? "");
          let key = JSON.stringify([
            status.serverUrl,
            status.deviceId,
            status.host?.deviceId,
            status.host?.authorized,
            status.host?.account,
            status.startupError?.code
          ]);
          if (key === authorizationKey) return;
          authorizationKey = key;
          let run = ++associationReadRun.current;
          props.control("settings.get").then((view) => {
            active && run === associationReadRun.current && applyView(view);
          }).catch(() => {
          });
        });
        return () => {
          active = !1, unsubscribe();
        };
      }, [props.statusFeed]), React.useEffect(() => {
        if (!signInOpen || savingServer || serverDirty) return;
        let active = !0, run = ++providerRequestRun.current;
        return qrFlowRun.current += 1, setQrSession(void 0), setQrImage(void 0), setQrExpired(!1), setQrFailed(!1), setQrBusy(!1), setQrCompleted(!1), setOAuthProviders([]), setProvidersLoading(!0), setProvidersFailed(!1), props.control("client.account.providers").then((items) => {
          if (!active || run !== providerRequestRun.current) return;
          let pairingSupported = items.some((item) => item.devicePairing === !0);
          setPairingServerUrl(pairingSupported ? savedServerUrl : void 0);
          let available = items.filter((item) => item.qrStartUrl != null);
          setOAuthProviders(available), setLoginMethod((current) => {
            if (loginMethodManuallySelected.current && (current === "password" || current === "device_pairing" && pairingSupported || available.some((item) => `oauth:${item.id}` === current))) return current;
            let preferred = available.find((item) => item.id === props.preferredQrProvider) ?? available[0];
            return preferred === void 0 ? "password" : `oauth:${preferred.id}`;
          });
        }).catch(() => {
          !active || run !== providerRequestRun.current || (setProvidersFailed(!0), setLoginMethod((current) => loginMethodManuallySelected.current && current === "device_pairing" ? current : "password"));
        }).finally(() => {
          active && run === providerRequestRun.current && setProvidersLoading(!1);
        }), () => {
          active = !1;
        };
      }, [signInOpen, props.preferredQrProvider, providerReload, savingServer, serverDirty, savedServerUrl]), React.useEffect(() => {
        if (!signInOpen || savingServer || serverDirty || providersLoading || !loginMethod.startsWith("oauth:") || !oauthProviders.some((item) => `oauth:${item.id}` === loginMethod) || qrSession !== void 0 || qrExpired || qrFailed || qrCompleted) return;
        let active = !0, run = ++qrFlowRun.current;
        return setQrBusy(!0), setQrFailed(!1), setError(void 0), setQrExpired(!1), props.control("client.account.qr.start", { provider: loginMethod.slice(6) }).then(async (session) => {
          if (!active || run !== qrFlowRun.current) return;
          let image = await import_qrcode2.default.toDataURL(session.scanUrl, {
            width: 184,
            margin: 1,
            errorCorrectionLevel: "L"
          });
          !active || run !== qrFlowRun.current || (setQrSession(session), setQrImage(image));
        }).catch((reason) => {
          !active || run !== qrFlowRun.current || (setQrFailed(!0), setError(messageOf(reason, t)));
        }).finally(() => {
          active && run === qrFlowRun.current && setQrBusy(!1);
        }), () => {
          active = !1;
        };
      }, [signInOpen, providersLoading, oauthProviders, loginMethod, qrSession, qrExpired, qrFailed, providerReload, savingServer, serverDirty]), React.useEffect(() => {
        if (!signInOpen || savingServer || serverDirty || !loginMethod.startsWith("oauth:") || qrSession === void 0) return;
        let active = !0, polling = !1, settled = !1, run = qrFlowRun.current, timer, poll = () => {
          polling || settled || !active || run !== qrFlowRun.current || (polling = !0, props.control("client.account.qr.poll", { qrId: qrSession.qrId }).then((result) => {
            !active || settled || run !== qrFlowRun.current || (result.status === "complete" ? (settled = !0, timer !== void 0 && clearInterval(timer), setError(void 0), setQrExpired(!1), setQrCompleted(!0), setQrSession(void 0), setQrImage(void 0), setQrBusy(!1)) : result.status === "expired" && (settled = !0, timer !== void 0 && clearInterval(timer), setQrExpired(!0), setQrSession(void 0), setQrImage(void 0), setQrBusy(!1)));
          }).catch((reason) => {
            active && !settled && run === qrFlowRun.current && setError(messageOf(reason, t));
          }).finally(() => {
            polling = !1;
          }));
        };
        return poll(), timer = setInterval(poll, 1500), () => {
          active = !1, settled = !0, timer !== void 0 && clearInterval(timer);
        };
      }, [signInOpen, loginMethod, qrSession, savingServer, serverDirty]), React.useEffect(() => {
        if (!signInOpen || savingServer || serverDirty || !qrCompleted) return;
        let active = !0;
        return setError(void 0), props.control("settings.get").then((view) => {
          active && (applyView(view), setSignInOpen(!1), setQrCompleted(!1), setLoginPassword(""), setNotice({ key: "authorizationComplete" }));
        }).catch((reason) => {
          active && setError(messageOf(reason, t));
        }), () => {
          active = !1;
        };
      }, [signInOpen, qrCompleted, completionReload, savingServer, serverDirty]);
      let saveLoginServer = async (serverUrlOverride) => {
        let nextServerUrl = (serverUrlOverride ?? serverUrl).trim();
        if (!(busy || savingServer || !writable || nextServerUrl === "" || serverUrlOverride === void 0 && !serverDirty)) {
          setSavingServer(!0), setBusy(!0), setError(void 0), setNotice(void 0), qrFlowRun.current += 1, providerRequestRun.current += 1, setQrSession(void 0), setQrImage(void 0), setQrCompleted(!1), setQrFailed(!1), setQrExpired(!1), setQrBusy(!1);
          try {
            let view = await props.control("settings.server.set", { serverUrl: nextServerUrl });
            serverDraftEdited.current = !1, setEditingServer(!1), applyView(view), setLoginPassword(""), setLoginEmail(""), setHostStatus(void 0), setProviderReload((value) => value + 1), setNotice({ key: view.applies === "live" ? "serverSavedLive" : "serverSaved" });
          } catch (reason) {
            setError(messageOf(reason, t));
          } finally {
            setSavingServer(!1), setBusy(!1);
          }
        }
      }, signInClient = async () => {
        if (!(savingServer || serverDirty || loginEmail.trim() === "" || loginPassword === "")) {
          setBusy(!0), setError(void 0);
          try {
            let result = await props.control("settings.configure", {
              role: "client",
              serverUrl: serverUrl.trim() || "https://dsh.r2049.cn",
              email: loginEmail.trim(),
              password: loginPassword
            });
            applyView(result.settings), setSignInOpen(!1), setLoginPassword(""), setNotice({ key: "authorizationComplete" });
          } catch (reason) {
            setError(messageOf(reason, t));
          } finally {
            setBusy(!1);
          }
        }
      }, selectLoginMethod = (method) => {
        loginMethodManuallySelected.current = !0, method !== loginMethod && (qrFlowRun.current += 1, setLoginMethod(method), setQrSession(void 0), setQrImage(void 0), setQrExpired(!1), setQrFailed(!1), setQrBusy(!1), setQrCompleted(!1), setError(void 0));
      }, logout = async () => {
        let run = ++associationReadRun.current;
        setBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let view = await props.control("settings.logout");
          applyView(view, run === associationReadRun.current), setSignInOpen(!1), setNotice({ key: "signedOut" });
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setBusy(!1);
        }
      }, reconnectHost = async () => {
        setReconnectBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let status = await props.control("host.reconnect");
          setHostStatus(status.host), setNotice({ key: "reconnectStarted" });
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setReconnectBusy(!1);
        }
      }, setCurrentDeviceControl = async (enabled) => {
        setBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let status = await props.control("host.authorization.set", { enabled });
          setHostStatus(status.host);
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setBusy(!1);
        }
      }, setTerminalRemote = async (enabled) => {
        let previous = terminalEnabled;
        setTerminalEnabled(enabled), setTerminalBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let view = await props.control("settings.development.set", { terminalEnabled: enabled });
          applyView(view), setNotice({ key: "terminalSaved" });
        } catch (reason) {
          setTerminalEnabled(previous), setError(messageOf(reason, t));
        } finally {
          setTerminalBusy(!1);
        }
      }, setSidebarEntryStyle = async (entry) => {
        if (entry === sidebarEntry) return;
        let previous = sidebarEntry;
        setSidebarEntry(entry), setSidebarEntryBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let view = await props.control("settings.appearance.set", { sidebarEntry: entry });
          applyView(view), setNotice({ key: "sidebarEntrySaved" });
        } catch (reason) {
          setSidebarEntry(previous), setError(messageOf(reason, t));
        } finally {
          setSidebarEntryBusy(!1);
        }
      }, setRemoteTools = async (enabled) => {
        setRemoteToolsBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let view = await props.control("settings.development.set", { remoteToolsEnabled: enabled, terminalEnabled });
          applyView(view), setNotice({ key: "remoteToolsSaved" });
        } catch (reason) {
          setRemoteToolsEnabled(!enabled), setError(messageOf(reason, t));
        } finally {
          setRemoteToolsBusy(!1);
        }
      }, checkAcp = async (backend) => {
        if (!acpChecking[backend]) {
          setAcpChecking((current) => ({ ...current, [backend]: !0 })), setAcpCheckResults((current) => ({ ...current, [backend]: void 0 })), setError(void 0);
          try {
            let view = await props.control("settings.get");
            applyView(view);
            let available = view.acpAvailability?.[backend] === !0;
            !available && view.writable && view.config.acp?.backends?.some((item) => item.id === backend && item.enabled !== !1) && applyView(await props.control("settings.acp.set", { backend, enabled: !1 })), setAcpCheckResults((current) => ({ ...current, [backend]: available })), setNotice({ key: available ? "acpAvailable" : "acpUnavailable" }), setTimeout(() => setAcpCheckResults((current) => ({ ...current, [backend]: void 0 })), 5e3);
          } catch (reason) {
            setError(messageOf(reason, t));
          } finally {
            setAcpChecking((current) => ({ ...current, [backend]: !1 }));
          }
        }
      }, removeAcp = async (backend) => {
        setBusy(!0), setError(void 0);
        try {
          let view = await props.control("settings.acp.remove", { id: backend });
          applyView(view);
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setBusy(!1);
        }
      }, installOrConfigureAcp = async (backend) => {
        if (!acpInstalling[backend]) {
          setAcpInstalling((current) => ({ ...current, [backend]: !0 })), setError(void 0);
          try {
            let view = await props.control("settings.acp.installOrConfigure", { backend });
            applyView(view), view.acpInstallResult?.action === "download_required" && view.acpInstallResult.downloadUrl ? setNotice({
              key: "acpDownloadRequired",
              params: { backend: backend === "cursor" ? "Cursor" : backend === "antigravity" ? "Antigravity" : backend === "hermes" ? "Hermes" : backend, url: view.acpInstallResult.downloadUrl }
            }) : view.acpInstallResult?.action === "installed" ? setNotice({ key: "acpInstalledNotice" }) : setNotice({ key: "acpConfiguredNotice" });
          } catch (reason) {
            setError(messageOf(reason, t));
          } finally {
            setAcpInstalling((current) => ({ ...current, [backend]: !1 }));
          }
        }
      }, loadLogs = async (filter = logsFilter) => {
        let run = ++logsRequestRun.current;
        setLogsLoading(!0), setLogsError(void 0);
        try {
          let next = await props.control("settings.logs.get", { filter, limit: 500 });
          if (run !== logsRequestRun.current) return;
          setLogsSnapshot(next);
        } catch (reason) {
          if (run !== logsRequestRun.current) return;
          setLogsError(messageOf(reason, t));
        } finally {
          run === logsRequestRun.current && setLogsLoading(!1);
        }
      }, toggleLogsDrawer = () => {
        let nextOpen = !logsOpen;
        setLogsOpen(nextOpen), nextOpen && loadLogs(logsFilter);
      }, changeLogsFilter = (filter) => {
        filter === logsFilter && logsSnapshot !== void 0 || (setLogsFilter(filter), loadLogs(filter));
      }, copyLogs = async () => {
        let lines = logsSnapshot?.entries.map((entry) => entry.line).join(`
`) ?? "";
        if (lines) {
          try {
            typeof navigator < "u" && navigator.clipboard && typeof navigator.clipboard.writeText == "function" ? (await navigator.clipboard.writeText(lines), setLogsCopyState("copied")) : setLogsCopyState("failed");
          } catch {
            setLogsCopyState("failed");
          }
          logsCopyTimer.current !== void 0 && clearTimeout(logsCopyTimer.current), logsCopyTimer.current = setTimeout(() => {
            logsCopyTimer.current = void 0, setLogsCopyState("idle");
          }, 2e3);
        }
      }, exportLogs = () => {
        let lines = logsSnapshot?.entries.map((entry) => entry.line).join(`
`) ?? "";
        if (!lines || typeof document > "u" || typeof Blob > "u" || typeof URL > "u") return;
        let blob = new Blob([lines + `
`], { type: "text/plain;charset=utf-8" }), href = URL.createObjectURL(blob);
        try {
          let link = document.createElement("a");
          link.href = href, link.download = "ds-harness-remote-" + (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".log", document.body?.appendChild(link), link.click(), link.remove();
        } finally {
          URL.revokeObjectURL(href);
        }
      }, clearLogs = async () => {
        if (logsClearing) return;
        let run = ++logsRequestRun.current;
        setLogsLoading(!1), setLogsClearing(!0), setLogsError(void 0);
        try {
          let cleared = await props.control("settings.logs.clear", {});
          if (run !== logsRequestRun.current) return;
          setLogsSnapshot(cleared);
        } catch (reason) {
          if (run !== logsRequestRun.current) return;
          setLogsError(messageOf(reason, t));
        } finally {
          setLogsClearing(!1);
        }
      };
      React.useEffect(() => () => {
        logsCopyTimer.current !== void 0 && clearTimeout(logsCopyTimer.current);
      }, []), React.useEffect(() => {
        if (!logsOpen) return;
        let viewport = logsViewportRef.current;
        viewport && typeof viewport.scrollHeight == "number" && (viewport.scrollTop = viewport.scrollHeight);
      }, [logsOpen, logsSnapshot]);
      let setDebug = async (enabled) => {
        if (!debugBusy) {
          setDebugBusy(!0), setError(void 0);
          try {
            applyView(await props.control("settings.development.set", { debugLogging: enabled })), logsOpen && loadLogs(logsFilter);
          } catch (reason) {
            setError(messageOf(reason, t));
          } finally {
            setDebugBusy(!1);
          }
        }
      }, developmentSetting = React.createElement(
        "section",
        { className: "dshRemoteDevelopmentSettings" },
        React.createElement(
          "div",
          { className: "dshRemoteDebugLogGroup" },
          React.createElement(
            "div",
            { className: "dshRemoteDebugLogHeader" },
            React.createElement(
              "button",
              {
                type: "button",
                className: "dshRemoteDebugLogTrigger",
                "aria-expanded": logsOpen,
                onClick: toggleLogsDrawer
              },
              React.createElement(
                "span",
                { className: "dshRemoteDebugLogTitleRow" },
                React.createElement("strong", null, t("debugLogging")),
                React.createElement("span", {
                  className: debugLogging ? "dshRemoteDebugLogLevelBadge isDebug" : "dshRemoteDebugLogLevelBadge"
                }, t(debugLogging ? "debugLoggingLevelDebug" : "debugLoggingLevelInfo"))
              ),
              React.createElement("p", null, t("debugLoggingHint"))
            ),
            React.createElement(
              "div",
              { className: "dshRemoteDebugLogControls" },
              React.createElement("button", {
                type: "button",
                className: "dshRemoteLogToggleBtn",
                "aria-expanded": logsOpen,
                onClick: toggleLogsDrawer
              }, logsOpen ? t("debugLogsToggleClose") + " \u25B4" : t("debugLogsToggleOpen") + " \u25BE"),
              React.createElement("input", {
                type: "checkbox",
                role: "switch",
                checked: debugLogging,
                disabled: busy || debugBusy || !writable,
                "aria-label": t("debugLogging"),
                onChange: (event) => void setDebug(event.target.checked)
              })
            )
          ),
          logsOpen && React.createElement(
            "div",
            { className: "dshRemoteLogDrawer", role: "region", "aria-label": t("debugLogging") },
            React.createElement(
              "div",
              { className: "dshRemoteLogToolbar" },
              React.createElement(
                "div",
                { className: "dshRemoteLogFilterGroup", role: "group" },
                React.createElement("button", {
                  type: "button",
                  className: logsFilter === "all" ? "dshRemoteLogFilterBtn isActive" : "dshRemoteLogFilterBtn",
                  "aria-pressed": logsFilter === "all",
                  onClick: () => changeLogsFilter("all")
                }, t("debugLogsFilterAll")),
                React.createElement("button", {
                  type: "button",
                  className: logsFilter === "warn" ? "dshRemoteLogFilterBtn isActive" : "dshRemoteLogFilterBtn",
                  "aria-pressed": logsFilter === "warn",
                  onClick: () => changeLogsFilter("warn")
                }, t("debugLogsFilterWarn"))
              ),
              React.createElement(
                "div",
                { className: "dshRemoteLogActions" },
                React.createElement("button", {
                  type: "button",
                  className: "dshRemoteLogActionBtn",
                  disabled: logsLoading,
                  onClick: () => void loadLogs(logsFilter)
                }, t(logsLoading ? "debugLogsRefreshing" : "debugLogsRefresh")),
                React.createElement("button", {
                  type: "button",
                  className: "dshRemoteLogActionBtn",
                  disabled: !logsSnapshot?.entries.length,
                  onClick: () => void copyLogs()
                }, t(logsCopyState === "copied" ? "debugLogsCopied" : logsCopyState === "failed" ? "debugLogsCopyFailed" : "debugLogsCopy")),
                React.createElement("button", {
                  type: "button",
                  className: "dshRemoteLogActionBtn",
                  disabled: !logsSnapshot?.entries.length,
                  onClick: exportLogs
                }, t("debugLogsExport")),
                React.createElement("button", {
                  type: "button",
                  className: "dshRemoteLogActionBtn",
                  disabled: logsClearing || !logsSnapshot?.totalBuffered,
                  onClick: () => void clearLogs()
                }, t("debugLogsClear"))
              )
            ),
            (logsSnapshot?.filePath || logsSnapshot?.fileError || logsSnapshot) && React.createElement(
              "div",
              { className: "dshRemoteLogMeta" },
              logsSnapshot?.filePath && React.createElement("span", null, t("debugLogsFileLabel"), " ", React.createElement("code", null, logsSnapshot.filePath)),
              logsSnapshot?.fileError && React.createElement("span", { className: "dshRemoteLogFallback" }, t("debugLogsFileFallback", { error: logsSnapshot.fileError })),
              logsSnapshot && React.createElement("span", null, t("debugLogsCount", { count: logsSnapshot.entries.length }))
            ),
            logsError && React.createElement("p", { className: "dshRemoteError", role: "alert" }, logsError),
            logsLoading && !logsSnapshot ? React.createElement("p", { className: "dshRemoteLogEmpty" }, t("debugLogsLoading")) : !logsSnapshot || logsSnapshot.entries.length === 0 ? React.createElement("p", { className: "dshRemoteLogEmpty" }, t("debugLogsEmpty")) : React.createElement(
              "div",
              { className: "dshRemoteLogViewport", ref: logsViewportRef },
              logsSnapshot.entries.map((entry) => React.createElement("span", {
                key: entry.seq,
                className: entry.level === "error" ? "dshRemoteLogLine isError" : entry.level === "warn" ? "dshRemoteLogLine isWarn" : entry.level === "debug" ? "dshRemoteLogLine isDebug" : "dshRemoteLogLine"
              }, entry.line))
            )
          )
        ),
        React.createElement(
          "div",
          { className: "dshRemoteAuthorizationSetting" },
          React.createElement(
            "div",
            null,
            React.createElement("strong", null, t("terminalRemote")),
            React.createElement("p", null, t("terminalRemoteHint"))
          ),
          React.createElement("input", {
            type: "checkbox",
            role: "switch",
            checked: terminalEnabled,
            disabled: busy || terminalBusy || !writable,
            "aria-label": t("terminalRemote"),
            onChange: (event) => void setTerminalRemote(event.target.checked)
          })
        ),
        React.createElement(
          "div",
          { className: "dshRemoteAuthorizationSetting" },
          React.createElement(
            "div",
            null,
            React.createElement("strong", null, t("remoteTools")),
            React.createElement("p", null, t("remoteToolsHint"))
          ),
          React.createElement("input", {
            type: "checkbox",
            role: "switch",
            checked: remoteToolsEnabled,
            disabled: remoteToolsBusy || !writable,
            "aria-label": t("remoteTools"),
            onChange: (event) => {
              let enabled = event.target.checked;
              setRemoteToolsEnabled(enabled), setRemoteTools(enabled);
            }
          })
        )
      ), resetIdentity = async () => {
        if (!window.confirm(t("resetIdentityConfirm"))) return;
        let run = ++associationReadRun.current;
        setResetBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let view = await props.control("settings.identity.reset", {}), status = await props.control("status").catch(() => {
          });
          applyView(view, run === associationReadRun.current), status !== void 0 && (setHostStatus(status.host), setHostName(status.deviceName ?? ""), setHostDeviceId(status.host?.deviceId ?? "")), setSignInOpen(!1), setNotice({ key: "resetIdentitySuccess" });
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setResetBusy(!1);
        }
      }, resetDisabledByStartupState = settingsView?.startupError?.code === "STORAGE_CONFLICT" || settingsView?.startupError?.code === "IDENTITY_LOCKED", retryStartup = async () => {
        if (retryStartupBusy) return;
        let run = ++associationReadRun.current;
        setRetryStartupBusy(!0), setError(void 0), setNotice(void 0);
        try {
          let view = await props.control("settings.startup.retry", {}), status = await props.control("status").catch(() => {
          });
          applyView(view, run === associationReadRun.current), setHostStatus(status?.host), setHostName(status?.deviceName ?? ""), setHostDeviceId(status?.host?.deviceId ?? ""), setNotice({ key: "retryStartupSuccess" });
        } catch (reason) {
          setError(messageOf(reason, t)), load().catch(() => {
          });
        } finally {
          setRetryStartupBusy(!1);
        }
      }, resetIdentitySetting = React.createElement(
        "div",
        { className: "dshRemoteAuthorizationSetting" },
        React.createElement(
          "div",
          null,
          React.createElement("strong", null, t("resetIdentity")),
          React.createElement("p", null, t("resetIdentityHint"))
        ),
        React.createElement("button", {
          type: "button",
          className: "dshRemoteDiscard",
          disabled: busy || resetBusy || !writable || resetDisabledByStartupState,
          onClick: () => void resetIdentity()
        }, t(resetBusy ? "resettingAction" : "resetIdentity"))
      ), startupErrorBanner = settingsView?.startupError !== void 0 ? React.createElement(
        "div",
        { className: "dshRemoteError", role: "alert" },
        React.createElement("p", null, startupErrorMessage(settingsView.startupError, t)),
        React.createElement("button", {
          type: "button",
          className: "dshRemoteDiscard",
          disabled: busy || resetBusy || retryStartupBusy,
          onClick: () => void retryStartup()
        }, t("retryStartup"))
      ) : null, sidebarEntrySetting = React.createElement(
        "div",
        { className: "dshRemoteAuthorizationSetting" },
        React.createElement(
          "div",
          null,
          React.createElement("strong", null, t("sidebarEntry")),
          React.createElement("p", null, t("sidebarEntryHint"))
        ),
        React.createElement("div", {
          className: "dshRemoteEntryStyleChoices",
          role: "radiogroup",
          "aria-label": t("sidebarEntry")
        }, sidebarEntryChoices.map((choice) => React.createElement("button", {
          key: choice.value,
          type: "button",
          role: "radio",
          "aria-checked": sidebarEntry === choice.value,
          className: sidebarEntry === choice.value ? "isSelected" : void 0,
          disabled: sidebarEntryBusy || !writable,
          onClick: () => void setSidebarEntryStyle(choice.value)
        }, t(choice.label))))
      ), acpSetting = React.createElement(
        "details",
        { className: "dshRemoteAuthorizationSetting dshRemoteAcpSetting" },
        React.createElement(
          "summary",
          null,
          React.createElement(
            "div",
            { className: "dshRemoteAcpSummaryText" },
            React.createElement("strong", null, t("agentBackends")),
            React.createElement("p", null, t("acpHint"), React.createElement("a", {
              href: "https://github.com/liguobao/ds-harness-remote/blob/feat/cursor-remote/docs/acp-remote.md",
              target: "_blank",
              rel: "noopener noreferrer",
              onClick: (event) => event.stopPropagation()
            }, t("acpDocumentation")))
          )
        ),
        React.createElement(
          "div",
          { className: "dshRemoteAcpList" },
          acpBackends.map((item) => React.createElement(
            "div",
            { key: item.id, className: "dshRemoteAuthorizationSetting" },
            React.createElement("div", null, React.createElement("strong", null, item.id === "codex" ? "CodeX" : item.id === "cursor" ? "Cursor" : item.id === "antigravity" ? "AGY" : item.id === "claude" ? "Claude" : item.id === "pi" ? "Pi" : item.id === "opencode" ? "OpenCode" : item.id === "hermes" ? "Hermes" : item.id), null),
            React.createElement(
              "span",
              { className: "dshRemoteAcpCheckCell" },
              // One entry per backend: while the command is unresolved this slot is
              // the fix (scan / install), once it resolves it turns back into the
              // read-only availability check. Keeping both visible at once made the
              // row read as two competing actions.
              writable && !busy && acpAvailability[item.id] !== !0 && ["codex", "cursor", "antigravity", "pi", "claude", "opencode", "hermes"].includes(item.id) ? React.createElement("a", {
                href: `#install-acp-${item.id}`,
                className: `dshRemoteAcpInstallLink${acpInstalling[item.id] ? " isInstalling" : ""}`,
                onClick: (event) => {
                  event.preventDefault(), installOrConfigureAcp(item.id);
                }
              }, acpInstalling[item.id] ? t("installingAcp") : ["cursor", "antigravity", "hermes"].includes(item.id) ? t("configureAcp") : t("installAcp")) : React.createElement(
                "a",
                { href: `#check-acp-${item.id}`, className: `dshRemoteAcpCheckLink${acpChecking[item.id] ? " isChecking" : acpCheckResults[item.id] === void 0 ? "" : acpCheckResults[item.id] ? " isPassed" : " isFailed"}`, onClick: (event) => {
                  event.preventDefault(), checkAcp(item.id);
                } },
                acpChecking[item.id] ? t("checkingAcp") : acpCheckResults[item.id] === void 0 ? t("checkAcp") : t(acpCheckResults[item.id] ? "acpCheckPassed" : "acpCheckFailed")
              )
            ),
            ["codex", "cursor", "antigravity", "pi", "claude", "opencode", "hermes"].includes(item.id) ? null : React.createElement("a", { href: `#remove-acp-${item.id}`, className: "dshRemoteAcpRemoveLink", onClick: (event) => {
              event.preventDefault(), removeAcp(item.id);
            } }, t("removeAcp")),
            React.createElement("input", {
              type: "checkbox",
              role: "switch",
              checked: settingsView?.config.acp?.enabled === !0 && item.enabled && acpAvailability[item.id] === !0,
              "aria-label": item.id,
              disabled: busy || !writable || acpChecking[item.id] === !0 || acpAvailability[item.id] !== !0,
              onChange: (event) => void props.control("settings.acp.set", { backend: item.id, enabled: event.target.checked }).then((view) => {
                applyView(view), setAcpBackends((view.config.acp?.backends ?? []).map((v) => ({ id: v.id, enabled: v.enabled !== !1 })));
              }).catch((reason) => setError(messageOf(reason, t)))
            })
          ))
        )
      );
      if (props.view === "summary") return React.createElement("span", null, t("pluginDescription"));
      let orderedQrProviders = [...oauthProviders].sort((a, b) => +(b.id === props.preferredQrProvider) - +(a.id === props.preferredQrProvider)), selectedProvider = oauthProviders.find((item) => `oauth:${item.id}` === loginMethod), scanLabel = t("scanWithProvider", { provider: selectedProvider?.displayName ?? "" }), passwordVisible = !savingServer && !serverDirty && loginMethod === "password" && (loginMethodManuallySelected.current || !providersLoading && oauthProviders.length === 0), qrLoginTab = (provider) => React.createElement("button", {
        key: provider.id,
        type: "button",
        role: "tab",
        id: `dsh-remote-settings-oauth:${provider.id}-tab`,
        "aria-selected": loginMethod === `oauth:${provider.id}`,
        "aria-controls": `dsh-remote-settings-oauth:${provider.id}-panel`,
        className: loginMethod === `oauth:${provider.id}` ? "isActive" : "",
        disabled: busy,
        onClick: () => selectLoginMethod(`oauth:${provider.id}`)
      }, provider.displayName), inlineSignIn = !signInOpen || association !== void 0 ? null : React.createElement(
        "div",
        {
          id: "dsh-remote-inline-signin",
          className: "dshRemoteInlineSignIn"
        },
        serverDirty && loginMethod !== "device_pairing" ? React.createElement("p", { className: "dshRemoteSettingsState", role: "status" }, t("saveServerBeforeLogin")) : null,
        React.createElement(
          "div",
          { className: "dshRemoteLoginTabs", role: "tablist", "aria-label": t("signInAccount") },
          pairingAvailable ? React.createElement("button", {
            type: "button",
            role: "tab",
            id: "dsh-remote-settings-device-pairing-tab",
            "aria-selected": loginMethod === "device_pairing",
            "aria-controls": "dsh-remote-settings-device-pairing-panel",
            className: loginMethod === "device_pairing" ? "isActive" : "",
            disabled: busy,
            onClick: () => selectLoginMethod("device_pairing")
          }, t("pairingLoginTab")) : null,
          ...orderedQrProviders.map(qrLoginTab),
          React.createElement("button", {
            type: "button",
            role: "tab",
            id: "dsh-remote-settings-password-tab",
            "aria-selected": passwordVisible,
            "aria-controls": "dsh-remote-settings-password-panel",
            className: passwordVisible ? "isActive" : "",
            disabled: busy,
            onClick: () => selectLoginMethod("password")
          }, t("accountPasswordLogin"))
        ),
        React.createElement(
          "div",
          { className: "dshRemoteLoginContent" },
          providersLoading && loginMethod !== "device_pairing" ? React.createElement("p", { className: "dshRemoteSettingsState", role: "status" }, t("loadingLoginProviders")) : null,
          providersFailed ? React.createElement(
            "p",
            { className: "dshRemoteSettingsState", role: "status" },
            t("noLoginProviders"),
            " ",
            React.createElement("button", {
              type: "button",
              disabled: busy || savingServer || serverDirty,
              onClick: () => setProviderReload((value) => value + 1)
            }, t("retryLoginProviders"))
          ) : null,
          loginMethod === "device_pairing" && pairingAvailable ? React.createElement(
            "div",
            { role: "tabpanel", id: "dsh-remote-settings-device-pairing-panel", "aria-labelledby": "dsh-remote-settings-device-pairing-tab" },
            React.createElement(HostPairingPanel, { key: settingsView?.config.serverUrl ?? "", control: props.control, serverUrl: settingsView?.config.serverUrl ?? "", disabled: busy || !writable || serverDirty, t, onComplete: () => void props.control("settings.get").then((view) => {
              applyView(view), setSignInOpen(!1), props.onSignIn?.();
            }).catch(() => {
            }) })
          ) : passwordVisible ? React.createElement(
            "div",
            {
              className: "dshRemoteClientLogin",
              role: "tabpanel",
              id: "dsh-remote-settings-password-panel",
              "aria-labelledby": "dsh-remote-settings-password-tab"
            },
            React.createElement("input", {
              type: "email",
              value: loginEmail,
              disabled: busy,
              autoComplete: "username",
              placeholder: t("account"),
              "aria-label": t("account"),
              onChange: (event) => setLoginEmail(event.target.value)
            }),
            React.createElement("input", {
              type: "password",
              value: loginPassword,
              disabled: busy,
              autoComplete: "current-password",
              placeholder: t("password"),
              "aria-label": t("password"),
              onChange: (event) => setLoginPassword(event.target.value)
            }),
            React.createElement("button", {
              type: "button",
              disabled: busy || loginEmail.trim() === "" || loginPassword === "",
              onClick: () => void signInClient()
            }, t(busy ? "signingIn" : "startSignIn")),
            React.createElement("p", { className: "dshRemotePasswordHint" }, t("passwordHint"))
          ) : !savingServer && !serverDirty && selectedProvider !== void 0 ? React.createElement(
            "div",
            {
              className: "dshRemoteQrLogin",
              role: "tabpanel",
              id: `dsh-remote-settings-${loginMethod}-panel`,
              "aria-labelledby": `dsh-remote-settings-${loginMethod}-tab`
            },
            qrCompleted ? React.createElement(
              "div",
              { className: "dshRemoteInlineSignInQrState" },
              React.createElement(
                "div",
                { className: "dshRemoteLoginProgress", role: "status", "aria-live": "polite" },
                React.createElement("span", { className: "dshRemoteLoginSpinner", "aria-hidden": !0 }),
                t("loginLoadingSettings")
              ),
              React.createElement("button", {
                type: "button",
                className: "dshRemoteReconnect",
                disabled: busy,
                onClick: () => {
                  setError(void 0), setCompletionReload((v) => v + 1);
                }
              }, t("retryLoginProviders"))
            ) : qrFailed ? React.createElement(
              "div",
              { className: "dshRemoteInlineSignInQrState" },
              React.createElement("p", null, t("retryLoginProviders")),
              React.createElement("button", {
                type: "button",
                className: "dshRemoteReconnect",
                disabled: qrBusy,
                onClick: () => {
                  setQrFailed(!1), setQrExpired(!1), setQrSession(void 0), setQrImage(void 0);
                }
              }, t("retryLoginProviders"))
            ) : qrExpired ? React.createElement(
              "div",
              { className: "dshRemoteInlineSignInQrState" },
              React.createElement("p", null, t("qrLoginExpired")),
              React.createElement("button", {
                type: "button",
                className: "dshRemoteReconnect",
                disabled: qrBusy,
                onClick: () => {
                  setQrExpired(!1), setQrFailed(!1), setQrSession(void 0), setQrImage(void 0);
                }
              }, t("refreshQrCode"))
            ) : qrImage === void 0 ? React.createElement(
              "div",
              { className: "dshRemoteQrPlaceholder", "aria-busy": qrBusy },
              React.createElement("span", null, t("checkingConnection"))
            ) : qrSession !== void 0 ? React.createElement(
              "a",
              {
                className: "dshRemoteQrOpen",
                href: qrSession.scanUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                "aria-label": t("openInBrowser")
              },
              React.createElement("img", {
                src: qrImage,
                width: 184,
                height: 184,
                alt: scanLabel
              }),
              React.createElement("span", null, t("openInBrowser"), " \u2197")
            ) : null,
            React.createElement("strong", null, scanLabel),
            React.createElement("p", null, t("scanLoginHint")),
            !qrCompleted && !qrFailed && !qrExpired && (qrBusy || qrSession !== void 0) ? React.createElement(
              "div",
              { className: "dshRemoteLoginProgress", role: "status", "aria-live": "polite" },
              React.createElement("span", { className: "dshRemoteLoginSpinner", "aria-hidden": !0 }),
              t("loginWaitingAuthorization")
            ) : null
          ) : null
        ),
        React.createElement(
          "div",
          { className: "dshRemoteServiceAddress" },
          React.createElement("span", null, t("currentServiceAddress")),
          editingServer ? React.createElement(
            "form",
            {
              className: "dshRemoteLoginServer",
              onSubmit: (event) => {
                event.preventDefault(), saveLoginServer();
              }
            },
            React.createElement("input", {
              id: "dsh-remote-settings-server",
              type: "url",
              required: !0,
              "aria-label": t("serverUrl"),
              value: serverUrl,
              disabled: busy || savingServer || !writable,
              autoComplete: "url",
              placeholder: t("serverUrl"),
              onChange: (event) => {
                serverDraftEdited.current = !0, setServerUrl(event.target.value);
              }
            }),
            React.createElement("button", {
              type: "submit",
              disabled: busy || savingServer || !writable || !serverDirty || serverUrl.trim() === ""
            }, t(savingServer ? "saving" : "save")),
            React.createElement("button", {
              type: "button",
              disabled: busy || savingServer || !writable,
              onClick: () => {
                serverDraftEdited.current = !0, setServerUrl("https://dsh.r2049.cn"), saveLoginServer("https://dsh.r2049.cn");
              }
            }, t("restoreDefaultServiceAddress")),
            React.createElement("button", {
              type: "button",
              disabled: busy || savingServer || !writable,
              onClick: () => {
                serverDraftEdited.current = !1, setServerUrl(savedServerUrl ?? "https://dsh.r2049.cn"), setEditingServer(!1);
              }
            }, t("cancelServiceAddressEdit"))
          ) : React.createElement(
            React.Fragment,
            null,
            React.createElement("a", {
              href: savedServerUrl ?? serverUrl,
              target: "_blank",
              rel: "noreferrer"
            }, savedServerUrl ?? serverUrl),
            React.createElement("button", {
              type: "button",
              className: "dshRemoteServiceAddressEdit",
              disabled: busy || savingServer || !writable,
              title: t("editServiceAddress"),
              "aria-label": t("editServiceAddress"),
              onClick: () => setEditingServer(!0)
            }, React.createElement("svg", {
              viewBox: "0 0 24 24",
              width: 16,
              height: 16,
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.8,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              "aria-hidden": !0
            }, React.createElement("path", { d: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" })))
          )
        )
      );
      return React.createElement(
        props.view === "page" ? "div" : "li",
        {
          className: `dshRemotePluginCard${open ? " isOpen" : ""}${props.view === "page" ? " dshRemotePluginModern" : ""}`,
          ...props.view === "page" ? { "data-dsh-remote-settings": "" } : {}
        },
        React.createElement(
          "div",
          { className: "dshRemotePluginCardHeader" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "dshRemotePluginCardToggle",
              "aria-expanded": open,
              "aria-label": t(open ? "collapseSettings" : "expandSettings", { name: t("pluginTitle") }),
              onClick: () => setOpen((current) => !current)
            },
            React.createElement(
              "span",
              { className: "dshRemotePluginCardHeading" },
              React.createElement("strong", null, t("pluginTitle")),
              React.createElement("span", null, t("pluginDescription"))
            ),
            association === void 0 ? null : React.createElement("span", {
              className: `dshRemotePluginCardStatus${connectionStatusClass(hostStatus)}`
            }, hostStatus?.authorized && !hostStatus.accountRequired && !hostStatus.online && (hostStatus.error !== void 0 || hostStatus.lastActiveAt !== void 0) ? React.createElement(ServerNotice, {
              offline: !0,
              linked: (hostStatus.connectedClients?.length ?? 0) > 0,
              expiresAt: hostStatus.recoveryExpiresAt,
              t
            }) : modeStatus?.mode === "remote" ? t("remoteTarget", { name: modeStatus.target?.name ?? t("host") }) : t("local")),
            React.createElement("span", { className: "dshRemotePluginCardChevron", "aria-hidden": !0 }, "\u2304")
          )
        ),
        open ? React.createElement(
          "div",
          { className: "dshRemotePluginCardBody" },
          loaded ? association !== void 0 ? React.createElement(
            "div",
            { className: "dshRemoteSettings" },
            React.createElement(
              "div",
              { className: "dshRemoteSettingsTop" },
              React.createElement(
                "div",
                { className: "dshRemoteAssociation" },
                React.createElement("span", null, t(association.account === void 0 ? "authorization" : "account")),
                React.createElement("strong", null, association.account === void 0 ? t("authorizationComplete") : displayRemoteAccount(association.account)),
                React.createElement("p", null, association.account === void 0 ? serverUrl : t("authorizedOn", { role: "Remote", serverUrl }))
              )
            ),
            React.createElement(
              "div",
              { className: "dshRemoteHostIdentity" },
              React.createElement(
                "div",
                null,
                React.createElement("span", null, t("hostName")),
                React.createElement("strong", null, hostName || "\u2014")
              ),
              React.createElement(
                "div",
                null,
                React.createElement("span", null, t("deviceId")),
                React.createElement("code", null, hostDeviceId || "\u2014")
              )
            ),
            startupErrorBanner,
            developmentSetting,
            sidebarEntrySetting,
            resetIdentitySetting,
            acpSetting,
            React.createElement(
              "div",
              { className: "dshRemoteAuthorizationSetting" },
              React.createElement(
                "div",
                null,
                React.createElement("strong", null, t("allowControlCurrentDevice")),
                React.createElement("p", null, t("thisMachineHost"))
              ),
              React.createElement("input", {
                type: "checkbox",
                role: "switch",
                disabled: busy,
                "aria-label": t("allowControlCurrentDevice"),
                checked: hostStatus?.authorized === !0,
                onChange: (event) => void setCurrentDeviceControl(event.target.checked)
              })
            ),
            React.createElement(
              "div",
              { className: "dshRemoteConnection", "aria-live": "polite" },
              React.createElement(
                "div",
                { className: "dshRemoteConnectionSummary" },
                React.createElement("span", null, t("connection")),
                React.createElement(
                  "strong",
                  null,
                  React.createElement("span", {
                    className: `dshRemoteConnectionDot${connectionStatusClass(hostStatus)}`,
                    "aria-hidden": !0
                  }),
                  connectionStatusLabel(hostStatus, t)
                ),
                React.createElement("p", null, hostStatus === void 0 ? t("checkingConnection") : hostStatus.lastActiveAt === void 0 ? t("neverConnected") : t("lastActive", { time: formatLocalTime(hostStatus.lastActiveAt) }))
              ),
              React.createElement("button", {
                type: "button",
                className: "dshRemoteReconnect",
                disabled: reconnectBusy || hostStatus?.configured === !1,
                onClick: () => void reconnectHost()
              }, t(reconnectBusy ? "reconnectingAction" : "reconnect"))
            ),
            hostStatus?.authorized && !hostStatus.accountRequired ? React.createElement(ServerNotice, {
              offline: !hostStatus.online && hostStatus.reconnecting,
              linked: (hostStatus.connectedClients?.length ?? 0) > 0,
              expiresAt: hostStatus.recoveryExpiresAt,
              t
            }) : null,
            hostStatus?.error === void 0 || hostStatus.online || hostStatus.reconnecting && hostStatus.error === "CONNECTION_FAILED" ? null : React.createElement("p", { className: "dshRemoteConnectionIssue", role: "status" }, connectionErrorMessage(hostStatus.error, t)),
            writable ? null : React.createElement("p", { className: "dshRemoteError" }, t("readOnly")),
            React.createElement(
              "div",
              { className: "dshRemoteSettingsFooter" },
              React.createElement("p", {
                className: error !== void 0 ? "dshRemoteError" : "dshRemoteNotice",
                role: error !== void 0 ? "alert" : "status"
              }, error ?? (notice === void 0 ? "" : t(notice.key, notice.params))),
              React.createElement("button", {
                type: "button",
                className: "dshRemoteDiscard",
                disabled: busy || !writable,
                onClick: () => void logout()
              }, t(busy ? "signingOut" : "signOut"))
            ),
            inlineSignIn
          ) : React.createElement(
            "div",
            { className: "dshRemoteSettings" },
            startupErrorBanner,
            React.createElement(
              "div",
              { className: "dshRemoteHostIdentity" },
              React.createElement(
                "div",
                null,
                React.createElement("span", null, t("hostName")),
                React.createElement("strong", null, hostName || "\u2014")
              ),
              React.createElement(
                "div",
                null,
                React.createElement("span", null, t("deviceId")),
                React.createElement("code", null, hostDeviceId || "\u2014")
              )
            ),
            developmentSetting,
            sidebarEntrySetting,
            resetIdentitySetting,
            acpSetting,
            React.createElement(
              "div",
              { className: "dshRemoteSettingsSignIn" },
              React.createElement("p", { className: "dshRemoteSettingsState" }, t("authorizeFromRemote")),
              React.createElement("button", {
                type: "button",
                className: signInOpen ? "dshRemoteDiscard" : "dshRemoteSave",
                disabled: busy || resetBusy || !loaded || settingsView?.startupError !== void 0,
                "aria-expanded": signInOpen,
                "aria-controls": "dsh-remote-inline-signin",
                onClick: () => {
                  setError(void 0), setSignInOpen((current) => !current);
                }
              }, t(signInOpen ? "close" : "signInAccount"))
            ),
            inlineSignIn,
            writable ? null : React.createElement("p", { className: "dshRemoteError" }, t("readOnly")),
            error !== void 0 || notice !== void 0 ? React.createElement(
              "div",
              { className: "dshRemoteSettingsFooter" },
              React.createElement("p", {
                className: error !== void 0 ? "dshRemoteError" : "dshRemoteNotice",
                role: error !== void 0 ? "alert" : "status"
              }, error ?? t(notice.key, notice.params))
            ) : null
          ) : React.createElement("p", { className: "dshRemoteSettingsState" }, error ?? t("loadingSettings"))
        ) : null
      );
    }
    return RemotePluginOptions;
  }

  // packages/plugin/src/client/shell.ts
  function installStyle(clientModuleId2) {
    let style = document.createElement("style");
    return style.dataset.plugin = clientModuleId2, style.dataset.pluginCss = "dsh-remote", style.textContent = [
      ".dshRemoteConnectedPanelHeader{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;margin-bottom:6px}.dshRemoteConnectedPanelHeader .dshRemoteConnectedPanelTitle{margin-bottom:0}",
      ".dshRemoteHostNameLine{display:flex;align-items:center;flex-wrap:wrap;gap:8px}",
      ".dshRemoteServerNotice{font-size:12px;line-height:1.5;white-space:normal;overflow-wrap:anywhere}.dshRemoteServerNotice.isWarning{color:var(--dsw-alias-state-warning-primary,#946200)}.dshRemoteServerNotice.isError{color:var(--dsw-alias-state-error-primary)}.dshRemoteServerNotice.isRestored{color:var(--dsw-alias-state-success-primary)}",
      // Browser navigation still targets the Desktop machine until Harness exposes
      // a Remote URL resolver. Hide the native guide entry in Remote mode only.
      'html.dshRemoteBrowserUnavailable [data-sidebar-right-guide-entry="browser"]{display:none!important}',
      'html.dshRemoteTargetActive button[aria-label="\u6DFB\u52A0\u5DE5\u4F5C\u533A"],html.dshRemoteTargetActive button[aria-label="Add workspace"]{display:none!important}',
      'html.dshRemoteCodexTargetActive [data-composer-card] button[aria-haspopup="listbox"][aria-label="\u6307\u4EE4"],html.dshRemoteCodexTargetActive [data-composer-card] button[aria-haspopup="listbox"][aria-label="Commands"]{display:none!important}',
      "[data-dsh-remote-hidden-action]{display:none!important}",
      // The 0.1.6 right sidebar occupies the same shell header area as the
      // remote status strip. Hide the strip while that sidebar is expanded;
      // the sidebar itself remains the active context for terminal/files.
      ":has([data-sidebar-right-open]) .dshRemoteSessionHeader{display:none!important}",
      // TerminalRecovery renders a retry action in the conversation header.
      // A failed remote terminal is reported when its tab is opened/closed;
      // keeping this background recovery action out of the top-left header
      // avoids overlapping the session controls.
      '[title^="\u6062\u590D\u7EC8\u7AEF\u5931\u8D25"],[title^="Terminal recovery failed"]{display:none!important}',
      ".dshRemoteTerminalUnavailable{box-sizing:border-box;margin:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:1.5}",
      ".dshRemoteModeButton{min-height:36px;border:0;background:transparent;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:8px}.dshRemoteModeButton:is(button){cursor:pointer}",
      ".dshRemoteModeButton:is(button):hover{background:var(--dsw-alias-interactive-bg-hover)}",
      // The official sidebar.footer.action slot owns the surrounding layout.
      // Style only our entry so other footer actions, usage and Settings keep
      // their host-defined geometry, including third-party sidebar variants.
      // Match native workspace rows: 8px inset, 16px icon slot and 6px label gap.
      ".dshRemoteSidebarEntry{box-sizing:border-box;flex:none;width:36px;min-width:36px;display:block}.dshRemoteSidebarEntry .dshRemoteModeButton{box-sizing:border-box;width:36px;height:36px;min-height:36px;justify-content:center;gap:0;padding:0;border-radius:50%}.dshRemoteSidebarEntry.isWide{flex:0 1 auto;width:fit-content;min-width:36px;max-width:100%;height:36px;margin:0}.dshRemoteSidebarEntry.isWide .dshRemoteModeButton{width:auto;max-width:100%;min-width:0;justify-content:flex-start;gap:6px;padding:0 8px;border-radius:8px;font:inherit;font-size:14px;line-height:20px;text-align:start}.dshRemoteSidebarLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshRemoteSidebarEntry.isRail{height:36px}.dshRemoteSidebarEntry.isActive .dshRemoteComputerIcon{color:var(--dsw-alias-brand-primary)}.dshRemoteSidebarEntry .dshRemoteModeButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dshRemoteSidebarEntry .dshRemoteModeButton:disabled{opacity:.45;cursor:default}",
      ".dshRemoteSidebarEntry.isWide.isActive .dshRemoteSidebarLabel{max-width:170px}",
      ".dshRemoteComputerIcon{box-sizing:border-box;width:18px;height:18px;flex:0 0 18px;color:var(--dsw-alias-label-secondary)}.dshRemoteSidebarEntry.isWide .dshRemoteComputerIcon{width:16px;height:16px;flex-basis:16px}",
      // Compact entry: the same button portalled to the end of the host account row.
      ".dshRemoteAccountEntry{display:inline-flex;align-items:center;flex:none}.dshRemoteAccountEntry .dshRemoteAccountEntryButton{box-sizing:border-box;width:26px;height:26px;min-width:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}.dshRemoteAccountEntry .dshRemoteAccountEntryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dshRemoteAccountEntry .dshRemoteAccountEntryButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}.dshRemoteAccountEntry .dshRemoteAccountEntryButton:disabled{opacity:.45;cursor:default}.dshRemoteAccountEntry.isActive .dshRemoteComputerIcon{color:var(--dsw-alias-brand-primary)}",
      // Segmented control for the entry style; scoped through the group because the
      // page body rule for bare buttons outranks a single class.
      ".dshRemoteEntryStyleChoices{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3)}.dshRemoteEntryStyleChoices>button{box-sizing:border-box;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:3px 10px;border-radius:6px;white-space:nowrap;cursor:pointer}.dshRemoteEntryStyleChoices>button:hover:not(:disabled):not(.isSelected){color:var(--dsw-alias-label-primary)}.dshRemoteEntryStyleChoices>button.isSelected{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.dshRemoteEntryStyleChoices>button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.dshRemoteEntryStyleChoices>button:disabled{opacity:.45;cursor:default}",
      // Keep Exit in flow: an absolute action and reserved padding can overlap
      // the icon or adjacent plugins when the host shrinks this flex item.
      ".dshRemoteSidebarEntry.isWide.isActive{display:flex;align-items:center}.dshRemoteSidebarEntry.isWide.isActive .dshRemoteModeButton{flex:1 1 auto;width:auto;overflow:hidden;padding:0}.dshRemoteSidebarEntry.isWide.isActive .dshRemoteComputerIcon{margin-inline-start:8px}.dshRemoteExitLink{margin-inline-start:auto;flex:0 0 36px;min-width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);padding:0;font:inherit;font-size:12px;line-height:20px;white-space:nowrap;cursor:pointer}.dshRemoteExitLink:hover:not(:disabled){color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteExitLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dshRemoteExitLink:disabled{opacity:.45;cursor:default}",
      // The strip sits inside the 40px Windows caption row, which the shell declares as the
      // window drag region. Without an explicit opt-out every press starts a window drag and
      // never reaches these buttons; the shell's own caption controls (sidebar toggle, new
      // session, the caption menus) opt out of that region the same way.
      '.dshRemoteSessionHeader{position:fixed;z-index:25;-webkit-app-region:no-drag;top:12px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 360px);height:28px;display:inline-flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}.dshRemoteSessionHeader>svg{width:15px;height:15px;flex:0 0 auto}.dshRemoteSessionTarget{min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis}.dshRemoteNetwork{flex:0 0 auto;border:0;background:transparent;color:inherit;font:inherit;padding:3px 2px;display:inline-flex;align-items:center;gap:5px;cursor:pointer}.dshRemoteNetwork:hover:not(:disabled){color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteNetwork:disabled{cursor:default}.dshRemoteNetwork>i{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.dshRemoteNetwork.isOnline>i{background:var(--dsw-alias-state-success-primary)}.dshRemoteNetwork.isOffline{color:var(--dsw-alias-state-error-primary)}.dshRemoteNetwork.isOffline>i{background:currentColor}.dshRemoteEncrypted{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}.dshRemoteHeaderExitLink{flex:0 0 auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:3px 2px;font:inherit;text-decoration:none;cursor:pointer}.dshRemoteHeaderExitLink:hover{text-decoration:underline;color:var(--dsw-alias-label-primary)}.dshRemoteHeaderExitLink:disabled{opacity:.45;cursor:default;text-decoration:none}.dshRemoteNetwork:focus-visible,.dshRemoteHeaderExitLink:focus-visible,.dshRemoteRoutePanel>header button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dshRemoteRouteBackdrop{position:fixed;inset:0;z-index:26;-webkit-app-region:no-drag}.dshRemoteRoutePanel{box-sizing:border-box;position:absolute;top:48px;right:28px;width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 72px);overflow:auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;white-space:normal}.dshRemoteRoutePanel>header{position:sticky;top:-16px;z-index:1;display:flex;align-items:center;justify-content:space-between;margin:-16px -16px 0;padding:16px;background:var(--dsw-alias-bg-layer-1)}.dshRemoteRoutePanel>header strong{font-size:14px}.dshRemoteRoutePanel>header button{width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:inherit;font-size:20px;cursor:pointer}.dshRemoteRoutePanel>header button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteRoutePanel ol{display:flex;align-items:stretch;margin:12px 0 0;padding:0 0 16px;border-bottom:1px solid var(--dsw-alias-border-l2);list-style:none}.dshRemoteRoutePanel li{position:relative;min-width:0;flex:1;display:flex;flex-direction:column;gap:4px;padding-right:20px}.dshRemoteRoutePanel li:not(:last-child)::after{content:"\u2192";position:absolute;right:7px;top:21px;color:var(--dsw-alias-label-tertiary)}.dshRemoteRoutePanel li small{color:var(--dsw-alias-label-tertiary)}.dshRemoteRoutePanel li strong,.dshRemoteRoutePanel li span{overflow:hidden;text-overflow:ellipsis}.dshRemoteRoutePanel li strong{font-size:13px}.dshRemoteRoutePanel li span{color:var(--dsw-alias-label-secondary);font-size:11px}.dshRemoteRouteSection{padding-top:16px}.dshRemoteRouteSection h3{margin:0 0 10px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}.dshRemoteRouteSection dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;margin:0}.dshRemoteRouteSection dl>div{min-width:0;display:grid;grid-template-columns:minmax(104px,auto) minmax(0,1fr);gap:10px;padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px;line-height:1.45}.dshRemoteRouteSection dt{color:var(--dsw-alias-label-tertiary)}.dshRemoteRouteSection dd{min-width:0;margin:0;text-align:right;overflow-wrap:anywhere}.dshRemoteRouteSection dd.isMono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}.dshRemoteRoutePanel>p{margin:16px 0 0;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}@media(max-width:620px){.dshRemoteSessionHeader{top:8px;max-width:calc(100vw - 112px)}.dshRemoteSessionHeader>svg{display:none}.dshRemoteSessionTarget{max-width:130px}.dshRemoteEncrypted{display:none}.dshRemoteRoutePanel{top:42px;right:12px;max-height:calc(100vh - 56px)}.dshRemoteRoutePanel ol{flex-direction:column;gap:18px}.dshRemoteRoutePanel li:not(:last-child)::after{content:"\u2193";top:auto;right:auto;bottom:-16px;left:3px}.dshRemoteRouteSection dl{grid-template-columns:1fr}.dshRemoteRouteSection dl>div{grid-template-columns:1fr;gap:2px}.dshRemoteRouteSection dd{text-align:left}}',
      ".dshRemoteSessionHeader{left:auto;right:148px;transform:none;max-width:calc(100vw - 420px)}@media(max-width:760px){.dshRemoteSessionHeader{left:auto;right:104px;transform:none;max-width:calc(100vw - 124px)}}",
      ".dshRemoteHostReferencePanel{position:fixed;z-index:2147483000;top:56px;right:20px;bottom:auto;width:min(380px,calc(100vw - 40px));box-sizing:border-box;padding:16px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 12px 36px var(--dsw-alias-shadow-l2);}.dshRemoteHostReferencePanel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.dshRemoteHostReferencePanel header button{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}.dshRemoteHostReferencePanel dl{margin:0}.dshRemoteHostReferencePanel dl>div{display:grid;grid-template-columns:80px minmax(0,1fr);gap:12px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshRemoteHostReferencePanel dt{color:var(--dsw-alias-label-tertiary)}.dshRemoteHostReferencePanel dd{margin:0;overflow-wrap:anywhere}.dshRemoteHostReferencePanel .isMono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}",
      ".dshRemoteModeButton:focus-visible,.dshRemotePage button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
      ".dshRemotePage{width:min(720px,100%);max-height:min(760px,calc(100vh - 40px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.35);overflow:hidden;animation:dshRemotePageIn .18s cubic-bezier(.25,1,.5,1);-webkit-app-region:no-drag}",
      ".dshRemotePageHeader{min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 24px;border-bottom:1px solid var(--dsw-alias-border-l2);-webkit-app-region:no-drag}.dshRemotePageIntro{min-width:0;flex:1;-webkit-app-region:no-drag}.dshRemotePageHeader strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;line-height:1.4}.dshRemotePageHeader p{min-width:0;max-width:70ch;margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}.dshRemoteStarLink{-webkit-app-region:no-drag}.dshRemotePageActions{flex:0 0 auto;display:flex;align-items:center;gap:4px;-webkit-app-region:no-drag;pointer-events:auto}.dshRemotePageActions>button{height:40px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;border:0;border-radius:8px;background:transparent;color:inherit;line-height:1;cursor:pointer;-webkit-app-region:no-drag;pointer-events:auto}.dshRemotePageActions>button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dshRemotePageActions>button:disabled{opacity:.45;cursor:default}.dshRemotePageBack,.dshRemotePageRefresh{min-width:48px;padding:0 10px;font:inherit;font-size:13px}.dshRemotePageBack{color:var(--dsw-alias-label-secondary)!important}.dshRemotePageClose{width:40px;padding:0;font-size:24px}",
      ".dshRemotePageBody{padding:24px;overflow:auto;display:flex;flex-direction:column;gap:24px}.dshRemotePageBody button{font:inherit;color:inherit}",
      ".dshRemotePageTitleRow{display:flex;align-items:center;gap:10px;min-width:0}.dshRemotePageTitleRow>strong{min-width:0;flex:0 1 auto}.dshRemoteStarLink{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:400;text-decoration:none}.dshRemoteStarLink:hover{color:var(--dsw-alias-label-primary);text-decoration:underline;text-underline-offset:3px}.dshRemoteStarLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;border-radius:3px}",
      // Registry update link inside the modal's account footer row, and the mini
      // upgrade affordances on the sidebar entry buttons. The host-row
      // "update available" marker stays plain text inside the joined detail string.
      ".dshRemoteAccountUpdate,button.dshRemoteAccountUpdate{flex:0 0 auto;color:var(--dsw-alias-brand-primary);font-size:12px;font-weight:500;white-space:nowrap;text-decoration:none}button.dshRemoteAccountUpdate{background:none;border:0;padding:0;font:inherit;line-height:1.5;cursor:pointer}button.dshRemoteAccountUpdate:disabled{cursor:default;text-decoration:none;opacity:.7}.dshRemoteAccountUpdate:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:3px}.dshRemoteAccountUpdate:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;border-radius:3px}",
      // Update affordances in the host's own update-indicator look: the labeled
      // sidebar entry button (full width again, as before cab95ec) carries the
      // DesktopUpdateIndicator palette (8% brand fill, 20% brand border, 12px/500
      // suffix); icon-only rail/compact entries get the official 6px brand dot.
      ".dshRemoteSidebarEntry.isWide.hasUpdate .dshRemoteModeButton{border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary)) 20%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary)) 8%,transparent);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary));font-weight:500}.dshRemoteSidebarEntry .dshRemoteModeButton,.dshRemoteAccountEntry .dshRemoteAccountEntryButton{position:relative}.dshRemoteUpdateSuffix{flex:0 0 auto;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;font-weight:500}.dshRemoteUpdateDot{position:absolute;inset-inline-end:2px;top:2px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary))}",
      ".dshRemoteSectionHeading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px}.dshRemoteSectionTitle{min-width:0;display:flex;align-items:center;gap:10px}.dshRemoteSectionTitle>strong{font-size:14px}.dshRemoteManageHosts{color:var(--dsw-alias-label-secondary);font-size:12px;text-decoration:none;white-space:nowrap}.dshRemoteManageHosts:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteSectionActions{display:flex;align-items:center;gap:14px}.dshRemoteSectionActions>button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:5px 0;font-size:12px}.dshRemoteSectionActions>button:hover:not(:disabled){color:var(--dsw-alias-label-primary);text-decoration:underline}",
      ".dshRemoteSectionTitle{flex:1}.dshRemoteSectionTitle>.dshRemoteConnectedMenu{margin-left:auto}",
      '.dshRemoteAcpSetting{display:block!important;width:100%;padding:0}.dshRemoteAcpSetting>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;cursor:pointer;list-style:none}.dshRemoteAcpSetting>summary::-webkit-details-marker{display:none}.dshRemoteAcpSetting>summary::after{content:"\u2304";color:var(--dsw-alias-label-secondary);transition:transform .18s ease-out}.dshRemoteAcpSetting[open]>summary::after{transform:rotate(180deg)}.dshRemoteAcpSummaryText{min-width:0}.dshRemoteAcpSummaryText strong{display:block}.dshRemoteAcpSummaryText p{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.4}.dshRemoteAcpCheckLink{grid-column:2;grid-row:1;color:var(--dsw-alias-brand-primary);font-size:12px;text-decoration:underline;text-underline-offset:3px}.dshRemoteAcpCheckLink:hover{color:var(--dsw-alias-label-primary)}.dshRemoteAcpCheckResult{grid-column:3;grid-row:1;font-size:11px;line-height:1.4;white-space:nowrap}.dshRemoteAcpCheckResult.isPassed{color:var(--dsw-alias-state-success-primary)}.dshRemoteAcpCheckResult.isFailed{color:var(--dsw-alias-state-danger-primary)}.dshRemoteAcpList{display:flex;flex-direction:column;gap:0;margin-top:12px;padding-top:0;border-top:0}.dshRemoteAcpList>.dshRemoteAuthorizationSetting{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto auto auto auto;align-items:center;column-gap:18px;line-height:1.4}.dshRemoteAcpList>.dshRemoteAuthorizationSetting>span:first-child{min-width:0;line-height:1.4}.dshRemoteAcpList>.dshRemoteAuthorizationSetting>input{grid-column:4;grid-row:1}',
      ".dshRemoteAcpAddLink{align-self:flex-start;margin-top:12px;color:var(--dsw-alias-brand-primary);font-size:12px;text-decoration:underline;text-underline-offset:3px}.dshRemoteAcpAddForm{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(140px,1fr) minmax(100px,1fr) auto;gap:8px;margin-top:12px}.dshRemoteAcpAddForm input{min-width:0;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:0 10px}.dshRemoteAcpAddForm button{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);padding:0 12px;cursor:pointer;font:inherit;font-size:12px}.dshRemoteAcpAddForm button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteAcpRemoveLink{grid-column:3;grid-row:1;color:var(--dsw-alias-label-secondary);font-size:12px;text-decoration:underline;text-underline-offset:3px}.dshRemoteAcpRemoveLink:hover{color:var(--dsw-alias-state-danger-primary)}",
      ".dshRemoteAcpCheckResult.isPassed,.dshRemoteAcpCheckResult.isFailed{color:var(--dsw-alias-label-secondary)}",
      ".dshRemoteAcpList>.dshRemoteAuthorizationSetting{grid-template-columns:minmax(0,1fr) auto 40px 56px;column-gap:18px}.dshRemoteAcpCheckCell{grid-column:2;display:flex;align-items:center;gap:10px;min-width:0}.dshRemoteAcpCheckLink,.dshRemoteAcpRemoveLink{justify-self:start}.dshRemoteAcpCheckResult{position:static}",
      ".dshRemoteAcpCheckLink.isPassed{color:var(--dsw-alias-state-success-primary)}.dshRemoteAcpCheckLink.isFailed{color:var(--dsw-alias-state-danger-primary)}.dshRemoteAcpCheckLink.isChecking{color:var(--dsw-alias-label-secondary)}.dshRemoteAcpInstallLink{color:var(--dsw-alias-brand-primary);font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;white-space:nowrap}.dshRemoteAcpInstallLink.isInstalling{color:var(--dsw-alias-label-secondary);pointer-events:none}",
      ".dshRemoteCancelWorkspace{min-height:36px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 0;cursor:pointer}.dshRemoteCancelWorkspace:hover:not(:disabled){color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteCancelWorkspace:disabled{opacity:.5;cursor:default}",
      ".dshRemoteHostLoading{display:flex;align-items:center;justify-content:center;gap:8px;position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;color:var(--dsw-alias-label-secondary)}",
      '.dshRemoteHostList{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2);max-height:296px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.dshRemoteHostList.isCollapsed{max-height:none;overflow-y:visible}.dshRemoteHostList>button{min-height:58px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);background:transparent;padding:10px 20px 10px 4px;cursor:pointer}.dshRemoteHostList>button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteHostList>button:disabled{opacity:.5;cursor:default}.dshRemoteHostList>button[aria-current="true"]{background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteHostList>button>span{min-width:0;display:flex;flex-direction:column;gap:3px}.dshRemoteHostList>button strong{font-size:14px;font-weight:500}.dshRemoteHostList small{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dshRemoteConnectedMenu{position:relative;flex:0 0 auto;margin-right:4px}.dshRemoteConnectedCount{appearance:none;display:inline-flex;align-items:center;justify-content:center;height:22px;border:0;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);box-shadow:0 1px 2px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.04) inset;padding:0 10px;font:inherit;font-size:11px;font-weight:500;line-height:17px;white-space:nowrap;cursor:default}.dshRemoteConnectedCount.isOnline{color:var(--dsw-alias-state-success-primary)}.dshRemoteConnectedCount.isInteractive{cursor:pointer}.dshRemoteConnectedCount.isInteractive:hover{filter:brightness(1.08)}.dshRemoteConnectedCount:disabled{opacity:1;cursor:default}.dshRemoteConnectedCount:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dshRemoteConnectedPanel{position:absolute;top:calc(100% + 8px);right:0;z-index:4;width:min(320px,calc(100vw - 48px));max-height:min(280px,40vh);overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 10px 28px rgba(0,0,0,.28);padding:10px 12px}.dshRemoteConnectedPanelTitle{display:block;margin:0 0 6px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}.dshRemoteClientList{display:flex;flex-direction:column}.dshRemoteClientRow{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshRemoteClientRow:last-child{border-bottom:0}.dshRemoteClientRow>span{min-width:0;display:flex;flex-direction:column;gap:2px}.dshRemoteClientRow strong{font-size:13px;font-weight:500}.dshRemoteClientRow small{color:var(--dsw-alias-label-secondary);font-size:11px}.dshRemoteClientOnline{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-state-success-primary)!important}.dshRemoteClientOnline::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}',
      ".dshRemoteConnectedCount{height:auto;border-radius:0;background:transparent;box-shadow:none;padding:0 4px;text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 45%,transparent);text-underline-offset:3px}.dshRemoteConnectedCount.isInteractive:hover{filter:none;text-decoration-color:currentColor}.dshRemoteConnectedCount:focus-visible{outline-offset:3px;border-radius:3px}",
      ".dshRemoteProgressStatus{display:inline-flex;align-items:center;gap:8px}",
      '.dshRemoteProgress{display:flex;flex-direction:column;gap:8px;margin:12px 0;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dshRemoteProgressHeader{display:flex;align-items:center;justify-content:space-between;gap:12px}.dshRemoteProgressHeader strong{font-size:13px;font-weight:600}.dshRemoteProgressHeader span{color:var(--dsw-alias-label-secondary);font-size:12px}.dshRemoteProgressBar{height:6px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-bg-layer-3)}.dshRemoteProgressBar>span{display:block;width:100%;height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary);transform-origin:left center;transition:transform .22s ease-out}[dir="rtl"] .dshRemoteProgressBar>span{transform-origin:right center}.dshRemoteProgress p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}.dshRemoteProgressRoute{font-weight:500}.dshRemoteProgressRoute .isActive{color:var(--dsw-alias-state-success-primary);font-weight:700}.dshRemoteProgressRouteArrow{color:var(--dsw-alias-label-tertiary)}@media(prefers-reduced-motion:reduce){.dshRemoteProgressBar>span{transition:none}}',
      '.dshRemoteBrowser{display:flex;flex-direction:column}.dshRemoteCrumbs{display:flex;align-items:center;gap:4px;overflow:auto;padding:2px 0 10px}.dshRemoteCrumbs>button{flex:0 0 auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 7px;border-radius:6px;cursor:pointer}.dshRemoteCrumbs>button:not(:last-child)::after{content:" /";color:var(--dsw-alias-label-tertiary)}.dshRemoteCrumbs>button:disabled{color:var(--dsw-alias-label-primary);font-weight:600}',
      ".dshRemotePage.hasSelectedHost>.dshRemotePageHeader{flex-shrink:0}.dshRemotePage.hasSelectedHost>.dshRemotePageBody{min-height:0;overflow:hidden}.dshRemotePage.hasSelectedHost .dshRemotePageBody>button,.dshRemotePage.hasSelectedHost .dshRemotePageBody>p{flex-shrink:0}.dshRemotePage.hasSelectedHost .dshRemoteBrowser{min-height:0;flex:1 1 auto}.dshRemoteBrowser>.dshRemoteWorkspaceHeading{flex-shrink:0}.dshRemoteWorkspaceLists,.dshRemoteFolderBrowser{min-height:0;overflow:auto;overscroll-behavior:contain;flex:1 1 auto}",
      ".dshRemoteDirectoryList{min-height:72px;display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}.dshRemoteDirectoryList>button{min-height:52px;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);background:transparent;padding:8px 4px;cursor:pointer}.dshRemoteDirectoryList>button:hover,.dshRemoteDirectoryList>button.isSelected{background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteDirectoryList>button.isSelected{color:var(--dsw-alias-label-primary)}.dshRemoteDirectoryList>button>span:first-child,.dshRemoteDirectoryList>button>.dshRemoteWorkspaceIcon{grid-row:1/3}.dshRemoteWorkspaceIcon{box-sizing:border-box;width:22px;height:22px;align-self:center;object-fit:contain}.dshRemoteWorkspaceIcon.isGpt{border-radius:6px}.dshRemoteDirectoryList>button>span:not(:first-child),.dshRemoteDirectoryList>button>small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshRemoteDirectoryList>button>small{grid-column:2;color:var(--dsw-alias-label-secondary)}.dshRemoteDirectoryList>p,.dshRemoteHint{margin:12px 0;color:var(--dsw-alias-label-secondary);font-size:13px}",
      ".dshRemoteAddWorkspace{box-sizing:border-box;width:40px;height:40px;display:inline-grid;place-items:center;flex:0 0 auto;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);padding:0;cursor:pointer}.dshRemoteAddWorkspace:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteAddWorkspace:disabled{opacity:.5;cursor:default}.dshRemoteAddWorkspaceIcon{width:20px;height:20px}.dshRemoteCodexWorkspaceGroup{margin-top:16px}.dshRemoteWorkspaceSourceHeading{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 4px 7px}.dshRemoteWorkspaceSourceText{min-width:0;display:flex;flex-direction:column;gap:2px}.dshRemoteWorkspaceSourceText>strong{font-size:13px}.dshRemoteWorkspaceSourceText>small{color:var(--dsw-alias-label-secondary);font-size:11px}.dshRemoteCodexWorkspaceList{min-height:0}.dshRemoteDirectoryList>.dshRemoteWorkspaceMore,.dshRemoteCodexWorkspaceGroup>.dshRemoteWorkspaceMore{box-sizing:border-box;width:100%;min-height:48px;display:flex;align-items:center;justify-content:center;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 4px;text-align:center;font-size:16px;cursor:pointer}.dshRemoteWorkspaceMore>span{display:block;line-height:1;transform:translateY(-2px)}.dshRemoteWorkspaceMore:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:transparent}.dshRemoteWorkspaceMore:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dshRemoteWorkspaceMore:disabled{opacity:.5;cursor:default}",
      ".dshRemotePreviewAction,.dshRemotePreviewForm{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}.dshRemotePreviewForm input{width:90px;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);padding:6px}.dshRemotePreviewForm [role=alert]{max-width:360px;white-space:normal}.dshRemoteDevelopmentSettings{width:100%;margin:16px 0}.dshRemoteDevelopmentSettings .dshRemotePathField{display:flex;flex-direction:column;gap:6px;margin:8px 0}.dshRemoteDevelopmentSettings .dshRemotePathField>label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}.dshRemoteDevelopmentSettings .dshRemotePortsRow{display:flex;gap:8px;align-items:stretch;width:100%}.dshRemoteDevelopmentSettings .dshRemotePortsRow>input{box-sizing:border-box;width:100%;flex:1;min-width:0;height:34px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:0 12px;font:inherit;font-size:13px;line-height:1.5}.dshRemoteDevelopmentSettings button{min-height:34px;color:inherit;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 14px;white-space:nowrap;font-size:13px;line-height:1.5}.dshRemoteAcpAddForm>label{display:flex;min-width:0;flex-direction:column;gap:5px;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}.dshRemoteAcpAddForm>label>input{box-sizing:border-box;width:100%;height:34px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:0 12px;font:inherit;font-size:13px;line-height:1.5}",
      ".dshRemoteFolderBrowser{margin-top:14px}.dshRemoteFolderBrowser>p,.dshRemoteFolderList>p{margin:12px 0;color:var(--dsw-alias-label-secondary);font-size:13px}.dshRemoteFolderList{max-height:260px;overflow:auto;border-block:1px solid var(--dsw-alias-border-l2)}.dshRemoteFolderList>button{width:100%;min-height:42px;display:flex;align-items:center;gap:9px;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);background:transparent;padding:7px 6px;text-align:left;cursor:pointer}.dshRemoteFolderList>button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteFolderBrowser>small{display:block;margin-top:8px;color:var(--dsw-alias-state-warn-label)}",
      ".dshRemotePathField{display:flex;flex-direction:column;gap:6px;margin-top:20px}.dshRemotePathField>span{font-size:13px;font-weight:600}.dshRemotePathField>input{min-height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:0 12px;font:inherit}.dshRemotePathField>small{color:var(--dsw-alias-label-secondary)}",
      ".dshRemoteOpenBar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:20px;padding:14px 0;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2)}.dshRemoteOpenBar>div{min-width:0;display:flex;flex-direction:column;gap:3px}.dshRemoteOpenBar span{color:var(--dsw-alias-label-secondary);font-size:12px}.dshRemoteOpenBar strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.dshRemoteOpenBar>button,.dshRemoteEnable>button{min-height:40px;flex:0 0 auto;border:0;border-radius:8px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);padding:8px 16px;cursor:pointer}.dshRemoteOpenBar>button:disabled,.dshRemoteEnable>button:disabled{opacity:.5;cursor:default}",
      ".dshRemoteEnable{box-sizing:border-box;width:min(440px,100%);max-width:100%;min-height:388px;margin:0 auto;display:flex;flex-direction:column;align-items:stretch;gap:10px}.dshRemoteEnable p{margin:0;color:var(--dsw-alias-label-secondary);line-height:1.5}",
      '.dshRemoteLoginTabs{width:min(440px,100%);display:flex;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshRemoteLoginTabs>button{position:relative;min-height:38px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}.dshRemoteLoginTabs>button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dshRemoteLoginTabs>button.isActive{color:var(--dsw-alias-label-primary);font-weight:600}.dshRemoteLoginTabs>button.isActive::after{content:"";position:absolute;right:12px;bottom:-1px;left:12px;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary)}.dshRemoteLoginTabs>button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:6px}',
      ".dshRemoteSettingsServer{width:100%;flex:initial!important;margin:0 0 16px!important}.dshRemoteSettingsServer>label{flex:0 0 auto;font-size:13px}.dshRemotePairingInstructions,.dshRemotePairing .dshRemoteError{white-space:pre-line}",
      ".dshRemoteLoginServer{display:flex;flex-wrap:nowrap;align-items:center;gap:8px;flex:0 1 680px;min-width:0;margin:0}.dshRemoteLoginServer button{font-size:12px}.dshRemoteLoginServer input{box-sizing:border-box;flex:1 1 220px;min-width:0;min-height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:0 12px;font:inherit}.dshRemoteLoginServer button{flex:0 0 auto;min-height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:8px 12px;font:inherit;cursor:pointer}",
      ".dshRemoteClientLogin{width:min(440px,100%);display:flex;flex-direction:column;gap:8px}.dshRemoteClientLogin input{box-sizing:border-box;width:100%;min-height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:0 12px;font:inherit}.dshRemoteClientLogin button{align-self:flex-start;min-height:40px;border:0;border-radius:8px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);padding:8px 16px;cursor:pointer}.dshRemotePasswordHint{margin:0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}",
      '.dshRemoteLoginProgress{display:flex;align-items:center;justify-content:center;gap:8px;min-height:24px;color:var(--dsw-alias-label-secondary);font-size:12px}.dshRemoteLoginSpinner{order:1;display:inline-flex;align-items:center;justify-content:center;gap:12px;width:24px;height:16px;flex:0 0 auto}.dshRemoteLoginSpinner::before,.dshRemoteLoginSpinner::after{content:"";width:4px;height:4px;border-radius:50%;background:currentColor;animation:dshRemoteLoginPulse 1.2s ease-in-out infinite}.dshRemoteLoginSpinner::after{animation-delay:.2s}.dshRemoteLoginSpinner{background:radial-gradient(circle,currentColor 2px,transparent 2.5px) center/4px 4px no-repeat;animation:dshRemoteLoginPulse 1.2s ease-in-out .1s infinite}@keyframes dshRemoteLoginPulse{0%,80%,100%{opacity:.35}40%{opacity:1}}@media(prefers-reduced-motion:reduce){.dshRemoteLoginSpinner,.dshRemoteLoginSpinner::before,.dshRemoteLoginSpinner::after{animation:none;opacity:.65}}',
      ".dshRemoteQrLogin{width:min(440px,100%);display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0 2px;text-align:center}.dshRemoteQrLogin img,.dshRemoteQrPlaceholder{box-sizing:border-box;width:200px;height:200px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:#fff;padding:8px}.dshRemoteQrOpen{display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px;text-decoration:none}.dshRemoteQrOpen:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteQrOpen:hover img{border-color:var(--dsw-alias-label-dimmed)}.dshRemoteQrOpen:focus-visible{border-radius:12px;outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.dshRemoteQrPlaceholder{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}.dshRemoteQrLogin>strong{font-size:14px}.dshRemoteQrLogin>p{max-width:48ch;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}.dshRemoteServiceAddress{box-sizing:border-box;display:flex;flex-wrap:nowrap;align-items:center;justify-content:center;gap:6px;width:100%;height:44px;min-height:44px;margin:8px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}.dshRemoteServiceAddress>span{flex:0 0 auto;white-space:nowrap}.dshRemoteServiceAddress>a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);text-decoration:none}.dshRemoteServiceAddress>a:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteServiceAddressEdit{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:4px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.dshRemoteServiceAddressEdit:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dshRemoteServiceAddressEdit:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dshRemoteServiceAddressEdit:disabled{opacity:.5;cursor:default}.dshRemoteQrLogin>button,.dshRemoteClientLogin>.dshRemoteLoginSwitch{min-height:32px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 8px;font:inherit;font-size:12px;cursor:pointer}.dshRemoteQrLogin>button:hover,.dshRemoteClientLogin>.dshRemoteLoginSwitch:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteClientLogin>.dshRemoteLoginSwitch{align-self:flex-start;background:transparent;color:var(--dsw-alias-label-secondary);padding-left:0}",
      ".dshRemoteLoginHeading{box-sizing:border-box;width:100%;display:flex;align-items:baseline;justify-content:center;overflow:hidden;white-space:nowrap;font-size:14px}.dshRemoteLoginHeading>a{display:inline-flex;align-items:baseline;justify-content:center;gap:10px;min-width:0;color:var(--dsw-alias-label-primary);font-size:inherit;font-weight:700;text-decoration:none;border-bottom:1px solid transparent}.dshRemoteLoginHeading>a:hover{text-decoration:none;border-bottom-color:currentColor}.dshRemoteLoginHeading>a:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:3px}.dshRemoteLoginTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshRemoteLoginHeading>a>span{flex:0 0 auto;color:inherit;font-size:inherit;font-weight:inherit}.dshRemoteLoginTabs{box-sizing:border-box;width:100%;flex-wrap:nowrap;overflow-x:auto}.dshRemoteLoginTabs>button{min-width:max-content;flex:1 0 auto;display:flex;align-items:center;justify-content:center;padding:6px 10px;white-space:nowrap;text-align:center}.dshRemoteLoginTabs>button.isActive::after{right:0;left:0;bottom:0;border-radius:0}.dshRemoteClientLogin,.dshRemoteQrLogin{box-sizing:border-box;width:100%;height:300px;min-height:300px}.dshRemoteClientLogin{align-items:stretch;padding-top:16px}.dshRemoteClientLogin>button{align-self:stretch;width:100%}.dshRemoteQrLogin{padding-top:12px}",
      '.dshRemoteHostControlToggle{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;cursor:default}.dshRemoteHostControlToggle>input{appearance:none;box-sizing:border-box;position:relative;width:32px;height:18px;flex:0 0 auto;margin:0;border:1px solid var(--dsw-alias-label-secondary);border-radius:999px;background:var(--dsw-alias-bg-layer-3);cursor:pointer;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);transition:background .16s ease-out,border-color .16s ease-out,box-shadow .16s ease-out}.dshRemoteHostControlToggle>input::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .16s ease-out,background .16s ease-out}.dshRemoteHostControlToggle>input:checked{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-primary);box-shadow:none}.dshRemoteHostControlToggle>input:checked::after{transform:translateX(14px);background:var(--dsw-alias-bg-layer-1)}.dshRemoteHostControlToggle>input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dshRemoteHostControlToggle>input:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.dshRemoteHostControlToggle>input,.dshRemoteHostControlToggle>input::after{transition:none}}',
      ".dshRemoteAccountFooter{position:relative;display:flex;align-items:center;justify-content:flex-start;gap:12px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px;color:var(--dsw-alias-label-secondary);font-size:12px}.dshRemoteAccountSettings{flex:0 0 auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:5px 0;font:inherit;line-height:1.5;white-space:nowrap}.dshRemoteAccountSettings:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteAccountExit{flex:0 0 auto;margin-left:auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:5px 0;font-size:12px;line-height:1.5;white-space:nowrap}.dshRemoteAccountExit:hover:not(:disabled){color:var(--dsw-alias-label-primary);text-decoration:underline}.dshRemoteAccountExit:disabled{opacity:.5;cursor:default;text-decoration:none}",
      ".dshRemoteLocalLink{align-self:flex-start;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 0;cursor:pointer}.dshRemoteLocalLink:hover{color:var(--dsw-alias-label-primary)}",
      "@keyframes dshRemotePageIn{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.dshRemotePage{animation:none}}@media(max-width:620px){.dshRemoteBackdrop{padding:12px}.dshRemotePage{max-height:calc(100vh - 24px)}.dshRemotePageHeader{gap:8px;padding:12px 16px}.dshRemotePage.hasSelectedHost .dshRemotePageBack{max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshRemoteSectionHeading{align-items:flex-start;flex-direction:column;gap:8px}.dshRemoteWorkspaceHeading{align-items:center;flex-direction:row}.dshRemoteSectionActions{width:100%;justify-content:space-between}.dshRemotePageBody{padding:20px 16px}.dshRemoteOpenBar{align-items:flex-end}.dshRemoteOpenBar>button{min-height:48px}}",
      ".dshRemoteBackdrop{position:fixed;inset:0;z-index:1000;background:var(--dsw-alias-bg-mask-3);display:grid;place-items:center;padding:20px;-webkit-app-region:no-drag}",
      ".dshRemoteDialog{width:min(460px,100%);max-height:80vh;overflow:auto;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:18px;display:grid;gap:12px;box-shadow:var(--dsw-shadow-lv2)}",
      ".dshRemoteDialog button,.dshRemoteDialog input{font:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 10px;background:transparent;color:inherit}",
      ".dshRemoteDialog button:not(:disabled){cursor:pointer}.dshRemoteDialog button:disabled{opacity:.5}",
      ".dshRemoteHeader{display:flex;align-items:center;justify-content:space-between}.dshRemoteHeader button{border:0;font-size:22px;padding:0 6px}",
      ".dshRemoteDevices{display:grid;gap:8px}.dshRemoteDevices p{margin:4px 0;color:var(--dsw-alias-label-secondary)}",
      ".dshRemoteError{margin:0;color:var(--dsw-alias-state-error-primary)}",
      ".dshRemoteHostAccount{display:grid;gap:8px;border-top:1px solid var(--dsw-alias-border-l3);padding-top:12px}.dshRemoteHostAccount p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px}",
      ".dshRemoteLogin{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dshRemoteLogin button{grid-column:1/-1}",
      // The plugin manager already supplies DSH's detail page chrome and
      // spacing for `view: page`. Keep the legacy card only for older hosts;
      // current DSH must not get a second, old-style card inside that page.
      ".dshRemotePluginCard{list-style:none;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:var(--dsw-radius-xl,16px);transition:border-color .16s,background .16s}",
      ".dshRemoteDetailSettingsAction{appearance:none;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;line-height:1.4;color:inherit;cursor:pointer;background:transparent;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:5px 10px;transition:border-color .16s,background .16s}.dshRemoteDetailSettingsAction:hover{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2)}.dshRemoteDetailSettingsAction:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
      ".dshRemotePluginModern{box-sizing:border-box;width:100%;max-width:none;box-shadow:none;border:0;background:transparent;border-radius:0}.dshRemotePluginModern>.dshRemotePluginCardHeader{display:none}.dshRemotePluginModern>.dshRemotePluginCardBody{border-top:0;margin:0;padding:0}",
      ".dshRemotePluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}.dshRemotePluginCard.isOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
      ".dshRemotePluginCard.dshRemotePluginModern:hover,.dshRemotePluginCard.dshRemotePluginModern.isOpen{border-color:transparent;background:transparent}",
      ".dshRemotePluginCardHeader{display:flex;align-items:center}.dshRemotePluginCardToggle{appearance:none;width:100%;min-width:0;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}.dshRemotePluginCardToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
      ".dshRemotePluginCardHeading{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}.dshRemotePluginCardHeading>strong{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dshRemotePluginCardHeading>span{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.dshRemotePluginCardStatus{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.dshRemotePluginCardStatus.isOnline{color:var(--dsw-alias-state-success-primary)}.dshRemotePluginCardStatus.isReconnecting{color:var(--dsw-alias-state-warn-label)}.dshRemotePluginCardStatus.isOffline{color:var(--dsw-alias-state-error-primary)}.dshRemotePluginCardChevron{color:var(--dsw-alias-label-tertiary);font-size:18px;line-height:14px;transition:transform .16s}.dshRemotePluginCard.isOpen .dshRemotePluginCardChevron{transform:rotate(180deg)}",
      ".dshRemotePluginCardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.dshRemoteSettings{display:flex;flex-direction:column;max-width:none}.dshRemoteSettingsTop{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:0 0 12px}.dshRemoteSettingsState{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
      ".dshRemotePluginModern .dshRemoteField input{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md,8px);height:40px}.dshRemotePluginModern .dshRemoteSettingsFooter button{border-radius:var(--dsw-radius-md,8px);min-height:32px}",
      ".dshRemoteSettingsSignIn{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;padding:16px 0 12px;border-top:1px solid var(--dsw-alias-border-l2)}.dshRemoteSettingsSignIn p{max-width:70ch}.dshRemoteSettingsSignIn button{flex-shrink:0}",
      ".dshRemoteInlineSignIn{box-sizing:border-box;width:100%;margin-top:4px;padding-top:12px;padding-bottom:12px;border-top:1px solid var(--dsw-alias-border-l2)}.dshRemoteInlineSignIn .dshRemoteClientLogin,.dshRemoteInlineSignIn .dshRemoteQrLogin{height:auto;min-height:0;padding-bottom:8px}",
      ".dshRemoteHostIdentity{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2)}.dshRemoteHostIdentity>div{min-width:0;display:flex;flex-direction:column;gap:3px}.dshRemoteHostIdentity span{color:var(--dsw-alias-label-tertiary);font-size:12px}.dshRemoteHostIdentity strong,.dshRemoteHostIdentity code{min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}.dshRemoteHostIdentity code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-weight:400}",
      ".dshRemoteField{display:flex;flex-direction:column;gap:6px;padding:12px 0}.dshRemoteField+.dshRemoteField{border-top:1px solid var(--dsw-alias-border-l2)}.dshRemoteField label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}.dshRemoteField input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.dshRemoteField input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.dshRemoteField input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.dshRemoteFieldValue{min-width:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.dshRemoteField p{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
      ".dshRemotePairing{padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.dshRemotePairing h3{font-size:14px;margin:0 0 8px}.dshRemotePairing p{font-size:13px;line-height:1.5;margin:8px 0}.dshRemotePairingQr{box-sizing:border-box;display:block;width:min(200px,100%);height:auto;margin:12px auto;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:8px;background:#fff}.dshRemotePairingIdentity code{overflow-wrap:anywhere;font-size:12px}.dshRemotePairing label{display:grid;gap:8px}.dshRemotePairing input{width:100%;max-width:240px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:20px;letter-spacing:.15em}.dshRemotePairing input:focus-visible,.dshRemotePairing button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dshRemotePairingActions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}",
      ".dshRemoteServiceAddress:has(form){height:auto;flex-wrap:wrap;justify-content:flex-start;row-gap:6px}.dshRemoteServiceAddress:has(form)>span{width:100%;text-align:left}.dshRemoteServiceAddress .dshRemoteLoginServer{box-sizing:border-box;width:100%;flex:1 0 100%;display:flex;flex-wrap:wrap;gap:6px}.dshRemoteServiceAddress .dshRemoteLoginServer>input,.dshRemoteServiceAddress .dshRemoteLoginServer>button{box-sizing:border-box;height:36px;min-height:36px;font-size:13px;line-height:normal;border-radius:8px;padding:0 10px}.dshRemoteServiceAddress .dshRemoteLoginServer>input{flex:1 1 180px;width:0;min-width:180px}.dshRemoteServiceAddress .dshRemoteLoginServer>button{flex:0 1 auto}",
      ".dshRemotePairing .dshRemotePairingCountdown{text-align:center;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);margin:4px 0}",
      ".dshRemoteLoginContent{box-sizing:border-box;height:360px;min-height:360px;overflow:auto;scrollbar-gutter:stable;overflow-anchor:none;padding-top:12px}.dshRemoteLoginContent>.dshRemoteClientLogin,.dshRemoteLoginContent>.dshRemoteQrLogin{height:auto;min-height:0;padding-top:4px}.dshRemoteLoginContent .dshRemoteQrPlaceholder,.dshRemoteLoginContent .dshRemoteInlineSignInQrState{box-sizing:border-box;height:228px;min-height:228px;display:flex;flex-direction:column;align-items:center;justify-content:center}.dshRemoteLoginContent .dshRemoteQrOpen{box-sizing:border-box;min-height:228px}.dshRemoteInlineSignIn .dshRemoteLoginContent>.dshRemoteClientLogin,.dshRemoteInlineSignIn .dshRemoteLoginContent>.dshRemoteQrLogin{padding-top:4px}.dshRemoteLoginContent .dshRemotePairing,.dshRemoteInlineSignIn .dshRemoteLoginContent .dshRemotePairing{padding:4px 0}.dshRemoteLoginContent .dshRemotePairing .dshRemotePairingInstructions,.dshRemoteLoginContent .dshRemotePairing .dshRemotePairingPolicy{margin:0 0 8px}.dshRemoteLoginContent .dshRemotePairingQr{margin:8px auto}",
      ".dshRemoteInlineSignIn>.dshRemoteServiceAddress{justify-content:center;margin:8px 0 0;font-size:12px;height:36px;min-height:36px}.dshRemoteInlineSignIn>.dshRemoteServiceAddress:has(form){height:auto;min-height:0;margin-bottom:24px;position:relative;z-index:1;background:var(--dsw-alias-bg-base,var(--dsw-alias-bg-layer-1))}.dshRemotePanelPairing{width:100%;min-width:0}.dshRemotePanelPairing .dshRemoteSave{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);border:0}.dshRemotePanelPairing .dshRemotePairing{border-bottom:0}.dshRemotePanelPairing .dshRemotePairingPolicy{color:var(--dsw-alias-label-secondary);font-size:12px}",
      ".dshRemoteInlineSignIn .dshRemoteClientLogin{max-width:440px}.dshRemoteInlineSignIn .dshRemoteClientLogin>input,.dshRemoteInlineSignIn .dshRemoteClientLogin>button{height:36px;min-height:36px;font-size:13px}.dshRemoteInlineSignIn{width:min(440px,100%);max-width:100%;margin:0 auto 48px;padding-top:0;border-top:0}.dshRemoteInlineSignIn .dshRemoteSettingsServer{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 20px!important}.dshRemoteInlineSignIn .dshRemoteSettingsServer>label{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}.dshRemoteInlineSignIn .dshRemoteSettingsServer>input{height:34px;min-height:34px;font-size:13px;padding:0 10px;background:transparent;border-radius:6px}.dshRemoteInlineSignIn .dshRemoteSettingsServer>button{height:34px;min-height:34px;padding:0 12px;font-size:12px;border-radius:6px;background:transparent}.dshRemoteInlineSignIn .dshRemoteLoginTabs{width:100%;justify-content:stretch;gap:0}.dshRemoteInlineSignIn .dshRemoteLoginTabs>button{flex:1 0 0;min-width:max-content;min-height:38px;padding:6px 10px;font-size:13px}.dshRemoteInlineSignIn .dshRemotePairing{padding:20px 0 8px;border-bottom:0}.dshRemoteInlineSignIn .dshRemotePairing h3{margin:0 0 12px;font-size:14px}.dshRemoteInlineSignIn .dshRemotePairingInstructions{font-size:13px;line-height:1.8;margin:0 0 12px}.dshRemoteInlineSignIn .dshRemotePairingPolicy{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0 0 20px}.dshRemoteInlineSignIn .dshRemotePairingActions{margin:16px 0 0}.dshRemoteInlineSignIn .dshRemotePairingActions>button{width:100%;min-height:36px;padding:8px 14px;font-size:13px;border-radius:8px}.dshRemoteInlineSignIn .dshRemotePairing .dshRemoteError{font-size:12px;line-height:1.7}",
      ".dshRemoteLoginContent .dshRemotePairingQr{margin:4px auto}.dshRemotePairingActions:empty{display:none}.dshRemotePairingQrActions{display:flex;align-items:center;justify-content:center;gap:16px;min-height:48px}.dshRemotePairingQrActions>.dshRemotePairingCountdown{font-size:18px;line-height:1.4}.dshRemotePairingQrActions>button{min-height:44px;padding:8px 18px;font-size:15px}.dshRemoteLoginContent .dshRemotePairing .dshRemotePairingInstructions{font-size:15px;line-height:1.6}.dshRemotePairingInstructionPrimary{font-size:18px}.dshRemotePairingInstructionSecondary{font-size:15px}.dshRemoteLoginContent .dshRemotePairing .dshRemotePairingInstructions,.dshRemoteLoginContent .dshRemotePairing .dshRemotePairingPolicy{margin-bottom:4px}",
      ".dshRemotePairingHeading{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;margin-bottom:12px}.dshRemotePairingHeading>.dshRemotePairingInstructions{margin:0!important}.dshRemotePairingHeading>.dshRemotePairingCountdown{white-space:nowrap}.dshRemotePairing .dshRemotePairingIdentity{margin:12px 0 20px}.dshRemotePairingIdentity>strong{display:inline-block;margin-bottom:4px}.dshRemotePairingIdentity code{display:inline-block;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}.dshRemotePairingCodeForm{display:grid;gap:12px;margin-top:20px}.dshRemotePairingCodeForm>label{font-size:13px;gap:8px}.dshRemotePairingCodeForm input{height:44px;padding:8px 12px;font-size:20px}.dshRemotePairing .dshRemotePairingCodeWarning{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}.dshRemotePairingCodeActions{display:flex;gap:8px;flex-wrap:wrap}.dshRemotePairingCodeActions>button{min-height:36px;font-size:13px}",
      '.dshRemoteAuthorizationSetting{border-top:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 0}.dshRemoteAuthorizationSetting>div{min-width:0}.dshRemoteAuthorizationSetting strong{font-size:13px;font-weight:500}.dshRemoteAuthorizationSetting p{margin:3px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px}.dshRemoteAuthorizationSetting>input,.dshRemoteDebugLogControls>input{appearance:none;position:relative;width:38px;height:22px;flex:0 0 auto;margin:0;border:1px solid var(--dsw-alias-label-secondary);border-radius:999px;background:var(--dsw-alias-bg-layer-3);cursor:pointer;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);transition:background .16s ease-out,border-color .16s ease-out,box-shadow .16s ease-out}.dshRemoteAuthorizationSetting>input::after,.dshRemoteDebugLogControls>input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .16s ease-out,background .16s ease-out}.dshRemoteAuthorizationSetting>input:checked,.dshRemoteDebugLogControls>input:checked{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-primary);box-shadow:none}.dshRemoteAuthorizationSetting>input:checked::after,.dshRemoteDebugLogControls>input:checked::after{transform:translateX(16px);background:var(--dsw-alias-bg-layer-1)}.dshRemoteAuthorizationSetting>input:focus-visible,.dshRemoteDebugLogControls>input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dshRemoteAuthorizationSetting>input:disabled,.dshRemoteDebugLogControls>input:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.dshRemoteAuthorizationSetting>input,.dshRemoteAuthorizationSetting>input::after,.dshRemoteDebugLogControls>input,.dshRemoteDebugLogControls>input::after{transition:none}}',
      ".dshRemoteAssociation{min-width:0;flex:1;display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);align-items:baseline;column-gap:12px;row-gap:4px}.dshRemoteAssociation>span{grid-column:1/-1;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}.dshRemoteAssociation strong{grid-column:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:1.5;overflow-wrap:anywhere}.dshRemoteAssociation p{grid-column:2;color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
      ".dshRemoteConnection{border-top:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0}.dshRemoteConnectionSummary{min-width:0;display:flex;flex-direction:column;gap:4px}.dshRemoteConnectionSummary>span{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}.dshRemoteConnectionSummary strong{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:1.5}.dshRemoteConnectionSummary p,.dshRemoteConnectionIssue{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.dshRemoteConnectionDot{width:8px;height:8px;flex:0 0 auto;border-radius:999px;background:var(--dsw-alias-label-tertiary)}.dshRemoteConnectionDot.isOnline{background:var(--dsw-alias-state-success-primary)}.dshRemoteConnectionDot.isReconnecting{background:var(--dsw-alias-state-warn-primary)}.dshRemoteConnectionDot.isOffline{background:var(--dsw-alias-state-error-primary)}.dshRemoteConnectionIssue{color:var(--dsw-alias-state-error-primary);padding:0 0 12px}.dshRemoteReconnect{appearance:none;flex:0 0 auto;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);min-height:34px;padding:5px 14px;font-size:13px;line-height:1.5}.dshRemoteReconnect:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteReconnect:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.dshRemoteReconnect:disabled{opacity:.4;cursor:default}",
      ".dshRemoteSettingsFooter{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px}.dshRemoteSettingsFooter .dshRemoteError,.dshRemoteNotice{min-width:0;flex:1;margin:0;font-size:12px;line-height:1.5}.dshRemoteNotice{color:var(--dsw-alias-label-tertiary)}.dshRemoteDiscard,.dshRemoteSave{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.dshRemoteDiscard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}.dshRemoteDiscard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.dshRemoteSave{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.dshRemoteDiscard:disabled,.dshRemoteSave:disabled{opacity:.4;cursor:default}.dshRemoteDiscard:focus-visible,.dshRemoteSave:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
      ".dshRemoteDebugLogGroup{border-top:1px solid var(--dsw-alias-border-l2);padding:12px 0}.dshRemoteDebugLogHeader{display:flex;align-items:center;justify-content:space-between;gap:16px}.dshRemoteDebugLogTrigger{appearance:none;border:0!important;border-radius:6px!important;background:transparent!important;padding:0!important;margin:0;text-align:left;color:inherit;font:inherit;cursor:pointer;min-width:0;flex:1;min-height:unset!important;white-space:normal}.dshRemoteDebugLogTrigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:4px;border-radius:6px}.dshRemoteDebugLogTitleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dshRemoteDebugLogTitleRow strong{font-size:13px;font-weight:500}.dshRemoteDebugLogTrigger p{margin:3px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4;white-space:normal}.dshRemoteDebugLogLevelBadge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:500;line-height:1.5;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}.dshRemoteDebugLogLevelBadge.isDebug{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}.dshRemoteDebugLogControls{display:flex;align-items:center;gap:10px;flex:0 0 auto}",
      ".dshRemoteLogToggleBtn,.dshRemoteLogActionBtn,.dshRemoteLogFilterBtn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);min-height:28px!important;padding:3px 10px!important;font-size:12px!important;line-height:1.4!important;white-space:nowrap}.dshRemoteLogToggleBtn:hover:not(:disabled),.dshRemoteLogActionBtn:hover:not(:disabled),.dshRemoteLogFilterBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-interactive-bg-hover)}.dshRemoteLogToggleBtn:disabled,.dshRemoteLogActionBtn:disabled,.dshRemoteLogFilterBtn:disabled{opacity:.45;cursor:default}.dshRemoteLogFilterBtn.isActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-secondary);font-weight:500}.dshRemoteLogDrawer{margin-top:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));display:flex;flex-direction:column;gap:8px}.dshRemoteLogToolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.dshRemoteLogFilterGroup,.dshRemoteLogActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.dshRemoteLogMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.4}.dshRemoteLogMeta code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dshRemoteLogFallback{color:var(--dsw-alias-state-warn-primary)}.dshRemoteLogViewport{box-sizing:border-box;width:100%;max-height:260px;min-height:120px;overflow:auto;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.55;margin:0;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal}.dshRemoteLogLine{display:block;color:var(--dsw-alias-label-primary);margin-bottom:3px}.dshRemoteLogLine:last-child{margin-bottom:0}.dshRemoteLogLine.isDebug{color:var(--dsw-alias-label-tertiary)}.dshRemoteLogLine.isWarn{color:var(--dsw-alias-state-warn-primary)}.dshRemoteLogLine.isError{color:var(--dsw-alias-state-error-primary)}.dshRemoteLogEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0;padding:16px 0;text-align:center}",
      "@media(max-width:620px){.dshRemotePluginCardStatus{display:none}.dshRemoteSettingsTop{gap:10px}.dshRemoteConnection{align-items:flex-start}.dshRemoteReconnect{min-height:40px}.dshRemotePortsRow{flex-direction:column}.dshRemoteAcpAddForm{grid-template-columns:1fr}.dshRemoteAcpAddForm button{min-height:40px}}"
    ].join(""), document.head.append(style), () => style.remove();
  }
  function installTerminalAvailabilityNotice(feed, t) {
    let latest, notice, update = () => {
      let terminal = document.querySelector("[data-sidebar-terminal]"), unavailable = latest?.mode === "remote" && latest.remoteFeatures?.terminal !== !0;
      if (!terminal || !unavailable) {
        notice?.remove(), notice = void 0;
        return;
      }
      notice !== void 0 && notice.isConnected || (notice = document.createElement("div"), notice.className = "dshRemoteTerminalUnavailable", notice.setAttribute("role", "alert"), notice.textContent = t("terminalRemoteUnavailable"), terminal.prepend(notice));
    }, unsubscribe = feed.subscribe((status) => {
      latest = status, update();
    }), observer = new MutationObserver(update);
    return observer.observe(document.body, { childList: !0, subtree: !0 }), update(), () => {
      unsubscribe(), observer.disconnect(), notice?.remove();
    };
  }

  // packages/plugin/src/client/account-entry.ts
  var NATIVE_ROW_SELECTOR = '[class*="settingsArea"] [class*="triggerRow"]', DS_BOT_ROW_SELECTOR = '[class*="settingsArea"] .bt-settings-row', accountRowSelectors = [NATIVE_ROW_SELECTOR, DS_BOT_ROW_SELECTOR], accountRowRetry = { intervalMs: 50, attempts: 40 }, MISSING_ANCHOR_WARNING = 'ds-harness-remote: Compact sidebar entry found no account row ([class*="settingsArea"] [class*="triggerRow"] or [class*="settingsArea"] .bt-settings-row). This host/DS-Bot combination exposes no Compact slot; the Standard entry stays in the sidebar footer.', warned = /* @__PURE__ */ new Set();
  function reportMissingAnchor() {
    warned.has(MISSING_ANCHOR_WARNING) || (warned.add(MISSING_ANCHOR_WARNING), console.warn(MISSING_ANCHOR_WARNING));
  }
  function isLaidOut(row) {
    return typeof row.getClientRects != "function" || row.getClientRects().length > 0;
  }
  function findAccountRow(root) {
    for (let selector of accountRowSelectors)
      for (let row of Array.from(root.querySelectorAll(selector)))
        if (isLaidOut(row)) return row;
    return null;
  }
  function mountAccountEntry(attach) {
    let attempt = 0, timer, host, attached = !1, observer, sync = () => {
      timer !== void 0 && (window.clearTimeout(timer), timer = void 0);
      let row = findAccountRow(document);
      if (row === null) {
        attached && (attached = !1, attach(null)), attempt < accountRowRetry.attempts ? (attempt += 1, timer = window.setTimeout(sync, accountRowRetry.intervalMs)) : reportMissingAnchor();
        return;
      }
      attempt = 0, host === void 0 && (host = document.createElement("span")), (host.parentElement !== row || !host.isConnected) && row.append(host), attached || (attached = !0, attach(host)), observer === void 0 && document.body !== null && (observer = new MutationObserver(() => {
        (!attached || host?.isConnected !== !0) && sync();
      }), observer.observe(document.body, { childList: !0, subtree: !0 }));
    };
    return sync(), () => {
      timer !== void 0 && window.clearTimeout(timer), observer?.disconnect(), host?.remove();
    };
  }

  // packages/plugin/src/client/workspaces.ts
  var import_qrcode3 = __toESM(require_browser(), 1);

  // packages/plugin/src/version-compare.ts
  var VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
  function parseVersion(value) {
    let match = VERSION_PATTERN.exec(value.trim().replace(/^v/, ""));
    if (match !== null)
      return {
        core: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4] === void 0 ? [] : match[4].split(".")
      };
  }
  function comparePrerelease(left, right) {
    if (left.length === 0 && right.length === 0) return 0;
    if (left.length === 0) return 1;
    if (right.length === 0) return -1;
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      let part = left[index], other = right[index];
      if (part === void 0) return -1;
      if (other === void 0) return 1;
      if (part === other) continue;
      let partNumeric = /^\d+$/.test(part), otherNumeric = /^\d+$/.test(other);
      return partNumeric && otherNumeric ? Math.sign(Number(part) - Number(other)) : partNumeric ? -1 : otherNumeric ? 1 : part < other ? -1 : 1;
    }
    return 0;
  }
  function compareVersions(left, right) {
    let parsedLeft = parseVersion(left), parsedRight = parseVersion(right);
    if (parsedLeft === void 0 || parsedRight === void 0) return 0;
    for (let index = 0; index < 3; index += 1)
      if (parsedLeft.core[index] !== parsedRight.core[index])
        return Math.sign(parsedLeft.core[index] - parsedRight.core[index]);
    return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
  }

  // packages/plugin/src/client/icons.ts
  var deepSeekWorkspaceIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAACVBMVEUAAADy8vXx8fUsA3vyAAAAAXRSTlMAQObYZgAAAOxJREFUWMPtlsEOwyAMQxP+/6OnTZMGxHGcot3wDYgfhkJbs6urprzveGtu9d1NgEdto8w93GuA7zPS2RFg7ynsCOAokbtAmLr2YaeKgJ6fxpT8jCAC0qSqPyNoO5DXdvyouj4ClFAdYaDxK09uiBDCIYBf6CxLesnR0uF2pG+JmhCqrUb0AOvjjoQaYDTCEAAgMg5grhAeAQIB+/M15IcKlnUIp4CkTCd0AKb4zVsRSJVGYEVzT0agK107IMGMEurvromEpaX4wzk/IKw378kq4LafED6Oowxfk7AP2q8W16EdM3p29Eyvrv6vF0WIBfBziKyCAAAAAElFTkSuQmCC", gptWorkspaceIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAclBMVEX////v7+++wMf////s7O3k5OTExcrX2Ny6vMTv8PPW19yXmqRqboJmaHd3eoaqrLPs7fGMjpfb3eKlpq1eYXOxs7pWWWd+gY5HSVdRVGVub3k+QU74+Pg4OkcvMT1ISlUoKjUiIy4fICueoKkaGyUSFB21Bp+qAAAAAXRSTlMAQObYZgAABChJREFUWMPtl916qjoQhlsdEwIECEgMYCBxx/u/xT1DrFUL1LO1DtY8LSLJvPnmB4gfH//sr7TPDfvdebf/xXZbkE/4zZ0MVhGHd9zJDsv+7F3//Z69tT5wljAu3tXw+TIlzXKJlhflYmJ+5uF5WpWhb54X+C/zZCmT2wJA4dJZwus0UYjIGqWyMhVbEp4yKNRRqlv0opW5PJLJ4rFJXvP4JKDRMqturBZjkMVJFYjR6iHQDQDI4+k2k51wZbWrqwp4mR/1CVYATyko9TFGxBUqL5IvMbXSWt0T8bkGgFLqgqZBI/Uxbx5UAxLaNcCNLBpttM7wbCc1pmJOpWAsDtey68UaQMyrFgb9uxLPjqg3+nGluyKN0XUdWw0BJ0NvTFFqgzpr9J+Dh4w0Ga1qkqBNswagxdRgFPAbgHRQG5jumGWyMxrTIaRRa4AzFs0YrNMXgI4MJWnsKYFhGNMnIh/mBOPsV8CZBFjN9w8ArowxnZzDr5IcvxTaKpxJCVsoI3SWysz1UM4AqQdzlCgho1IKrK+x1mKFzisANtgEU8E7GwHDgOqxe4w9tnM166wbaA2xBMBLrTWcAGYGdCiYVUJUrMCF+7l6gklrW1RwPi8ByjuActANqhKzVWoYrFGcCFzbDgNaBrTWpncFQMcI2DfWoAiDqRCiHcYM/ZdCEKkZqfR8spj4F0CiJjv2gHL6URNoCQDaYacL6O1oFDO2eQDUFP7AKdCRdC4CRDZaNifbjA41l/uYb/SZMAFNTBGzY7sG4J2jTsJgToOzIzXF3HZqBpSOAGduXbkGEKV1OqVGqRJpRxtvwbSw5IqAiUJItwBCOT9R32FCGo3nCkAN3t0UTBRC6zDONcBeOee9pr4T+ASbnDOdc5OmtREwEEB5w8Wqgt4bOV5c7Lt9iiK8zdP/IsBbutUGX4gNwEVCqd3FUt/xYnRWt7BvPBYQjwjAGXa3ASguHVAZ/WXKlA3eZDX1wRegFsr7E2wAlB9xFbx/7MV70kFT8aqNgLL3F8nFBmA3hrn/IJHjKJOK2oj1WI4Z4FzwN/81AOhgYD6v2xbIvaZIurLC9AfvB1WLTYAoXejF1xeBL5cpBIyEbmxkZymIXwDQh1BAfOrhI1lfwtgz8tozF5T4ttf3+32AyxC6klwAgw/YVTHpoK82xYt3wLP/Bw4AAI4D7/01TLKXBj9NEz2wEuGiKpoy68S/FwCLMQAZ3gXhihaCa25vQo6RyToOz9PE6wYjJgGi1YnqZX8qMIK+TDlnargGzSv4NvFjlwXf/nfLLMrAB4O/Xl3BH0d+RIASFgDA8IYMIXgr2+cBsbDdPSwAAHjSZFmb3txETCKIxc0uWwI8rxsLJcTiVndNwyMgKljbbNN2/zcEAja2+4RgIDYN2Bu/WtAOaEodnu2dnzz/7I/Y/w/LaEcX/MdfAAAAAElFTkSuQmCC";

  // packages/plugin/src/client/plugin-upgrade.ts
  var DEFAULTS = {
    intervalMs: 1e3,
    unreachableDeadlineMs: 6e4,
    stalledReads: 3
  };
  async function settleLostUpgrade(readStatus, latest, options = {}) {
    let intervalMs = options.intervalMs ?? DEFAULTS.intervalMs, deadlineMs = options.unreachableDeadlineMs ?? DEFAULTS.unreachableDeadlineMs, stalledReads = options.stalledReads ?? DEFAULTS.stalledReads, sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))), waited = 0, stalled = 0;
    for (; waited <= deadlineMs; ) {
      let status;
      try {
        status = await readStatus();
      } catch {
        status = void 0;
      }
      let current = status !== void 0 && status.controlUnavailable !== !0 ? status.update?.currentVersion : void 0;
      if (current !== void 0) {
        if (compareVersions(current, latest) >= 0) return "upgraded";
        if (stalled += 1, stalled >= stalledReads) return "unknown";
      } else
        stalled = 0;
      await sleep(intervalMs), waited += intervalMs;
    }
    return "unknown";
  }

  // packages/plugin/src/client/workspaces.ts
  function createRemoteWorkspaceAction(React, portal) {
    let ServerNotice = createServerNotice(React), HostPairingPanel = createHostPairingPanel(React), RemoteProgressView = createRemoteProgressView(React);
    function RemoteAccountEntry(props) {
      let [container, setContainer] = React.useState(null), { portal: portal2 } = props;
      if (React.useEffect(
        () => portal2 === void 0 ? void 0 : mountAccountEntry(setContainer),
        [portal2]
      ), typeof portal2 != "function" || container === null) return props.fallback;
      try {
        return portal2(props.children, container);
      } catch {
        return props.fallback;
      }
    }
    function RemoteWorkspaceAction(props) {
      let { t } = props, connectionErrorMessageFor = (reason, translate) => {
        if (typeof reason == "object" && reason !== null && "code" in reason) {
          let code = reason.code;
          if (typeof code == "string") return connectionErrorMessage(code, translate);
        }
        return messageOf(reason, translate);
      }, [open, setOpen] = React.useState(!1), [status, setStatus] = React.useState(void 0), [devices, setDevices] = React.useState([]), [discoveryUnavailable, setDiscoveryUnavailable] = React.useState(!1), [selectedHost, setSelectedHost] = React.useState(void 0), [connectingHost, setConnectingHost] = React.useState(void 0), [workspaces, setWorkspaces] = React.useState([]), [codexWorkspaces, setCodexWorkspaces] = React.useState([]), [cursorWorkspaces, setCursorWorkspaces] = React.useState([]), [antigravityWorkspaces, setAntigravityWorkspaces] = React.useState([]), [piWorkspaces, setPiWorkspaces] = React.useState([]), [opencodeWorkspaces, setOpencodeWorkspaces] = React.useState([]), [claudeWorkspaces, setClaudeWorkspaces] = React.useState([]), [hermesWorkspaces, setHermesWorkspaces] = React.useState([]), [workspaceBackend, setWorkspaceBackend] = React.useState("harness"), [codexWorkspaceId, setCodexWorkspaceId] = React.useState(void 0), [cursorWorkspaceId, setCursorWorkspaceId] = React.useState(void 0), [antigravityWorkspaceId, setAntigravityWorkspaceId] = React.useState(void 0), [piWorkspaceId, setPiWorkspaceId] = React.useState(void 0), [opencodeWorkspaceId, setOpencodeWorkspaceId] = React.useState(void 0), [claudeWorkspaceId, setClaudeWorkspaceId] = React.useState(void 0), [hermesWorkspaceId, setHermesWorkspaceId] = React.useState(void 0), [directory, setDirectory] = React.useState(void 0), [path, setPath] = React.useState(""), [addingWorkspace, setAddingWorkspace] = React.useState(!1), [showAllWorkspaces, setShowAllWorkspaces] = React.useState(!1), [showAllCodexWorkspaces, setShowAllCodexWorkspaces] = React.useState(!1), [devicesOpen, setDevicesOpen] = React.useState(!1), [upgradePhase, setUpgradePhase] = React.useState("idle"), [upgradeError, setUpgradeError] = React.useState(void 0), [showAllCursorWorkspaces, setShowAllCursorWorkspaces] = React.useState(!1), [showAllAntigravityWorkspaces, setShowAllAntigravityWorkspaces] = React.useState(!1), [showAllPiWorkspaces, setShowAllPiWorkspaces] = React.useState(!1), [showAllOpencodeWorkspaces, setShowAllOpencodeWorkspaces] = React.useState(!1), [showAllClaudeWorkspaces, setShowAllClaudeWorkspaces] = React.useState(!1), [showAllHermesWorkspaces, setShowAllHermesWorkspaces] = React.useState(!1), workspaceListId = "dsh-remote-workspace-list", codexWorkspaceHeadingId = "dsh-remote-codex-workspace-heading", codexWorkspaceListId = "dsh-remote-codex-workspace-list", cursorWorkspaceHeadingId = "dsh-remote-cursor-workspace-heading", cursorWorkspaceListId = "dsh-remote-cursor-workspace-list", antigravityWorkspaceHeadingId = "dsh-remote-antigravity-workspace-heading", piWorkspaceHeadingId = "dsh-remote-pi-workspace-heading", opencodeWorkspaceHeadingId = "dsh-remote-opencode-workspace-heading", claudeWorkspaceHeadingId = "dsh-remote-claude-workspace-heading", hermesWorkspaceHeadingId = "dsh-remote-hermes-workspace-heading", antigravityWorkspaceListId = "dsh-remote-antigravity-workspace-list", piWorkspaceListId = "dsh-remote-pi-workspace-list", opencodeWorkspaceListId = "dsh-remote-opencode-workspace-list", claudeWorkspaceListId = "dsh-remote-claude-workspace-list", hermesWorkspaceListId = "dsh-remote-hermes-workspace-list", [busy, setBusy] = React.useState(!1), [refreshingHosts, setRefreshingHosts] = React.useState(!1), [needsAuthorization, setNeedsAuthorization] = React.useState(void 0), [email, setEmail] = React.useState(""), [password, setPassword] = React.useState(""), [loginServerUrl, setLoginServerUrl] = React.useState("https://dsh.r2049.cn"), [editingServer, setEditingServer] = React.useState(!1), [savingServer, setSavingServer] = React.useState(!1), serverDirty = loginServerUrl.trim() !== (status?.serverUrl ?? ""), [loginMethod, setLoginMethod] = React.useState("password"), loginMethodManuallySelected = React.useRef(!1), [oauthProviders, setOAuthProviders] = React.useState([]), [providersLoading, setProvidersLoading] = React.useState(!1), [providersFailed, setProvidersFailed] = React.useState(!1), [pairingServerUrl, setPairingServerUrl] = React.useState(void 0), pairingAvailable = pairingServerUrl !== void 0 && pairingServerUrl === status?.serverUrl, [providerReload, setProviderReload] = React.useState(0), providerRequestRun = React.useRef(0), [qrSession, setQrSession] = React.useState(void 0), [qrImage, setQrImage] = React.useState(void 0), [qrExpired, setQrExpired] = React.useState(!1), [hostEmail, setHostEmail] = React.useState(""), [hostPassword, setHostPassword] = React.useState(""), [hostRegistrationCode, setHostRegistrationCode] = React.useState(""), [progress, setProgress] = React.useState(void 0), progressRun = React.useRef(0), qrFlowRun = React.useRef(0), pageRef = React.useRef(null), [notice, setNotice] = React.useState(void 0), [error, setError] = React.useState(void 0), [sidebarEntry, setSidebarEntry] = React.useState(() => props.sidebarEntry.read());
      React.useEffect(
        () => props.sidebarEntry.subscribe(() => setSidebarEntry(props.sidebarEntry.read())),
        [props.sidebarEntry]
      ), React.useEffect(() => {
        props.control("settings.get").then((view) => props.sidebarEntry.publish(view.config.sidebar?.entry ?? "standard")).catch(() => {
        });
      }, [props.control, props.sidebarEntry]), React.useEffect(() => {
        open || (setDevicesOpen(!1), qrFlowRun.current += 1, setBusy(!1));
      }, [open]), React.useEffect(() => {
        if (!open) return;
        let frame = window.requestAnimationFrame(() => pageRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
      }, [open]), React.useEffect(() => {
        if (!open) return;
        let closeOnEscape = (event) => {
          if (event.key === "Escape") {
            if (devicesOpen) {
              event.stopPropagation(), setDevicesOpen(!1);
              return;
            }
            setOpen(!1);
          }
        };
        return window.addEventListener("keydown", closeOnEscape), () => window.removeEventListener("keydown", closeOnEscape);
      }, [open, devicesOpen]), React.useEffect(() => {
        if (!devicesOpen) return;
        let closeOnPointer = (event) => {
          let target = event.target;
          target instanceof Element && target.closest(".dshRemoteConnectedMenu") === null && setDevicesOpen(!1);
        };
        return window.addEventListener("mousedown", closeOnPointer), () => window.removeEventListener("mousedown", closeOnPointer);
      }, [devicesOpen]), React.useEffect(() => {
        (status?.host?.connectedClients?.length ?? 0) === 0 && setDevicesOpen(!1);
      }, [status?.host?.connectedClients?.length]), React.useEffect(() => {
        props.control("status").then(setStatus).catch(() => {
        });
      }, []), React.useEffect(() => {
        status?.serverUrl !== void 0 && setLoginServerUrl(status.serverUrl), setPairingServerUrl(void 0), setLoginMethod((current) => current === "device_pairing" ? "password" : current);
      }, [status?.serverUrl]), React.useEffect(() => {
        let remoteActive2 = status?.mode === "remote";
        return document.documentElement.classList.toggle("dshRemoteTargetActive", remoteActive2), () => {
          remoteActive2 && document.documentElement.classList.remove("dshRemoteTargetActive");
        };
      }, [status?.mode]);
      let startQrLogin = async (provider) => {
        let run = ++qrFlowRun.current;
        setBusy(!0), setError(void 0), setQrExpired(!1);
        try {
          let session = await props.control("client.account.qr.start", { provider }), image = await import_qrcode3.default.toDataURL(session.scanUrl, {
            width: 184,
            margin: 1,
            errorCorrectionLevel: "L"
          });
          if (run !== qrFlowRun.current) return;
          setQrSession(session), setQrImage(image);
        } catch (reason) {
          run === qrFlowRun.current && setError(messageOf(reason, t));
        } finally {
          run === qrFlowRun.current && setBusy(!1);
        }
      };
      React.useEffect(() => {
        if (!open || !needsAuthorization || savingServer || serverDirty) return;
        let active = !0, run = ++providerRequestRun.current;
        return qrFlowRun.current += 1, setBusy(!1), setQrSession(void 0), setQrImage(void 0), setQrExpired(!1), setOAuthProviders([]), setProvidersLoading(!0), setProvidersFailed(!1), props.control("client.account.providers").then((items) => {
          if (!active || run !== providerRequestRun.current) return;
          let pairingSupported = items.some((item) => item.devicePairing === !0);
          setPairingServerUrl(pairingSupported ? status?.serverUrl : void 0);
          let available = items.filter((item) => item.qrStartUrl != null);
          setOAuthProviders(available), setLoginMethod((current) => {
            if (loginMethodManuallySelected.current && (current === "password" || current === "device_pairing" && pairingSupported || available.some((item) => `oauth:${item.id}` === current))) return current;
            let preferred = available.find((item) => item.id === props.preferredQrProvider) ?? available[0];
            return preferred === void 0 ? "password" : `oauth:${preferred.id}`;
          });
        }).catch(() => {
          !active || run !== providerRequestRun.current || (setProvidersFailed(!0), setLoginMethod((current) => loginMethodManuallySelected.current && current === "device_pairing" ? current : "password"));
        }).finally(() => {
          active && run === providerRequestRun.current && setProvidersLoading(!1);
        }), () => {
          active = !1;
        };
      }, [open, needsAuthorization, status?.serverUrl, props.preferredQrProvider, providerReload, savingServer, serverDirty]), React.useEffect(() => {
        !open || !needsAuthorization || savingServer || serverDirty || providersLoading || loginMethod === "password" || !oauthProviders.some((item) => `oauth:${item.id}` === loginMethod) || qrSession !== void 0 || qrExpired || startQrLogin(loginMethod.slice(6));
      }, [open, needsAuthorization, providersLoading, oauthProviders, loginMethod, qrSession, qrExpired, savingServer, serverDirty]), React.useEffect(() => {
        if (!open || savingServer || serverDirty || loginMethod === "password" || qrSession === void 0) return;
        let active = !0, polling = !1, settled = !1, run = qrFlowRun.current, timer, poll = () => {
          polling || settled || (polling = !0, props.control("client.account.qr.poll", { qrId: qrSession.qrId }).then(async (result) => {
            if (!(!active || settled || run !== qrFlowRun.current))
              if (result.status === "complete") {
                settled = !0, timer !== void 0 && window.clearInterval(timer), setBusy(!0), setError(void 0), setQrExpired(!1);
                try {
                  let [nextDevices, nextStatus] = await Promise.all([
                    props.control("devices"),
                    props.control("status")
                  ]);
                  active && run === qrFlowRun.current && (setDevices(nextDevices), setStatus(nextStatus), setNeedsAuthorization(!1));
                } catch (reason) {
                  active && run === qrFlowRun.current && setError(connectionErrorMessageFor(reason, t));
                } finally {
                  run === qrFlowRun.current && (setQrSession(void 0), setQrImage(void 0), setBusy(!1));
                }
              } else result.status === "expired" && (settled = !0, timer !== void 0 && window.clearInterval(timer), setQrExpired(!0), setQrSession(void 0), setQrImage(void 0));
          }).catch((reason) => {
            active && !settled && run === qrFlowRun.current && setError(messageOf(reason, t));
          }).finally(() => {
            polling = !1;
          }));
        };
        return poll(), timer = window.setInterval(poll, 1500), () => {
          active = !1, timer !== void 0 && window.clearInterval(timer);
        };
      }, [open, loginMethod, qrSession, savingServer, serverDirty]);
      let selectLoginMethod = (method) => {
        loginMethodManuallySelected.current = !0, method !== loginMethod && (qrFlowRun.current += 1, setLoginMethod(method), setQrSession(void 0), setQrImage(void 0), setQrExpired(!1), setError(void 0));
      }, orderedQrProviders = [...oauthProviders].sort((a, b) => +(b.id === props.preferredQrProvider) - +(a.id === props.preferredQrProvider)), selectedProvider = oauthProviders.find((item) => `oauth:${item.id}` === loginMethod), scanLabel = t("scanWithProvider", { provider: selectedProvider?.displayName ?? "" }), passwordVisible = !savingServer && !serverDirty && loginMethod === "password" && (loginMethodManuallySelected.current || !providersLoading && oauthProviders.length === 0), qrLoginTab = (provider) => React.createElement("button", {
        key: provider.id,
        type: "button",
        role: "tab",
        id: `dsh-remote-oauth:${provider.id}-tab`,
        "aria-selected": loginMethod === `oauth:${provider.id}`,
        "aria-controls": `dsh-remote-oauth:${provider.id}-panel`,
        className: loginMethod === `oauth:${provider.id}` ? "isActive" : "",
        disabled: busy,
        onClick: () => selectLoginMethod(`oauth:${provider.id}`)
      }, t("providerLogin", { provider: provider.displayName })), selectHost = async (host) => {
        setBusy(!0), setError(void 0), setConnectingHost(host), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1);
        try {
          let result = await runConnectHostProgress(
            status?.preferredTransports,
            host.deviceId,
            props.control,
            { label: "remoteProgressLoadingWorkspaces", detail: "remoteProgressLoadingWorkspacesDetail" },
            setProgress,
            progressRun,
            async () => {
              let nextWorkspaces = await props.control("workspaces.list", {
                targetDeviceId: host.deviceId
              }), [
                nextCodexWorkspaces,
                nextCursorWorkspaces,
                nextAntigravityWorkspaces,
                nextPiWorkspaces,
                nextOpencodeWorkspaces,
                nextClaudeWorkspaces,
                nextHermesWorkspaces,
                nextStatus
              ] = await Promise.all([
                props.control("codex.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("cursor.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("antigravity.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("pi.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("opencode.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("claude.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("hermes.workspaces.list", { targetDeviceId: host.deviceId }).catch(() => []),
                props.control("status").catch(() => {
                })
              ]);
              return nextStatus !== void 0 && setStatus(nextStatus), {
                workspaces: nextWorkspaces,
                codexWorkspaces: nextCodexWorkspaces,
                cursorWorkspaces: nextCursorWorkspaces,
                antigravityWorkspaces: nextAntigravityWorkspaces,
                piWorkspaces: nextPiWorkspaces,
                opencodeWorkspaces: nextOpencodeWorkspaces,
                claudeWorkspaces: nextClaudeWorkspaces,
                hermesWorkspaces: nextHermesWorkspaces,
                status: nextStatus
              };
            },
            (result2) => connectedProgress(result2.status)
          );
          setWorkspaces(result.workspaces), setCodexWorkspaces(result.codexWorkspaces), setCursorWorkspaces(result.cursorWorkspaces), setAntigravityWorkspaces(result.antigravityWorkspaces), setPiWorkspaces(result.piWorkspaces), setOpencodeWorkspaces(result.opencodeWorkspaces), setClaudeWorkspaces(result.claudeWorkspaces), setHermesWorkspaces(result.hermesWorkspaces), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setSelectedHost(host), setPath(""), setAddingWorkspace(!1), setDirectory(void 0);
        } catch (reason) {
          setError(connectionErrorMessageFor(reason, t));
        } finally {
          setConnectingHost(void 0), setBusy(!1);
        }
      }, browseDirectory = async (nextPath) => {
        if (selectedHost !== void 0) {
          setBusy(!0), setError(void 0);
          try {
            let listing = await props.control("directory.list", {
              targetDeviceId: selectedHost.deviceId,
              ...nextPath === void 0 ? {} : { path: nextPath }
            });
            setDirectory(listing), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setPath(listing.path);
          } catch (reason) {
            setError(connectionErrorMessageFor(reason, t));
          } finally {
            setBusy(!1);
          }
        }
      }, startAddingWorkspace = (backend) => {
        setAddingWorkspace(!0), setWorkspaceBackend(backend), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setDirectory(void 0), setPath(""), browseDirectory();
      }, cancelAddingWorkspace = () => {
        setAddingWorkspace(!1), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setDirectory(void 0), setPath("");
      }, refreshRemote = async () => {
        setBusy(!0), setRefreshingHosts(!0), setNotice(void 0), setError(void 0);
        try {
          let nextStatus = await props.control("status");
          if (setStatus(nextStatus), nextStatus.controlUnavailable) {
            setNeedsAuthorization(void 0), setError(t("remoteControlUnavailable"));
            return;
          }
          if (nextStatus.startupError !== void 0) {
            setDevices([]), setNeedsAuthorization(void 0), setSelectedHost(void 0), setWorkspaces([]), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setPath(""), setAddingWorkspace(!1), setDirectory(void 0), setError(startupErrorMessage(nextStatus.startupError, t));
            return;
          }
          if (nextStatus.host?.pairingHostOnly) {
            setNeedsAuthorization(!nextStatus.host.authorized || nextStatus.host.accountRequired), setDevices([]), setDiscoveryUnavailable(!1), chooseAnotherHost();
            return;
          }
          if (!nextStatus.available) {
            setDevices([]), setNeedsAuthorization(!1), setSelectedHost(void 0), setWorkspaces([]), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setPath(""), setAddingWorkspace(!1), setDirectory(void 0);
            return;
          }
          try {
            if (nextStatus.clientAuthRequired)
              throw Object.assign(new Error("Sign in again."), { code: "AUTH_INVALID" });
            if (!(await props.control("client.authorization.status")).hasCredentials)
              throw Object.assign(new Error("Remote account authorization is required."), { code: "ACCOUNT_AUTH_REQUIRED" });
            setNeedsAuthorization(!1);
            let nextDevices = await props.control("devices");
            if (setDevices(nextDevices), setDiscoveryUnavailable(!1), selectedHost !== void 0) {
              let nextSelectedHost = nextDevices.find((device) => device.deviceId === selectedHost.deviceId);
              nextSelectedHost === void 0 ? (setSelectedHost(void 0), setWorkspaces([]), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setPath(""), setAddingWorkspace(!1), setDirectory(void 0)) : (setSelectedHost(nextSelectedHost), props.control("workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setWorkspaces(w)).catch(() => {
              }), props.control("codex.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setCodexWorkspaces(w)).catch(() => {
              }), props.control("cursor.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setCursorWorkspaces(w)).catch(() => {
              }), props.control("antigravity.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setAntigravityWorkspaces(w)).catch(() => {
              }), props.control("pi.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setPiWorkspaces(w)).catch(() => {
              }), props.control("opencode.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setOpencodeWorkspaces(w)).catch(() => {
              }), props.control("claude.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setClaudeWorkspaces(w)).catch(() => {
              }), props.control("hermes.workspaces.list", { targetDeviceId: nextSelectedHost.deviceId }).then((w) => setHermesWorkspaces(w)).catch(() => {
              }));
            }
          } catch (reason) {
            let code = typeof reason == "object" && reason !== null && "code" in reason ? String(reason.code) : "";
            ["ACCOUNT_AUTH_REQUIRED", "AUTH_INVALID", "AUTH_REQUIRED", "TOKEN_EXPIRED", "DEVICE_REVOKED", "DEVICE_OWNERSHIP_REQUIRED"].includes(code) ? (setDevices([]), setNeedsAuthorization(!0), setSelectedHost(void 0), setWorkspaces([]), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setPath(""), setAddingWorkspace(!1), setDirectory(void 0)) : code === "CONNECTION_FAILED" || messageOf(reason, t) === t("serverUnavailableError") ? setDiscoveryUnavailable(!0) : setError(messageOf(reason, t));
          }
        } catch (reason) {
          setError(connectionErrorMessageFor(reason, t));
        } finally {
          setRefreshingHosts(!1), setBusy(!1);
        }
      }, show = async () => {
        setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setOpen(!0), await refreshRemote();
      };
      React.useEffect(() => props.subscribeOpen(() => {
        show();
      }), [props.subscribeOpen, show]), React.useEffect(() => props.statusFeed.subscribe((next) => {
        setStatus(next), next.host?.pairingHostOnly && (setNeedsAuthorization(!next.host.authorized || next.host.accountRequired), setDevices([]), setSelectedHost(void 0), setConnectingHost(void 0)), next.host?.online && setDiscoveryUnavailable(!1);
      }), [props.statusFeed]);
      let chooseAnotherHost = () => {
        setSelectedHost(void 0), setWorkspaces([]), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setShowAllWorkspaces(!1), setShowAllCodexWorkspaces(!1), setShowAllCursorWorkspaces(!1), setShowAllAntigravityWorkspaces(!1), setShowAllPiWorkspaces(!1), setShowAllOpencodeWorkspaces(!1), setShowAllClaudeWorkspaces(!1), setShowAllHermesWorkspaces(!1), setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setDirectory(void 0), setPath(""), setAddingWorkspace(!1), setError(void 0);
      }, resetLoginFlow = () => {
        providerRequestRun.current += 1, qrFlowRun.current += 1, setQrSession(void 0), setQrImage(void 0), setQrExpired(!1), setOAuthProviders([]), setPairingServerUrl(void 0), setProvidersFailed(!1), setProvidersLoading(!1), setLoginMethod("password"), loginMethodManuallySelected.current = !1, setPassword(""), setError(void 0), setNotice(void 0);
      }, saveLoginServer = async (serverUrlOverride) => {
        let nextServerUrl = (serverUrlOverride ?? loginServerUrl).trim();
        if (!(nextServerUrl === "" || savingServer)) {
          resetLoginFlow(), setSavingServer(!0), setBusy(!0);
          try {
            if ((await props.control("settings.server.set", { serverUrl: nextServerUrl })).applies !== "live") {
              setNotice(t("serverSaved"));
              return;
            }
            let nextStatus = await props.control("status");
            setStatus(nextStatus), setLoginServerUrl(nextStatus.serverUrl ?? loginServerUrl.trim()), setEditingServer(!1), setProviderReload((value) => value + 1);
          } catch (reason) {
            setError(messageOf(reason, t));
          } finally {
            setSavingServer(!1), setBusy(!1);
          }
        }
      }, signInClient = async () => {
        if (!(serverDirty || savingServer || email.trim() === "" || password === "" || loginServerUrl.trim() === "")) {
          setBusy(!0), setError(void 0);
          try {
            status?.clientAuthRequired ? await props.control("client.account.login", { email: email.trim(), password }) : await props.control("settings.configure", {
              role: "client",
              serverUrl: loginServerUrl.trim(),
              email: email.trim(),
              password
            }), setDevices(await props.control("devices")), setStatus(await props.control("status")), setNeedsAuthorization(!1), setPassword("");
          } catch (reason) {
            setError(connectionErrorMessageFor(reason, t));
          } finally {
            setBusy(!1);
          }
        }
      }, authorizeHost = async (kind) => {
        if (!(kind === "account" && (hostEmail.trim() === "" || hostPassword === "")) && !(kind === "code" && hostRegistrationCode.trim() === "")) {
          setBusy(!0), setError(void 0);
          try {
            kind === "account" ? (await props.control("host.account.login", { email: hostEmail.trim(), password: hostPassword }), setHostPassword("")) : (await props.control("host.registration-code.submit", { code: hostRegistrationCode.trim() }), setHostRegistrationCode("")), setStatus(await props.control("status"));
          } catch (reason) {
            setError(connectionErrorMessageFor(reason, t));
          } finally {
            setBusy(!1);
          }
        }
      }, openLocalWorkspaces = async () => {
        setBusy(!0), setError(void 0);
        try {
          await props.control("mode.set", { mode: "local" }), window.location.reload();
        } catch (reason) {
          setError(messageOf(reason, t)), setBusy(!1);
        }
      }, setCurrentDeviceControl = async (enabled) => {
        setBusy(!0), setError(void 0);
        try {
          setStatus(await props.control("host.authorization.set", { enabled }));
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setBusy(!1);
        }
      }, logoutRemote = async () => {
        qrFlowRun.current += 1, progressRun.current += 1, setBusy(!0), setError(void 0);
        try {
          await props.control("settings.logout"), setDevices([]), setSelectedHost(void 0), setConnectingHost(void 0), setWorkspaces([]), setCodexWorkspaces([]), setCursorWorkspaces([]), setAntigravityWorkspaces([]), setPiWorkspaces([]), setOpencodeWorkspaces([]), setClaudeWorkspaces([]), setHermesWorkspaces([]), setDirectory(void 0), setPath(""), setPassword(""), setProgress(void 0), setNeedsAuthorization(!0), setQrSession(void 0), setQrImage(void 0), setQrExpired(!1), setStatus(await props.control("status"));
        } catch (reason) {
          setError(messageOf(reason, t));
        } finally {
          setBusy(!1);
        }
      }, openWorkspace = async (selection) => {
        let targetBackend = selection?.backend ?? workspaceBackend, targetPath = (selection?.path ?? path).trim(), targetCodexWorkspaceId = selection?.backend === "codex" ? selection.workspaceId : selection === void 0 ? codexWorkspaceId : void 0, targetCursorWorkspaceId = selection?.backend === "cursor" ? selection.workspaceId : selection === void 0 ? cursorWorkspaceId : void 0, targetAntigravityWorkspaceId = selection?.backend === "antigravity" ? selection.workspaceId : selection === void 0 ? antigravityWorkspaceId : void 0, targetPiWorkspaceId = selection?.backend === "pi" ? selection.workspaceId : selection === void 0 ? piWorkspaceId : void 0, targetOpencodeWorkspaceId = selection?.backend === "opencode" ? selection.workspaceId : selection === void 0 ? opencodeWorkspaceId : void 0, targetClaudeWorkspaceId = selection?.backend === "claude" ? selection.workspaceId : selection === void 0 ? claudeWorkspaceId : void 0, targetHermesWorkspaceId = selection?.backend === "hermes" ? selection.workspaceId : selection === void 0 ? hermesWorkspaceId : void 0, createWorkspace = selection === void 0 && addingWorkspace;
        if (!(selectedHost === void 0 || targetPath === "" || !createWorkspace && targetBackend === "codex" && targetCodexWorkspaceId === void 0 || !createWorkspace && targetBackend === "cursor" && targetCursorWorkspaceId === void 0 && targetPath === "" || !createWorkspace && targetBackend === "antigravity" && targetAntigravityWorkspaceId === void 0 && targetPath === "")) {
          setBusy(!0), setError(void 0);
          try {
            let nextStatus = await (targetBackend === "codex" ? createWorkspace ? props.control("codex.workspace.create", {
              targetDeviceId: selectedHost.deviceId,
              path: targetPath
            }) : props.control("codex.workspace.open", {
              targetDeviceId: selectedHost.deviceId,
              workspaceId: targetCodexWorkspaceId
            }) : targetBackend !== "harness" ? (() => {
              let workspaceId = {
                cursor: targetCursorWorkspaceId,
                antigravity: targetAntigravityWorkspaceId,
                pi: targetPiWorkspaceId,
                opencode: targetOpencodeWorkspaceId,
                claude: targetClaudeWorkspaceId,
                hermes: targetHermesWorkspaceId
              }[targetBackend];
              return createWorkspace || workspaceId === void 0 ? props.control(`${targetBackend}.workspace.create`, { targetDeviceId: selectedHost.deviceId, path: targetPath }) : props.control(`${targetBackend}.workspace.open`, { targetDeviceId: selectedHost.deviceId, workspaceId });
            })() : props.control("workspace.open", {
              targetDeviceId: selectedHost.deviceId,
              path: targetPath
            }));
            setStatus(nextStatus), nextStatus.workspaceSelection !== void 0 && window.sessionStorage.setItem(pendingWorkspaceSelectionKey, JSON.stringify(nextStatus.workspaceSelection)), window.location.reload();
          } catch (reason) {
            setError(messageOf(reason, t)), setBusy(!1);
          }
        }
      }, reauth = status?.clientAuthRequired === !0, remoteLabel = reauth ? t("clientSignInAgain") : status?.mode === "remote" ? t("activeRemote", { name: status.target?.name ?? t("host") }) : t("remoteEntry"), remoteActionLabel = !reauth && status?.mode === "remote" ? `${remoteLabel} \xB7 ${t("exitRemote")}` : remoteLabel, visibleWorkspaces = showAllWorkspaces ? workspaces : workspaces.slice(0, 3), visibleCodexWorkspaces = showAllCodexWorkspaces ? codexWorkspaces : codexWorkspaces.slice(0, 3), visibleCursorWorkspaces = showAllCursorWorkspaces ? cursorWorkspaces : cursorWorkspaces.slice(0, 3), visibleAntigravityWorkspaces = showAllAntigravityWorkspaces ? antigravityWorkspaces : antigravityWorkspaces.slice(0, 3), visiblePiWorkspaces = showAllPiWorkspaces ? piWorkspaces : piWorkspaces.slice(0, 3), visibleOpencodeWorkspaces = showAllOpencodeWorkspaces ? opencodeWorkspaces : opencodeWorkspaces.slice(0, 3), visibleClaudeWorkspaces = showAllClaudeWorkspaces ? claudeWorkspaces : claudeWorkspaces.slice(0, 3), visibleHermesWorkspaces = showAllHermesWorkspaces ? hermesWorkspaces : hermesWorkspaces.slice(0, 3), codexAvailable = status?.remoteFeatures?.codex === !0, cursorAvailable = status?.remoteFeatures?.cursor === !0, antigravityAvailable = status?.remoteFeatures?.antigravity === !0, piAvailable = status?.remoteFeatures?.pi === !0, opencodeAvailable = status?.remoteFeatures?.opencode === !0, claudeAvailable = status?.remoteFeatures?.claude === !0, hermesAvailable = status?.remoteFeatures?.hermes === !0, rawUpdate = status?.update, updateInfo = rawUpdate !== void 0 && typeof rawUpdate.currentVersion == "string" && typeof rawUpdate.latestVersion == "string" ? rawUpdate : void 0, localUpdateAvailable = updateInfo !== void 0 && compareVersions(updateInfo.currentVersion, updateInfo.latestVersion) < 0, updateNotice = updateInfo !== void 0 && localUpdateAvailable ? t("updateAvailable", { latest: updateInfo.latestVersion, current: updateInfo.currentVersion }) : void 0, releasesUrl = "https://github.com/liguobao/ds-harness-remote/releases", canUpgradeInPlace = updateInfo?.upgrade === "ready", startLocalUpgrade = async () => {
        if (!(!canUpgradeInPlace || updateInfo === void 0)) {
          setUpgradePhase("running"), setUpgradeError(void 0);
          try {
            let result = await props.control("plugin.update", {
              version: updateInfo.latestVersion
            });
            if (result.status === "started") {
              setUpgradePhase("started");
              return;
            }
            if (result.status === "manual") {
              setUpgradePhase("idle"), window.open(releasesUrl, "_blank", "noopener");
              return;
            }
            setUpgradePhase("failed"), setUpgradeError(typeof result.message == "string" && result.message !== "" ? result.message : t("pluginUpdateFailed"));
          } catch (reason) {
            if (setUpgradePhase("verifying"), await settleLostUpgrade(
              () => props.control("status"),
              updateInfo.latestVersion
            ) === "upgraded") {
              setUpgradePhase("started");
              return;
            }
            setUpgradePhase("unknown"), setUpgradeError(messageOf(reason, t));
          }
        }
      }, deviceUpdateAvailable = (device) => updateInfo !== void 0 && device.clientVersion !== void 0 && compareVersions(device.clientVersion, updateInfo.latestVersion) < 0, selectedHostDetails = selectedHost === void 0 ? void 0 : [
        formatPlatform(selectedHost.platform),
        selectedHost.harnessVersion === void 0 ? void 0 : t("harnessVersion", { version: selectedHost.harnessVersion }),
        selectedHost.clientVersion === void 0 ? void 0 : t("pluginVersion", { version: selectedHost.clientVersion }),
        deviceUpdateAvailable(selectedHost) ? t("updateAvailableTag") : void 0
      ].filter(Boolean).join(" \xB7 "), connectedClients = status?.host?.connectedClients ?? [], connectedCount = connectedClients.length, connectedCountLabel = t("connectedClientCount", { count: connectedCount }), connectedMenu = !needsAuthorization && status?.hostAuthorizationAvailable === !0 ? React.createElement(
        "div",
        {
          className: `dshRemoteConnectedMenu${devicesOpen ? " isOpen" : ""}`
        },
        React.createElement("a", {
          href: connectedCount > 0 ? "#connected-devices" : void 0,
          className: `dshRemoteConnectedCount${connectedCount > 0 ? " isOnline isInteractive" : ""}`,
          "aria-expanded": connectedCount > 0 ? devicesOpen : void 0,
          "aria-haspopup": connectedCount > 0 ? "dialog" : void 0,
          title: connectedCountLabel,
          "aria-label": connectedCountLabel,
          onClick: (event) => {
            event.preventDefault(), connectedCount !== 0 && setDevicesOpen((current) => !current);
          }
        }, connectedCountLabel),
        devicesOpen && connectedCount > 0 ? React.createElement(
          "div",
          {
            className: "dshRemoteConnectedPanel",
            id: "connected-devices",
            role: "dialog",
            "aria-label": t("currentConnectedDevices")
          },
          React.createElement(
            "div",
            { className: "dshRemoteConnectedPanelHeader" },
            React.createElement("strong", { className: "dshRemoteConnectedPanelTitle" }, t("currentConnectedDevices")),
            React.createElement(ServerNotice, {
              countdownOnly: !0,
              offline: status?.host?.online === !1 && status.host.reconnecting,
              linked: connectedCount > 0,
              expiresAt: status?.host?.recoveryExpiresAt,
              t
            })
          ),
          React.createElement(
            "div",
            { className: "dshRemoteClientList", "aria-label": t("currentConnectedDevices") },
            ...connectedClients.map((client) => React.createElement(
              "div",
              {
                key: client.deviceId,
                className: "dshRemoteClientRow"
              },
              React.createElement(
                "span",
                null,
                React.createElement(
                  "span",
                  { className: "dshRemoteHostNameLine" },
                  React.createElement("strong", null, client.name.trim() === "" ? t("unknownDevice") : client.name),
                  null
                ),
                React.createElement("small", null, [
                  client.platform === void 0 ? void 0 : formatPlatform(client.platform),
                  connectedClientModeLabel(client.mode, t)
                ].filter(Boolean).join(" \xB7 "))
              ),
              React.createElement("small", { className: "dshRemoteClientOnline" }, t("connected"))
            ))
          )
        ) : null
      ) : null, serverUnavailable = discoveryUnavailable || status?.host?.online === !1 && status.host.reconnecting && (status.host.lastActiveAt !== void 0 || status.host.error === "CONNECTION_FAILED"), listedHosts = status?.host?.pairingHostOnly ? [] : connectingHost === void 0 ? devices : [connectingHost], computerIcon = React.createElement(
        "svg",
        {
          className: "dshRemoteComputerIcon",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": !0
        },
        React.createElement("rect", { x: 3, y: 4, width: 18, height: 13, rx: 2 }),
        React.createElement("path", { d: "M8 21h8M12 17v4" })
      ), remoteActive = status?.mode === "remote", updateSuffix = localUpdateAvailable && props.wide ? React.createElement("span", {
        className: "dshRemoteUpdateSuffix",
        title: updateNotice,
        "aria-hidden": !0
      }, t("updateShort", { version: updateInfo?.latestVersion ?? "" })) : null, updateDot = localUpdateAvailable ? React.createElement("span", { className: "dshRemoteUpdateDot", title: t("updateBadge"), "aria-hidden": !0 }) : null, entry = React.createElement(
        "div",
        { className: `dshRemoteSidebarEntry${remoteActive ? " isActive" : ""}${props.wide ? " isWide" : " isRail"}${localUpdateAvailable ? " hasUpdate" : ""}` },
        React.createElement(remoteActive && props.wide && !reauth ? "div" : "button", {
          ...remoteActive && props.wide && !reauth ? {} : {
            type: "button",
            disabled: remoteActive && busy,
            onClick: () => void (remoteActive && !reauth ? openLocalWorkspaces() : show())
          },
          className: "dshRemoteModeButton",
          title: props.wide ? remoteLabel : remoteActionLabel,
          "aria-label": props.wide ? remoteLabel : remoteActionLabel
        }, computerIcon, props.wide ? React.createElement("span", { className: "dshRemoteSidebarLabel" }, remoteLabel) : null, props.wide ? updateSuffix : updateDot),
        remoteActive && props.wide ? React.createElement("button", {
          type: "button",
          className: "dshRemoteExitLink",
          disabled: busy,
          onClick: () => void openLocalWorkspaces()
        }, t("exitRemote")) : null
      ), accountEntry = remoteActive ? entry : React.createElement(
        "div",
        { className: `dshRemoteAccountEntry${remoteActive ? " isActive" : ""}` },
        React.createElement("button", {
          type: "button",
          className: "dshRemoteAccountEntryButton",
          disabled: remoteActive && busy,
          title: remoteActionLabel,
          "aria-label": remoteActionLabel,
          onClick: () => void (remoteActive && !reauth ? openLocalWorkspaces() : show())
        }, computerIcon, updateDot)
      ), compact = sidebarEntry === "compact" && props.wide && props.portal !== void 0;
      return React.createElement(
        React.Fragment,
        null,
        compact ? React.createElement(RemoteAccountEntry, { portal: props.portal, fallback: entry }, accountEntry) : entry,
        open ? renderBodyPortal(portal, React.createElement("div", {
          className: "dshRemoteBackdrop",
          role: "presentation",
          onMouseDown: (event) => {
            event.target === event.currentTarget && setOpen(!1);
          }
        }, React.createElement(
          "section",
          {
            className: `dshRemotePage${selectedHost === void 0 ? "" : " hasSelectedHost"}`,
            role: "dialog",
            "aria-modal": !0,
            "aria-label": selectedHost?.name ?? t("remoteTitle"),
            tabIndex: -1,
            ref: pageRef
          },
          React.createElement(
            "header",
            { className: "dshRemotePageHeader" },
            React.createElement(
              "div",
              { className: "dshRemotePageIntro" },
              React.createElement(
                "div",
                { className: "dshRemotePageTitleRow" },
                React.createElement("strong", null, selectedHost?.name ?? t("remoteTitle")),
                selectedHost === void 0 ? React.createElement("a", {
                  className: "dshRemoteStarLink",
                  href: "https://github.com/liguobao/ds-harness-remote",
                  target: "_blank",
                  rel: "noreferrer"
                }, t("starProject")) : null
              ),
              React.createElement("p", null, selectedHostDetails ?? t(status?.host?.pairingHostOnly ? "pairingHostOnly" : "remoteDescription"))
            ),
            React.createElement(
              "div",
              { className: "dshRemotePageActions" },
              selectedHost === void 0 ? null : React.createElement("button", {
                type: "button",
                className: "dshRemotePageBack",
                disabled: busy,
                title: t("backToHosts"),
                onClick: chooseAnotherHost
              }, t("backToHosts")),
              React.createElement("button", {
                type: "button",
                className: "dshRemotePageRefresh",
                disabled: busy,
                title: t("refreshRemote"),
                "aria-label": t("refreshRemote"),
                onClick: () => void refreshRemote()
              }, t("refreshRemoteShort")),
              React.createElement("button", { type: "button", className: "dshRemotePageClose", onClick: () => setOpen(!1), "aria-label": t("close") }, "\xD7")
            )
          ),
          React.createElement(
            "main",
            { className: "dshRemotePageBody" },
            status?.mode === "remote" ? React.createElement("button", {
              type: "button",
              className: "dshRemoteLocalLink",
              disabled: busy,
              onClick: () => void openLocalWorkspaces()
            }, t("openLocalWorkspaces")) : null,
            React.createElement(
              React.Fragment,
              null,
              needsAuthorization === void 0 && busy ? React.createElement("p", null, t("checkingConnection")) : null,
              needsAuthorization ? React.createElement(
                "section",
                { className: "dshRemoteEnable" },
                React.createElement(
                  "div",
                  { className: "dshRemoteLoginHeading" },
                  React.createElement(
                    "a",
                    {
                      href: "https://github.com/liguobao/ds-harness-remote",
                      target: "_blank",
                      rel: "noopener noreferrer"
                    },
                    React.createElement("strong", { className: "dshRemoteLoginTitle" }, t("signInClient")),
                    React.createElement("span", null, t("signInClientDescription"))
                  )
                ),
                React.createElement(
                  "div",
                  { className: "dshRemoteLoginTabs", role: "tablist" },
                  pairingAvailable && status?.hostAuthorizationAvailable ? React.createElement("button", {
                    type: "button",
                    role: "tab",
                    id: "dsh-remote-pairing-tab",
                    "aria-selected": loginMethod === "device_pairing",
                    "aria-controls": "dsh-remote-pairing-panel",
                    className: loginMethod === "device_pairing" ? "isActive" : "",
                    disabled: busy || savingServer,
                    onClick: () => selectLoginMethod("device_pairing")
                  }, t("pairingLoginTab")) : null,
                  ...orderedQrProviders.map(qrLoginTab),
                  React.createElement("button", {
                    type: "button",
                    role: "tab",
                    id: "dsh-remote-password-tab",
                    "aria-selected": passwordVisible,
                    "aria-controls": "dsh-remote-password-panel",
                    className: passwordVisible ? "isActive" : "",
                    disabled: busy || savingServer || serverDirty,
                    onClick: () => selectLoginMethod("password")
                  }, t("accountPasswordLogin"))
                ),
                React.createElement(
                  "div",
                  { className: "dshRemoteLoginContent" },
                  providersLoading && loginMethod !== "device_pairing" ? React.createElement("p", { role: "status" }, t("loadingLoginProviders")) : null,
                  providersFailed ? React.createElement(
                    "p",
                    { role: "status" },
                    t("noLoginProviders"),
                    " ",
                    React.createElement("button", {
                      type: "button",
                      disabled: busy || savingServer || serverDirty,
                      onClick: () => setProviderReload((value) => value + 1)
                    }, t("retryLoginProviders"))
                  ) : null,
                  !savingServer && !serverDirty && !providersLoading && !providersFailed && oauthProviders.length === 0 && loginMethod !== "device_pairing" ? React.createElement("p", { role: "status" }, t("noLoginProviders")) : null,
                  loginMethod === "device_pairing" && pairingAvailable && status?.hostAuthorizationAvailable ? React.createElement(
                    "div",
                    { role: "tabpanel", id: "dsh-remote-pairing-panel", "aria-labelledby": "dsh-remote-pairing-tab", className: "dshRemotePanelPairing" },
                    React.createElement(HostPairingPanel, {
                      key: status.serverUrl ?? "",
                      control: props.control,
                      serverUrl: status.serverUrl ?? "",
                      disabled: busy || savingServer || serverDirty,
                      t,
                      onComplete: () => {
                        refreshRemote();
                      }
                    })
                  ) : passwordVisible ? React.createElement(
                    "div",
                    {
                      className: "dshRemoteClientLogin",
                      role: "tabpanel",
                      id: "dsh-remote-password-panel",
                      "aria-labelledby": "dsh-remote-password-tab"
                    },
                    React.createElement("input", {
                      type: "email",
                      value: email,
                      disabled: busy,
                      autoComplete: "username",
                      placeholder: t("account"),
                      "aria-label": t("account"),
                      onChange: (event) => setEmail(event.target.value)
                    }),
                    React.createElement("input", {
                      type: "password",
                      value: password,
                      disabled: busy,
                      autoComplete: "current-password",
                      placeholder: t("password"),
                      "aria-label": t("password"),
                      onChange: (event) => setPassword(event.target.value)
                    }),
                    React.createElement("button", { type: "button", disabled: busy || savingServer || serverDirty || loginServerUrl.trim() === "" || email.trim() === "" || password === "", onClick: () => void signInClient() }, t(busy ? "signingIn" : "startSignIn")),
                    React.createElement("p", { className: "dshRemotePasswordHint" }, t("passwordHint"))
                  ) : selectedProvider !== void 0 ? React.createElement(
                    "div",
                    {
                      className: "dshRemoteQrLogin",
                      role: "tabpanel",
                      id: `dsh-remote-${loginMethod}-panel`,
                      "aria-labelledby": `dsh-remote-${loginMethod}-tab`
                    },
                    qrImage === void 0 ? React.createElement(
                      "div",
                      { className: "dshRemoteQrPlaceholder", "aria-busy": busy },
                      qrExpired ? React.createElement("p", null, t("qrLoginExpired")) : React.createElement("span", null, t("checkingConnection"))
                    ) : qrSession !== void 0 ? React.createElement(
                      "a",
                      {
                        className: "dshRemoteQrOpen",
                        href: qrSession.scanUrl,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        "aria-label": t("openInBrowser")
                      },
                      React.createElement("img", {
                        src: qrImage,
                        width: 184,
                        height: 184,
                        alt: scanLabel
                      }),
                      React.createElement("span", null, t("openInBrowser"), " \u2197")
                    ) : null,
                    React.createElement("strong", null, scanLabel),
                    React.createElement("p", null, t("scanLoginHint")),
                    !qrExpired && (busy || qrSession !== void 0) ? React.createElement(
                      "div",
                      {
                        className: "dshRemoteLoginProgress",
                        role: "status",
                        "aria-live": "polite"
                      },
                      React.createElement("span", { className: "dshRemoteLoginSpinner", "aria-hidden": !0 }),
                      t(busy && qrSession !== void 0 ? "loginLoadingDevices" : "loginWaitingAuthorization")
                    ) : null,
                    qrExpired ? React.createElement("button", {
                      type: "button",
                      disabled: busy,
                      onClick: () => setQrExpired(!1)
                    }, t("refreshQrCode")) : null
                  ) : null
                ),
                React.createElement(
                  "div",
                  { className: "dshRemoteServiceAddress" },
                  React.createElement("span", null, t("currentServiceAddress")),
                  editingServer ? React.createElement(
                    "form",
                    {
                      className: "dshRemoteLoginServer",
                      onSubmit: (event) => {
                        event.preventDefault(), saveLoginServer();
                      }
                    },
                    React.createElement("input", {
                      id: "dsh-remote-login-server",
                      type: "url",
                      required: !0,
                      "aria-label": t("serverUrl"),
                      value: loginServerUrl,
                      disabled: busy || savingServer,
                      autoComplete: "url",
                      placeholder: t("serverUrl"),
                      onChange: (event) => {
                        resetLoginFlow(), setLoginServerUrl(event.target.value);
                      }
                    }),
                    React.createElement("button", {
                      type: "submit",
                      disabled: busy || savingServer || loginServerUrl.trim() === ""
                    }, t(savingServer ? "saving" : "save")),
                    React.createElement("button", {
                      type: "button",
                      disabled: busy || savingServer,
                      onClick: () => {
                        resetLoginFlow(), setLoginServerUrl("https://dsh.r2049.cn"), saveLoginServer("https://dsh.r2049.cn");
                      }
                    }, t("restoreDefaultServiceAddress")),
                    React.createElement("button", {
                      type: "button",
                      disabled: busy || savingServer,
                      onClick: () => {
                        setLoginServerUrl(status?.serverUrl ?? "https://dsh.r2049.cn"), setEditingServer(!1);
                      }
                    }, t("cancelServiceAddressEdit"))
                  ) : React.createElement(
                    React.Fragment,
                    null,
                    React.createElement("a", {
                      href: status?.serverUrl ?? loginServerUrl,
                      target: "_blank",
                      rel: "noreferrer"
                    }, status?.serverUrl ?? loginServerUrl),
                    React.createElement("button", {
                      type: "button",
                      className: "dshRemoteServiceAddressEdit",
                      disabled: busy || savingServer,
                      title: t("editServiceAddress"),
                      "aria-label": t("editServiceAddress"),
                      onClick: () => setEditingServer(!0)
                    }, React.createElement("svg", {
                      viewBox: "0 0 24 24",
                      width: 16,
                      height: 16,
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: 1.8,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      "aria-hidden": !0
                    }, React.createElement("path", { d: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" })))
                  )
                )
              ) : null,
              needsAuthorization !== !1 ? null : React.createElement(
                React.Fragment,
                null,
                selectedHost === void 0 ? React.createElement(
                  "section",
                  { className: "dshRemoteHosts", "aria-label": t("chooseHost") },
                  status?.hostAuthorizationAvailable && status.host?.accountRequired ? React.createElement(
                    "section",
                    { className: "dshRemoteHostAccount" },
                    React.createElement("strong", null, t("thisMachineHost")),
                    React.createElement("p", null, t("hostSignInHint")),
                    React.createElement(
                      "div",
                      { className: "dshRemoteLogin" },
                      React.createElement("input", { type: "email", value: hostEmail, disabled: busy, autoComplete: "username", placeholder: t("serverAccountEmail"), "aria-label": t("serverAccountEmail"), onChange: (event) => setHostEmail(event.target.value) }),
                      React.createElement("input", { type: "password", value: hostPassword, disabled: busy, autoComplete: "current-password", placeholder: t("serverAccountPassword"), "aria-label": t("serverAccountPassword"), onChange: (event) => setHostPassword(event.target.value) }),
                      React.createElement("button", { type: "button", disabled: busy || hostEmail.trim() === "" || hostPassword === "", onClick: () => void authorizeHost("account") }, t(busy ? "signingIn" : "signInRegisterHost")),
                      React.createElement("input", { value: hostRegistrationCode, disabled: busy, autoComplete: "one-time-code", placeholder: t("hostRegistrationCode"), "aria-label": t("hostRegistrationCode"), onChange: (event) => setHostRegistrationCode(event.target.value) }),
                      React.createElement("button", { type: "button", disabled: busy || hostRegistrationCode.trim() === "", onClick: () => void authorizeHost("code") }, t(busy ? "registering" : "useRegistrationCode"))
                    )
                  ) : null,
                  React.createElement(
                    "div",
                    { className: "dshRemoteSectionHeading" },
                    React.createElement(
                      "div",
                      { className: "dshRemoteSectionTitle" },
                      React.createElement("strong", null, t(status?.host?.pairingHostOnly ? "thisMachineHost" : "chooseHost")),
                      status?.serverUrl !== void 0 && !status.host?.pairingHostOnly ? React.createElement("a", {
                        className: "dshRemoteManageHosts",
                        href: `${status.serverUrl}/app/hosts`,
                        target: "_blank",
                        rel: "noreferrer",
                        title: t("manageHosts")
                      }, t("manageHosts")) : null,
                      status?.hostAuthorizationAvailable ? React.createElement(
                        "div",
                        { className: "dshRemoteHostControlToggle" },
                        React.createElement("span", null, t("allowControlDevice")),
                        React.createElement("input", {
                          type: "checkbox",
                          role: "switch",
                          disabled: busy,
                          "aria-label": t("allowControlDevice"),
                          checked: status.host?.authorized === !0,
                          onChange: (event) => void setCurrentDeviceControl(event.target.checked)
                        })
                      ) : null,
                      connectedMenu
                    )
                  ),
                  React.createElement("div", {
                    className: `dshRemoteHostList${connectingHost === void 0 ? "" : " isCollapsed"}`,
                    "aria-busy": connectingHost === void 0 ? void 0 : !0
                  }, listedHosts.length === 0 ? error !== void 0 || refreshingHosts ? null : React.createElement("p", null, t(status?.host?.pairingHostOnly ? "pairingHostOnly" : "noRemoteHosts")) : listedHosts.map((device) => React.createElement(
                    "button",
                    {
                      type: "button",
                      key: device.deviceId,
                      disabled: busy || serverUnavailable || !device.online,
                      "aria-current": connectingHost?.deviceId === device.deviceId ? "true" : void 0,
                      onClick: () => void selectHost(device)
                    },
                    React.createElement(
                      "span",
                      null,
                      React.createElement("strong", null, device.name),
                      React.createElement("small", null, [
                        formatPlatform(device.platform),
                        device.harnessVersion === void 0 ? void 0 : t("harnessVersion", { version: device.harnessVersion }),
                        device.clientVersion === void 0 ? void 0 : t("pluginVersion", { version: device.clientVersion }),
                        deviceUpdateAvailable(device) ? t("updateAvailableTag") : void 0
                      ].filter(Boolean).join(" \xB7 "))
                    ),
                    React.createElement("small", null, t(serverUnavailable ? "unavailable" : device.online ? "online" : "offline"))
                  )))
                ) : null,
                React.createElement(RemoteProgressView, { progress, t }),
                selectedHost === void 0 ? connectingHost === void 0 ? React.createElement(
                  React.Fragment,
                  null,
                  status?.host?.pairingHostOnly ? null : React.createElement("p", { className: "dshRemoteHint" }, t("selectHostHint")),
                  React.createElement(
                    "footer",
                    { className: "dshRemoteAccountFooter" },
                    refreshingHosts ? React.createElement(
                      "span",
                      { className: "dshRemoteHostLoading", role: "status", "aria-label": t("checkingConnection") },
                      React.createElement("span", { className: "dshRemoteLoginSpinner", "aria-hidden": !0 })
                    ) : null,
                    React.createElement(
                      "span",
                      { className: "dshRemoteHostNameLine" },
                      React.createElement("span", null, status?.target?.name ?? status?.deviceName ?? (status?.host?.account === void 0 ? t("account") : displayRemoteAccount(status.host.account))),
                      React.createElement(ServerNotice, {
                        offline: discoveryUnavailable || status?.host?.online === !1 && status.host.reconnecting,
                        linked: connectedCount > 0 || status?.connected === !0,
                        expiresAt: status?.host?.recoveryExpiresAt ?? status?.network?.recoveryExpiresAt,
                        t
                      })
                    ),
                    updateNotice === void 0 ? null : canUpgradeInPlace ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement("button", {
                        type: "button",
                        className: "dshRemoteAccountUpdate",
                        disabled: upgradePhase === "running" || upgradePhase === "verifying" || upgradePhase === "started",
                        title: upgradePhase === "failed" || upgradePhase === "unknown" ? upgradeError ?? updateNotice : updateNotice,
                        onClick: () => void startLocalUpgrade()
                      }, t(
                        upgradePhase === "running" || upgradePhase === "verifying" ? "pluginUpdating" : upgradePhase === "started" ? "pluginUpdateReload" : upgradePhase === "failed" ? "pluginUpdateFailed" : upgradePhase === "unknown" ? "pluginUpdateUnknown" : "updateAvailableShort",
                        { version: updateInfo?.latestVersion ?? "" }
                      )),
                      React.createElement("a", {
                        className: "dshRemoteAccountUpdate",
                        href: releasesUrl,
                        target: "_blank",
                        rel: "noreferrer",
                        title: updateNotice
                      }, t("pluginUpdateManual"))
                    ) : React.createElement("a", {
                      className: "dshRemoteAccountUpdate",
                      href: releasesUrl,
                      target: "_blank",
                      rel: "noreferrer",
                      title: updateNotice
                    }, t("updateAvailableShort", { version: updateInfo?.latestVersion ?? "" })),
                    props.openSettings === void 0 ? null : React.createElement("button", {
                      type: "button",
                      className: "dshRemoteAccountSettings",
                      onClick: props.openSettings,
                      "aria-label": t("settings"),
                      title: t("settings")
                    }, t("settings")),
                    React.createElement("button", {
                      type: "button",
                      className: "dshRemoteAccountExit",
                      disabled: busy,
                      onClick: () => void logoutRemote()
                    }, t("exitRemoteAccount"))
                  )
                ) : null : React.createElement(
                  "section",
                  { className: "dshRemoteBrowser", "aria-label": t("chooseDirectory") },
                  React.createElement(
                    "div",
                    { className: "dshRemoteSectionHeading dshRemoteWorkspaceHeading" },
                    React.createElement("strong", null, t(addingWorkspace ? workspaceBackend === "codex" ? "addCodexWorkspace" : workspaceBackend === "cursor" ? "addCursorWorkspace" : workspaceBackend === "antigravity" ? "addAntigravityWorkspace" : workspaceBackend === "pi" ? "addPiWorkspace" : workspaceBackend === "claude" ? "addClaudeWorkspace" : workspaceBackend === "hermes" ? "addHermesWorkspace" : workspaceBackend === "opencode" ? "addOpencodeWorkspace" : "addRemoteWorkspace" : "existingWorkspaces")),
                    addingWorkspace ? React.createElement("button", {
                      type: "button",
                      className: "dshRemoteCancelWorkspace",
                      disabled: busy,
                      onClick: cancelAddingWorkspace
                    }, t("cancelAddWorkspace")) : React.createElement("button", {
                      type: "button",
                      className: "dshRemoteAddWorkspace",
                      disabled: busy,
                      title: t("addRemoteWorkspace"),
                      "aria-label": t("addRemoteWorkspace"),
                      onClick: () => startAddingWorkspace("harness")
                    }, React.createElement("svg", {
                      className: "dshRemoteAddWorkspaceIcon",
                      viewBox: "0 0 16 16",
                      "aria-hidden": !0,
                      focusable: !1
                    }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })))
                  ),
                  addingWorkspace ? React.createElement(
                    "div",
                    { className: "dshRemoteFolderBrowser" },
                    directory === void 0 ? React.createElement("p", null, t("loadingDirectory")) : React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        "nav",
                        { className: "dshRemoteCrumbs", "aria-label": t("currentDirectory") },
                        directory.crumbs.map((crumb) => React.createElement("button", {
                          type: "button",
                          key: crumb.path,
                          disabled: busy || crumb.path === directory.path,
                          onClick: () => void browseDirectory(crumb.path)
                        }, crumb.path === directory.home ? "\u2302" : crumb.name))
                      ),
                      React.createElement("div", { className: "dshRemoteFolderList" }, directory.entries.filter((entry2) => !entry2.hidden).length === 0 ? React.createElement("p", null, t("emptyDirectory")) : directory.entries.filter((entry2) => !entry2.hidden).map((entry2) => React.createElement("button", {
                        type: "button",
                        key: entry2.path,
                        disabled: busy,
                        onClick: () => void browseDirectory(entry2.path)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u25B1"), React.createElement("span", null, entry2.name)))),
                      directory.truncated ? React.createElement("small", null, t("directoryTruncated")) : null
                    )
                  ) : React.createElement(
                    "div",
                    { className: "dshRemoteWorkspaceLists" },
                    React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        "div",
                        { id: workspaceListId, className: "dshRemoteDirectoryList" },
                        workspaces.length === 0 ? React.createElement("p", null, t("noRemoteWorkspaces")) : visibleWorkspaces.map((workspace) => React.createElement(
                          "button",
                          {
                            type: "button",
                            key: workspace.workspaceId,
                            disabled: busy,
                            className: workspaceBackend === "harness" && path === workspace.path ? "isSelected" : "",
                            "aria-pressed": workspaceBackend === "harness" && path === workspace.path,
                            onClick: () => {
                              setWorkspaceBackend("harness"), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setPath(workspace.path);
                            },
                            onDoubleClick: () => void openWorkspace({ backend: "harness", path: workspace.path })
                          },
                          React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                          React.createElement("span", null, workspace.title),
                          React.createElement("small", null, workspace.path)
                        )),
                        workspaces.length <= 3 || showAllWorkspaces ? null : React.createElement("button", {
                          type: "button",
                          className: "dshRemoteWorkspaceMore",
                          disabled: busy,
                          "aria-controls": workspaceListId,
                          "aria-label": t("showAllWorkspaces"),
                          onClick: () => setShowAllWorkspaces(!0)
                        }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                      )
                    ),
                    codexAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: codexWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement(
                          "span",
                          { className: "dshRemoteWorkspaceSourceText" },
                          React.createElement("strong", null, t("codexVirtualWorkspace"))
                        ),
                        codexAvailable ? React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addCodexWorkspace"),
                          "aria-label": t("addCodexWorkspace"),
                          onClick: () => startAddingWorkspace("codex")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }))) : null
                      ),
                      React.createElement("div", {
                        id: codexWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": codexWorkspaceHeadingId
                      }, visibleCodexWorkspaces.length === 0 ? React.createElement("p", null, t("noCodexWorkspaces")) : visibleCodexWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "codex" && codexWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "codex" && codexWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("codex"), setCodexWorkspaceId(workspace.workspaceId), setCursorWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "codex",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon isGpt", src: gptWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      codexWorkspaces.length <= 3 || showAllCodexWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": codexWorkspaceListId,
                        "aria-label": t("showAllCodexWorkspaces"),
                        onClick: () => setShowAllCodexWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null,
                    cursorAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: cursorWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement(
                          "span",
                          { className: "dshRemoteWorkspaceSourceText" },
                          React.createElement("strong", null, t("cursorVirtualWorkspace"))
                        ),
                        cursorAvailable ? React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addCursorWorkspace"),
                          "aria-label": t("addCursorWorkspace"),
                          onClick: () => startAddingWorkspace("cursor")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }))) : null
                      ),
                      React.createElement("div", {
                        id: cursorWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": cursorWorkspaceHeadingId
                      }, visibleCursorWorkspaces.length === 0 ? React.createElement("p", null, t("noCursorWorkspaces")) : visibleCursorWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "cursor" && cursorWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "cursor" && cursorWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("cursor"), setCursorWorkspaceId(workspace.workspaceId), setCodexWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "cursor",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      cursorWorkspaces.length <= 3 || showAllCursorWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": cursorWorkspaceListId,
                        "aria-label": t("showAllCursorWorkspaces"),
                        onClick: () => setShowAllCursorWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null,
                    antigravityAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: antigravityWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement(
                          "span",
                          { className: "dshRemoteWorkspaceSourceText" },
                          React.createElement("strong", null, t("antigravityVirtualWorkspace"))
                        ),
                        antigravityAvailable ? React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addAntigravityWorkspace"),
                          "aria-label": t("addAntigravityWorkspace"),
                          onClick: () => startAddingWorkspace("antigravity")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }))) : null
                      ),
                      React.createElement("div", {
                        id: antigravityWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": antigravityWorkspaceHeadingId
                      }, visibleAntigravityWorkspaces.length === 0 ? React.createElement("p", null, t("noAntigravityWorkspaces")) : visibleAntigravityWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "antigravity" && antigravityWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "antigravity" && antigravityWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("antigravity"), setAntigravityWorkspaceId(workspace.workspaceId), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "antigravity",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      antigravityWorkspaces.length <= 3 || showAllAntigravityWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": antigravityWorkspaceListId,
                        "aria-label": t("showAllAntigravityWorkspaces"),
                        onClick: () => setShowAllAntigravityWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null,
                    piAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: piWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement(
                          "span",
                          { className: "dshRemoteWorkspaceSourceText" },
                          React.createElement("strong", null, t("piVirtualWorkspace"))
                        ),
                        piAvailable ? React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addPiWorkspace"),
                          "aria-label": t("addPiWorkspace"),
                          onClick: () => startAddingWorkspace("pi")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }))) : null
                      ),
                      React.createElement("div", {
                        id: piWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": piWorkspaceHeadingId
                      }, visiblePiWorkspaces.length === 0 ? React.createElement("p", null, t("noPiWorkspaces")) : visiblePiWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "pi" && piWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "pi" && piWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("pi"), setPiWorkspaceId(workspace.workspaceId), setAntigravityWorkspaceId(void 0), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "pi",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      piWorkspaces.length <= 3 || showAllPiWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": piWorkspaceListId,
                        "aria-label": t("showAllPiWorkspaces"),
                        onClick: () => setShowAllPiWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null,
                    opencodeAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: opencodeWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement("span", { className: "dshRemoteWorkspaceSourceText" }, React.createElement("strong", null, t("opencodeVirtualWorkspace"))),
                        React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addOpencodeWorkspace"),
                          "aria-label": t("addOpencodeWorkspace"),
                          onClick: () => startAddingWorkspace("opencode")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })))
                      ),
                      React.createElement("div", {
                        id: opencodeWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": opencodeWorkspaceHeadingId
                      }, visibleOpencodeWorkspaces.length === 0 ? React.createElement("p", null, t("noOpencodeWorkspaces")) : visibleOpencodeWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "opencode" && opencodeWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "opencode" && opencodeWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("opencode"), setOpencodeWorkspaceId(workspace.workspaceId), setPiWorkspaceId(void 0), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "opencode",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      opencodeWorkspaces.length <= 3 || showAllOpencodeWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": opencodeWorkspaceListId,
                        "aria-label": t("showAllOpencodeWorkspaces"),
                        onClick: () => setShowAllOpencodeWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null,
                    hermesAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: hermesWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement("span", { className: "dshRemoteWorkspaceSourceText" }, React.createElement("strong", null, t("hermesVirtualWorkspace"))),
                        React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addHermesWorkspace"),
                          "aria-label": t("addHermesWorkspace"),
                          onClick: () => startAddingWorkspace("hermes")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })))
                      ),
                      React.createElement("div", {
                        id: hermesWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": hermesWorkspaceHeadingId
                      }, visibleHermesWorkspaces.length === 0 ? React.createElement("p", null, t("noHermesWorkspaces")) : visibleHermesWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "hermes" && hermesWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "hermes" && hermesWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("hermes"), setClaudeWorkspaceId(void 0), setHermesWorkspaceId(workspace.workspaceId), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "hermes",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      hermesWorkspaces.length <= 3 || showAllHermesWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": hermesWorkspaceListId,
                        "aria-label": t("showAllHermesWorkspaces"),
                        onClick: () => setShowAllHermesWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null,
                    claudeAvailable ? React.createElement(
                      "section",
                      { className: "dshRemoteCodexWorkspaceGroup" },
                      React.createElement(
                        "div",
                        {
                          id: claudeWorkspaceHeadingId,
                          className: "dshRemoteWorkspaceSourceHeading"
                        },
                        React.createElement("span", { className: "dshRemoteWorkspaceSourceText" }, React.createElement("strong", null, t("claudeVirtualWorkspace"))),
                        React.createElement("button", {
                          type: "button",
                          className: "dshRemoteAddWorkspace",
                          disabled: busy,
                          title: t("addClaudeWorkspace"),
                          "aria-label": t("addClaudeWorkspace"),
                          onClick: () => startAddingWorkspace("claude")
                        }, React.createElement("svg", {
                          className: "dshRemoteAddWorkspaceIcon",
                          viewBox: "0 0 16 16",
                          "aria-hidden": !0,
                          focusable: !1
                        }, React.createElement("path", { d: "M8 3v10M3 8h10", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })))
                      ),
                      React.createElement("div", {
                        id: claudeWorkspaceListId,
                        className: "dshRemoteDirectoryList dshRemoteCodexWorkspaceList",
                        "aria-labelledby": claudeWorkspaceHeadingId
                      }, visibleClaudeWorkspaces.length === 0 ? React.createElement("p", null, t("noClaudeWorkspaces")) : visibleClaudeWorkspaces.map((workspace) => React.createElement(
                        "button",
                        {
                          type: "button",
                          key: workspace.workspaceId,
                          disabled: busy,
                          className: workspaceBackend === "claude" && claudeWorkspaceId === workspace.workspaceId ? "isSelected" : "",
                          "aria-pressed": workspaceBackend === "claude" && claudeWorkspaceId === workspace.workspaceId,
                          onClick: () => {
                            setWorkspaceBackend("claude"), setClaudeWorkspaceId(workspace.workspaceId), setHermesWorkspaceId(void 0), setPiWorkspaceId(void 0), setOpencodeWorkspaceId(void 0), setAntigravityWorkspaceId(void 0), setCodexWorkspaceId(void 0), setCursorWorkspaceId(void 0), setPath(workspace.path);
                          },
                          onDoubleClick: () => void openWorkspace({
                            backend: "claude",
                            path: workspace.path,
                            workspaceId: workspace.workspaceId
                          })
                        },
                        React.createElement("img", { className: "dshRemoteWorkspaceIcon", src: deepSeekWorkspaceIcon, alt: "", "aria-hidden": !0 }),
                        React.createElement("span", null, workspace.title),
                        React.createElement("small", null, `${workspace.path} \xB7 ${workspace.sessionCount}`)
                      ))),
                      claudeWorkspaces.length <= 3 || showAllClaudeWorkspaces ? null : React.createElement("button", {
                        type: "button",
                        className: "dshRemoteWorkspaceMore",
                        disabled: busy,
                        "aria-controls": claudeWorkspaceListId,
                        "aria-label": t("showAllClaudeWorkspaces"),
                        onClick: () => setShowAllClaudeWorkspaces(!0)
                      }, React.createElement("span", { "aria-hidden": !0 }, "\u2026"))
                    ) : null
                  ),
                  React.createElement(
                    "footer",
                    { className: "dshRemoteOpenBar" },
                    React.createElement("div", null, React.createElement("span", null, t("currentDirectory")), React.createElement("strong", null, path || "\u2014")),
                    React.createElement("button", {
                      type: "button",
                      disabled: busy || path.trim() === "" || !addingWorkspace && workspaceBackend === "codex" && codexWorkspaceId === void 0 || !addingWorkspace && workspaceBackend === "cursor" && cursorWorkspaceId === void 0 && path === "" || !addingWorkspace && workspaceBackend === "antigravity" && antigravityWorkspaceId === void 0 && path === "" || !addingWorkspace && workspaceBackend === "pi" && piWorkspaceId === void 0 && path === "" || !addingWorkspace && workspaceBackend === "opencode" && opencodeWorkspaceId === void 0 && path === "" || !addingWorkspace && workspaceBackend === "claude" && claudeWorkspaceId === void 0 && path === "" || !addingWorkspace && workspaceBackend === "hermes" && hermesWorkspaceId === void 0 && path === "",
                      onClick: () => void openWorkspace()
                    }, t(busy ? "openingWorkspace" : addingWorkspace ? "confirmAddWorkspace" : "openWorkspace"))
                  )
                )
              )
            ),
            notice === void 0 ? null : React.createElement("p", { className: "dshRemoteNotice", role: "status" }, notice),
            error === void 0 || serverUnavailable && error === t("serverUnavailableError") ? null : React.createElement("p", { className: "dshRemoteError", role: "alert" }, error)
          )
        ))) : null
      );
    }
    return RemoteWorkspaceAction;
  }

  // packages/plugin/src/plugin-route-client.ts
  var PluginRouteFailure = class extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }, KNOWN_ERROR_NAMES = /* @__PURE__ */ new Set([
    "TimeoutError",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "URIError",
    "EvalError",
    "Error",
    "AbortError",
    "DOMException"
  ]);
  function sanitizeErrorName(error) {
    if (typeof error == "object" && error !== null && "name" in error) {
      let name = error.name;
      if (typeof name == "string" && KNOWN_ERROR_NAMES.has(name)) return name;
    }
    return "Error";
  }
  function isTimeoutError(error) {
    for (let current = error, depth = 0; current != null && depth < 4; depth++) {
      if (typeof current != "object") return !1;
      let candidate = current;
      if (candidate.name === "TimeoutError" || candidate.code === "UND_ERR_CONNECT_TIMEOUT" || candidate.code === "ETIMEDOUT") return !0;
      current = candidate.cause;
    }
    return !1;
  }
  function isAbortFailure(error, signal) {
    return signal?.aborted === !0 ? !0 : typeof error == "object" && error !== null && error.name === "AbortError";
  }
  function createPluginRouteFetch(original, baseUrl, options = {}) {
    let routeUrl = new URL("api/bot", baseUrl), nextRpcId = 0, control = async (method, payload, signal) => {
      let rpcId = `plugin-route-${++nextRpcId}`, response;
      try {
        response = await original(new URL(`${CONTROL_RPC_PREFIX.slice(1)}/${method}`, baseUrl), {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
          signal
        });
      } catch (error) {
        throw isAbortFailure(error, signal) || isTimeoutError(error) ? error : new PluginRouteFailure("remote-plugin/control-unavailable", "The local Remote control request failed. Reload the Remote plugin.", {
          stage: "transport",
          method,
          errorName: sanitizeErrorName(error)
        });
      }
      if (!response.ok)
        throw new PluginRouteFailure("remote-plugin/control-unavailable", `The local Remote control request failed (HTTP ${response.status}). Reload the Remote plugin.`, {
          stage: "transport",
          method,
          httpStatus: response.status
        });
      let envelope = await response.json();
      if (!isRecord(envelope) || envelope.type !== "server-response" || envelope.rpcId !== rpcId || !isRecord(envelope.result))
        throw new PluginRouteFailure("remote-plugin/control-invalid", "The local Remote control response is invalid. Reload the Remote plugin.");
      if (envelope.result.ok !== !0) {
        let error = isRecord(envelope.result.error) ? envelope.result.error : void 0, code = (isRecord(error?.details) ? error.details : void 0)?.remoteCode ?? error?.code;
        throw code === "FEATURE_NOT_SUPPORTED" || code === "METHOD_NOT_FOUND" ? new PluginRouteFailure("remote-plugin/host-unsupported", "The selected Host does not support plugin route forwarding. Update and reload Remote on the Host, then reconnect.") : code === "REMOTE_NOT_CONNECTED" || code === "TRANSPORT_CLOSED" ? new PluginRouteFailure("remote-plugin/disconnected", "The Remote Host is disconnected. Reconnect to load DS Bot.") : code === "INVALID_MESSAGE" ? new PluginRouteFailure("remote-plugin/operation-not-allowed", "This DS Bot operation is not allowed over Remote. Use the Host locally.") : new PluginRouteFailure("remote-plugin/control-rejected", "The Remote plugin route request was rejected by the control channel.");
      }
      return envelope.result.value;
    };
    return async (input, init) => {
      let requestUrl = new URL(input instanceof Request ? input.url : String(input), baseUrl);
      if ((init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() !== "POST" || requestUrl.href !== routeUrl.href) return original(input, init);
      let lifetime = (init?.signal !== void 0 ? init.signal ?? void 0 : input instanceof Request ? input.signal : void 0) ?? AbortSignal.timeout(45e3);
      try {
        lifetime.throwIfAborted();
        let status, probeTimeout = AbortSignal.timeout(1e4), probeSignal = AbortSignal.any([lifetime, probeTimeout]);
        try {
          status = await control("status", {}, probeSignal);
        } catch (error) {
          throw error instanceof PluginRouteFailure ? error : (lifetime.throwIfAborted(), probeTimeout.aborted ? new PluginRouteFailure("remote-plugin/control-timeout", "The local Remote control probe timed out. Reload the Remote plugin.", {
            stage: "status",
            timeoutMs: 1e4,
            errorName: sanitizeErrorName(error)
          }) : isTimeoutError(error) ? new PluginRouteFailure("remote-plugin/control-timeout", "The local Remote control request timed out. Reload the Remote plugin.", {
            stage: "transport",
            method: "status",
            errorName: sanitizeErrorName(error)
          }) : error);
        }
        if (lifetime.throwIfAborted(), !isRecord(status)) throw new PluginRouteFailure("remote-plugin/authority-unavailable", "The Remote plugin route authority is unavailable.");
        if (status.mode === "local") return original(input, init);
        if (status.mode !== "remote") throw new PluginRouteFailure("remote-plugin/authority-unavailable", "The Remote plugin route authority is unavailable.");
        if (status.connected !== !0) throw new PluginRouteFailure("remote-plugin/disconnected", "The Remote Host is disconnected. Reconnect to load DS Bot.");
        if (!isRecord(status.remoteFeatures) || status.remoteFeatures.pluginRoute !== !0) throw new PluginRouteFailure("remote-plugin/host-unsupported", "The selected Host does not support plugin route forwarding. Update and reload Remote on the Host, then reconnect.");
        if (status.backend !== void 0 && status.backend !== "harness") throw new PluginRouteFailure("remote-plugin/backend-unsupported", "DS Bot requires the Remote Harness catalog. Select a Harness workspace on this Host.");
        let body = await (input instanceof Request ? new Request(input, init) : new Request(requestUrl, init)).clone().json().catch((error) => {
          throw new PluginRouteFailure("remote-plugin/route-request-invalid", "The plugin route body must be a JSON object.", {
            stage: "request-body",
            errorName: sanitizeErrorName(error)
          });
        });
        if (!isRecord(body))
          throw new PluginRouteFailure("remote-plugin/route-request-invalid", "The plugin route body must be a JSON object.", { stage: "request-body" });
        let result = await control("plugin.route", { route: "api/bot", body }, lifetime);
        if (!isRecord(result) || !Number.isInteger(result.status) || result.status < 200 || result.status > 599)
          throw new PluginRouteFailure("remote-plugin/route-response-invalid", "The plugin route response is invalid.", { stage: "response-structure" });
        let statusCode = result.status;
        if (statusCode === 404 && body.endpoint === "state")
          return new Response(JSON.stringify({ ok: !0, value: { bots: [], rooms: [], agents: [] } }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        if (statusCode === 404) throw new PluginRouteFailure("remote-plugin/bot-not-loaded", "The Host has no DS Bot route. Enable ds-bot in the same DSH instance/profile as the connected Host.");
        if (statusCode === 503) throw new PluginRouteFailure("remote-plugin/host-carrier-unavailable", "The Host plugin route carrier is unavailable. Update and reload Remote on the Host.");
        if (statusCode >= 200 && statusCode < 300 && options.beforeResponse !== void 0)
          try {
            await waitWithSignal(options.beforeResponse(status, body, result.json, lifetime), lifetime);
          } catch {
            throw lifetime.throwIfAborted(), new PluginRouteFailure("remote-plugin/catalog-unavailable", "The Remote Harness Session catalog is not ready. Reconnect before loading DS Bot.");
          }
        return lifetime.throwIfAborted(), new Response([204, 205, 304].includes(statusCode) ? null : JSON.stringify(result.json ?? null), {
          status: statusCode,
          headers: { "content-type": "application/json" }
        });
      } catch (error) {
        lifetime.throwIfAborted();
        let failure = error instanceof PluginRouteFailure ? error : isTimeoutError(error) ? new PluginRouteFailure("remote-plugin/control-timeout", "The Remote plugin route request timed out. Reload the Remote plugin.", {
          stage: "route",
          errorName: sanitizeErrorName(error)
        }) : new PluginRouteFailure("remote-plugin/unavailable", "The Remote plugin route is unavailable.", {
          errorName: sanitizeErrorName(error)
        });
        return new Response(JSON.stringify({
          ok: !1,
          error: {
            code: failure.code,
            message: failure.message,
            details: failure.details
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    };
  }
  function createPluginRouteCatalogGuard(readSessions) {
    return async (_status, body, json, signal) => {
      if (!isRecord(json) || json.ok !== !0 || !isRecord(json.value)) return;
      let required = botSessionIds(body.endpoint, json.value);
      if (required.size === 0) return;
      let sessions = await readSessions(), containsSessions = () => {
        let snapshot = sessions.list.getSnapshot(), known = new Set(snapshot.ids);
        return snapshot.phase === "ready" && [...required].every((id) => known.has(id));
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal.throwIfAborted(), containsSessions()) return;
        if (sessions.refresh === void 0) break;
        await sessions.refresh();
      }
      if (signal.throwIfAborted(), !containsSessions()) throw new Error("The Remote Session catalog does not contain the published Sessions.");
    };
  }
  function botSessionIds(endpoint, value) {
    let ids = /* @__PURE__ */ new Set(), add = (id) => {
      if (id != null) {
        if (typeof id != "string" || id.length === 0) throw new Error("Invalid Bot Session identity.");
        ids.add(id);
      }
    }, addArray = (input) => {
      if (input !== void 0) {
        if (!Array.isArray(input)) throw new Error("Invalid Bot Session identities.");
        input.forEach(add);
      }
    }, bot = (input) => {
      if (!isRecord(input)) throw new Error("Invalid Bot catalog entry.");
      add(input.id), add(input.sessionId), addArray(input.parts), Array.isArray(input.segments) && input.segments.forEach((segment) => {
        if (!isRecord(segment)) throw new Error("Invalid Bot Session segment.");
        add(segment.sessionId);
      });
    }, room = (input) => {
      if (!isRecord(input)) throw new Error("Invalid Bot room entry.");
      add(input.id), add(input.sessionId), addArray(input.ownParts), addArray(input.parts), isRecord(input.sessions) && Object.values(input.sessions).forEach(add);
    }, agent = (input) => {
      if (!isRecord(input)) throw new Error("Invalid Bot agent entry.");
      addArray(input.sessions);
    }, roster = () => {
      for (let [key, visit] of [["bots", bot], ["rooms", room], ["agents", agent]])
        if (value[key] !== void 0) {
          if (!Array.isArray(value[key])) throw new Error("Invalid Bot roster.");
          value[key].forEach(visit);
        }
    };
    switch (endpoint) {
      case "state":
      case "delete-bot":
      case "delete-room":
      case "set-main":
      case "remove-agent":
      case "goal-draft":
      case "goal-control":
        roster();
        break;
      case "create-bot":
      case "duplicate-bot":
      case "update-bot":
        bot(value);
        break;
      case "create-room":
        room(value);
        break;
      case "update-room":
        room(value.room);
        break;
      case "add-agent":
        agent(value);
        break;
      case "agent-session":
      case "agent-adopt":
        add(value.sessionId);
        break;
      case "set-flags":
        Array.isArray(value.sessions) ? agent(value) : Array.isArray(value.members) ? room(value) : bot(value);
        break;
    }
    return ids;
  }
  function waitWithSignal(pending, signal) {
    return new Promise((resolve, reject) => {
      let onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: !0 }), signal.aborted && onAbort(), pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  }
  function isRecord(value) {
    return typeof value == "object" && value !== null && !Array.isArray(value);
  }

  // packages/plugin/src/remote-file-content-provider.ts
  function shouldUseRemoteFileViewer(status) {
    return status.mode === "remote" && status.remoteFeatures?.fileViewer === !0;
  }
  var REMOTE_FILE_SAVE_AS_MAX_BYTES = 100 * 1024 * 1024, REMOTE_FILE_FAST_SAVE_AS_MAX_BYTES = 1024 * 1024 * 1024;
  function shouldAllowRemoteFileSaveAs(status) {
    return shouldUseRemoteFileViewer(status) && (status.transport === "LAN" || status.transport === "P2P" || status.transport === "TURN");
  }
  function remoteFileSaveAsMaxBytes(status) {
    return status.transport === "LAN" || status.transport === "P2P" ? REMOTE_FILE_FAST_SAVE_AS_MAX_BYTES : REMOTE_FILE_SAVE_AS_MAX_BYTES;
  }
  function createRemoteFileContentProvider(call, options = {}) {
    return {
      id: "dsh-remote-files",
      priority: 1e4,
      supports: () => !0,
      saveAsAllowed: () => ({
        allowed: currentSaveAsAllowed(options.saveAsAllowed),
        maxBytes: currentSaveAsMaxBytes(options.saveAsMaxBytes)
      }),
      async stat(locator, signal) {
        let value = await call("fileviewer.stat", { path: locator }, signal);
        if (value.exists)
          return {
            name: value.name,
            size: value.isDirectory ? 0 : value.size,
            mime: value.mime,
            mtimeMs: value.mtimeMs,
            isDirectory: value.isDirectory
          };
      },
      async read(locator, request) {
        if (!Number.isInteger(request.offset) || request.offset < 0) throw new Error("A non-negative integer offset is required.");
        if (!Number.isInteger(request.length) || request.length <= 0) throw new Error("A positive integer length is required.");
        let chunks = [], received = 0;
        for (; received < request.length; ) {
          request.signal.throwIfAborted();
          let length = Math.min(524288, request.length - received), offset = request.offset + received, range = await call("fileviewer.readRange", { path: locator, offset, length }, request.signal);
          if (range.offset !== offset) throw new Error("The Remote Host returned a mismatched file range.");
          let bytes = decodeBase64(range.data);
          if (bytes.byteLength > length) throw new Error("The Remote Host returned more file bytes than requested.");
          if (chunks.push(bytes), received += bytes.byteLength, range.eof || bytes.byteLength === 0) break;
        }
        let merged = new Uint8Array(received), cursor = 0;
        for (let chunk of chunks)
          merged.set(chunk, cursor), cursor += chunk.byteLength;
        return merged;
      },
      async list(locator, signal) {
        return (await call("fileviewer.list", { path: locator }, signal)).entries.map((entry) => ({
          locator: entry.path,
          name: entry.name,
          size: entry.isDirectory ? 0 : entry.size ?? 0,
          mtimeMs: entry.mtimeMs,
          isDirectory: entry.isDirectory
        }));
      }
    };
  }
  function currentSaveAsAllowed(value) {
    return typeof value == "function" ? value() : value === !0;
  }
  function currentSaveAsMaxBytes(value) {
    return typeof value == "function" ? value() : value ?? REMOTE_FILE_SAVE_AS_MAX_BYTES;
  }
  function decodeBase64(value) {
    let binary = atob(value), bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  // packages/plugin/src/status-stream.ts
  function parseStatus(data) {
    if (typeof data == "string")
      try {
        let parsed = JSON.parse(data);
        return parsed === null || typeof parsed != "object" ? void 0 : parsed;
      } catch {
        return;
      }
  }
  function createStatusFeed(options) {
    let listeners = /* @__PURE__ */ new Set(), pollIntervalMs = options.pollIntervalMs ?? 1500, openTimeoutMs = options.openTimeoutMs ?? 4e3, createSource = options.createSource ?? ((url) => new EventSource(url)), status, source, openTimer, pollTimer, publish = (next) => {
      status = next;
      for (let listener of [...listeners]) listener(next);
    }, teardown = () => {
      openTimer !== void 0 && (clearTimeout(openTimer), openTimer = void 0), pollTimer !== void 0 && (clearInterval(pollTimer), pollTimer = void 0), source?.close(), source = void 0;
    }, poll = () => {
      options.readStatus().then((next) => {
        pollTimer !== void 0 && publish(next);
      }).catch(() => {
      });
    }, fallbackToPolling = (reason) => {
      pollTimer !== void 0 || listeners.size === 0 || (openTimer !== void 0 && (clearTimeout(openTimer), openTimer = void 0), source?.close(), source = void 0, options.onFallback?.(reason), poll(), pollTimer = setInterval(poll, pollIntervalMs));
    }, openStream = () => {
      let opened;
      try {
        opened = createSource(options.url);
      } catch {
        fallbackToPolling("unsupported");
        return;
      }
      source = opened;
      let received = !1;
      openTimer = setTimeout(() => {
        received || fallbackToPolling("silent");
      }, openTimeoutMs), opened.onmessage = (event) => {
        received = !0, openTimer !== void 0 && (clearTimeout(openTimer), openTimer = void 0);
        let next = parseStatus(event.data);
        next !== void 0 && publish(next);
      }, opened.onerror = () => {
        opened.readyState === 2 && fallbackToPolling("unavailable");
      };
    };
    return {
      getSnapshot: () => status,
      subscribe: (listener) => (listeners.add(listener), status !== void 0 && listener(status), listeners.size === 1 && openStream(), () => {
        listeners.delete(listener), listeners.size === 0 && teardown();
      }),
      close: () => {
        listeners.clear(), teardown();
      }
    };
  }

  // packages/plugin/src/client-recovery.ts
  function subscribeRemoteRecovery(feed, reconnect) {
    let previous;
    return feed.subscribe((status) => {
      let recovered = status.mode === "remote" && status.connected === !0 && previous?.mode === "remote" && previous.target?.deviceId === status.target?.deviceId && status.recoveryGeneration !== void 0 && status.recoveryGeneration !== previous.recoveryGeneration;
      previous = status, recovered && reconnect();
    });
  }

  // packages/plugin/src/client.ts
  var clientModuleId = "ds-harness-remote", controlRouteBackoffStepsMs = [1e3, 2e3, 5e3, 1e4, 3e4], ControlRouteUnavailableError = class extends Error {
    constructor(message) {
      super(message), this.name = "ControlRouteUnavailableError";
    }
  }, originalPluginFetch = window.fetch, readyPluginSessions, pluginSessions = new Promise((resolve) => {
    readyPluginSessions = resolve;
  }), pluginRouteFetch = typeof originalPluginFetch == "function" && typeof document < "u" ? createPluginRouteFetch(originalPluginFetch.bind(window), document.baseURI, {
    beforeResponse: createPluginRouteCatalogGuard(() => pluginSessions)
  }) : void 0;
  pluginRouteFetch !== void 0 && (window.fetch = pluginRouteFetch);
  var uploadGlobal = globalThis, previousUploadHook = uploadGlobal.__DSH_FILE_UPLOAD__, remoteUploadHook = typeof originalPluginFetch == "function" && typeof document < "u" ? { fetch: createRemoteUploadFetch(previousUploadHook?.fetch ?? originalPluginFetch.bind(window), document.baseURI) } : void 0;
  remoteUploadHook !== void 0 && (uploadGlobal.__DSH_FILE_UPLOAD__ = remoteUploadHook);
  function controlRouteUnavailableStatus() {
    return {
      mode: "local",
      available: !1,
      controlUnavailable: !0,
      connected: !1,
      transport: "Disconnected",
      remoteFeatures: { commandList: !1, fileViewer: !1, terminal: !1, codex: !1, pluginRoute: !1, cursor: !1, antigravity: !1, pi: !1, opencode: !1 },
      hostAuthorizationAvailable: !1
    };
  }
  window.__ModuleLoader__.load({
    id: clientModuleId,
    factory: (require2) => {
      let module = { exports: {} }, React = require2("react"), portal = (() => {
        try {
          let reactDom = require2("react-dom");
          return typeof reactDom.createPortal == "function" ? reactDom.createPortal.bind(reactDom) : void 0;
        } catch {
          return;
        }
      })(), RemotePluginOptions = createRemotePluginOptions(React);
      function RemotePluginSettingsAction(props) {
        if (pluginSubjectPackageName(props.subject) !== "ds-harness-remote") return null;
        let label = props.t("openPluginSettings");
        return React.createElement("button", {
          type: "button",
          className: "dshRemoteDetailSettingsAction",
          "aria-label": label,
          onClick: (event) => {
            (event.currentTarget?.closest("[data-plugin-detail],[data-plugin-row-detail]") ?? document).querySelector("[data-dsh-remote-settings]")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, label);
      }
      let RemoteWorkspaceAction = createRemoteWorkspaceAction(React, portal), RemoteProgressView = createRemoteProgressView(React), RemoteSessionHeaderAction = createRemoteSessionHeaderAction(React, portal), openHarnessSettings;
      function RemoteSettingsLauncher(props) {
        return openHarnessSettings = props.openSettings, null;
      }
      let inject = [
        "connection",
        "slots",
        "locale",
        "workspaces",
        "sessions"
      ];
      function RemoteModeAction(props) {
        let { t } = props, [open, setOpen] = React.useState(!1), [status, setStatus] = React.useState(void 0), [devices, setDevices] = React.useState([]), [hostRegistrationCode, setHostRegistrationCode] = React.useState(""), [email, setEmail] = React.useState(""), [password, setPassword] = React.useState(""), [busy, setBusy] = React.useState(!1), [progress, setProgress] = React.useState(void 0), progressRun = React.useRef(0), [error, setError] = React.useState(void 0), [supported, setSupported] = React.useState(!0), refresh = async () => {
          let [nextStatus, nextDevices] = await Promise.all([
            props.control("status"),
            props.control("devices").catch(() => [])
          ]);
          setStatus(nextStatus), setDevices(nextDevices);
        }, refreshStatus = async () => {
          setStatus(await props.control("status"));
        };
        React.useEffect(() => {
          refresh().catch((reason) => {
            setError(messageOf(reason, t)), setSupported(!1);
          });
        }, []), React.useEffect(() => {
          if (open)
            return props.statusFeed.subscribe(setStatus);
        }, [open]);
        let switchMode = async (mode, targetDeviceId) => {
          setBusy(!0), setError(void 0);
          try {
            let action = () => props.control("mode.set", { mode, ...targetDeviceId === void 0 ? {} : { targetDeviceId } });
            setStatus(mode === "remote" && targetDeviceId !== void 0 ? await runConnectHostProgress(
              status?.preferredTransports,
              targetDeviceId,
              props.control,
              { label: "remoteProgressSwitchingWorkspace", detail: "remoteProgressSwitchingWorkspaceDetail" },
              setProgress,
              progressRun,
              action,
              connectedProgress
            ) : await action()), window.location.reload();
          } catch (reason) {
            setError(messageOf(reason, t)), setBusy(!1);
          }
        }, loginHost = async () => {
          if (!(email.trim() === "" || password === "")) {
            setBusy(!0), setError(void 0);
            try {
              await props.control("host.account.login", { email: email.trim(), password }), await refreshStatus();
            } catch (reason) {
              setError(messageOf(reason, t));
            } finally {
              setPassword(""), setBusy(!1);
            }
          }
        }, registerHostWithCode = async () => {
          if (hostRegistrationCode.trim() !== "") {
            setBusy(!0), setError(void 0);
            try {
              await props.control("host.registration-code.submit", { code: hostRegistrationCode.trim() }), setHostRegistrationCode(""), await refreshStatus();
            } catch (reason) {
              setError(messageOf(reason, t));
            } finally {
              setBusy(!1);
            }
          }
        }, label = status?.mode === "remote" ? t("remoteTarget", { name: status.target?.name ?? t("host") }) : t("local");
        return supported ? React.createElement(
          React.Fragment,
          null,
          React.createElement("button", {
            type: "button",
            className: "dshRemoteModeButton",
            title: t("switchTarget"),
            "aria-label": t("switchTarget"),
            onClick: () => setOpen(!0)
          }, React.createElement("span", { "aria-hidden": !0 }, "\u25CE"), props.wide ? React.createElement("span", null, label) : null),
          open ? renderBodyPortal(portal, React.createElement(
            "div",
            { className: "dshRemoteBackdrop", role: "presentation", onMouseDown: (event) => {
              event.target === event.currentTarget && setOpen(!1);
            } },
            React.createElement(
              "section",
              {
                className: "dshRemoteDialog",
                role: "dialog",
                "aria-modal": !0,
                "aria-label": t("harnessTarget")
              },
              React.createElement(
                "div",
                { className: "dshRemoteHeader" },
                React.createElement("strong", null, t("harnessTarget")),
                React.createElement("button", { type: "button", onClick: () => setOpen(!1), "aria-label": t("close") }, "\xD7")
              ),
              React.createElement("button", {
                type: "button",
                disabled: busy || status?.mode === "local",
                onClick: () => void switchMode("local")
              }, t("thisMachineLocal")),
              React.createElement("div", { className: "dshRemoteDevices" }, devices.length === 0 ? React.createElement("p", null, t("noRemoteHosts")) : devices.map((device) => React.createElement("button", {
                type: "button",
                key: device.deviceId,
                disabled: busy || !device.online || status?.target?.deviceId === device.deviceId,
                onClick: () => void switchMode("remote", device.deviceId)
              }, `${device.name} \xB7 ${t(device.online ? "online" : "offline")}`))),
              React.createElement(RemoteProgressView, { progress, t }),
              status?.hostAuthorizationAvailable && status.host !== void 0 ? React.createElement(
                "div",
                { className: "dshRemoteHostAccount" },
                React.createElement("strong", null, t("thisMachineHost")),
                React.createElement("p", null, status.host.online ? status.host.account === void 0 ? t("connected") : t("connectedAs", { account: status.host.account }) : status.host.accountRequired ? t("hostSignInHint") : status.host.error === void 0 ? t("checkingHost") : t("hostUnavailable", { error: connectionErrorMessage(status.host.error, t) })),
                status.host.accountRequired ? React.createElement(
                  "div",
                  { className: "dshRemoteLogin" },
                  React.createElement("input", {
                    type: "email",
                    value: email,
                    disabled: busy,
                    autoComplete: "username",
                    placeholder: t("serverAccountEmail"),
                    "aria-label": t("serverAccountEmail"),
                    onChange: (event) => setEmail(event.target.value)
                  }),
                  React.createElement("input", {
                    type: "password",
                    value: password,
                    disabled: busy,
                    autoComplete: "current-password",
                    placeholder: t("password"),
                    "aria-label": t("serverAccountPassword"),
                    onChange: (event) => setPassword(event.target.value)
                  }),
                  React.createElement("button", {
                    type: "button",
                    disabled: busy || email.trim() === "" || password === "",
                    onClick: () => void loginHost()
                  }, t(busy ? "signingIn" : "signInRegisterHost")),
                  React.createElement("input", {
                    value: hostRegistrationCode,
                    disabled: busy,
                    autoComplete: "one-time-code",
                    placeholder: t("hostRegistrationCode"),
                    "aria-label": t("hostRegistrationCode"),
                    onChange: (event) => setHostRegistrationCode(event.target.value)
                  }),
                  React.createElement("button", {
                    type: "button",
                    disabled: busy || hostRegistrationCode.trim() === "",
                    onClick: () => void registerHostWithCode()
                  }, t(busy ? "registering" : "useRegistrationCode"))
                ) : null
              ) : null,
              error === void 0 ? null : React.createElement("p", { className: "dshRemoteError", role: "alert" }, error)
            )
          )) : null
        ) : null;
      }
      function apply(ctx) {
        if (window.__DS_HARNESS_REMOTE_CLIENT_ACTIVE__) return;
        window.__DS_HARNESS_REMOTE_CLIENT_ACTIVE__ = !0, readyPluginSessions(ctx.sessions), ctx.inject(["fileUpload"], (uploadContext) => {
          let service = uploadContext.get("fileUpload");
          if (service === void 0 || remoteUploadHook === void 0) return;
          let originalPost = service.post, post = async (request) => {
            let response = await remoteUploadHook.fetch(request.path, {
              method: "POST",
              body: request.body,
              headers: request.headers,
              signal: request.signal
            });
            return { status: response.status, body: await response.text() };
          };
          uploadContext.effect(() => (service.post = post, () => {
            service.post === post && (service.post = originalPost);
          }), "ds-harness-remote: attachment upload carrier");
        }), ctx.effect(() => () => {
          window.__DS_HARNESS_REMOTE_CLIENT_ACTIVE__ = !1;
        }, "ds-harness-remote: client singleton"), ctx.effect(() => () => {
          pluginRouteFetch !== void 0 && window.fetch === pluginRouteFetch && (window.fetch = originalPluginFetch), uploadGlobal.__DSH_FILE_UPLOAD__ === remoteUploadHook && (uploadGlobal.__DSH_FILE_UPLOAD__ = previousUploadHook);
        }, "ds-harness-remote: plugin route fetch");
        let t = ctx.locale.bind(localeNamespace), remoteOpenListeners = /* @__PURE__ */ new Set(), openRemote = () => {
          for (let listener of remoteOpenListeners) listener();
        }, subscribeOpen = (listener) => (remoteOpenListeners.add(listener), () => {
          remoteOpenListeners.delete(listener);
        }), sidebarEntryStyle = "standard", sidebarEntryListeners = /* @__PURE__ */ new Set(), sidebarEntry = {
          read: () => sidebarEntryStyle,
          subscribe: (listener) => (sidebarEntryListeners.add(listener), () => {
            sidebarEntryListeners.delete(listener);
          }),
          publish: (style) => {
            if (style !== sidebarEntryStyle) {
              sidebarEntryStyle = style;
              for (let listener of sidebarEntryListeners) listener();
            }
          }
        }, controlRouteRetryAfter = 0, controlRouteBackoffIndex = 0, control = async (endpoint, payload = {}) => {
          if (endpoint === "status" && Date.now() < controlRouteRetryAfter)
            return controlRouteUnavailableStatus();
          let result;
          try {
            result = await ctx.connection.rpc.call(CONTROL_RPC_PREFIX, endpoint, payload), controlRouteRetryAfter = 0, controlRouteBackoffIndex = 0;
          } catch (reason) {
            if (!isMissingControlRoute(reason)) throw reason;
            let delayMs = controlRouteBackoffStepsMs[Math.min(controlRouteBackoffIndex, controlRouteBackoffStepsMs.length - 1)];
            if (controlRouteBackoffIndex += 1, controlRouteRetryAfter = Date.now() + delayMs, endpoint === "status") return controlRouteUnavailableStatus();
            throw new ControlRouteUnavailableError(t("remoteControlUnavailable"));
          }
          return unwrapControlResult(result, t("remoteRequestFailed"));
        }, statusFeed = createStatusFeed({
          url: STATUS_STREAM_PATH.slice(1),
          readStatus: () => control("status"),
          onFallback: (reason) => {
            console.warn("ds-harness-remote: status event stream unavailable, polling status instead:", reason);
          }
        });
        ctx.effect(() => () => statusFeed.close(), "ds-harness-remote: status stream"), ctx.effect(() => {
          let unsubscribe = statusFeed.subscribe((status) => {
            document.documentElement.classList.toggle("dshRemoteBrowserUnavailable", status.mode === "remote");
          });
          return () => {
            unsubscribe(), document.documentElement.classList.remove("dshRemoteBrowserUnavailable");
          };
        }, "ds-harness-remote: hide local browser entry in remote mode"), ctx.effect(() => subscribeRemoteRecovery(statusFeed, () => ctx.connection.reconnect?.()), "ds-harness-remote: carrier recovery"), ctx.effect(() => {
          let disposed = !1, unsubscribeWorkspaces, unsubscribeSessions, selection, opening = !1, reconcile = () => {
            if (disposed || opening || selection === void 0) return;
            let pending = selection, workspaceSnapshot = ctx.workspaces.list.getSnapshot();
            if (!workspacesReady(workspaceSnapshot) || !workspaceSnapshot.items.some((workspace) => workspace.workspaceId === pending.workspaceId)) return;
            let sessionSnapshot = ctx.sessions.list.getSnapshot(), isVirtualBackend = pending.backend === "codex" || pending.backend === "cursor" || pending.backend === "antigravity" || pending.backend === "pi" || pending.backend === "opencode" || pending.backend === "claude" || pending.backend === "hermes";
            if (isVirtualBackend && pending.sessionId !== void 0 && sessionSnapshot.phase !== "ready") return;
            opening = !0, unsubscribeWorkspaces?.(), unsubscribeSessions?.(), unsubscribeWorkspaces = void 0, unsubscribeSessions = void 0;
            let navigation = ctx.get("uiWorkspace"), connectWorkspace = (workspaceId) => navigation !== void 0 ? navigation.connectWorkspace(workspaceId) : ctx.workspaces.connectWorkspace(workspaceId);
            (isVirtualBackend && pending.sessionId !== void 0 && sessionSnapshot.ids.includes(pending.sessionId) ? Promise.resolve(pending.sessionId) : connectWorkspace(pending.workspaceId)).then(async (sessionId) => {
              if (!disposed) {
                if (navigation !== void 0)
                  navigation.openSession(sessionId);
                else if (typeof ctx.workspaces.openSession == "function")
                  ctx.workspaces.openSession(sessionId);
                else if (typeof ctx.sessions.open == "function")
                  ctx.sessions.open(sessionId);
                else
                  throw new Error("No supported Session open API is available.");
                window.sessionStorage.removeItem(pendingWorkspaceSelectionKey), await control("workspace.selection.consume", pending).catch(() => {
                });
              }
            }).catch((reason) => {
              disposed || console.warn("remote workspace selection failed:", reason);
            });
          };
          return control("status").then((status) => {
            let pending = status.workspaceSelection ?? storedWorkspaceSelection();
            disposed || status.mode !== "remote" || pending === void 0 || status.target?.deviceId !== pending.targetDeviceId || (selection = pending, unsubscribeWorkspaces = ctx.workspaces.list.subscribe(reconcile), unsubscribeSessions = ctx.sessions.list.subscribe(reconcile), reconcile());
          }).catch(() => {
          }), () => {
            disposed = !0, unsubscribeWorkspaces?.(), unsubscribeSessions?.();
          };
        }, "ds-harness-remote: resume selected workspace"), ctx.inject(["fileViewer"], (fileViewerContext) => {
          let viewer = fileViewerContext.get("fileViewer");
          viewer !== void 0 && fileViewerContext.effect(() => {
            let unregister, latestSaveAsAllowed = !1, latestSaveAsMaxBytes = REMOTE_FILE_SAVE_AS_MAX_BYTES, unsubscribe = statusFeed.subscribe((status) => {
              let supported = shouldUseRemoteFileViewer(status);
              latestSaveAsAllowed = shouldAllowRemoteFileSaveAs(status), latestSaveAsMaxBytes = remoteFileSaveAsMaxBytes(status), supported && unregister === void 0 ? unregister = viewer.registerContentProvider(createRemoteFileContentProvider(
                (endpoint, payload) => control(endpoint, payload),
                { saveAsAllowed: () => latestSaveAsAllowed, saveAsMaxBytes: () => latestSaveAsMaxBytes }
              )) : !supported && unregister !== void 0 && (unregister(), unregister = void 0, latestSaveAsAllowed = !1, latestSaveAsMaxBytes = REMOTE_FILE_SAVE_AS_MAX_BYTES);
            });
            return () => {
              unsubscribe(), unregister?.();
            };
          }, "ds-harness-remote: remote file viewer provider");
        });
        let RemoteMentionIcon = (props) => React.createElement(
          "svg",
          {
            width: props.size ?? 18,
            height: props.size ?? 18,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: props.color ?? "currentColor",
            strokeWidth: 1.8,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": !0,
            className: "dshRemoteComputerIcon"
          },
          React.createElement("rect", { x: 3, y: 4, width: 18, height: 13, rx: 2 }),
          React.createElement("path", { d: "M8 21h8M12 17v4" })
        );
        ctx.inject(["inputTriggers"], (inputContext) => {
          let hostCache = /* @__PURE__ */ new Map();
          inputContext.effect(() => {
            let inputTriggers = inputContext.inputTriggers, source = {
              trigger: "@",
              name: "\u4E3B\u673A",
              order: -20,
              showGroupTitle: !0,
              candidates: async (_session, request) => {
                if ((await control("settings.get").catch(() => {
                }))?.config?.remoteTools?.enabled === !1) return [];
                let devices = await control("devices").catch(() => []), query = request.query.trim().toLocaleLowerCase();
                return devices.filter((device) => device.online && (query === "" || `${device.name} ${device.deviceId}`.toLocaleLowerCase().includes(query))).map((device) => (hostCache.set(device.name, device), {
                  name: device.name,
                  label: device.name,
                  description: t("remoteHostMention", { platform: device.platform }),
                  icon: RemoteMentionIcon,
                  value: JSON.stringify({ deviceId: device.deviceId, label: device.name, platform: device.platform })
                }));
              },
              onPick: (pick) => {
                let host = JSON.parse(pick.candidate.value);
                return { text: `@${host.label} (Remote hostId=${JSON.stringify(host.deviceId)}) ` };
              }
            }, stopHostFileOpen = (event) => {
              let target = event.target instanceof Element ? event.target.closest('button,[role="button"],a') ?? event.target : void 0;
              if (!(target instanceof Element)) return;
              let text = target.textContent?.trim().replace(/^@/, "") ?? "", device = hostCache.get(text);
              if (!device) return;
              event.preventDefault(), event.stopImmediatePropagation();
              let invocation = `@${device.name}`, container = target;
              for (let depth = 0; depth < 20 && container !== null; depth += 1) {
                let candidate = container.textContent?.trim() ?? "";
                candidate.includes(device.name) && candidate.length > invocation.length && candidate.length < 4e3 && (invocation = candidate), container = container.parentElement;
              }
              window.dispatchEvent(new CustomEvent("dsh-remote-host-reference", {
                detail: { label: device.name, platform: device.platform, deviceId: device.deviceId, invocation }
              }));
            };
            document.addEventListener("click", stopHostFileOpen, !0);
            let unregister = inputTriggers.registerSource(source);
            return () => {
              document.removeEventListener("click", stopHostFileOpen, !0), unregister();
            };
          }, "ds-harness-remote: host mention source");
        }), ctx.effect(() => ctx.locale.register(localeNamespace, { zh, en, ru, uk }), "ds-harness-remote: dictionaries"), ctx.effect(() => installStyle(clientModuleId), "ds-harness-remote: client styles"), ctx.effect(() => installTerminalAvailabilityNotice(statusFeed, t), "ds-harness-remote: terminal availability notice"), ctx.slots.inject("shell.overlay", () => ctx.slots.register({
          name: "shell.overlay",
          id: "ds-harness-remote-global-context",
          order: 20,
          locale: localeNamespace,
          inject: () => ({ control, statusFeed, onSignIn: openRemote })
        }, RemoteSessionHeaderAction)), ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
          name: "sidebar.footer.action",
          id: "ds-harness-remote-workspace",
          order: -20,
          locale: localeNamespace,
          inject: () => ({
            control,
            statusFeed,
            subscribeOpen,
            openSettings: void 0,
            preferredQrProvider: ctx.locale.getLocale().active === "zh" ? "zhihu" : "github",
            sidebarEntry,
            portal
          })
        }, RemoteWorkspaceAction)), ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
          name: "plugins.row.config",
          key: "ds-harness-remote#ds-harness-remote",
          locale: localeNamespace,
          inject: () => ({
            control,
            statusFeed,
            onSignIn: openRemote,
            preferredQrProvider: ctx.locale.getLocale().active === "zh" ? "zhihu" : "github",
            sidebarEntry
          })
        }, RemotePluginOptions)), ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
          name: "plugins.bundle.config",
          key: "ds-harness-remote",
          locale: localeNamespace,
          inject: () => ({
            control,
            statusFeed,
            onSignIn: openRemote,
            preferredQrProvider: ctx.locale.getLocale().active === "zh" ? "zhihu" : "github",
            sidebarEntry
          })
        }, RemotePluginOptions)), ctx.slots.inject("plugins.detail.actions", () => ctx.slots.register({
          name: "plugins.detail.actions",
          id: "ds-harness-remote-settings-link",
          order: 30,
          locale: localeNamespace,
          inject: () => ({})
        }, RemotePluginSettingsAction));
      }
      function pluginSubjectPackageName(subject) {
        if (typeof subject != "object" || subject === null) return;
        let pkg = subject.pkg;
        if (typeof pkg != "object" || pkg === null) return;
        let name = pkg.name;
        return typeof name == "string" ? name : void 0;
      }
      function isMissingControlRoute(reason) {
        return reason instanceof Error && reason.message.startsWith(`transport failure for ${CONTROL_RPC_PREFIX}/`) && (reason.message.endsWith(": HTTP 404") || reason.message.endsWith(": HTTP 405"));
      }
      return module.exports.apply = apply, module.exports.inject = inject, module.exports;
    }
  });
})();
