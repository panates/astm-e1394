import { EventEmitter } from 'node:events';
import type { AstmDictionary } from '@astm-e1394/dictionary';
import iconv from 'iconv-lite';
import { AstmMessage } from '../astm-message.js';
import type { AstmConnection } from './astm-connection.js';
import { AstmLinkError, AstmLinkErrorCode } from './astm-link-error.js';
import { ACK, ENQ, EOT, NAK } from './control-chars.js';
import {
  type AstmFrame,
  encodeFrame,
  FrameReader,
  type FrameToken,
  MAX_FRAME_TEXT,
  recordsToFrameTexts,
} from './frame.js';

/**
 * Where the link is in the E1381 protocol:
 * - closed: the connection is not open;
 * - idle: neutral, nothing being sent or received;
 * - establishing: ENQ sent, waiting for the reply;
 * - sending: sending a message's frames;
 * - receiving: the other side's ENQ taken, reading its frames.
 */
export type AstmLinkState =
  'closed' | 'idle' | 'establishing' | 'sending' | 'receiving';

export interface AstmLinkOptions {
  /**
   * Which side of the link this is. On contention - both sides sending ENQ
   * at once - the instrument wins: the host waits longer before it tries
   * again. Default 'host', the laboratory information system.
   */
  role?: 'host' | 'instrument';
  /** The encoding of message text on the wire. Default UTF-8, which is ASCII too. */
  encoding?: string;
  /** The dictionary received messages are read with */
  dictionary?: AstmDictionary;
  /** Sender waiting for a reply to ENQ or a frame. Default 15000 ms. */
  replyTimeout?: number;
  /** Receiver waiting for the next frame or EOT. Default 30000 ms. */
  frameTimeout?: number;
  /** Wait after contention before a new ENQ. Default 20000 ms for the host, 1000 ms for an instrument. */
  contentionDelay?: number;
  /** Wait after a NAK to ENQ (receiver busy) or no reply to it. Default 10000 ms. */
  busyDelay?: number;
  /** ENQs sent for one message before it fails. Default 6. */
  maxEstablishAttempts?: number;
  /** Sends of one frame after a NAK before the transfer ends. Default 6. */
  maxRetries?: number;
  /** Bytes of text in a frame. Default 240, the standard's. */
  maxFrameLength?: number;
  /** A pause before each reply (ACK, NAK), for instruments that miss one sent too soon. Default 0. */
  ackDelay?: number;
  /** A pause between frames. Default 0. */
  frameDelay?: number;
  /** A pause after a transfer ends before the next ENQ. Default 0. */
  messageDelay?: number;
  /**
   * 'lenient' takes a frame whose checksum is wrong - reporting it as a
   * 'warning' - for an instrument known to compute it wrongly. Default 'strict'.
   */
  checksum?: 'strict' | 'lenient';
  /**
   * What an EOT received instead of an ACK - the receiver asking the sender
   * to stop - does: 'ignore' takes it as an ACK and sends the rest, as the
   * standard allows; 'stop' ends the transfer, failing the message when
   * frames are left. Default 'ignore'.
   */
  receiverInterrupt?: 'ignore' | 'stop';
}

export interface AstmLinkEvents {
  open: [];
  close: [];
  state: [state: AstmLinkState, previous: AstmLinkState];
  /** A message received whole */
  message: [message: AstmMessage];
  /** Bytes written to the connection */
  send: [data: Buffer];
  /** Bytes received from the connection */
  receive: [data: Buffer];
  /** A frame or control character read */
  token: [token: FrameToken];
  /** Something wrong the link went on after: a bad frame, a lost transfer */
  warning: [error: AstmLinkError];
  error: [error: Error];
}

interface Outgoing {
  frames: AstmFrame[];
  resolve: () => void;
  reject: (e: Error) => void;
}

const DEFAULTS = {
  replyTimeout: 15000,
  frameTimeout: 30000,
  busyDelay: 10000,
  maxEstablishAttempts: 6,
  maxRetries: 6,
  ackDelay: 0,
  frameDelay: 0,
  messageDelay: 0,
};

/**
 * The E1381 / LIS1-A low-level protocol over a connection: establishment
 * (ENQ), transfer (frames, each answered ACK or NAK) and termination (EOT).
 * Messages given to send() are queued and sent one transfer each; messages
 * received whole are emitted as 'message'.
 */
