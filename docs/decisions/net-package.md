# Instrument communication

Status: accepted

ASTM E1394 messages travel between instruments and the LIS over TCP and serial ports, using the low-level protocol of ASTM E1381 / CLSI LIS1-A. The work has two parts:

- **Connections** carry bytes, and only bytes. Each way of reaching an instrument is a class that implements the `AstmConnection` interface: `TcpClientConnection`, `SerialConnection` and the others below.
- **`AstmLink`** speaks the protocol over any connection: the E1381 state machine, frames, timers and retries, messages, and the handlers. It is written and tested once, and it does not know which connection it has.

The parts are split across packages by what they depend on. All of them are in the `core` group and release together:

| Package | Holds | Depends on |
| --- | --- | --- |
| `@astm-e1394/core` | the message model, `AstmConnection`, `AstmLink`, the frame codec, `MemoryConnection`, the handlers and the router | `dictionary`, `iconv-lite` |
| `@astm-e1394/net` | `TcpClientConnection`, `TcpSocketConnection`, `TcpServer` | `core`, `node:net` |
| `@astm-e1394/serial` | `SerialConnection` | `core`, `serialport` |

The protocol has no outside dependency, so it is in core with the messages it carries. A way of connecting that needs a Node.js module or a package is a package of its own, and an application installs only the ones it uses.

```
 core     AstmLink    handlers, queries          application
                      records <-> AstmMessage    message
                      ENQ/ACK/NAK/EOT, frames    link (E1381)
 ──────────────────── AstmConnection ──────────────────────────
 core     MemoryConnection
 net      TcpClientConnection | TcpSocketConnection | TcpServer
 serial   SerialConnection
 yours    any class that implements AstmConnection
```

An instrument's settings, such as delays and framing, are options of the link, not of the connection. Moving an instrument from a COM port to TCP changes only its connection class.

## Connections

```typescript
/** A byte stream to an instrument */
interface AstmConnection extends EventEmitter {
  readonly isOpen: boolean;
  /** For logs: "tcp://10.0.0.5:5000", "serial:COM3" */
  readonly description: string;
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: Buffer): Promise<void>;
  // events: 'open', 'data' (Buffer), 'close', 'error'
}
```

- **`TcpClientConnection`** (`@astm-e1394/net`): connects to an instrument, and reconnects after a delay when the connection drops (`reconnectDelay`, 0 to turn reconnecting off). A serial-to-TCP converter (Moxa and the like) is reached this way too.
- **`SerialConnection`** (`@astm-e1394/serial`): uses the `serialport` package, a dependency of that package only. Options: `path`, `baudRate`, `dataBits`, `parity`, `stopBits`, flow control.
- **`TcpSocketConnection`** (`@astm-e1394/net`): one socket that a `TcpServer` accepted. It is open when it is made, and does not reconnect.
- **`MemoryConnection`** (`@astm-e1394/core`): `MemoryConnection.pair()` gives two connected ends, for tests and for an instrument simulator in the same process.
- **Your own:** any class that implements the interface, such as a USB driver or a gateway, works with `AstmLink` unchanged.

### The TCP server

A server is not one connection: it makes them. `TcpServer` listens, and gives each socket it accepts as a `TcpSocketConnection`. An `AstmLink` is made for each, from options and handlers given once:

```typescript
const server = new TcpServer({ link: { role: 'host', ackDelay: 50 } });
server.use('result', storeResults); // shared by every connection's link
server.on('link', (link: AstmLink) => log(link.connection.description));
await server.listen(5000);
```

## Link layer (E1381)

This layer runs one state machine per connection: neutral, establishment, transfer and termination, as the standard defines them.

- **Establishment:** the sender sends ENQ. The receiver answers ACK (ready), NAK (busy: the sender retries after 10 s) or ENQ (contention).
- **Contention:** when both sides send ENQ, the instrument wins. The side with `role: 'host'` (our default, as the LIS) waits at least 20 s before it tries again. An instrument waits at least 1 s. A simulator takes the instrument role.
- **Frames:** `STX FN text ETB|ETX C1 C2 CR LF`. The frame number counts 1-7, then 0. The text holds at most 240 characters. A record longer than that is split into intermediate frames that end with ETB, and its last frame ends with ETX. Each record starts a new frame. The checksum is the sum of the bytes from FN through ETB or ETX, modulo 256, as two uppercase hex digits.
- **Replies:** ACK moves to the next frame. NAK, or a bad checksum or frame number, means the frame is sent again, up to 6 times; then the sender ends the transfer with EOT. An EOT received instead of an ACK is a receiver interrupt: the sender finishes the current frame and stops.
- **Termination:** EOT returns the link to neutral.

Every timer and limit is an option. The defaults are the standard's values:

