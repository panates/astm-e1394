import { expect } from 'expect';
import {
  AstmLink,
  type AstmLinkError,
  AstmLinkErrorCode,
  type AstmLinkOptions,
  AstmMessage,
  type AstmRequest,
  type AstmResponse,
  AstmRouter,
  MemoryConnection,
  messageKind,
} from '../src/index.js';
import { type Clock, installClock } from './link-support.js';

const HEADER = 'H|\\^&|||ANALYZER|||||||P|LIS2-A2|20250102103000';
const RESULT = [
  HEADER,
  'P|1||PAT001',
  'O|1|SPEC001||^^^GLU|R',
  'R|1|^^^GLU|5.4|mmol/L||N||F',
  'L|1|N',
].join('\r');
const ORDER = [HEADER, 'P|1||PAT001', 'O|1|SPEC001||^^^GLU|R', 'L|1|N'].join(
  '\r',
);
const QUERY = [HEADER, 'Q|1|^SPEC001||ALL', 'L|1|N'].join('\r');
const OTHER = [HEADER, 'P|1||PAT001', 'L|1|N'].join('\r');

const request = (text: string): AstmRequest => {
  const message = AstmMessage.parse(text);
  return {
    message,
    kind: messageKind(message),
    link: { connection: new MemoryConnection(), send: async () => undefined },
  };
};

describe('AstmRouter', () => {
  it('tells the kind of a message from its records', () => {
    expect(messageKind(AstmMessage.parse(QUERY))).toBe('query');
    expect(messageKind(AstmMessage.parse(RESULT))).toBe('result');
    expect(messageKind(AstmMessage.parse(ORDER))).toBe('order');
    expect(messageKind(AstmMessage.parse(OTHER))).toBe('other');
  });

  it('runs handlers by priority, then in the order added', async () => {
    const router = new AstmRouter();
    const ran: string[] = [];
    router.use(() => void ran.push('a'));
    router.use(() => void ran.push('late'), 5);
    router.use(() => void ran.push('early'), -1);
    router.use(async () => {
      await Promise.resolve();
      ran.push('b');
    });
    expect(await router.handle(request(RESULT), {})).toBe(true);
    expect(ran).toEqual(['early', 'a', 'b', 'late']);
  });

  it('runs only the handlers whose filter matches', async () => {
    const router = new AstmRouter();
    const ran: string[] = [];
    router.use('query', () => void ran.push('query'));
    router.use('result', () => void ran.push('result'));
    router.use(['order', 'result'], () => void ran.push('order|result'));
    router.use('any', () => void ran.push('any'));
    router.use(
      req => req.message.get('P-4') === 'PAT001',
      () => void ran.push('fn'),
    );
    await router.handle(request(RESULT), {});
    expect(ran).toEqual(['result', 'order|result', 'any', 'fn']);
    ran.length = 0;
    await router.handle(request(QUERY), {});
    expect(ran).toEqual(['query', 'any']);
  });

  it('says whether any handler ran', async () => {
    const router = new AstmRouter();
    expect(router.isEmpty).toBe(true);
    router.use('query', () => undefined);
    expect(router.isEmpty).toBe(false);
    expect(await router.handle(request(RESULT), {})).toBe(false);
    expect(await router.handle(request(QUERY), {})).toBe(true);
  });

  it('lays out routers added to it, with their filters', async () => {
    const inner = new AstmRouter();
    const ran: string[] = [];
    inner.use(() => void ran.push('inner'));
    inner.use('order', () => void ran.push('inner order'));
    const router = new AstmRouter();
    router.use(() => void ran.push('outer'));
    router.use('result', inner);
    await router.handle(request(RESULT), {});
    expect(ran).toEqual(['outer', 'inner']);
    ran.length = 0;
    await router.handle(request(ORDER), {});
    expect(ran).toEqual(['outer']);
    /* A handler added to the inner router later is seen */
    inner.use(() => void ran.push('added'));
    ran.length = 0;
    await router.handle(request(RESULT), {});
    expect(ran).toEqual(['outer', 'inner', 'added']);
  });

  it('goes on after a three-argument handler only when it calls next()', async () => {
    const router = new AstmRouter();
    const ran: string[] = [];
    router.use(async (_req, _res, next) => {
      ran.push('calls next');
      await new Promise(resolve => setImmediate(resolve));
      next();
    });
    /* Three arguments, and next() never called */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    router.use(async (_req: AstmRequest, _res: AstmResponse, _next: any) => {
      ran.push('stops');
    });
    router.use(() => void ran.push('never'));
    await router.handle(request(RESULT), {});
    expect(ran).toEqual(['calls next', 'stops']);
  });

  it('rejects with what a handler throws or passes to next()', async () => {
    const thrown = new AstmRouter().use(() => {
      throw new Error('thrown');
    });
    await expect(thrown.handle(request(RESULT), {})).rejects.toThrow('thrown');
    const passed = new AstmRouter().use((_req, _res, next) =>
      next(new Error('passed')),
    );
    await expect(passed.handle(request(RESULT), {})).rejects.toThrow('passed');
  });

  it('refuses an unknown kind and a handler that is not one', () => {
    const router = new AstmRouter();
    expect(() => router.use('results' as any, () => undefined)).toThrow(
      /Unknown message kind/,
    );
    expect(() => router.use({} as any)).toThrow(TypeError);
  });
});

