import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import type { AstmConnection, AstmConnectionEvents } from '@astm-e1394/core';

/** Socket settings shared by the TCP connections */
export interface TcpSocketOptions {
  /**
   * TCP keep-alive, so that a peer that vanished without closing is noticed:
   * the delay in ms before the first probe, or false to turn it off.
   * Default: 30 s.
   */
  keepAlive?: number | false;
}

/**
 * What the TCP connections share: one socket at a time, its bytes passed on
 * as 'data', and its end passed on as 'close'.
 */
export abstract class TcpConnection
  extends EventEmitter<AstmConnectionEvents>
  implements AstmConnection
{
  protected _socket?: Socket;

  abstract readonly description: string;
  abstract open(): Promise<void>;
  abstract close(): Promise<void>;

  get isOpen(): boolean {
    const socket = this._socket;
    return !!socket && !socket.destroyed && socket.readyState === 'open';
  }

  /** The socket in use, while there is one */
  get socket(): Socket | undefined {
    return this._socket;
  }

  write(data: Buffer): Promise<void> {
    const socket = this._socket;
    if (!this.isOpen || !socket) {
      return Promise.reject(new Error(`${this.description} is not open`));
    }
    return new Promise((resolve, reject) => {
      socket.write(data, err => (err ? reject(err) : resolve()));
    });
  }

  /** Takes a connected socket into use; emits 'close' once it ends */
  protected _attach(socket: Socket, options: TcpSocketOptions) {
    this._socket = socket;
    /* Control characters are single bytes: Nagle would hold ACKs back */
    socket.setNoDelay(true);
    const keepAlive = options.keepAlive ?? 30_000;
    if (keepAlive !== false) socket.setKeepAlive(true, keepAlive);
    socket.on('data', (data: Buffer) => this.emit('data', data));
    socket.on('error', err => this._emitError(err));
    socket.once('close', () => {
      socket.removeAllListeners('data');
      if (this._socket === socket) this._socket = undefined;
      this._onSocketClose();
    });
  }

  protected _onSocketClose() {
    this.emit('close');
  }

  /** Ends the socket once its data is written, and waits until it closes */
  protected _closeSocket(): Promise<void> {
    const socket = this._socket;
    if (!socket || socket.destroyed) return Promise.resolve();
    return new Promise(resolve => {
      socket.once('close', () => resolve());
      socket.end(() => socket.destroy());
    });
  }

  /** 'error' without a listener would throw in the socket's callback */
  protected _emitError(error: Error) {
    if (this.listenerCount('error')) this.emit('error', error);
  }
}
