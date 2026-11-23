import { EventEmitter } from 'node:events';
import type {
  AstmConnection,
  AstmConnectionEvents,
} from '../astm-connection.js';

/**
 * One end of an in-memory connection: what one end writes, the other
 * receives. MemoryConnection.pair() makes both ends, for tests and for an
 * instrument simulator in the same process.
 */
export class MemoryConnection
  extends EventEmitter<AstmConnectionEvents>
  implements AstmConnection
{
  protected _isOpen = false;
  protected _peer?: MemoryConnection;
  readonly description: string;

  constructor(name = 'memory') {
    super();
    this.description = name;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get peer(): MemoryConnection | undefined {
    return this._peer;
  }

  async open(): Promise<void> {
    if (this._isOpen) return;
    this._isOpen = true;
    this.emit('open');
  }

  async close(): Promise<void> {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.emit('close');
  }

  /** Delivers the bytes to the other end, on a later tick, as a socket would */
  async write(data: Buffer): Promise<void> {
    if (!this._isOpen) throw new Error(`${this.description} is not open`);
    const peer = this._peer;
    if (!peer?.isOpen) return;
    const copy = Buffer.from(data);
    queueMicrotask(() => {
      if (peer.isOpen) peer.emit('data', copy);
    });
  }

  /** Two connected ends */
  static pair(
    names: [string, string] = ['memory:a', 'memory:b'],
  ): [MemoryConnection, MemoryConnection] {
    const a = new MemoryConnection(names[0]);
    const b = new MemoryConnection(names[1]);
    a._peer = b;
    b._peer = a;
    return [a, b];
  }
}
