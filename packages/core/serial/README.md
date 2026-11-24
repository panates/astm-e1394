# @astm-e1394/serial

Connects to laboratory instruments over serial ports for ASTM E1394 messages.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/@astm-e1394/serial
[npm-url]: https://npmjs.org/package/@astm-e1394/serial
[downloads-image]: https://img.shields.io/npm/dm/@astm-e1394/serial.svg
[downloads-url]: https://npmjs.org/package/@astm-e1394/serial
[ci-test-image]: https://github.com/panates/astm-e1394/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/astm-e1394/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/astm-e1394/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/astm-e1394

## Install

```bash
npm install @astm-e1394/core@beta @astm-e1394/serial@beta
```

A serial port connection for [`@astm-e1394/core`](https://www.npmjs.com/package/@astm-e1394/core)'s `AstmLink`, which runs the ASTM E1381 (LIS1-A) protocol and the message handlers. The core README describes the link, its handlers and its options. The port is opened with the [serialport](https://www.npmjs.com/package/serialport) package, which comes with prebuilt binaries for the common platforms.

## Usage

```typescript
import { AstmLink } from '@astm-e1394/core';
import { SerialConnection } from '@astm-e1394/serial';

const link = new AstmLink(
  new SerialConnection({
    path: 'COM3', // or '/dev/ttyUSB0'
    baudRate: 9600,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
  }),
  { role: 'host' },
);
link.use('result', async req => store(req.message));
link.on('error', err => console.error(err));
await link.open();
```

| Option | Default | What it is |
| --- | --- | --- |
| `path` | | The port |
| `baudRate` | 9600 | |
| `dataBits` | 8 | 5, 6, 7 or 8 |
| `parity` | `'none'` | `'none'`, `'even'`, `'odd'`, `'mark'` or `'space'` |
| `stopBits` | 1 | 1, 1.5 or 2 |
| `rtscts` | `false` | Hardware flow control |
| `xonxoff` | `false` | Software flow control |
| `reconnectDelay` | 5000 | The wait in ms before opening the port again when it closes on its own, such as a USB adapter unplugged, or an attempt fails; 0 turns this off |

`write()` resolves once the bytes have left the port, so the link's delays (`ackDelay`, `frameDelay`) are counted from the wire.

## A port of your own

Given a port made elsewhere - a `SerialPort` of the serialport package, open or not - the connection uses that port as it is:

```typescript
import { SerialPort } from 'serialport';

const port = new SerialPort({ path: 'COM3', baudRate: 9600 });
const link = new AstmLink(new SerialConnection(port));
```

- `open()` opens the port when it is closed, or waits while its owner opens it.
- The port's own `open`, `close` and `data` go to the link, also when its owner closes or opens it.
- The connection never makes another port, and does not open this one again on its own.

## License

[MIT](https://github.com/panates/astm-e1394/blob/main/LICENSE)
