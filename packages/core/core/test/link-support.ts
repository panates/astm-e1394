import FakeTimers from '@sinonjs/fake-timers';
import {
  AstmLink,
  type AstmLinkOptions,
  MemoryConnection,
} from '../src/index.js';

export const STX = '\x02';
export const ETX = '\x03';
export const EOT = '\x04';
export const ENQ = '\x05';
export const ACK = '\x06';
export const NAK = '\x15';
export const ETB = '\x17';

export type Clock = ReturnType<typeof FakeTimers.install>;

/** Fake setTimeout only: the connection's microtasks run as they do */
export function installClock(): Clock {
  return FakeTimers.install({ toFake: ['setTimeout', 'clearTimeout'] });
}

/** Lets microtasks and timers due now run */
export const flush = (clock: Clock) => clock.tickAsync(0);

/**
 * A link under test, and the other end of its connection driven by hand,
 * as a scripted instrument: `peer.sent` is what the link wrote
 */
export async function linkWithPeer(options?: AstmLinkOptions) {
  const [a, b] = MemoryConnection.pair();
  const link = new AstmLink(a, options);
  const received: Buffer[] = [];
  b.on('data', d => received.push(d));
  await b.open();
  await link.open();
  const peer = {
    conn: b,
    /** What the link wrote, as latin1 text, since the last take() */
    take(): string {
      const s = Buffer.concat(received).toString('latin1');
      received.length = 0;
      return s;
    },
    write(s: string | Buffer) {
      return b.write(typeof s === 'string' ? Buffer.from(s, 'latin1') : s);
    },
  };
  return { link, peer };
}
