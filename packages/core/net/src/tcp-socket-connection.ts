import type { Socket } from 'node:net';
import { TcpConnection, type TcpSocketOptions } from './tcp-connection.js';

/**
 * One socket that a server accepted. It is open when it is made, and it does
 * not reconnect: once it closes, the instrument connects again as a new
 * socket.
 */
export class TcpSocketConnection extends TcpConnection {
  readonly description: string;

  constructor(socket: Socket, options?: TcpSocketOptions) {
    super();
    this.description = `tcp://${socket.remoteAddress}:${socket.remotePort}`;
    this._attach(socket, options || {});
  }

  /** The socket is open from the start; it cannot be opened again */
  async open(): Promise<void> {
    if (!this.isOpen) throw new Error(`${this.description} is closed`);
  }

  async close(): Promise<void> {
    await this._closeSocket();
  }
}