describe('AstmLink handlers', () => {
  let clock: Clock;
  beforeEach(() => {
    clock = installClock();
  });
  afterEach(() => clock.uninstall());

  async function pair(hostOptions?: AstmLinkOptions) {
    const [a, b] = MemoryConnection.pair();
    const host = new AstmLink(a, hostOptions);
    const instrument = new AstmLink(b, { role: 'instrument' });
    await host.open();
    await instrument.open();
    return { host, instrument };
  }

  it('gives received messages to the handlers that match', async () => {
    const { host, instrument } = await pair();
    const results: AstmRequest[] = [];
    host.use('result', req => void results.push(req));
    host.use('query', () => {
      throw new Error('not a query');
    });
    const sent = instrument.send(RESULT);
    await clock.tickAsync(100);
    await sent;
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe('result');
    expect(results[0].link).toBe(host);
    expect(results[0].message.get('R-4')).toBe('5.4');
  });

  it('answers a query with the message a handler sets', async () => {
    const { host, instrument } = await pair();
    host.use('query', async (req, res) => {
      expect(req.message.get('Q-3-2')).toBe('SPEC001');
      res.message = ORDER;
    });
    const answer = instrument.query(QUERY);
    await clock.tickAsync(100);
    expect(messageKind(await answer)).toBe('order');
    expect(host.state).toBe('idle');
  });

  it('sends the default answer when the handlers set none', async () => {
    const { host, instrument } = await pair();
    host.use('query', () => undefined);
    const answer = instrument.query(QUERY);
    await clock.tickAsync(100);
    const message = await answer;
    expect(message.records.map(r => r.recordType)).toEqual(['H', 'L']);
    expect(message.get('L-3')).toBe('I');
  });

  it('sends the default answer when a handler fails, and reports the error', async () => {
    const { host, instrument } = await pair();
    const errors: Error[] = [];
    host.on('error', e => errors.push(e));
    host.use('query', () => {
      throw new Error('database down');
    });
    const answer = instrument.query(QUERY);
    await clock.tickAsync(100);
    expect((await answer).get('L-3')).toBe('I');
    expect(errors.map(e => e.message)).toEqual(['database down']);
  });

  it('sends the default answer when the handlers take longer than queryTimeout', async () => {
    const { host, instrument } = await pair({ queryTimeout: 1000 });
    const warnings: AstmLinkError[] = [];
    host.on('warning', w => warnings.push(w));
    host.use('query', async (_req, res) => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      res.message = ORDER;
    });
    const got: AstmMessage[] = [];
    instrument.on('message', m => got.push(m));
    const answer = instrument.query(QUERY);
    await clock.tickAsync(1500);
    expect((await answer).get('L-3')).toBe('I');
    expect(warnings.map(w => w.code)).toEqual([AstmLinkErrorCode.QueryTimeout]);
    /* The late answer is dropped */
    await clock.tickAsync(5000);
    expect(got.length).toBe(1);
  });

  it('sends the answer defaultQueryAnswer gives', async () => {
    const { host, instrument } = await pair({
      defaultQueryAnswer: req =>
        [HEADER, `P|1||${req.message.get('Q-3-2')}`, 'L|1|N'].join('\r'),
    });
    host.use('query', () => undefined);
    const answer = instrument.query(QUERY);
    await clock.tickAsync(100);
    expect((await answer).get('P-4')).toBe('SPEC001');
  });

  it('sends what a handler sets for a message that is not a query', async () => {
    const { host, instrument } = await pair();
    host.use('result', (_req, res) => {
      res.message = OTHER;
    });
    const got: AstmMessage[] = [];
    instrument.on('message', m => got.push(m));
    const sent = instrument.send(RESULT);
    await clock.tickAsync(100);
    await sent;
    expect(got.length).toBe(1);
    expect(got[0].get('P-4')).toBe('PAT001');
  });

  it('leaves a query unanswered when no handler takes it', async () => {
    const { host, instrument } = await pair();
    host.use('result', () => undefined);
    const answer = instrument.query(QUERY, { timeout: 2000 });
    const failed = expect(answer).rejects.toMatchObject({
      code: AstmLinkErrorCode.QueryTimeout,
    });
    await clock.tickAsync(2500);
    await failed;
  });

  it('fails a query waiting for its answer when the connection closes', async () => {
    const { host, instrument } = await pair();
    host.use('query', async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));
    });
    const answer = instrument.query(QUERY);
    const failed = expect(answer).rejects.toMatchObject({
      code: AstmLinkErrorCode.Closed,
    });
    await clock.tickAsync(100);
    await instrument.close();
    await failed;
  });

  it('shares a router between links', async () => {
    const router = new AstmRouter();
    const seen: AstmLink[] = [];
    router.use('result', req => void seen.push(req.link as AstmLink));
    const one = await pair();
    const two = await pair();
    one.host.use(router);
    two.host.use(router);
    const sent = [one.instrument.send(RESULT), two.instrument.send(RESULT)];
    await clock.tickAsync(100);
    await Promise.all(sent);
    expect(seen).toEqual([one.host, two.host]);
  });
});