export class AstmLink extends EventEmitter<AstmLinkEvents> {
  readonly connection: AstmConnection;
  readonly options: Readonly<AstmLinkOptions>;
  protected _state: AstmLinkState = 'closed';
  protected _reader = new FrameReader();
  protected _queue: Outgoing[] = [];
  protected _timers = new Set<NodeJS.Timeout>();
  /** The timer of the current wait: a reply, a frame, a delay before ENQ */
  protected _timer?: NodeJS.Timeout;
  protected _waiting = false;
  protected _attempts = 0;
  protected _frameIndex = 0;
  protected _retries = 0;
  protected _expectedNumber = 1;
  protected _lastNumber = -1;
  protected _received: Buffer[] = [];
  protected _partial: Buffer[] = [];

  constructor(connection: AstmConnection, options?: AstmLinkOptions) {
    super();
    this.connection = connection;
    this.options = { ...options };
    connection.on('open', () => this._onOpen());
    connection.on('close', () => this._onClose());
    connection.on('data', data => this._onData(data));
    connection.on('error', err => this._emitError(err));
    if (connection.isOpen) this._setState('idle');
  }

  get state(): AstmLinkState {
    return this._state;
  }

  /** Messages waiting to be sent, the one being sent included */
  get pending(): number {
    return this._queue.length;
  }

  /** Opens the connection */
  async open(): Promise<void> {
    await this.connection.open();
  }

  /** Closes the connection; messages not yet sent fail */
  async close(): Promise<void> {
    this._failAll(
      new AstmLinkError('The link was closed', AstmLinkErrorCode.Closed),
    );
    await this.connection.close();
  }

  /**
   * Queues a message and sends it in a transfer of its own. Resolves once its
   * last frame is acknowledged and EOT sent; rejects with an AstmLinkError
   * when it cannot be sent.
   */
  send(message: AstmMessage | string): Promise<void> {
    const text = typeof message === 'string' ? message : message.toAstmString();
    const records = text.split(/\r\n?|\n/).filter(r => r);
    const frames = recordsToFrameTexts(records, {
      encoding: this.options.encoding,
      maxLength: this.options.maxFrameLength || MAX_FRAME_TEXT,
    }).map((f, i) => ({ ...f, number: (i + 1) % 8 }));
    return new Promise<void>((resolve, reject) => {
      this._queue.push({ frames, resolve, reject });
      this._kick();
    });
  }

  /* ------------------------------------------------------------ events */

  protected _onOpen() {
    this._reader.reset();
    this._setState('idle');
    this.emit('open');
    this._kick();
  }

  protected _onClose() {
    this._clearTimers();
    this._waiting = false;
    /* The message being sent fails; the rest wait for the connection to open again */
    const current = this._state === 'sending' || this._state === 'establishing';
    if (current && this._queue.length) {
      this._queue
        .shift()!
        .reject(
          new AstmLinkError(
            'The connection closed during the transfer',
            AstmLinkErrorCode.Closed,
          ),
        );
    }
    if (this._state === 'receiving') {
      this._warn(
        'The connection closed during a transfer; its records are lost',
        AstmLinkErrorCode.Closed,
      );
    }
    this._resetReceive();
    this._setState('closed');
    this.emit('close');
  }

  protected _onData(data: Buffer) {
    this.emit('receive', data);
    for (const token of this._reader.push(data)) {
      this.emit('token', token);
      try {
        this._onToken(token);
      } catch (e: any) {
        this._emitError(e);
      }
    }
  }

  protected _onToken(token: FrameToken) {
    const code = token.type === 'control' ? token.code : undefined;
    switch (this._state) {
      case 'idle':
        if (code === ENQ) this._startReceive();
        return;
      case 'establishing':
        if (code === ACK) return this._startTransfer();
        if (code === NAK) return this._establishFailed('busy');
        if (code === ENQ) return this._contention();
        return;
      case 'sending':
        if (code === ACK) return this._frameAccepted();
        if (code === NAK) return this._frameRefused();
        if (code === EOT) return this._interrupted();
        return;
      case 'receiving':
        if (token.type === 'frame') return this._onFrame(token);
        if (code === EOT) return this._endReceive();
        /* The sender began again: what it sent before is dropped */
        if (code === ENQ) {
          this._resetReceive();
          this._reply(ACK);
          this._wait(this._opt('frameTimeout'), () => this._frameTimedOut());
        }
        return;
    }
  }

  /* ----------------------------------------------------------- sending */

