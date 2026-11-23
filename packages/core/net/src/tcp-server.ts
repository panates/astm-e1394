import { EventEmitter } from 'node:events';
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from 'node:net';
import {
  type AstmHandler,
  AstmLink,
  type AstmLinkOptions,
  type AstmMessageFilter,
  AstmRouter,
} from '@astm-e1394/core';
import type { TcpSocketOptions } from './tcp-connection.js';
import { TcpSocketConnection } from './tcp-socket-connection.js';

export interface TcpServerOptions extends TcpSocketOptions {
  /** The options of the link made for each connection */
  link?: AstmLinkOptions;
  /** Connections beyond this many are refused. Default: no limit. */
  maxConnections?: number;
}

export interface TcpServerEvents {
  listening: [];
  /** A connection was accepted; its link is open */
  link: [link: AstmLink];
  close: [];
  error: [error: Error];
}

/**
 * Listens for instruments that connect to the LIS. Each socket it accepts
 * becomes a TcpSocketConnection with an AstmLink of its own, made from the
 * options given once, and is emitted as 'link'. The handlers added with
 * use() serve every link. A link leaves the server's list when its
 * connection closes.
 */
export class TcpServer extends EventEmitter<TcpServerEvents> {
  readonly options: Readonly<TcpServerOptions>;
  protected _server: Server;
  protected _links = new Set<AstmLink>();
  /** The handlers shared by every link */
  readonly router = new AstmRouter();

  constructor(options?: TcpServerOptions) {
    super();
    this.options = { ...options };
    this._server = createServer(socket => this._accept(socket));
    if (this.options.maxConnections) {
      this._server.maxConnections = this.options.maxConnections;
    }
    this._server.on('error', err => {
      if (this.listenerCount('error')) this.emit('error', err);
    });
    this._server.on('close', () => this.emit('close'));
  }

  /**
   * Adds a handler, or a router, shared by every link - or, given a filter
   * first, for the messages it matches (see AstmRouter.use). Handlers added
   * later serve the links already open too.
   */
  use(handler: AstmHandler | AstmRouter, priority?: number): this;
  use(
    filter: AstmMessageFilter,
    handler: AstmHandler | AstmRouter,
    priority?: number,
  ): this;
  use(...args: any[]): this {
    (this.router.use as (...a: any[]) => AstmRouter)(...args);
    return this;
  }

  /** The links of the connections open now */
  get links(): ReadonlySet<AstmLink> {
    return this._links;
  }

  get listening(): boolean {
    return this._server.listening;
  }

  /** The address the server listens on, while it listens */
  address(): AddressInfo | undefined {
    const address = this._server.address();
    return address && typeof address === 'object' ? address : undefined;
  }

  /** Starts listening; port 0 takes a free port, which address() then gives */
  listen(port: number, host?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this._server;
      const fail = (err: Error) => reject(err);
      server.once('error', fail);
      server.listen(port, host, () => {
        server.removeListener('error', fail);
        this.emit('listening');
        resolve();
      });
    });
  }

  /** Stops listening and closes every open connection */
  async close(): Promise<void> {
    const closing = new Promise<void>(resolve => {
      if (!this._server.listening) return resolve();
      this._server.close(() => resolve());
    });
    await Promise.all([...this._links].map(link => link.close()));
    await closing;
  }

  protected _accept(socket: Socket) {
    const connection = new TcpSocketConnection(socket, this.options);
    const link = new AstmLink(connection, this.options.link);
    link.use(this.router);
    this._links.add(link);
    link.once('close', () => this._links.delete(link));
    this.emit('link', link);
  }
}
