import { once } from 'node:events';
import { AstmLink, type AstmMessage } from '@astm-e1394/core';
import { expect } from 'expect';
import { SerialPortMock } from 'serialport';
import {
  SerialConnection,
  type SerialConnectionOptions,
  type SerialPortLike,
} from '../src/index.js';

const PATH = '/dev/ANALYZER';

/** A SerialConnection over the mock binding of the serialport package */
class MockSerialConnection extends SerialConnection {
  ports: SerialPortMock[] = [];

  protected _createPort(): SerialPortLike {
    const o = this.options;
    const port = new SerialPortMock({
      path: o.path,
      baudRate: o.baudRate ?? 9600,
      autoOpen: false,
    });
    this.ports.push(port);
    return port;
  }

  get port(): SerialPortMock {
    return this.ports[this.ports.length - 1];
  }
}

const connection = (options?: Partial<SerialConnectionOptions>) =>
  new MockSerialConnection({ path: PATH, ...options });

const until = async (fn: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('Timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

describe('SerialConnection', () => {
  let conn: MockSerialConnection | undefined;
  beforeEach(() => {
    SerialPortMock.binding.reset();
    SerialPortMock.binding.createPort(PATH, { record: true });
  });
  afterEach(async () => {
    await conn?.close();
    conn = undefined;
  });

  it('opens, writes and receives', async () => {
    conn = connection();
    expect(conn.description).toBe(`serial:${PATH}`);
    const opened = once(conn, 'open');
    await conn.open();
    await opened;
    expect(conn.isOpen).toBe(true);

    await conn.write(Buffer.from([0x05]));
    expect([...conn.port.port!.recording]).toEqual([0x05]);

    const data = once(conn, 'data');
    conn.port.port!.emitData(Buffer.from([0x06]));
    expect([...(await data)[0]]).toEqual([0x06]);

    const closed = once(conn, 'close');
    await conn.close();
    await closed;
    expect(conn.isOpen).toBe(false);
  });

  it('opens once when called twice', async () => {
    conn = connection();
    await Promise.all([conn.open(), conn.open()]);
    await conn.open();
    expect(conn.ports.length).toBe(1);
  });

  it('opens the port with the settings given', () => {
    const port = new SerialConnection({
      path: PATH,
      baudRate: 19200,
      dataBits: 7,
      parity: 'even',
      stopBits: 2,
      rtscts: true,
      xonxoff: true,
    })['_createPort']() as any;
    expect(port.settings).toMatchObject({
      path: PATH,
      baudRate: 19200,
      dataBits: 7,
      parity: 'even',
      stopBits: 2,
      rtscts: true,
      xon: true,
      xoff: true,
      autoOpen: false,
    });
  });

  it('opens again when the port closes on its own', async () => {
    conn = connection({ reconnectDelay: 20 });
    await conn.open();
    const closed = once(conn, 'close');
    const reopened = once(conn, 'open');
    /* The adapter is unplugged */
    conn.port._disconnected(new Error('disconnected'));
    await closed;
    await reopened;
    expect(conn.isOpen).toBe(true);
    expect(conn.ports.length).toBe(2);
  });

  it('does not open again when reconnectDelay is 0', async () => {
    conn = connection({ reconnectDelay: 0 });
    await conn.open();
    const closed = once(conn, 'close');
    conn.port._disconnected(new Error('disconnected'));
    await closed;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(conn.isOpen).toBe(false);
    expect(conn.ports.length).toBe(1);
  });

  it('rejects open() when the port is missing, and keeps trying', async () => {
    SerialPortMock.binding.reset();
    conn = connection({ reconnectDelay: 20 });
    const errors: Error[] = [];
    conn.on('error', e => errors.push(e));
    await expect(conn.open()).rejects.toThrow();
    await until(() => errors.length > 0);
    /* The adapter is plugged in */
    SerialPortMock.binding.createPort(PATH);
    await once(conn, 'open');
    expect(conn.isOpen).toBe(true);
  });

  it('stops trying after close()', async () => {
    SerialPortMock.binding.reset();
    conn = connection({ reconnectDelay: 20 });
    await expect(conn.open()).rejects.toThrow();
    await conn.close();
    const tried = conn.ports.length;
    SerialPortMock.binding.createPort(PATH);
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(conn.ports.length).toBe(tried);
    expect(conn.isOpen).toBe(false);
  });

  it('refuses to write while closed', async () => {
    conn = connection();
    await expect(conn.write(Buffer.from('x'))).rejects.toThrow(/not open/);
  });

  it('carries a link: a bare message from the instrument arrives whole', async () => {
    conn = connection();
    const link = new AstmLink(conn, { framing: 'none' });
    const got = once(link, 'message') as Promise<[AstmMessage]>;
    await link.open();
    conn.port.port!.emitData(
      'H|\\^&\rP|1||PAT001\rO|1|S1||^^^GLU\rR|1|^^^GLU|5.4\rL|1|N\r',
    );
    const [message] = await got;
    expect(message.get('R-4')).toBe('5.4');
  });
});