| Option | Default | What it is |
| --- | --- | --- |
| `replyTimeout` | 15 s | sender waiting for ACK/NAK after ENQ or a frame |
| `frameTimeout` | 30 s | receiver waiting for the next frame, or EOT |
| `contentionDelay` | 20 s host, 1 s instrument | wait after contention before a new ENQ |
| `busyDelay` | 10 s | wait after a NAK to ENQ |
| `maxRetries` | 6 | sends of one frame before the transfer is ended |
| `maxFrameLength` | 240 | characters of text in a frame |

Instruments differ from the standard often enough that these options are part of the design too:

- `ackDelay`: a pause before each ACK, for instruments that miss a reply sent too soon.
- `frameDelay`: a pause between frames.
- `messageDelay`: a pause between one transfer's EOT and the next ENQ.
- `idleTimeout`: closes or flags a connection with no traffic.
- `framing`: `'e1381'` (the default), or `'none'` for instruments that send bare records over TCP with no ENQ, frames or ACK. In `'none'` mode a message ends at its L record, or after `messageEndTimeout` of silence.
- `checksum: 'strict' | 'lenient'`: lenient accepts a frame whose checksum is wrong, logs it and ACKs it, for an instrument known to compute it wrongly.

The link reports what it does through events (`state`, `frame`, `send`, `receive`), with the raw bytes. These events are how a problem with an instrument in the field gets diagnosed.

## Message layer

- **Receiving:** the frames of a transfer are put back together into records, and the records are parsed into an `AstmMessage` (core). One transfer usually holds one message, from H to L. A transfer that holds several messages is split with `AstmMessage.parseAll()`.
- **Sending:** `send(message)` queues the message. Each message is one transfer (ENQ to EOT). The returned promise resolves after the EOT is sent, and rejects when establishment fails, retries run out, or the receiver interrupts.
- **Encoding:** text is decoded and encoded in the link's `encoding` option (for example `windows-1254`) and given to `AstmMessage`.

## Application layer

```typescript
import { AstmLink } from '@astm-e1394/core';
import { SerialConnection } from '@astm-e1394/serial';

const link = new AstmLink(
  new SerialConnection({ path: 'COM3', baudRate: 9600 }),
  { role: 'host', ackDelay: 50 },
);

// One-way instruments: results arrive; the link layer has already ACKed them.
link.use('result', async req => {
  await store(req.message);
});

// Instruments that query: a Q record arrives, the answer goes out as a new transfer.
link.use('query', async (req, res) => {
  res.message = await ordersFor(req.message.get('Q-3-2'));
});

await link.open();
```

- The same handlers serve an instrument over any connection. A handler set can also be made once as an `AstmRouter` and given to several links, or to a `TcpServer`.
- ASTM has no message type, so a filter is a message kind read from the records: `'query'` (a Q record), `'result'` (R records), `'order'` (O records with no R), `'other'`, a list of kinds, `'any'`, or a function of the request. Handlers run in order, as in hl7v2's router: `use(filter, handler, priority?)`, lower priorities first, then in the order added.
- A handler with two arguments runs, and the next one after it. A handler with three runs the next only when it calls `next()` before its promise settles; `next(error)` fails the request.
- A router added to another, or to a link, is read at each message, so handlers added to it later serve the links it was given to.
- ASTM has no application acknowledgment. When a handler fails, the link has already ACKed the frames, so the failure is reported through an `error` event and nothing goes back to the instrument.
- **Answers:** a message a handler sets in `res.message` is sent back as a new transfer, as soon as the link is neutral, whatever kind of message it answers.
- **Queries:** instruments wait for the answer only for their own time limit, so `queryTimeout` (default 30 s) bounds the handlers. When a handler took the query but set no answer, failed, or ran out of time, the default answer goes out: a header and an L record with termination code `I` (no information available). The `defaultQueryAnswer` option replaces it. A query that no handler takes gets no answer, so that an application answering from the `message` event is not answered over.
- **Sending orders unasked:** for instruments that take orders without a query, `link.send(message)` sends one.
- **Instrument role:** `role: 'instrument'` and `link.query(message)` send a Q message and resolve with the next message received, the answer. It fails after `queryTimeout`, or when the connection closes. Over a `MemoryConnection` pair, this makes an instrument simulator for tests and for trying out an LIS.

## Testing

- `AstmLink` is tested over a `MemoryConnection` pair, with fake timers (`@sinonjs/fake-timers`) for the timeouts.
- Recorded byte streams from real instruments, made up of test data only, become fixtures.
- Each connection class gets thin tests of its own: open, write, data, close, reconnect. Serial runs against a virtual port pair where the system has one, and is skipped where it does not.

## Open questions

1. Which instruments come first? Their interface manuals decide the defaults worth changing: framing over TCP, delays, encoding.
2. ~~Is `serialport` as an optional peer dependency acceptable?~~ Settled: `SerialConnection` is in its own package, `@astm-e1394/serial`, with `serialport` as a dependency.
3. What is the default answer to a query with no orders: an L record with `I`, or P and O records with report type `Y` or `Z`?
4. Should several messages in one transfer be sent as one? It is rare; the proposal sends one message per transfer.
