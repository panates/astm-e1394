import { expect } from 'expect';
import { AstmLink, type AstmMessage, MemoryConnection } from '../src/index.js';
import {
  type Clock,
  flush,
  installClock,
  linkWithPeer,
} from './link-support.js';

const RESULT = [
  'H|\\^&|||ANALYZER|||||||P|LIS2-A2|20250102103000',
  'P|1||PAT001',
  'O|1|SPEC001||^^^GLU|R',
  'R|1|^^^GLU|5.4|mmol/L||N||F',
  'L|1|N',
];
const QUERY = ['H|\\^&', 'Q|1|^SPEC001||ALL', 'L|1|N'];

describe("framing 'none'", () => {
  let clock: Clock;
  beforeEach(() => {
    clock = installClock();
  });
  afterEach(() => clock.uninstall());

  async function bareLink(options?: { messageEndTimeout?: number }) {
    const { link, peer } = await linkWithPeer({ framing: 'none', ...options });
    const got: AstmMessage[] = [];
    link.on('message', m => got.push(m));
    return { link, peer, got };
  }

  it('takes a message at its L record, with no handshake', async () => {
    const { link, peer, got } = await bareLink();
    await peer.write(RESULT.join('\r') + '\r');
    await flush(clock);
    expect(got.length).toBe(1);
    expect(got[0].get('R-4')).toBe('5.4');
    /* Nothing goes back: no ACK */
    expect(peer.take()).toBe('');
    expect(link.state).toBe('idle');
  });

  it('takes records arriving in pieces, ended by CR LF', async () => {
    const { peer, got } = await bareLink();
    const text = RESULT.join('\r\n') + '\r\n';
    for (let i = 0; i < text.length; i += 7) {
      await peer.write(text.slice(i, i + 7));
      await flush(clock);
    }
    expect(got.length).toBe(1);
    expect(got[0].records.length).toBe(5);
  });

  it('cuts messages that arrive together at their L records', async () => {
    const { peer, got } = await bareLink();
    const one = RESULT.join('\r') + '\r';
    /* Two whole messages and the start of a third */
    await peer.write(one + one + RESULT.slice(0, 2).join('\r') + '\r');
    await flush(clock);
    expect(got.length).toBe(2);
    await peer.write(RESULT.slice(2).join('\r') + '\r');
    await flush(clock);
    expect(got.length).toBe(3);
    expect(got[2].get('P-4')).toBe('PAT001');
  });

  it('ends a message with no L record after messageEndTimeout', async () => {
    const { peer, got } = await bareLink({ messageEndTimeout: 500 });
    await peer.write(RESULT.slice(0, 4).join('\r') + '\r');
    await clock.tickAsync(400);
    expect(got.length).toBe(0);
    /* More data starts the wait again */
    await peer.write('C|1|I|checked|G\r');
    await clock.tickAsync(400);
    expect(got.length).toBe(0);
    await clock.tickAsync(100);
    expect(got.length).toBe(1);
    expect(got[0].getRecords('C').length).toBe(1);
  });

  it('does not take a record that only starts with L as a terminator', async () => {
    const { peer, got } = await bareLink({ messageEndTimeout: 500 });
    await peer.write(RESULT.slice(0, 4).join('\r') + '\rLX|1\r');
    await flush(clock);
    expect(got.length).toBe(0);
  });

  it('drops E1381 control characters', async () => {
    const { peer, got } = await bareLink();
    await peer.write('\x05\x02' + RESULT.join('\r') + '\r\x03\x04');
    await flush(clock);
    expect(got.length).toBe(1);
    expect(got[0].records.length).toBe(5);
  });

  it('takes what it has when the connection closes', async () => {
    const { link, peer, got } = await bareLink();
    await peer.write(RESULT.slice(0, 3).join('\r') + '\r');
    await flush(clock);
    await link.close();
    expect(got.length).toBe(1);
    expect(got[0].getRecords('O').length).toBe(1);
  });

  it('sends the records as they are, one message after another', async () => {
    const { link, peer } = await linkWithPeer({
      framing: 'none',
      messageDelay: 1000,
    });
    const first = link.send(RESULT.join('\r'));
    const second = link.send(QUERY.join('\r'));
    await flush(clock);
    await first;
    expect(peer.take()).toBe(RESULT.join('\r') + '\r');
    await clock.tickAsync(999);
    expect(peer.take()).toBe('');
    await clock.tickAsync(1);
    await second;
    expect(peer.take()).toBe(QUERY.join('\r') + '\r');
    expect(link.state).toBe('idle');
  });

  it('answers a query between two bare links', async () => {
    const [a, b] = MemoryConnection.pair();
    const host = new AstmLink(a, { framing: 'none' });
    const instrument = new AstmLink(b, {
      framing: 'none',
      role: 'instrument',
    });
    host.use('query', (_req, res) => {
      res.message = RESULT.join('\r');
    });
    await host.open();
    await instrument.open();
    const answer = instrument.query(QUERY.join('\r'));
    await clock.tickAsync(10);
    expect((await answer).get('R-4')).toBe('5.4');
  });
});

describe('idleTimeout', () => {
  let clock: Clock;
  beforeEach(() => {
    clock = installClock();
  });
  afterEach(() => clock.uninstall());

  it('emits idle after a period with no traffic, and again after each', async () => {
    const { link, peer } = await linkWithPeer({ idleTimeout: 1000 });
    let idle = 0;
    link.on('idle', () => idle++);
    await clock.tickAsync(999);
    expect(idle).toBe(0);
    await clock.tickAsync(1);
    expect(idle).toBe(1);
    await clock.tickAsync(1000);
    expect(idle).toBe(2);
    /* Traffic starts the period again */
    await clock.tickAsync(500);
    await peer.write('\x04');
    await clock.tickAsync(900);
    expect(idle).toBe(2);
    await clock.tickAsync(100);
    expect(idle).toBe(3);
  });

  it('counts what the link sends as traffic', async () => {
    const { link } = await linkWithPeer({ idleTimeout: 1000 });
    let idle = 0;
    link.on('idle', () => idle++);
    await clock.tickAsync(600);
    void link.send(RESULT.join('\r')).catch(() => undefined);
    await clock.tickAsync(600);
    expect(idle).toBe(0);
    await link.close();
  });

  it('stops when the connection closes, and lets a handler close it', async () => {
    const { link } = await linkWithPeer({ idleTimeout: 1000 });
    let idle = 0;
    link.on('idle', () => {
      idle++;
      void link.close();
    });
    await clock.tickAsync(5000);
    expect(idle).toBe(1);
    expect(link.state).toBe('closed');
  });

  it('is off by default', async () => {
    const { link } = await linkWithPeer();
    let idle = 0;
    link.on('idle', () => idle++);
    await clock.tickAsync(600_000);
    expect(idle).toBe(0);
  });
});
