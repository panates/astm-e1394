# @astm-e1394/net

Connects to laboratory instruments over TCP for ASTM E1394 messages.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/@astm-e1394/net
[npm-url]: https://npmjs.org/package/@astm-e1394/net
[downloads-image]: https://img.shields.io/npm/dm/@astm-e1394/net.svg
[downloads-url]: https://npmjs.org/package/@astm-e1394/net
[ci-test-image]: https://github.com/panates/astm-e1394/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/astm-e1394/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/astm-e1394/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/astm-e1394

## Install

```bash
npm install @astm-e1394/core @astm-e1394/net
```

TCP connections for [`@astm-e1394/core`](https://www.npmjs.com/package/@astm-e1394/core)'s `AstmLink`, which runs the ASTM E1381 (LIS1-A) protocol and the message handlers. The core README describes the link, its handlers and its options.

## Instruments that connect to the LIS

`TcpServer` listens, makes an `AstmLink` for each connection it accepts, and serves every link with the handlers added to it:

```typescript
import { TcpServer } from '@astm-e1394/net';

const server = new TcpServer({ link: { role: 'host', ackDelay: 50 } });

server.use('result', async req => {
  await store(req.message);
});
server.use('query', async (req, res) => {
  res.message = await ordersFor(req.message.get('Q-3-2'));
});

server.on('link', link => {
  console.log('connected:', link.connection.description); // tcp://10.0.0.5:51234
  link.on('error', err => console.error(err));
});

await server.listen(5000);
```

- `server.links` holds the links of the connections open now; a link leaves it when its connection closes.
- `maxConnections` refuses connections beyond a number.
- `server.close()` stops listening and closes every connection.

## Connecting to an instrument

`TcpClientConnection` connects to an instrument, or to a serial-to-TCP converter, and connects again when the connection drops:

```typescript
import { AstmLink } from '@astm-e1394/core';
import { TcpClientConnection } from '@astm-e1394/net';

const link = new AstmLink(
  new TcpClientConnection({ host: '10.0.0.5', port: 5000, reconnectDelay: 5000 }),
  { framing: 'none' }, // for an instrument that sends bare records over TCP
);
link.use('result', async req => store(req.message));
await link.open();
```

- `open()` rejects when the first attempt fails, and goes on trying in the background every `reconnectDelay` (5 s; 0 turns it off). The link emits `open` when the connection gets through. `close()` stops the attempts.
- `connectTimeout` (10 s) bounds one attempt. `keepAlive` (30 s, or `false`) sets TCP keep-alive, so that an instrument that vanished without closing is noticed.

## A socket of your own

`TcpSocketConnection` uses a socket made elsewhere as it is: one your code connected, is still connecting, or took from a server of its own.

```typescript
import { connect } from 'node:net';
import { TcpSocketConnection } from '@astm-e1394/net';

const link = new AstmLink(new TcpSocketConnection(connect(5000, '10.0.0.5')));
await link.open(); // waits for the socket to connect
```

It does not reconnect: once the socket closes, a new socket makes a new connection.

## License

[MIT](https://github.com/panates/astm-e1394/blob/main/LICENSE)
