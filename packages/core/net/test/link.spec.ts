import { AstmMessage } from '@astm-e1394/core';
import { expect } from 'expect';
import {
  AstmLink,
  AstmLinkErrorCode,
  encodeFrame,
  MemoryConnection,
} from '../src/index.js';
import {
  ACK,
  type Clock,
  ENQ,
  EOT,
  flush,
  installClock,
  linkWithPeer,
  NAK,
} from './support.js';

const RESULT = [
  'H|\\^&|||ANALYZER|||||||P|LIS2-A2|20250102103000',
  'P|1||PAT001||DOE^JOHN',
  'O|1|SPEC001||^^^GLU|R',
  'R|1|^^^GLU|5.4|mmol/L||N||F',
  'L|1|N',
].join('\r');

const frame = (n: number, text: string, final = true) =>
  encodeFrame({ number: n, text: Buffer.from(text, 'latin1'), final }).toString(
    'latin1',
  );

describe('AstmLink', () => {
  let clock: Clock;
  beforeEach(() => {
    clock = installClock();
  });
  afterEach(() => clock.uninstall());

  describe('between two links', () => {
    it('sends a message and receives it whole', async () => {
      const [a, b] = MemoryConnection.pair();
      const host = new AstmLink(a);
      const instrument = new AstmLink(b, { role: 'instrument' });
      const got: AstmMessage[] = [];
      host.on('message', m => got.push(m));
      await host.open();
      await instrument.open();
      const sent = instrument.send(AstmMessage.parse(RESULT));
      await clock.runAllAsync();
      await sent;
      expect(got.length).toBe(1);
      expect(got[0].toAstmString()).toBe(RESULT + '\r');
      expect(host.state).toBe('idle');
      expect(instrument.state).toBe('idle');
    });

    it('sends long records in several frames, numbering past 7', async () => {
      const [a, b] = MemoryConnection.pair();
      const host = new AstmLink(a);
      const instrument = new AstmLink(b, {
        role: 'instrument',
        maxFrameLength: 20,
      });
      const numbers: number[] = [];
      host.on('token', t => t.type === 'frame' && numbers.push(t.frame.number));
      let got: AstmMessage | undefined;
      host.on('message', m => (got = m));
      await host.open();
      await instrument.open();
      const text = RESULT.replace('DOE^JOHN', 'D'.repeat(100) + '^JOHN');
      const sent = instrument.send(text);
      await clock.runAllAsync();
      await sent;
      expect(numbers.length).toBeGreaterThan(8);
      expect(numbers.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1]);
      expect(got!.get('P-6-1')).toBe('D'.repeat(100));
    });

    it('sends queued messages one transfer each, in order', async () => {
      const [a, b] = MemoryConnection.pair();
      const host = new AstmLink(a);
      const instrument = new AstmLink(b, { role: 'instrument' });
      const ids: string[] = [];
      host.on('message', m => ids.push(m.get('P-4')));
      await host.open();
      await instrument.open();
      const all = Promise.all(
        ['A', 'B', 'C'].map(id =>
          instrument.send(RESULT.replace('PAT001', id)),
        ),
      );
      await clock.runAllAsync();
      await all;
      expect(ids).toEqual(['A', 'B', 'C']);
    });

    it('lets the instrument win on contention', async () => {
      const [a, b] = MemoryConnection.pair();
      const host = new AstmLink(a);
      const instrument = new AstmLink(b, { role: 'instrument' });
      const order: string[] = [];
      host.on('message', m => order.push('host got ' + m.get('P-4')));
      instrument.on('message', m =>
        order.push('instrument got ' + m.get('P-4')),
      );
      await host.open();
      await instrument.open();
      const p1 = host.send(RESULT.replace('PAT001', 'FROM-HOST'));
      const p2 = instrument.send(RESULT.replace('PAT001', 'FROM-INSTRUMENT'));
      await clock.runAllAsync();
      await Promise.all([p1, p2]);
      expect(order).toEqual([
        'host got FROM-INSTRUMENT',
        'instrument got FROM-HOST',
      ]);
    });
  });

  describe('as sender', () => {
    it('sends a frame again after NAK', async () => {
      const { link, peer } = await linkWithPeer();
      const sent = link.send('H|\\^&\rL|1');
      await flush(clock);
      expect(peer.take()).toBe(ENQ);
      await peer.write(ACK);
      await flush(clock);
      const first = peer.take();
      expect(first).toBe(frame(1, 'H|\\^&\r'));
      await peer.write(NAK);
      await flush(clock);
      expect(peer.take()).toBe(first);
      await peer.write(ACK);
      await flush(clock);
      expect(peer.take()).toBe(frame(2, 'L|1\r'));
      await peer.write(ACK);
      await flush(clock);
      expect(peer.take()).toBe(EOT);
      await sent;
    });

    it('fails a message after too many NAKs', async () => {
      const { link, peer } = await linkWithPeer({ maxRetries: 2 });
      const sent = link.send('H|\\^&\rL|1');
      const failed = sent.catch(e => e);
      await flush(clock);
      await peer.write(ACK);
      await flush(clock);
      for (let i = 0; i < 3; i++) {
        await peer.write(NAK);
        await flush(clock);
      }
      const err = await failed;
      expect(err.code).toBe(AstmLinkErrorCode.TooManyRetries);
      expect(peer.take().endsWith(EOT)).toBe(true);
      expect(link.state).toBe('idle');
    });

    it('fails a message when a frame gets no reply in time', async () => {
      const { link, peer } = await linkWithPeer({ replyTimeout: 1000 });
      const failed = link.send('H|\\^&\rL|1').catch(e => e);
      await flush(clock);
      await peer.write(ACK);
      await clock.tickAsync(1000);
      expect((await failed).code).toBe(AstmLinkErrorCode.ReplyTimeout);
    });

    it('tries ENQ again while the receiver is busy, then gives up', async () => {
      const { link, peer } = await linkWithPeer({
        maxEstablishAttempts: 3,
        busyDelay: 500,
      });
      const failed = link.send('H|\\^&\rL|1').catch(e => e);
      for (let i = 0; i < 3; i++) {
        await clock.tickAsync(i ? 500 : 0);
        expect(peer.take()).toBe(ENQ);
        await peer.write(NAK);
        await flush(clock);
      }
      expect((await failed).code).toBe(AstmLinkErrorCode.NotAccepted);
    });

    it('takes the other side ENQ while it waits after contention', async () => {
      const { link, peer } = await linkWithPeer();
      const got: AstmMessage[] = [];
      link.on('message', m => got.push(m));
      const sent = link.send('H|\\^&\rL|1|N');
      await flush(clock);
      expect(peer.take()).toBe(ENQ);
      await peer.write(ENQ);
      await clock.tickAsync(1000);
      expect(link.state).toBe('idle');
      await peer.write(ENQ);
      await flush(clock);
      expect(peer.take()).toBe(ACK);
      await peer.write(frame(1, 'H|\\^&\r') + frame(2, 'L|1\r'));
      await peer.write(EOT);
      await flush(clock);
      expect(got.length).toBe(1);
      /* The line is neutral again: its own message goes at once */
      expect(peer.take()).toBe(ACK + ACK + ENQ);
      await peer.write(ACK);
      await flush(clock);
      await peer.write(ACK);
      await flush(clock);
      await peer.write(ACK);
      await flush(clock);
      await sent;
    });

    it('stops on a receiver interrupt when told to', async () => {
      const { link, peer } = await linkWithPeer({ receiverInterrupt: 'stop' });
      const failed = link.send('H|\\^&\rP|1\rL|1').catch(e => e);
      await flush(clock);
      await peer.write(ACK);
      await flush(clock);
      await peer.write(EOT);
      await flush(clock);
      expect((await failed).code).toBe(AstmLinkErrorCode.Interrupted);
    });

    it('fails the message being sent when the connection closes', async () => {
      const { link, peer } = await linkWithPeer();
      const failed = link.send('H|\\^&\rL|1').catch(e => e);
      await flush(clock);
      await peer.conn.peer!.close();
      expect((await failed).code).toBe(AstmLinkErrorCode.Closed);
      expect(link.state).toBe('closed');
    });
  });

  describe('as receiver', () => {
    it('answers NAK to a bad frame and takes it sent again', async () => {
      const { link, peer } = await linkWithPeer();
      const got: AstmMessage[] = [];
      const warnings: string[] = [];
      link.on('message', m => got.push(m));
      link.on('warning', w => warnings.push(w.message));
      await peer.write(ENQ);
      await flush(clock);
      expect(peer.take()).toBe(ACK);
      await peer.write('\x021H|\\^&\r\x0300\r\n');
      await flush(clock);
      expect(peer.take()).toBe(NAK);
      await peer.write(frame(1, 'H|\\^&\r'));
      await flush(clock);
      expect(peer.take()).toBe(ACK);
      await peer.write(frame(2, 'L|1\r'));
      await peer.write(EOT);
      await flush(clock);
      expect(got.length).toBe(1);
      expect(warnings[0]).toMatch(/checksum/);
    });

    it('takes a frame sent twice once', async () => {
      const { link, peer } = await linkWithPeer();
      const got: AstmMessage[] = [];
      link.on('message', m => got.push(m));
      await peer.write(ENQ);
      await peer.write(frame(1, 'H|\\^&\r'));
      await peer.write(frame(1, 'H|\\^&\r'));
      await peer.write(frame(2, 'P|1\r'));
      await peer.write(frame(3, 'L|1\r'));
      await peer.write(EOT);
      await flush(clock);
      expect(peer.take()).toBe(ACK.repeat(5));
      expect(got[0].records.map(r => r.recordType).join('')).toBe('HPL');
    });

    it('joins a record sent in several frames', async () => {
      const { link, peer } = await linkWithPeer();
      let got: AstmMessage | undefined;
      link.on('message', m => (got = m));
      await peer.write(ENQ);
      await peer.write(frame(1, 'H|\\^&\r'));
      await peer.write(frame(2, 'P|1||AB', false));
      await peer.write(frame(3, 'CD\r'));
      await peer.write(frame(4, 'L|1\r'));
      await peer.write(EOT);
      await flush(clock);
      expect(got!.get('P-4')).toBe('ABCD');
    });

    it('drops a transfer with no frame in time', async () => {
      const { link, peer } = await linkWithPeer({ frameTimeout: 1000 });
      const warnings: AstmLinkErrorCode[] = [];
      link.on('warning', w => warnings.push(w.code));
      await peer.write(ENQ);
      await peer.write(frame(1, 'H|\\^&\r'));
      await clock.tickAsync(1000);
      expect(warnings).toEqual([AstmLinkErrorCode.FrameTimeout]);
      expect(link.state).toBe('idle');
    });

    it('takes a bad checksum when lenient', async () => {
      const { link, peer } = await linkWithPeer({ checksum: 'lenient' });
      let got: AstmMessage | undefined;
      link.on('message', m => (got = m));
      await peer.write(ENQ);
      await peer.write('\x021H|\\^&\r\x0300\r\n');
      await peer.write(frame(2, 'L|1\r'));
      await peer.write(EOT);
      await flush(clock);
      expect(peer.take()).toBe(ACK.repeat(3));
      expect(got).toBeDefined();
    });

    it('waits ackDelay before each reply', async () => {
      const { peer } = await linkWithPeer({ ackDelay: 100 });
      await peer.write(ENQ);
      await flush(clock);
      expect(peer.take()).toBe('');
      await clock.tickAsync(100);
      expect(peer.take()).toBe(ACK);
    });

    it('reads text in the encoding given', async () => {
      const { link, peer } = await linkWithPeer({ encoding: 'windows-1254' });
      let got: AstmMessage | undefined;
      link.on('message', m => (got = m));
      await peer.write(ENQ);
      await peer.write(frame(1, 'H|\\^&\r'));
      await peer.write(
        encodeFrame({
          number: 2,
          text: Buffer.from([...Buffer.from('P|1||'), 0xde, 0x0d]),
          final: true,
        }),
      );
      await peer.write(frame(3, 'L|1\r'));
      await peer.write(EOT);
      await flush(clock);
      expect(got!.get('P-4')).toBe('Ş');
    });
  });
});
