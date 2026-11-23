import { once } from 'node:events';
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from 'node:net';
import { AstmLink, type AstmMessage } from '@astm-e1394/core';
import { expect } from 'expect';
import { TcpClientConnection, TcpServer } from '../src/index.js';

const RESULT = [
  'H|\\^&|||ANALYZER|||||||P|LIS2-A2|20250102103000',
  'P|1||PAT001||DOE^JOHN',
  'O|1|SPEC001||^^^GLU|R',
  'R|1|^^^GLU|5.4|mmol/L||N||F',
  'L|1|N',
].join('\r');

const HOST = '127.0.0.1';

/** A plain TCP server that keeps its sockets, as an instrument would */
async function rawServer(port = 0) {
  const sockets: Socket[] = [];
  const server: Server = createServer(s => sockets.push(s));
  server.listen(port, HOST);
  await once(server, 'listening');
  return {
    server,
    sockets,
    port: (server.address() as AddressInfo).port,
    async close() {
      sockets.forEach(s => s.destroy());
      await new Promise(resolve => server.close(resolve));
    },
  };
}

/** A port nothing listens on */
async function freePort(): Promise<number> {
  const raw = await rawServer();
  await raw.close();
  return raw.port;
}

const until = async (fn: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('Timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

describe('TcpClientConnection', () => {
  let conn: TcpClientConnection | undefined;
  afterEach(async () => {
    await conn?.close();
    conn = undefined;
  });

  it('connects, writes and receives', async () => {
    const raw = await rawServer();
    conn = new TcpClientConnection({ host: HOST, port: raw.port });
    expect(conn.description).toBe(`tcp://${HOST}:${raw.port}`);
    const opened = once(conn, 'open');
    await conn.open();
    await opened;
    expect(conn.isOpen).toBe(true);
    await until(() => raw.sockets.length === 1);

    const peer = raw.sockets[0];
    const received = once(peer, 'data');
    await conn.write(Buffer.from([0x05]));
    expect([...(await received)[0]]).toEqual([0x05]);

    const data = once(conn, 'data');
    peer.write(Buffer.from([0x06]));
    expect([...(await data)[0]]).toEqual([0x06]);

    const closed = once(conn, 'close');
    await conn.close();
    await closed;
    expect(conn.isOpen).toBe(false);
    await raw.close();
  });

  it('opens once when called twice', async () => {
    const raw = await rawServer();
    conn = new TcpClientConnection({ host: HOST, port: raw.port });
    await Promise.all([conn.open(), conn.open()]);
    await conn.open();
    await until(() => raw.sockets.length === 1);
    expect(raw.sockets.length).toBe(1);
    await raw.close();
  });

  it('reconnects when the connection drops', async () => {
    const raw = await rawServer();
    conn = new TcpClientConnection({
      host: HOST,
      port: raw.port,
      reconnectDelay: 20,
    });
    await conn.open();
    await until(() => raw.sockets.length === 1);
    const closed = once(conn, 'close');
    const reopened = once(conn, 'open');
    raw.sockets[0].destroy();
    await closed;
    await reopened;
    expect(conn.isOpen).toBe(true);
    await until(() => raw.sockets.length === 2);
    await raw.close();
  });

  it('does not reconnect when reconnectDelay is 0', async () => {
    const raw = await rawServer();
    conn = new TcpClientConnection({
      host: HOST,
      port: raw.port,
      reconnectDelay: 0,
    });
    await conn.open();
    await until(() => raw.sockets.length === 1);
    const closed = once(conn, 'close');
    raw.sockets[0].destroy();
    await closed;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(conn.isOpen).toBe(false);
    expect(raw.sockets.length).toBe(1);
    await raw.close();
  });

  it('rejects open() when nothing listens, and keeps trying', async () => {
    const port = await freePort();
    conn = new TcpClientConnection({ host: HOST, port, reconnectDelay: 20 });
    const errors: Error[] = [];
    conn.on('error', e => errors.push(e));
    await expect(conn.open()).rejects.toThrow();
    await until(() => errors.length > 0);

    const raw = await rawServer(port);
    await once(conn, 'open');
    expect(conn.isOpen).toBe(true);
    await raw.close();
  });

  it('stops trying after close()', async () => {
    const port = await freePort();
    conn = new TcpClientConnection({ host: HOST, port, reconnectDelay: 20 });
    await expect(conn.open()).rejects.toThrow();
    await conn.close();
    const raw = await rawServer(port);
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(raw.sockets.length).toBe(0);
    expect(conn.isOpen).toBe(false);
    await raw.close();
  });

  it('times out a connection attempt', async () => {
    /* A non-routable address: the SYN gets no answer */
    conn = new TcpClientConnection({
      host: '10.255.255.1',
      port: 5000,
      connectTimeout: 30,
      reconnectDelay: 0,
    });
    await expect(conn.open()).rejects.toThrow();
  });

  it('refuses to write while closed', async () => {
    conn = new TcpClientConnection({ host: HOST, port: 1 });
    await expect(conn.write(Buffer.from('x'))).rejects.toThrow(/not open/);
  });
});

describe('TcpServer', () => {
  let server: TcpServer;
  let client: AstmLink | undefined;
  beforeEach(async () => {
    server = new TcpServer({ link: { role: 'host' } });
    await server.listen(0, HOST);
  });
  afterEach(async () => {
    await client?.close();
    client = undefined;
    await server.close();
  });

  const connectInstrument = async () => {
    const conn = new TcpClientConnection({
      host: HOST,
      port: server.address()!.port,
      reconnectDelay: 0,
    });
    client = new AstmLink(conn, { role: 'instrument' });
    const accepted = once(server, 'link') as Promise<[AstmLink]>;
    await client.open();
    const [link] = await accepted;
    return { client, link };
  };

  it('makes a link for each connection and exchanges messages', async () => {
    expect(server.listening).toBe(true);
    const { client: instrument, link } = await connectInstrument();
    expect(server.links.size).toBe(1);
    expect(link.state).toBe('idle');
    expect(link.options.role).toBe('host');
    expect(link.connection.description).toMatch(/^tcp:\/\/127\.0\.0\.1:\d+$/);

    const received = once(link, 'message') as Promise<[AstmMessage]>;
    await instrument.send(RESULT);
    const [message] = await received;
    expect(message.get('R-4')).toBe('5.4');

    const back = once(instrument, 'message') as Promise<[AstmMessage]>;
    await link.send(RESULT);
    expect((await back)[0].get('P-4')).toBe('PAT001');
  });

  it('drops a link when its connection closes', async () => {
    const { client: instrument, link } = await connectInstrument();
    const closed = once(link, 'close');
    await instrument.close();
    await closed;
    expect(server.links.size).toBe(0);
  });

  it('closes its connections when it closes', async () => {
    const { client: instrument } = await connectInstrument();
    const closed = once(instrument, 'close');
    await server.close();
    await closed;
    expect(server.listening).toBe(false);
    expect(server.links.size).toBe(0);
  });

  it('rejects listen() on a port in use', async () => {
    const other = new TcpServer();
    await expect(other.listen(server.address()!.port, HOST)).rejects.toThrow();
    await other.close();
  });

  it('refuses connections beyond maxConnections', async () => {
    const limited = new TcpServer({ maxConnections: 1 });
    await limited.listen(0, HOST);
    const port = limited.address()!.port;
    const first = new TcpClientConnection({
      host: HOST,
      port,
      reconnectDelay: 0,
    });
    const second = new TcpClientConnection({
      host: HOST,
      port,
      reconnectDelay: 0,
    });
    await first.open();
    await until(() => limited.links.size === 1);
    const secondClosed = once(second, 'close');
    await second.open();
    await secondClosed;
    expect(limited.links.size).toBe(1);
    await first.close();
    await limited.close();
  });
});
