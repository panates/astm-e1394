# @astm-e1394/core

Parses, builds and serializes ASTM E1394 (LIS2-A2) messages, and runs the ASTM E1381 (LIS1-A) protocol over any connection.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/@astm-e1394/core
[npm-url]: https://npmjs.org/package/@astm-e1394/core
[downloads-image]: https://img.shields.io/npm/dm/@astm-e1394/core.svg
[downloads-url]: https://npmjs.org/package/@astm-e1394/core
[ci-test-image]: https://github.com/panates/astm-e1394/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/astm-e1394/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/astm-e1394/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/astm-e1394

## Install

```bash
npm install @astm-e1394/core@beta
```

## Messages

```typescript
import { AstmMessage, PRecord, RRecord } from '@astm-e1394/core';

const msg = AstmMessage.parse(text);

msg.get('P-6-1'); // the first patient's last name
msg.get('/P(1)/O/R(2)-4'); // the second patient's first order's third result

for (const r of msg.getRecords('R')) {
  console.log(r.field(RRecord.UniversalTestID).getValue(4), r.field(RRecord.DataOrMeasurementValue).getValue());
}

const errors = msg.validate();
```

Building a message numbers its records as the hierarchy has them:

```typescript
const msg = new AstmMessage();
msg.addRecord('P').field(PRecord.PatientName).setValue('DOE', 1);
msg.addRecord('O'); // O|1, under the patient
msg.addRecord('L').field(3).setValue('N');
msg.toAstmString(); // records ended by CR
```

- Fields are numbered as the standard numbers them: the record type ID is field 1, so `P-2` is the patient's sequence number.
- A message is read in the delimiters its header declares, and written back in them.
- `buildTree()` gives the records in their hierarchy: patients under the header, orders under their patient, results under their order, comments under the record before them.
- `toObject()` and `assign()` give and take the message as a plain object shaped as that hierarchy.
- `AstmMessage.parseAll()` reads input that holds several messages.
- A Buffer is read in `options.encoding` (UTF-8 by default); the standard names no character set.

## Talking to an instrument

`AstmLink` runs the ASTM E1381 (LIS1-A) low-level protocol over a connection: ENQ, frames with checksums, ACK and NAK, retries and timeouts. It turns the frames it receives into `AstmMessage`s and sends messages as frames. A connection only carries bytes: [`@astm-e1394/net`](https://www.npmjs.com/package/@astm-e1394/net) has TCP connections and a TCP server, [`@astm-e1394/serial`](https://www.npmjs.com/package/@astm-e1394/serial) a serial port, and any class that implements `AstmConnection` works too.

```typescript
import { AstmLink } from '@astm-e1394/core';
import { SerialConnection } from '@astm-e1394/serial';

const link = new AstmLink(new SerialConnection({ path: 'COM3' }), {
  role: 'host', // the LIS; an instrument wins when both sides start at once
  encoding: 'windows-1254',
});

// Results: the frames are already acknowledged when the handler runs
link.use('result', async req => {
  await store(req.message);
});

// Queries: the answer goes back as a new transfer
link.use('query', async (req, res) => {
  res.message = await ordersFor(req.message.get('Q-3-2'));
});

link.on('error', err => console.error(err));
await link.open();

await link.send(orderMessage); // orders sent unasked
```

- ASTM has no message type. A handler's filter is a kind read from the records: `'query'` (a Q record), `'result'` (R records), `'order'` (O records with no R), `'other'`, a list of these, `'any'`, or a function of the request.
- Handlers run in order of `priority` (lower first), then in the order added. A handler with a third argument runs the next one only when it calls `next()`.
- An `AstmRouter` holds a set of handlers to give to several links: `link.use(router)`.
- A query that a handler took but did not answer, failed on, or did not answer within `queryTimeout` (30 s) gets a header and an `L|1|I` record (no information available). The `defaultQueryAnswer` option replaces that answer.
- A handler that fails is reported through the `error` event. ASTM has no application acknowledgment, so nothing goes back to the instrument.

### Instruments that differ from the standard

Every timer and limit of the standard is an option, with the standard's value as the default: `replyTimeout`, `frameTimeout`, `contentionDelay`, `busyDelay`, `maxRetries`, `maxEstablishAttempts`, `maxFrameLength`. These options are for instruments that do not follow it:

| Option | What it is for |
| --- | --- |
| `ackDelay` | A pause before each ACK or NAK, for instruments that miss a reply sent too soon |
| `frameDelay` | A pause between frames |
| `messageDelay` | A pause between one message's EOT and the next ENQ |
| `checksum: 'lenient'` | Takes frames with a wrong checksum, reporting each as a `warning` |
| `receiverInterrupt` | `'ignore'` (default) or `'stop'`: what an EOT received instead of an ACK does |
| `framing: 'none'` | Instruments that send bare records with no ENQ, frames or ACK. A message ends at its L record, or after `messageEndTimeout` (2 s) of silence |
| `idleTimeout` | Emits `idle` after a period with no traffic; close the connection there to drop a silent one |

The `send`, `receive`, `token`, `state` and `warning` events report each step with its raw bytes, for finding out what an instrument in the field does.

### An instrument simulator

`MemoryConnection.pair()` gives two connected ends. With a link in the instrument role on one end, `query()` sends a query and resolves with the answer, which tests an LIS without an instrument:

```typescript
import { AstmLink, MemoryConnection } from '@astm-e1394/core';

const [lisEnd, instrumentEnd] = MemoryConnection.pair();
const lis = new AstmLink(lisEnd);
lis.use('query', (req, res) => {
  res.message = ordersFor(req.message);
});
const instrument = new AstmLink(instrumentEnd, { role: 'instrument' });
await lis.open();
await instrument.open();

const answer = await instrument.query('H|\\^&\rQ|1|^SPEC001||ALL\rL|1|N');
```

The design and its reasons are in [docs/decisions/net-package.md](https://github.com/panates/astm-e1394/blob/dev/docs/decisions/net-package.md).

## License

[MIT](https://github.com/panates/astm-e1394/blob/main/LICENSE)
