/** What went wrong on a link */
export enum AstmLinkErrorCode {
  /** The connection closed, or the link was closed, before the transfer ended */
  Closed = 'CLOSED',
  /** The receiver did not take the ENQ: busy, contention or no reply, every attempt */
  NotAccepted = 'NOT_ACCEPTED',
  /** No reply to a frame in time */
  ReplyTimeout = 'REPLY_TIMEOUT',
  /** A frame refused (NAK) more times than allowed */
  TooManyRetries = 'TOO_MANY_RETRIES',
  /** The receiver asked the sender to stop (EOT instead of ACK) */
  Interrupted = 'INTERRUPTED',
  /** No frame or EOT from the sender in time */
  FrameTimeout = 'FRAME_TIMEOUT',
  /** A transfer ended with a record cut short */
  IncompleteRecord = 'INCOMPLETE_RECORD',
  /** The records of a transfer are not a message the core package reads */
  InvalidMessage = 'INVALID_MESSAGE',
  /** A query got no answer in time: from the handlers, or from the other side */
  QueryTimeout = 'QUERY_TIMEOUT',
}

export class AstmLinkError extends Error {
  readonly code: AstmLinkErrorCode;
  /** The raw bytes involved, where there are some */
  raw?: Buffer;

  constructor(message: string, code: AstmLinkErrorCode, raw?: Buffer) {
    super(message);
    this.name = 'AstmLinkError';
    this.code = code;
    if (raw) this.raw = raw;
  }
}
