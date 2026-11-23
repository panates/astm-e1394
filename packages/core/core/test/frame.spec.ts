import { expect } from 'expect';
import {
  encodeFrame,
  frameChecksum,
  FrameReader,
  recordsToFrameTexts,
} from '../src/index.js';

describe('E1381 frames', () => {
  it('computes the checksum from FN through ETX or ETB', () => {
    const text = Buffer.from('L|1|N\r');
    let sum = 0x31 + 0x03;
    for (const b of text) sum += b;
    expect(frameChecksum(1, text, true)).toBe(
      (sum % 256).toString(16).toUpperCase().padStart(2, '0'),
    );
    expect(frameChecksum(1, Buffer.from(''), true)).toBe('34');
  });

  it('encodes a frame', () => {
    const raw = encodeFrame({
      number: 1,
      text: Buffer.from('L|1\r'),
      final: true,
    });
    expect(raw.toString('latin1')).toBe(
      '\x021L|1\r\x03' + frameChecksum(1, Buffer.from('L|1\r'), true) + '\r\n',
    );
  });

  it('cuts a long record into frames, never inside a character', () => {
    const texts = recordsToFrameTexts(['R|1|' + 'x'.repeat(500), 'L|1'], {
      maxLength: 240,
    });
    expect(texts.map(t => [t.text.length, t.final])).toEqual([
      [240, false],
      [240, false],
      [25, true],
      [4, true],
    ]);
    const utf = recordsToFrameTexts(['ş'.repeat(5)], { maxLength: 3 });
    expect(utf.every(t => t.text.length <= 3)).toBe(true);
    expect(Buffer.concat(utf.map(t => t.text)).toString()).toBe('şşşşş\r');
  });

  it('reads frames arriving in pieces, among control characters and noise', () => {
    const reader = new FrameReader();
    const frame = encodeFrame({
      number: 2,
      text: Buffer.from('P|1\r'),
      final: true,
    });
    const tokens = [
      ...reader.push(Buffer.from([0x05, 0x41])),
      ...reader.push(frame.subarray(0, 4)),
      ...reader.push(frame.subarray(4)),
      ...reader.push(Buffer.from([0x04])),
    ];
    expect(tokens.map(t => t.type)).toEqual(['control', 'frame', 'control']);
    const f = tokens[1] as any;
    expect(f.valid).toBe(true);
    expect(f.frame.number).toBe(2);
    expect(f.frame.text.toString()).toBe('P|1\r');
  });

  it('takes a frame at its CR when the LF is left out', () => {
    const reader = new FrameReader();
    const frame = encodeFrame({
      number: 1,
      text: Buffer.from('a\r'),
      final: true,
    });
    const tokens = reader.push(frame.subarray(0, frame.length - 1));
    expect(tokens.length).toBe(1);
    expect(reader.push(Buffer.from('\n'))).toEqual([]);
  });

  it('reports a wrong checksum', () => {
    const raw = Buffer.from('\x021H|\\^&\r\x0300\r\n', 'latin1');
    const [token] = new FrameReader().push(raw) as any[];
    expect(token.valid).toBe(false);
    expect(token.problem).toMatch(/checksum 00/);
  });
});
