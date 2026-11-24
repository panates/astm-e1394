import { expect } from 'expect';
import { AstmErrorCode, AstmMessage, dictionary } from '../src/index.js';
import { resultMessage } from './fixtures.js';

const codes = (msg: AstmMessage, options?: any) =>
  msg.validate(options).map(e => e.code);

describe('validate', () => {
  it('finds nothing wrong in a well-formed message', () => {
    expect(AstmMessage.parse(resultMessage).validate({ tables: true })).toEqual(
      [],
    );
  });

  it('reports records out of place and wrong sequence numbers', () => {
    const msg = AstmMessage.parse('H|\\^&\rR|1\rP|2\rO|1\rL|1\r');
    const errors = msg.validate();
    expect(errors.map(e => e.code)).toEqual([
      AstmErrorCode.RecordOutOfPlace,
      AstmErrorCode.SequenceNumber,
    ]);
    expect(errors[0].recordType).toBe('R');
    expect(errors[1].recordIndex).toBe(2);
  });

  it('reports a missing terminator and records after it', () => {
    expect(codes(AstmMessage.parse('H|\\^&\rP|1\r'))).toEqual([
      AstmErrorCode.MissingTerminator,
    ]);
    expect(codes(AstmMessage.parse('H|\\^&\rL|1\rP|1\r'))).toEqual([
      AstmErrorCode.RecordOutOfPlace,
    ]);
  });

  it('reports unknown records, types and repeats', () => {
    const msg = AstmMessage.parse('H|\\^&\rP|1||||||1980021X|M\\F\rX|1\rL|1\r');
    expect(codes(msg)).toEqual([
      AstmErrorCode.UnknownRecord,
      AstmErrorCode.DataType,
      AstmErrorCode.Repeat,
    ]);
  });

  it('checks codes against tables when asked', () => {
    const msg = AstmMessage.parse('H|\\^&\rP|1||||||19800215|Q\rL|1|N\r');
    expect(codes(msg)).toEqual([]);
    expect(codes(msg, { tables: true })).toEqual([AstmErrorCode.TableValue]);
    const ours = dictionary.extend({
      tables: { Sex: { values: { Q: 'Ours' } } },
    });
    const msg2 = AstmMessage.parse('H|\\^&\rP|1||||||19800215|Q\rL|1|N\r', {
      dictionary: ours,
    });
    expect(codes(msg2, { tables: true })).toEqual([]);
  });

  it('skips what it is told to', () => {
    const msg = AstmMessage.parse('H|\\^&\rR|5||||||||||||||x\r');
    expect(codes(msg, { structure: false })).toEqual([]);
  });
});
