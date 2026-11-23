import iconv from 'iconv-lite';
import { ACK, CR, ENQ, EOT, ETB, ETX, LF, NAK, STX } from '../constants.js';

const CONTROLS = new Set([ENQ, ACK, NAK, EOT]);

/*
 * E1381 frames:
 *
 *   intermediate   STX FN text ETB C1 C2 CR LF
 *   last           STX FN text ETX C1 C2 CR LF
 *
 * FN is the frame number, the digit "1" to "7" and then "0". A record's text
 * ends with its CR, and a frame holds at most one record: a record longer
 * than a frame's text is split into intermediate frames, its last frame
 * ending with ETX. C1 C2 is the checksum: the sum of the bytes from FN
 * through ETB or ETX, modulo 256, as two uppercase hex digits.
 */

/** The standard's limit on a frame's text: 247 bytes a frame in all */
export const MAX_FRAME_TEXT = 240;

export interface AstmFrame {
  /** 0 to 7 */
  number: number;
  /** The text, as bytes */
  text: Buffer;
  /** Whether the frame ends its record (ETX) or not (ETB) */
  final: boolean;
}

/** The checksum of a frame: FN, text and the end character */
export function frameChecksum(
  number: number,
  text: Buffer,
  final: boolean,
): string {
  let sum = 0x30 + number + (final ? ETX : ETB);
  for (const b of text) sum += b;
  return (sum & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

/** A frame as the bytes sent */
export function encodeFrame(frame: AstmFrame): Buffer {
  return Buffer.concat([
    Buffer.from([STX, 0x30 + frame.number]),
    frame.text,
    Buffer.from([frame.final ? ETX : ETB]),
    Buffer.from(frameChecksum(frame.number, frame.text, frame.final), 'ascii'),
    Buffer.from([CR, LF]),
  ]);
}

/**
 * A message's records as frame texts: each record's text and its CR,
 * encoded, cut into pieces of at most `maxLength` bytes - never inside a
 * character
 */
export function recordsToFrameTexts(
  records: string[],
  options?: { encoding?: string; maxLength?: number },
): { text: Buffer; final: boolean }[] {
  const encoding = options?.encoding || 'utf8';
  const max = options?.maxLength || MAX_FRAME_TEXT;
  const out: { text: Buffer; final: boolean }[] = [];
  for (const record of records) {
    const pieces: Buffer[] = [];
    let current: Buffer[] = [];
    let size = 0;
    for (const ch of record + '\r') {
      const bytes = iconv.encode(ch, encoding);
      if (size + bytes.length > max && size > 0) {
        pieces.push(Buffer.concat(current));
        current = [];
        size = 0;
      }
      current.push(bytes);
      size += bytes.length;
    }
    pieces.push(Buffer.concat(current));
    pieces.forEach((text, i) =>
      out.push({ text, final: i === pieces.length - 1 }),
    );
  }
  return out;
}

/** What a FrameReader reads: a control character, or a whole frame */
export type FrameToken =
  | { type: 'control'; code: number }
  | {
      type: 'frame';
      frame: AstmFrame;
      /** Whether the checksum and the frame's layout are right */
      valid: boolean;
      /** What was wrong, when not valid */
      problem?: string;
      raw: Buffer;
    };

/**
 * Reads bytes as they arrive into control characters and frames. A frame
 * may arrive in pieces; bytes outside a frame that are not control
 * characters are noise, and dropped.
 */
export class FrameReader {
  protected _buf: Buffer = Buffer.alloc(0);

  /** Discards a frame read in part */
  reset() {
    this._buf = Buffer.alloc(0);
  }

  push(data: Buffer): FrameToken[] {
    const out: FrameToken[] = [];
    let buf = this._buf.length ? Buffer.concat([this._buf, data]) : data;
    let i = 0;
    while (i < buf.length) {
      const b = buf[i];
      if (b !== STX) {
        if (CONTROLS.has(b)) out.push({ type: 'control', code: b });
        i++;
        continue;
      }
      /* A frame: STX ... ETB|ETX C1 C2 CR [LF] */
      let end = -1;
      for (let k = i + 1; k < buf.length; k++) {
        const c = buf[k];
        if (c === ETX || c === ETB) {
          end = k;
          break;
        }
        if (c === STX) break;
      }
      if (end < 0) {
        /* Another STX before an end: the first frame was cut short */
        const next = buf.indexOf(STX, i + 1);
        if (next > 0) {
          i = next;
          continue;
        }
        break;
      }
      if (end + 3 >= buf.length) break;
      /* Taken at its CR: an instrument that leaves the LF out waits for the reply */
      let stop = buf[end + 3] === CR ? end + 4 : end + 3;
      if (stop < buf.length && buf[stop] === LF) stop++;
      out.push(this._token(buf.subarray(i, stop), end - i));
      i = stop;
    }
    buf = buf.subarray(i);
    this._buf = Buffer.from(buf);
    return out;
  }

  protected _token(raw: Buffer, end: number): FrameToken {
    const fnChar = raw[1];
    const number = fnChar - 0x30;
    const final = raw[end] === ETX;
    const text = Buffer.from(raw.subarray(2, end));
    const frame: AstmFrame = { number, text, final };
    let problem: string | undefined;
    if (!(number >= 0 && number <= 7)) problem = 'invalid frame number';
    else {
      const given = raw.subarray(end + 1, end + 3).toString('ascii');
      const expected = frameChecksum(number, text, final);
      if (given.toUpperCase() !== expected)
        problem = `checksum ${given}, ${expected} expected`;
      else if (raw[end + 3] !== CR) problem = 'no CR after the checksum';
    }
    return {
      type: 'frame',
      frame,
      valid: !problem,
      ...(problem ? { problem } : {}),
      raw: Buffer.from(raw),
    };
  }
}
