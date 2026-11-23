import type { Socket } from 'node:net';
import { TcpConnection, type TcpSocketOptions } from './tcp-connection.js';

/**
 * A socket given to it: one that a server accepted, or one your own code
 * connected or is connecting. The connection uses that socket as it is and
 * does not reconnect: once it closes, a new socket makes a new connection.
 *
 * open() waits for a socket still connecting, and resolves at once for one
 * already connected.
 */
export class TcpSocketConnection extends TcpConnection {
  protected _description: string;

  constructor(socket: Socket, options?: TcpSocketOptions) {
    super();
    this._description = describe(socket);
    this._attach(socket, options || {});
    if (socket.connecting) {
      socket.once('connect', () => {
        this._description = describe(socket);
        this.emit('open');
      });
    }
  }

  get description(): string {
    return this._description;
  }

  async open(): Promise<void> {
    const socket = this._socket;
    if (this.isOpen) return;
    if (!socket?.connecting) throw new Error(`${this.description} is closed`);
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        socket.removeListener('connect', onConnect);
        reject(err);
      };
      const onConnect = () => {
        socket.removeListener('error', onError);
        resolve();
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  async close(): Promise<void> {
    if (this._socket?.connecting) this._socket.destroy();
    await this._closeSocket();
  }
}

function describe(socket: Socket): string {
  if (socket.remoteAddress) {
    return `tcp://${socket.remoteAddress}:${socket.remotePort}`;
  }
  return 'tcp://connecting';
}
