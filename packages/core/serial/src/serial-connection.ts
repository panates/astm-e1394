import { EventEmitter } from 'node:events';
import type { AstmConnection, AstmConnectionEvents } from '@astm-e1394/core';
import { SerialPort } from 'serialport';

export interface SerialConnectionOptions {
  /** The port: "COM3", "/dev/ttyUSB0" */
  path: string;
  /** Default 9600, the speed most instruments start at */
  baudRate?: number;
  /** Default 8 */
  dataBits?: 5 | 6 | 7 | 8;
  /** Default 'none' */
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  /** Default 1 */
  stopBits?: 1 | 1.5 | 2;
  /** Hardware flow control (RTS/CTS). Default false. */
  rtscts?: boolean;
  /** Software flow control (XON/XOFF), both ways. Default false. */
  xonxoff?: boolean;
  /**
   * The wait in ms before opening the port again after it closes on its own
   * - a USB adapter unplugged - or an attempt fails; 0 turns this off.
   * Default 5 s.
   */
  reconnectDelay?: number;
}

/** What SerialConnection needs of a port: a SerialPort, or a mock in tests */
export interface SerialPortLike extends EventEmitter {
  readonly isOpen: boolean;
  /** True while an open is in progress, as SerialPort has it */
  readonly opening?: boolean;
  readonly path?: string;
  open(callback: (err: Error | null) => void): void;
  close(callback?: (err: Error | null) => void): void;
  write(data: Buffer): boolean;
  drain(callback: (err: Error | null) => void): void;
}

/**
 * A serial port to an instrument, through the serialport package.
 *
 * Given options, the connection makes the port and opens it. Given a port
 * made elsewhere - a SerialPort, open or not - it uses that port as it is:
 * open() opens it when it is closed, the port's own events are passed on,
 * and the connection never makes another port or opens it again on its
 * own.
 *
 * open() resolves once the port is open. When the first attempt fails it
 * rejects; with reopening on, the connection keeps trying in the background
 * and emits 'open' when it gets through. Failed attempts after the first
 * are emitted as 'error'. close() stops reopening.
 */
export class SerialConnection
  extends EventEmitter<AstmConnectionEvents>
  implements AstmConnection
{
  readonly options: Readonly<SerialConnectionOptions>;
  readonly description: string;
  protected _port?: SerialPortLike;
  /** Between open() and close(): the port is to be kept open */
  protected _wanted = false;
  protected _opening?: Promise<void>;
  protected _reconnectTimer?: NodeJS.Timeout;
  /** The port given to the constructor, used as it is */
  protected _given?: SerialPortLike;

  constructor(options: SerialConnectionOptions);
  constructor(port: SerialPortLike);
  constructor(arg: SerialConnectionOptions | SerialPortLike) {
    super();
    if (isPort(arg)) {
      this._given = arg;
      this.options = { path: arg.path || '', reconnectDelay: 0 };
      this.description = `serial:${arg.path || 'port'}`;
      this._attachGiven(arg);
      return;
    }
    this.options = { ...arg };
    this.description = `serial:${arg.path}`;
  }

  /** The port in use, while there is one; a given port always */
  get port(): SerialPortLike | undefined {
    return this._port;
  }

  get isOpen(): boolean {
    return !!this._port?.isOpen;
  }

  get reconnectDelay(): number {
    if (this._given) return 0;
    return this.options.reconnectDelay ?? 5000;
  }

  async open(): Promise<void> {
    this._wanted = true;
    if (this.isOpen) return;
    this._clearReconnect();
    try {
      await this._open();
    } catch (e) {
      this._scheduleReconnect();
      throw e;
    }
  }

  async close(): Promise<void> {
    this._wanted = false;
    this._clearReconnect();
    const opening = this._opening;
    if (opening) await opening.catch(() => undefined);
    const port = this._port;
    if (!port?.isOpen) return;
    await new Promise<void>(resolve => {
      port.once('close', () => resolve());
      port.close(err => err && resolve());
    });
  }

  /** Resolves once the bytes have gone out of the port */
  write(data: Buffer): Promise<void> {
    const port = this._port;
    if (!port?.isOpen) {
      return Promise.reject(new Error(`${this.description} is not open`));
    }
    return new Promise((resolve, reject) => {
      port.write(data);
      port.drain(err => (err ? reject(err) : resolve()));
    });
  }

  /** Makes the port, not yet open; tests give a mock here */
  protected _createPort(): SerialPortLike {
    const o = this.options;
    return new SerialPort({
      path: o.path,
      baudRate: o.baudRate ?? 9600,
      dataBits: o.dataBits ?? 8,
      parity: o.parity ?? 'none',
      stopBits: o.stopBits ?? 1,
      rtscts: !!o.rtscts,
      xon: !!o.xonxoff,
      xoff: !!o.xonxoff,
      autoOpen: false,
    });
  }

  protected _open(): Promise<void> {
    if (this._opening) return this._opening;
    if (this._given) return this._openGiven(this._given);
    const promise = new Promise<void>((resolve, reject) => {
      const port = this._createPort();
      port.open(err => {
        if (err) return reject(err);
        if (!this._wanted) {
          /* close() was called while opening */
          port.close();
          return resolve();
        }
        this._attach(port);
        resolve();
        this.emit('open');
      });
    });
    this._opening = promise;
    const done = () => {
      if (this._opening === promise) this._opening = undefined;
    };
    promise.then(done, done);
    return promise;
  }

  /** A given port: its 'open' event becomes the connection's */
  protected _openGiven(port: SerialPortLike): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      if (port.opening) {
        const onError = (err: Error) => {
          port.removeListener('open', onOpen);
          reject(err);
        };
        const onOpen = () => {
          port.removeListener('error', onError);
          resolve();
        };
        port.once('open', onOpen);
        port.once('error', onError);
        return;
      }
      port.open(err => (err ? reject(err) : resolve()));
    });
    this._opening = promise;
    const done = () => {
      if (this._opening === promise) this._opening = undefined;
    };
    promise.then(done, done);
    return promise;
  }

  /** A given port is the connection's for good: its events are passed on */
  protected _attachGiven(port: SerialPortLike) {
    this._port = port;
    port.on('open', () => this.emit('open'));
    port.on('data', (data: Buffer) => this.emit('data', data));
    port.on('error', (err: Error) => this._emitError(err));
    port.on('close', () => this.emit('close'));
  }

  protected _attach(port: SerialPortLike) {
    this._port = port;
    port.on('data', (data: Buffer) => this.emit('data', data));
    port.on('error', (err: Error) => this._emitError(err));
    port.once('close', () => {
      port.removeAllListeners('data');
      if (this._port === port) this._port = undefined;
      this.emit('close');
      this._scheduleReconnect();
    });
  }

  protected _scheduleReconnect() {
    const delay = this.reconnectDelay;
    if (!this._wanted || delay <= 0 || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = undefined;
      if (!this._wanted || this.isOpen) return;
      this._open().catch(err => {
        this._emitError(err);
        this._scheduleReconnect();
      });
    }, delay);
  }

  protected _clearReconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = undefined;
  }

  /** 'error' without a listener would throw in the port's callback */
  protected _emitError(error: Error) {
    if (this.listenerCount('error')) this.emit('error', error);
  }
}

function isPort(
  arg: SerialConnectionOptions | SerialPortLike,
): arg is SerialPortLike {
  return typeof (arg as SerialPortLike).open === 'function';
}