  /** Starts the next transfer when the link is idle and a message waits */
  protected _kick() {
    if (this._state !== 'idle' || this._waiting || !this._queue.length) return;
    this._attempts++;
    this._setState('establishing');
    this._write(Buffer.from([ENQ]));
    this._wait(this._opt('replyTimeout'), () =>
      this._establishFailed('timeout'),
    );
  }

  protected _establishFailed(reason: 'busy' | 'timeout') {
    this._clearWait();
    /* No reply: the sender ends the attempt with EOT */
    if (reason === 'timeout') this._write(Buffer.from([EOT]));
    this._setState('idle');
    if (this._attempts >= this._opt('maxEstablishAttempts')) {
      this._attempts = 0;
      this._queue
        .shift()
        ?.reject(
          new AstmLinkError(
            reason === 'busy'
              ? 'The receiver stayed busy (NAK to every ENQ)'
              : 'The receiver did not answer ENQ',
            AstmLinkErrorCode.NotAccepted,
          ),
        );
    }
    this._pause(this._opt('busyDelay'));
  }

  protected _contention() {
    this._clearWait();
    this._setState('idle');
    const delay =
      this.options.contentionDelay ??
      (this.options.role === 'instrument' ? 1000 : 20000);
    this._pause(delay);
  }

  protected _startTransfer() {
    this._clearWait();
    this._attempts = 0;
    this._frameIndex = 0;
    this._retries = 0;
    this._setState('sending');
    this._sendFrame();
  }

  protected _sendFrame() {
    const item = this._queue[0];
    const frame = item?.frames[this._frameIndex];
    if (!frame) return this._endTransfer();
    this._write(encodeFrame(frame));
    this._wait(this._opt('replyTimeout'), () =>
      this._abortTransfer(
        new AstmLinkError(
          `No reply to frame ${frame.number} in time`,
          AstmLinkErrorCode.ReplyTimeout,
        ),
      ),
    );
  }

  protected _nextFrame() {
    this._retries = 0;
    this._frameIndex++;
    const delay = this._opt('frameDelay');
    if (delay) this._wait(delay, () => this._sendFrame());
    else this._sendFrame();
  }

  protected _frameAccepted() {
    this._clearWait();
    this._nextFrame();
  }

  protected _frameRefused() {
    this._clearWait();
    if (++this._retries > this._opt('maxRetries')) {
      return this._abortTransfer(
        new AstmLinkError(
          `Frame refused ${this._retries} times`,
          AstmLinkErrorCode.TooManyRetries,
        ),
      );
    }
    this._sendFrame();
  }

  protected _interrupted() {
    this._clearWait();
    if (this.options.receiverInterrupt !== 'stop') return this._nextFrame();
    const item = this._queue[0];
    if (item && this._frameIndex + 1 < item.frames.length) {
      return this._abortTransfer(
        new AstmLinkError(
          'The receiver asked to stop before the message was sent whole',
          AstmLinkErrorCode.Interrupted,
        ),
      );
    }
    this._endTransfer();
  }

  protected _endTransfer() {
    this._clearWait();
    this._write(Buffer.from([EOT]));
    const item = this._queue.shift();
    this._setState('idle');
    item?.resolve();
    this._pause(this._opt('messageDelay'));
  }

  protected _abortTransfer(error: AstmLinkError) {
    this._clearWait();
    this._write(Buffer.from([EOT]));
    const item = this._queue.shift();
    this._setState('idle');
    item?.reject(error);
    this._pause(this._opt('messageDelay'));
  }

  /* --------------------------------------------------------- receiving */

  protected _startReceive() {
    /* The other side's ENQ is taken even during a pause before our own */
    this._clearWait();
    this._resetReceive();
    this._setState('receiving');
    this._reply(ACK);
    this._wait(this._opt('frameTimeout'), () => this._frameTimedOut());
  }

