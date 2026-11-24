import { connect, type Socket } from 'node:net';
import { TcpConnection, type TcpSocketOptions } from './tcp-connection.js';

export interface TcpClientConnectionOptions extends TcpSocketOptions {
  host: string;
  port: number;
  /**
   * The wait in ms before connecting again after the connection drops or an
   * attempt fails; 0 turns reconnecting off. Default: 5 s.
   */
  reconnectDelay?: number;
  /** The time in ms one attempt to connect may take. Default: 10 s. */
  connectTimeout?: number;
}

/**
 * Connects to an instrument, or to a serial-to-TCP converter, and reconnects
 * when the connection drops.
 *
 * open() resolves once connected. When the first attempt fails it rejects;
 * with reconnecting on, the connection keeps trying in the background and
 * emits 'open' when it gets through. Failed attempts after the first are
 * emitted as 'error'. close() stops reconnecting.
 */
export class TcpClientConnection extends TcpConnection {
  readonly options: Readonly<TcpClientConnectionOptions>;
  readonly description: string;
  /** Between open() and close(): the connection is to be kept up */
  protected _wanted = false;
  protected _connecting?: Promise<void>;
  protected _reconnectTimer?: NodeJS.Timeout;

  constructor(options: TcpClientConnectionOptions) {
    super();
    this.options = { ...options };
    this.description = `tcp://${options.host}:${options.port}`;
  }

  get reconnectDelay(): number {
    return this.options.reconnectDelay ?? 5000;
  }

  async open(): Promise<void> {
    this._wanted = true;
    if (this.isOpen) return;
    this._clearReconnect();
    try {
      await this._connect();
    } catch (e) {
      this._scheduleReconnect();
      throw e;
    }
  }

  async close(): Promise<void> {
    this._wanted = false;
    this._clearReconnect();
    const connecting = this._connecting;
    if (connecting) await connecting.catch(() => undefined);
    await this._closeSocket();
  }

  protected _connect(): Promise<void> {
    if (this._connecting) return this._connecting;
    const promise = new Promise<void>((resolve, reject) => {
      const socket: Socket = connect({
        host: this.options.host,
        port: this.options.port,
        timeout: this.options.connectTimeout ?? 10_000,
      });
      const fail = (err: Error) => {
        socket.destroy();
        reject(err);
      };
      socket.once('error', fail);
      socket.once('timeout', () =>
        fail(new Error(`Connecting to ${this.description} timed out`)),
      );
      socket.once('connect', () => {
        socket.removeListener('error', fail);
        socket.removeAllListeners('timeout');
        socket.setTimeout(0);
        if (!this._wanted) {
          /* close() was called while connecting */
          socket.destroy();
          return resolve();
        }
        this._attach(socket, this.options);
        resolve();
        this.emit('open');
      });
    });
    this._connecting = promise;
    const done = () => {
      if (this._connecting === promise) this._connecting = undefined;
    };
    promise.then(done, done);
    return promise;
  }

  protected _onSocketClose() {
    super._onSocketClose();
    this._scheduleReconnect();
  }

  protected _scheduleReconnect() {
    const delay = this.reconnectDelay;
    if (!this._wanted || delay <= 0 || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = undefined;
      if (!this._wanted || this.isOpen) return;
      this._connect().catch(err => {
        this._emitError(err);
        this._scheduleReconnect();
      });
    }, delay);
  }

  protected _clearReconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = undefined;
  }
}
