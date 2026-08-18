// dsh-mini — 桌面客户端半边（浏览器 bundle，零构建）
//
// 职责：
//   1) 左侧栏 footer 手机图标（sidebar.footer.action，order 210，渲染在
//      side-session 的「临时会话」图标上方）→ 网关未开启时点击自动跳转
//      DSH 设置页；已开启时弹出二维码面板（系统相机 / DSH-Mobile 应用扫码）。
//   2) 设置页分节（settings.section，order 70）：局域网网关开关、token
//      显示/重置、绑定地址与端口、二维码预览、上传限额、连接自检。
//   3) 余额转发：监听 Desktop 壳的 "dsh-balance-changed" 事件 + 周期性
//      refreshBalance()，把余额数据 POST 到 host 缓存供手机余额圆环读取
//      （dsh-balance 无 host API，插件只能走 client 半边）。
//
// 实现约束：客户端插件 require 只能取平台 seed 模块（跨插件值导入是构建
// 错误），本文件全部代码内联（含 vendored MIT QR 编码器 qrcode-generator，
// Kazuhiko Arase / http://www.d-project.com/，见 vendor/qrcode.js 头部注释）。

window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-mini",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var reactDom = require("react-dom/client");
    var jsxRuntime = require("react/jsx-runtime");
    var jsx = jsxRuntime.jsx;
    var jsxs = jsxRuntime.jsxs;
    var useState = react.useState;
    var useEffect = react.useEffect;
    var useRef = react.useRef;

    // startup beacon: fires the moment this bundle's factory materializes
    var BUNDLE_REV = 4;
    (function () {
      try {
        fetch("/dsh-mini/api/client-beacon", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ev: "factory", msg: "bundle factory materialized rev=" + BUNDLE_REV }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {
        /* diagnostic only */
      }
    })();

    // ------------------------------------------------------------------
    // vendored QR encoder (MIT, Kazuhiko Arase) — isolated in an IIFE so
    // its UMD tail (`module.exports = factory()`) cannot hijack our
    // plugin's module.exports (that bug silently dropped name/apply/inject
    // and made the client fiber never activate).
    // ------------------------------------------------------------------
    var qrcode = (function () {
      var module = { exports: {} };
      var exports = module.exports;
      var define;
      //---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

      return module.exports;
    })();

    function h(type, props) {
      var children = Array.prototype.slice.call(arguments, 2);
      if (children.length === 0) return jsx(type, props || {});
      if (children.length === 1)
        return jsx(type, Object.assign({}, props || {}, { children: children[0] }));
      return jsxs(type, Object.assign({}, props || {}, { children: children }));
    }

    // ------------------------------------------------------------------
    // 单例 store + subscribe
    // ------------------------------------------------------------------
    var store = {
      overlayOpen: false,
      gateway: null,
      gatewayLoading: false,
      error: "",
      busy: false,
      notice: "",
    };
    var listeners = new Set();
    function setState(patch) {
      Object.assign(store, patch);
      listeners.forEach(function (l) {
        l();
      });
    }
    function subscribe(l) {
      listeners.add(l);
      return function () {
        listeners.delete(l);
      };
    }
    function useStore() {
      var force = useState(0)[1];
      useEffect(function () {
        return subscribe(function () {
          force(function (x) {
            return x + 1;
          });
        });
      }, []);
      return store;
    }

    // ------------------------------------------------------------------
    // host API（同源回环，免 token）
    // ------------------------------------------------------------------
    function apiJson(path, opts) {
      return fetch(path, Object.assign({ cache: "no-store" }, opts || {})).then(function (r) {
        return r.json().catch(function () {
          return { error: "HTTP " + r.status };
        });
      });
    }
    function refreshGateway(silent) {
      if (!silent) setState({ gatewayLoading: true });
      return apiJson("/dsh-mini/api/gateway")
        .then(function (d) {
          setState({ gateway: d.gateway || null, gatewayLoading: false, error: d.error || "" });
          return d.gateway;
        })
        .catch(function (e) {
          setState({ gatewayLoading: false, error: String((e && e.message) || e) });
          return null;
        });
    }
    function postConfig(patch) {
      setState({ busy: true, error: "" });
      return apiJson("/dsh-mini/api/gateway/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then(function (d) {
          setState({ gateway: d.gateway || null, busy: false, error: d.error || "", notice: d.ok ? "已保存" : "" });
        })
        .catch(function (e) {
          setState({ busy: false, error: String((e && e.message) || e) });
        });
    }
    function resetToken() {
      setState({ busy: true, error: "" });
      return apiJson("/dsh-mini/api/gateway/token/reset", { method: "POST" })
        .then(function (d) {
          setState({ busy: false, error: d.error || "", notice: d.ok ? "token 已重置（LAN 设备需重新扫码连接）" : "" });
          return refreshGateway();
        })
        .catch(function (e) {
          setState({ busy: false, error: String((e && e.message) || e) });
        });
    }

    // ------------------------------------------------------------------
    // 打开 DSH 设置页（点 settings 触发按钮；找不到则回退 aria-label 匹配）
    // ------------------------------------------------------------------
    function openSettingsPage() {
      try {
        var btn = document.querySelector("button.VOzbGW_trigger");
        if (btn) {
          btn.click();
          return true;
        }
        var all = Array.prototype.slice.call(document.querySelectorAll("button"));
        for (var i = 0; i < all.length; i++) {
          var label = (all[i].getAttribute("aria-label") || "") + " " + (all[i].textContent || "");
          if (/设置|Settings/i.test(label)) {
            all[i].click();
            return true;
          }
        }
      } catch (e) {
        console.warn("[dsh-mini] openSettingsPage failed: " + String((e && e.message) || e));
      }
      return false;
    }

    // ------------------------------------------------------------------
    // 二维码渲染（canvas）
    // ------------------------------------------------------------------
    function renderQr(text, canvas) {
      if (!canvas || !text) {
        beacon("qr-skip", "canvas=" + Boolean(canvas) + " text=" + Boolean(text));
        return;
      }
      try {
        var qr = qrcode(0, "M");
        qr.addData(text);
        qr.make();
        var n = qr.getModuleCount();
        var size = 232;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#101014";
        var cell = size / n;
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            if (qr.isDark(r, c)) {
              ctx.fillRect(Math.floor(c * cell), Math.floor(r * cell), Math.ceil(cell), Math.ceil(cell));
            }
          }
        }
        beacon("qr-ok", "modules=" + n + " url=" + text.slice(0, 60));
      } catch (e) {
        beacon("qr-fail", String((e && e.message) || e));
        console.warn("[dsh-mini] QR render failed: " + String((e && e.message) || e));
      }
    }

    // ------------------------------------------------------------------
    // 二维码弹窗（body 根挂载，仿 side-session 浮窗做法）
    // ------------------------------------------------------------------
    function QrOverlay() {
      var s = useStore();
      var canvasRef = useRef(null);
      var gw = s.gateway || {};
      useEffect(
        function () {
          if (s.overlayOpen) refreshGateway();
        },
        [s.overlayOpen]
      );
      useEffect(
        function () {
          if (s.overlayOpen && gw.url && canvasRef.current) {
            beacon("qr-overlay", "url=" + gw.url.slice(0, 60));
            renderQr(gw.url, canvasRef.current);
          } else {
            beacon("qr-overlay-skip", "open=" + s.overlayOpen + " url=" + Boolean(gw.url) + " canvas=" + Boolean(canvasRef.current));
          }
        },
        [s.overlayOpen, gw.url]
      );
      var copyState = useState("");
      var setCopy = copyState[1];
      if (!s.overlayOpen) return null;
      return h(
        "div",
        {
          className: "dsm-mask",
          onClick: function () {
            setState({ overlayOpen: false });
          },
        },
        h(
          "div",
          { className: "dsm-dialog", onClick: function (e) { e.stopPropagation(); } },
          h("div", { className: "dsm-dialog-title" }, "远程控制 DSH-Mobile"),
          gw.lanEnabled
            ? h(
                "div",
                { className: "dsm-qr-wrap" },
                gw.reachable || (gw.publicMode && gw.publicUrl)
                  ? h("canvas", { ref: canvasRef, className: "dsm-qr" })
                  : h(
                      "div",
                      { className: "dsm-warn" },
                      gw.bindWarn || "网关不可达：请检查 DSH web 绑定地址（需 0.0.0.0）。"
                    )
              )
            : h(
                "div",
                { className: "dsm-off" },
                h("div", { className: "dsm-off-title" }, "局域网网关未开启"),
                h("div", { className: "dsm-off-hint" }, "开启后此处将显示二维码，手机扫码即可连接。"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsm-btn dsm-btn-primary",
                    onClick: function () {
                      setState({ overlayOpen: false });
                      openSettingsPage();
                    },
                  },
                  "前往设置开启网关"
                )
              ),
          (gw.lanEnabled || (gw.publicMode && gw.publicUrl)) && gw.url
            ? h(
                "div",
                { className: "dsm-url-row" },
                h("input", { className: "dsm-url", readOnly: true, value: gw.url, onFocus: function (e) { e.target.select(); } }),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsm-btn",
                    onClick: function () {
                      try {
                        navigator.clipboard.writeText(gw.url).then(function () {
                          setCopy("已复制");
                          setTimeout(function () { setCopy(""); }, 1500);
                        });
                      } catch (e) {
                        /* ignore */
                      }
                    },
                  },
                  copyState[0] || "复制"
                )
              )
            : null,
          h(
            "div",
            { className: "dsm-status-row" },
            h("span", null, "主服务 " + (gw.host || "?") + ":" + (gw.port || "?")),
            gw.lanEnabled
              ? h(
                  "span",
                  null,
                  "网关 " +
                    (gw.gatewayListening
                      ? "0.0.0.0:" + (gw.gatewayPort != null ? gw.gatewayPort : "?")
                      : "未监听") +
                    (gw.lanIps && gw.lanIps.length ? " · LAN " + gw.lanIps.join(", ") : "")
                )
              : null,
            h("span", { className: gw.reachable ? "dsm-ok" : "dsm-bad" }, gw.reachable ? "手机可访问" : gw.lanEnabled ? "手机不可访问" : "仅本机")
          ),
          h("div", { className: "dsm-hint" }, "用手机系统相机扫码，或在 DSH-Mobile 应用内扫码连接（连接需同一 Wi-Fi）。"),
          h(
            "div",
            { className: "dsm-actions" },
            h(
              "button",
              {
                type: "button",
                className: "dsm-btn",
                onClick: function () {
                  setState({ overlayOpen: false });
                  openSettingsPage();
                },
              },
              "打开设置"
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsm-btn dsm-btn-primary",
                onClick: function () {
                  setState({ overlayOpen: false });
                },
              },
              "关闭"
            )
          )
        )
      );
    }

    // ------------------------------------------------------------------
    // 侧栏 footer 手机图标（sidebar.footer.action）
    // ------------------------------------------------------------------
    var footerRenderBeacon = false;
    var settingsRenderBeacon = false;
    function FooterIcon(props) {
      if (!footerRenderBeacon) {
        footerRenderBeacon = true;
        beacon("slot-footer-render", "FooterIcon rendered");
      }
      var s = useStore();
      var wide = !!(props && props.wide);
      return h(
        "button",
        {
          type: "button",
          className: "dsm-footer-icon",
          "data-rail": wide ? "0" : "1",
          title: "远程控制",
          "aria-haspopup": "dialog",
          onClick: function () {
            // 未配置（网关关闭）→ 跳设置页；已配置 → 弹二维码
            beacon("footer-click", "clicked");
            refreshGateway().then(function (gw) {
              beacon("footer-click", "gw=" + JSON.stringify({ ok: Boolean(gw), lan: gw && gw.lanEnabled, url: gw && gw.url ? gw.url.slice(0, 30) : null }));
              if (!gw) {
                setState({ overlayOpen: true });
              } else if (gw.lanEnabled !== true) {
                openSettingsPage();
              } else {
                setState({ overlayOpen: true });
              }
            });
          },
        },
        h(
          "svg",
          {
            width: wide ? "16" : "18",
            height: wide ? "16" : "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
          h("rect", { x: "5", y: "2", width: "14", height: "20", rx: "2", ry: "2" }),
          h("path", { d: "M12 18h.01" })
        ),
        wide ? h("span", { className: "dsm-footer-label" }, "远程控制") : null
      );
    }

    // ------------------------------------------------------------------
    // 设置页分节（settings.section）
    // ------------------------------------------------------------------
    function SettingsCard() {
      if (!settingsRenderBeacon) {
        settingsRenderBeacon = true;
        beacon("slot-settings-render", "SettingsCard rendered");
      }
      var s = useStore();
      var gw = s.gateway || {};
      var canvasRef = useRef(null);
      var maxDraftState = useState(gw.maxUploadMb != null ? String(gw.maxUploadMb) : "20");
      var maxDraft = maxDraftState[0];
      var setMaxDraft = maxDraftState[1];
      var portDraftState = useState(gw.gatewayPort != null ? String(gw.gatewayPort) : "46322");
      var portDraft = portDraftState[0];
      var setPortDraft = portDraftState[1];
      var showTokenState = useState(false);
      var showToken = showTokenState[0];
      var setShowToken = showTokenState[1];
      var pubModeState = useState(gw.publicMode === true);
      var pubMode = pubModeState[0];
      var setPubMode = pubModeState[1];
      var pubUrlState = useState(gw.publicUrl || "");
      var pubUrl = pubUrlState[0];
      var setPubUrl = pubUrlState[1];
      useEffect(function () {
        setPubMode(gw.publicMode === true);
      }, [gw.publicMode]);
      useEffect(function () {
        if (gw.publicUrl != null) setPubUrl(gw.publicUrl);
      }, [gw.publicUrl]);
      useEffect(function () {
        refreshGateway();
      }, []);
      useEffect(
        function () {
          if (gw.gatewayPort != null) setPortDraft(String(gw.gatewayPort));
        },
        [gw.gatewayPort]
      );
      useEffect(
        function () {
          if (gw.url && canvasRef.current) {
            beacon("qr-settings", "url=" + gw.url.slice(0, 60));
            renderQr(gw.url, canvasRef.current);
          } else {
            beacon("qr-settings-skip", "url=" + Boolean(gw.url) + " canvas=" + Boolean(canvasRef.current));
          }
        },
        [gw.url]
      );
      return h(
        "div",
        { className: "dsm-settings" },
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "局域网网关"),
          h(
            "label",
            { className: "dsm-switch" },
            h("input", {
              type: "checkbox",
              checked: gw.lanEnabled === true,
              disabled: s.busy,
              onChange: function (e) {
                postConfig({ lanEnabled: e.target.checked });
              },
            }),
            h("span", { className: "dsm-switch-slider" })
          ),
          h("div", { className: "dsm-set-hint" }, "开启后手机可通过局域网访问本机 DSH（网关独立监听 0.0.0.0，主服务绑定不变）。")
        ),
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "网关端口"),
          h(
            "input",
            {
              className: "dsm-set-input dsm-set-input-num",
              type: "number",
              min: "1024",
              max: "65535",
              value: portDraft,
              onChange: function (e) {
                setPortDraft(e.target.value);
              },
            }
          ),
          h(
            "button",
            {
              type: "button",
              className: "dsm-btn",
              disabled: s.busy,
              onClick: function () {
                postConfig({ gatewayPort: Number(portDraft) });
              },
            },
            "应用"
          ),
          h(
            "div",
            { className: "dsm-set-hint" },
            "网关独立监听 0.0.0.0（默认 46322），仅转发 /dsh-mini；主服务 " +
              (gw.host || "?") + ":" + (gw.port || "?") +
              " 保持回环不变。改动后网关自动重启。"
          )
        ),
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "连接状态"),
          h(
            "div",
            { className: "dsm-set-value" },
            gw.gatewayListening
              ? "网关监听中 0.0.0.0:" + (gw.gatewayPort != null ? gw.gatewayPort : "?") + " · LAN IP: " + (gw.lanIps && gw.lanIps.length ? gw.lanIps.join(", ") : "未检测到")
              : "网关未监听"
          ),
          gw.bindWarn ? h("div", { className: "dsm-set-warn" }, gw.bindWarn) : null
        ),
        gw.lanEnabled
          ? h(
              "div",
              { className: "dsm-set-row" },
              h("div", { className: "dsm-set-label" }, "扫码连接"),
              h("canvas", { ref: canvasRef, className: "dsm-qr-sm" }),
              h(
                "div",
                { className: "dsm-set-hint" },
                "手机系统相机扫码，或 DSH-Mobile 应用内扫码。" + (gw.reachable ? "" : "（网关未就绪或未检测到局域网 IP，手机无法访问）")
              )
            )
          : null,
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "连接密钥"),
          h(
            "div",
            { className: "dsm-token-row" },
            h(
              "input",
              {
                className: "dsm-set-input",
                readOnly: true,
                type: showToken ? "text" : "password",
                value: gw.token || "",
                onFocus: function (e) {
                  e.target.select();
                },
              }
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsm-btn",
                onClick: function () {
                  setShowToken(!showToken);
                },
              },
              showToken ? "隐藏" : "显示"
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsm-btn",
                disabled: s.busy,
                onClick: function () {
                  resetToken();
                },
              },
              "重置"
            )
          ),
          h("div", { className: "dsm-set-hint" }, "重置后 LAN 设备需重新扫码；本机回环不受影响。")
        ),
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "上传限额 (MB)"),
          h(
            "input",
            {
              className: "dsm-set-input dsm-set-input-num",
              type: "number",
              min: "1",
              max: "100",
              value: maxDraft,
              onChange: function (e) {
                setMaxDraft(e.target.value);
              },
            }
          ),
          h(
            "button",
            {
              type: "button",
              className: "dsm-btn",
              disabled: s.busy,
              onClick: function () {
                postConfig({ maxUploadMb: Number(maxDraft) });
              },
            },
            "应用"
          ),
          h("div", { className: "dsm-set-hint" }, "手机端附件上传的单文件上限（1–100 MB）。")
        ),
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "允许外网访问"),
          h(
            "label",
            { className: "dsm-switch" },
            h("input", {
              type: "checkbox",
              checked: pubMode,
              disabled: s.busy,
              onChange: function (e) {
                setPubMode(e.target.checked);
                postConfig({ publicMode: e.target.checked });
              },
            }),
            h("span", { className: "dsm-switch-slider" })
          ),
          h(
            "div",
            { className: "dsm-set-hint" },
            "关闭 = 仅内部局域网：只有回环 / 本机 / 局域网 IP 可访问，来自公网域名或公网 IP 的请求（含 cloudflared 等隧道转出的连接）一律拒绝（即使带连接密钥）。开启 = 允许外网：用独立隧道把网关 0.0.0.0:" +
              (gw.gatewayPort != null ? gw.gatewayPort : "?") +
              " 暴露到公网，所有请求（含隧道回环）都必须携带连接密钥，二维码自动切换为公网地址；局域网体验不受影响。"
          ),
          pubMode
            ? h(
                "div",
                { className: "dsm-set-row" },
                h("div", { className: "dsm-set-label" }, "公网地址 (publicUrl)"),
                h(
                  "div",
                  { className: "dsm-token-row" },
                  h("input", {
                    className: "dsm-set-input",
                    type: "text",
                    placeholder: "https://xxx-xxx.trycloudflare.com",
                    value: pubUrl,
                    onChange: function (e) {
                      setPubUrl(e.target.value);
                    },
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dsm-btn",
                      disabled: s.busy,
                      onClick: function () {
                        postConfig({ publicUrl: pubUrl.trim() });
                      },
                    },
                    "应用"
                  )
                ),
                h(
                  "div",
                  { className: "dsm-set-hint" },
                  (gw.external && gw.external.up ? "✓ 外网入口已配置，二维码/连接 URL 为公网地址。" : gw.publicUrl ? "已填写，等待网关按此地址生成二维码。" : "填写隧道公网地址（以 http(s):// 开头，不要带 ?token 或尾部斜杠）。保存后二维码/连接 URL 自动切换；外网设备首次打开需在地址后附 ?token= 或在应用中扫码。") +
                    (gw.maxUploadMb != null && pubMode ? " 外网模式上传上限已钳制为 " + gw.maxUploadMb + " MB。" : "")
                )
              )
            : null
        ),
        h(
          "div",
          { className: "dsm-set-row" },
          h("div", { className: "dsm-set-label" }, "状态"),
          h(
            "button",
            {
              type: "button",
              className: "dsm-btn",
              disabled: s.gatewayLoading,
              onClick: function () {
                refreshGateway();
              },
            },
            "重新检测"
          ),
          h("div", { className: "dsm-set-hint" }, "版本 " + (gw.version || "?") + (s.notice ? " · " + s.notice : "") + (s.error ? " · 错误：" + s.error : ""))
        )
      );
    }

    // ------------------------------------------------------------------
    // 余额转发（Desktop 壳 → host 缓存 → 手机）
    // ------------------------------------------------------------------
    function setupBalanceForwarder() {
      if (typeof window === "undefined") return function () {};
      var forward = function (detail) {
        try {
          fetch("/dsh-mini/api/balance/report", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(detail || null),
            cache: "no-store",
          }).catch(function () {
            /* host not ready yet */
          });
        } catch (e) {
          /* ignore */
        }
      };
      var onBalance = function (e) {
        forward(e && e.detail);
      };
      window.addEventListener("dsh-balance-changed", onBalance);
      var poll = function () {
        try {
          if (window.dshDesktop && typeof window.dshDesktop.refreshBalance === "function") {
            window.dshDesktop.refreshBalance();
          }
        } catch (e) {
          /* ignore */
        }
      };
      var t = setInterval(poll, 60000);
      poll();
      return function () {
        window.removeEventListener("dsh-balance-changed", onBalance);
        clearInterval(t);
      };
    }

    // ------------------------------------------------------------------
    // CSS 注入（同 side-session 模式：style[data-plugin-css] 幂等）
    // ------------------------------------------------------------------
    var CSS_TAG = "@deepseek-ai/dsh-mini/client.css";
    function ensureCss() {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]")) return;
      var tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-mini";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent =
        ".dsm-mask{position:fixed;inset:0;z-index:1200;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center}" +
        ".dsm-dialog{width:min(420px,calc(100vw - 32px));background:var(--dsw-alias-bg-layer-2,#1b1b22);border-radius:20px;box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(0,0,0,.4));padding:20px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary,#f2f2f7)}" +
        ".dsm-dialog-title{font-size:16px;font-weight:600;line-height:24px}" +
        ".dsm-qr-wrap{display:flex;align-items:center;justify-content:center;padding:12px;background:#fff;border-radius:14px}" +
        ".dsm-qr{display:block;width:232px;height:232px}" +
        ".dsm-qr-sm{display:block;width:120px;height:120px;background:#fff;border-radius:10px}" +
        ".dsm-url-row{display:flex;gap:8px}" +
        ".dsm-url{flex:1;min-width:0;font-size:12px;padding:8px 10px;border-radius:10px;border:1px solid var(--dsw-alias-line,#333);background:transparent;color:inherit}" +
        ".dsm-status-row{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#9a9aa5)}" +
        ".dsm-ok{color:var(--dsw-alias-state-success-primary,#3fbf7f)}.dsm-bad{color:var(--dsw-alias-state-error-primary,#e5484d)}" +
        ".dsm-hint{font-size:12px;color:var(--dsw-alias-label-secondary,#9a9aa5)}" +
        ".dsm-warn{font-size:12px;color:var(--dsw-alias-state-error-primary,#e5484d);padding:10px}" +
        ".dsm-off{display:flex;flex-direction:column;gap:6px;align-items:center;padding:16px 8px;text-align:center}" +
        ".dsm-off-title{font-size:14px;font-weight:600}.dsm-off-hint{font-size:12px;color:var(--dsw-alias-label-secondary,#9a9aa5)}" +
        ".dsm-actions{display:flex;justify-content:flex-end;gap:8px}" +
        ".dsm-btn{font:inherit;font-size:13px;padding:7px 14px;border-radius:10px;border:1px solid var(--dsw-alias-line,#333);background:transparent;color:inherit;cursor:pointer}" +
        ".dsm-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}" +
        ".dsm-btn:disabled{opacity:.5;cursor:default}" +
        ".dsm-btn-primary{background:var(--dsw-alias-accent-primary,#4c7dff);border-color:transparent;color:#fff}" +
        ".dsm-footer-icon{box-sizing:border-box;flex:1 0 100%;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary,#f2f2f7);background:transparent;border:none;border-radius:12px;margin:4px -4px;padding:6px 2px 6px 10px;font:inherit;font-size:14px;line-height:22px;display:flex;align-items:center;gap:8px;cursor:pointer;overflow:hidden}" +
        ".dsm-footer-icon:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}" +
        ".dsm-footer-icon[data-rail='1']{border-radius:50%;justify-content:center;gap:0;flex:0 0 36px;width:36px;height:36px;margin:8px 0 10px;padding:0}" +
        ".dsm-footer-label{white-space:nowrap;overflow:hidden}" +
        ".dsm-settings{display:flex;flex-direction:column;gap:18px;font-size:14px;color:var(--dsw-alias-label-primary,#f2f2f7)}" +
        ".dsm-set-row{display:flex;flex-direction:column;gap:8px}" +
        ".dsm-set-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f2f7)}" +
        ".dsm-set-value{font-size:13px;color:var(--dsw-alias-label-secondary,#9a9aa5)}" +
        ".dsm-set-hint{font-size:12px;color:var(--dsw-alias-label-secondary,#9a9aa5)}" +
        ".dsm-set-warn{font-size:12px;color:var(--dsw-alias-state-error-primary,#e5484d)}" +
        ".dsm-set-input{font:inherit;font-size:13px;padding:7px 10px;border-radius:10px;border:1px solid var(--dsw-alias-line,#333);background:transparent;color:inherit;min-width:0}" +
        ".dsm-set-input-num{width:96px}" +
        ".dsm-token-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
        ".dsm-token-row .dsm-set-input{flex:1;min-width:160px}" +
        ".dsm-switch{position:relative;display:inline-block;width:40px;height:22px;flex:none}" +
        ".dsm-switch input{opacity:0;width:0;height:0}" +
        ".dsm-switch-slider{position:absolute;cursor:pointer;inset:0;background:var(--dsw-alias-line,#3a3a44);border-radius:22px;transition:.2s}" +
        ".dsm-switch-slider:before{content:'';position:absolute;height:16px;width:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}" +
        ".dsm-switch input:checked + .dsm-switch-slider{background:var(--dsw-alias-accent-primary,#4c7dff)}" +
        ".dsm-switch input:checked + .dsm-switch-slider:before{transform:translateX(18px)}" +
        "[class*='_footerActions']{flex-wrap:wrap}" +
        "[class*='_collapsed'] [class*='_footerActions']{width:36px;justify-content:flex-start}";
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------------
    // 挂载
    // ------------------------------------------------------------------
    var mounted = false;
    function mountOverlay() {
      if (mounted || typeof document === "undefined") return;
      mounted = true;
      var container = document.createElement("div");
      container.id = "dsh-mini-overlay-root";
      document.body.appendChild(container);
      try {
        beacon("overlay", "creating root");
        var root = reactDom.createRoot(container);
        beacon("overlay", "root created");
        root.render(h(QrOverlay));
        beacon("overlay", "render called");
      } catch (e) {
        var msg = String((e && e.message) || e);
        console.warn("[dsh-mini] overlay 挂载失败：" + msg);
        beacon("overlay", "ERR " + msg);
      }
    }

    function beacon(ev, msg) {
      try {
        fetch("/dsh-mini/api/client-beacon", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ev: ev, msg: msg }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {
        /* diagnostic only */
      }
    }

    function apply(ctx) {
      beacon("apply", "client apply started");
      ensureCss();
      ctx.effect(function () {
        return setupBalanceForwarder();
      }, "dsh-mini: balance forwarder");
      ctx.effect(function () {
        mountOverlay();
      }, "dsh-mini: overlay mount");

      // 每 30s 静默刷新网关连接状态（二维码 / 可达性 / 端口改动即时生效）
      ctx.effect(function () {
        var timer = setInterval(function () {
          refreshGateway(true);
        }, 30000);
        return function () {
          clearInterval(timer);
        };
      }, "dsh-mini: gateway poll (30s)");

      // 左侧主栏 footer 手机图标（order 210 < side-session 220 → 渲染在其上方）
      ctx.effect(function () {
        try {
          const ret = ctx.slots.inject("sidebar.footer.action", function () {
            const dispose = ctx.slots.register({ name: "sidebar.footer.action", id: "dsh-mini", order: 210, label: "远程控制" }, FooterIcon);
            beacon("slot-footer", "registered");
            return dispose;
          }, "dsh-mini");
          beacon("slot-footer", "inject returned");
          return ret;
        } catch (e) {
          const msg = String((e && e.message) || e);
          console.warn("[dsh-mini] sidebar.footer.action 槽不可用：" + msg);
          beacon("slot-footer", "ERR " + msg);
        }
      }, "dsh-mini: footer icon");

      // 设置页分节（settings.section list 槽）
      ctx.effect(function () {
        try {
          const ret = ctx.slots.inject("settings.section", function () {
            const dispose = ctx.slots.register({ name: "settings.section", id: "dsh-mini", order: 70, label: function () { return "DSH-Mobile 手机桥"; } }, SettingsCard);
            beacon("slot-settings", "registered");
            return dispose;
          }, "name");
          beacon("slot-settings", "inject returned");
          return ret;
        } catch (e) {
          const msg = String((e && e.message) || e);
          console.warn("[dsh-mini] settings.section 槽不可用：" + msg);
          beacon("slot-settings", "ERR " + msg);
        }
      }, "dsh-mini: settings section");
    }

    exports.name = "@deepseek-ai/dsh-mini";
    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
