# astm-e1394

ASTM E1394 (LIS2-A2) laboratory instrument message parser and serializer for Node.js.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/astm-e1394
[npm-url]: https://npmjs.org/package/astm-e1394
[downloads-image]: https://img.shields.io/npm/dm/astm-e1394.svg
[downloads-url]: https://npmjs.org/package/astm-e1394
[ci-test-image]: https://github.com/panates/astm-e1394/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/astm-e1394/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/astm-e1394/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/astm-e1394

## Packages

| Package | Description |
| --- | --- |
| [`@astm-e1394/core`](packages/core/core) | Parses, builds and serializes ASTM E1394 (LIS2-A2) messages, and runs the ASTM E1381 (LIS1-A) protocol over any connection. |
| [`@astm-e1394/dictionary`](packages/core/dictionary) | Record and field definitions of ASTM E1394 (LIS2-A2). |
| [`@astm-e1394/net`](packages/core/net) | Connects to laboratory instruments over TCP. |
| [`@astm-e1394/serial`](packages/core/serial) | Connects to laboratory instruments over serial ports. |

The packages are in early design and not published yet.

## Node.js

Node.js 22 or later.

## License

[MIT](LICENSE)