  protected _onFrame(token: Extract<FrameToken, { type: 'frame' }>) {
    this._clearWait();
    const { frame } = token;
    let valid = token.valid;
    if (!valid && this.options.checksum === 'lenient' && frame.number >= 0) {
      this._warn(
        `Frame ${frame.number} taken in spite of: ${token.problem}`,
        AstmLinkErrorCode.InvalidMessage,
        token.raw,
      );
      valid = true;
    }
    if (valid && frame.number === this._expectedNumber) {
      this._partial.push(frame.text);
      if (frame.final) {
        this._received.push(Buffer.concat(this._partial));
        this._partial = [];
      }
      this._lastNumber = frame.number;
      this._expectedNumber = (frame.number + 1) % 8;
      this._reply(ACK);
    } else if (valid && frame.number === this._lastNumber) {
      /* Sent again: our ACK was lost. Taken once, acknowledged again */
      this._reply(ACK);
    } else {
      this._warn(
        valid
          ? `Frame ${frame.number} out of order, ${this._expectedNumber} expected`
          : `Frame refused: ${token.problem}`,
        AstmLinkErrorCode.InvalidMessage,
        token.raw,
      );
      this._reply(NAK);
    }
    this._wait(this._opt('frameTimeout'), () => this._frameTimedOut());
  }

  protected _endReceive() {
    this._clearWait();
    if (this._partial.length) {
      this._warn(
        'The transfer ended in the middle of a record; the record is dropped',
        AstmLinkErrorCode.IncompleteRecord,
        Buffer.concat(this._partial),
      );
    }
    const data = Buffer.concat(this._received);
    this._resetReceive();
    this._setState('idle');
    if (data.length) this._emitMessages(data);
    this._kick();
  }

  protected _frameTimedOut() {
    this._warn(
      'No frame or EOT in time; the transfer is dropped',
      AstmLinkErrorCode.FrameTimeout,
      Buffer.concat([...this._received, ...this._partial]),
    );
    this._resetReceive();
    this._setState('idle');
    this._kick();
  }

  protected _emitMessages(data: Buffer) {
    let messages: AstmMessage[];
    try {
      messages = AstmMessage.parseAll(iconv.decode(data, this._encoding), {
        encoding: this._encoding,
        dictionary: this.options.dictionary,
      });
    } catch (e: any) {
      const err = new AstmLinkError(
        `The records received are not a message: ${e.message}`,
        AstmLinkErrorCode.InvalidMessage,
        data,
      );
      this._emitError(err);
      return;
    }
    for (const message of messages) this.emit('message', message);
  }

  protected _resetReceive() {
    this._received = [];
    this._partial = [];
    this._expectedNumber = 1;
    this._lastNumber = -1;
  }

  /* ----------------------------------------------------------- helpers */

  protected get _encoding(): string {
    return this.options.encoding || 'utf8';
  }

  protected _opt<K extends keyof typeof DEFAULTS>(key: K): number {
    return (this.options[key] as number | undefined) ?? DEFAULTS[key];
  }

  protected _setState(state: AstmLinkState) {
    const previous = this._state;
    if (previous === state) return;
    this._state = state;
    this.emit('state', state, previous);
  }

  protected _write(data: Buffer) {
    if (!this.connection.isOpen) return;
    this.emit('send', data);
    this.connection.write(data).catch(e => this._emitError(e));
  }

  /** A reply to the sender, after the ackDelay the instrument needs */
  protected _reply(code: number) {
    const delay = this._opt('ackDelay');
    if (!delay) return this._write(Buffer.from([code]));
    this._timeout(delay, () => this._write(Buffer.from([code])));
  }

  /** The one wait the protocol is in: a reply, a frame, a delay between frames */
  protected _wait(ms: number, fn: () => void) {
    this._clearWait();
    this._timer = this._timeout(ms, () => {
      this._timer = undefined;
      fn();
    });
  }

  protected _clearWait() {
    this._waiting = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timers.delete(this._timer);
      this._timer = undefined;
    }
  }

  /** Holds the next ENQ back for a while; the other side's ENQ is still taken */
  protected _pause(ms: number) {
    this._wait(ms, () => {
      this._waiting = false;
      this._kick();
    });
    this._waiting = true;
  }

  protected _timeout(ms: number, fn: () => void): NodeJS.Timeout {
    const t = setTimeout(() => {
      this._timers.delete(t);
      try {
        fn();
      } catch (e: any) {
        this._emitError(e);
      }
    }, ms);
    this._timers.add(t);
    return t;
  }

  protected _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._timer = undefined;
  }

  protected _failAll(error: AstmLinkError) {
    const items = this._queue;
    this._queue = [];
    for (const item of items) item.reject(error);
  }

  protected _warn(text: string, code: AstmLinkErrorCode, raw?: Buffer) {
    this.emit('warning', new AstmLinkError(text, code, raw));
  }

  /** 'error' without a listener would throw: it is only emitted when one listens */
  protected _emitError(error: Error) {
    if (this.listenerCount('error')) this.emit('error', error);
  }
}
