import type { EventEmitter } from 'node:events';

/** The events every connection emits */
export interface AstmConnectionEvents {
  open: [];
  data: [data: Buffer];
  close: [];
  error: [error: Error];
}

/**
 * A byte stream to an instrument: a TCP socket, a serial port, or anything
 * else that carries bytes both ways. A connection knows nothing of the
 * protocol: AstmLink speaks E1381 over any connection.
 *
 * Implementations emit 'open' when bytes can be written, 'data' for each
 * chunk received, 'close' when the stream ends - a connection that
 * reconnects emits 'open' again - and 'error'.
 */
export interface AstmConnection extends EventEmitter<AstmConnectionEvents> {
  readonly isOpen: boolean;
  /** Where the connection goes, for logs: "tcp://10.0.0.5:5000", "serial:COM3" */
  readonly description: string;
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: Buffer): Promise<void>;
}
