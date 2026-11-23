import { expect } from 'expect';
import {
  AstmError,
  AstmErrorCode,
  AstmMessage,
  HRecord,
  ORecord,
  PNType,
  PRecord,
  RRecord,
  UTIType,
} from '../src/index.js';
import { resultMessage } from './fixtures.js';

describe('parse', () => {
  it('reads records, fields, repeats and components', () => {
    const msg = AstmMessage.parse(resultMessage);
    expect(msg.records.map(r => r.recordType).join('')).toBe('HPORCRPORL');
    const p = msg.getRecord('P')!;
    expect(p.sequence).toBe(1);
    expect(p.field(PRecord.PatientName).getValue(PNType.LastName)).toBe('DOE');
    expect(p.field(PRecord.PatientName).getValue(PNType.FirstName)).toBe(
      'JOHN',
    );
    const o = msg.getRecord('O')!;
    const tests = o.field(ORecord.UniversalTestID);
    expect(tests.repeats.length).toBe(2);
    expect(tests.repeat(1).getValue(UTIType.ManufacturerLocalCode)).toBe(
      'CREA',
    );
    const r = msg.getRecord('R')!;
    expect(r.field(RRecord.DataOrMeasurementValue).getValue()).toBe('5.4');
    expect(r.field(RRecord.DateTimeTestStarted).getValue()).toBe(
      '20250102100000',
    );
    expect(r.field(RRecord.DateTimeTestStarted).getDate()).toEqual(
      new Date(2025, 0, 2, 10, 0, 0),
    );
    expect(msg.header.field(HRecord.SenderNameOrID).getValue(3)).toBe('SN123');
  });

  it('reads the delimiters the header declares', () => {
    const msg = AstmMessage.parse(
      'H!@#$\rP!1!!!!DOE#JOHN\rO!1!S1!!###A@###B\rL!1!N\r',
    );
    expect(msg.fieldDelimiter).toBe('!');
    expect(msg.repeatDelimiter).toBe('@');
    expect(msg.componentDelimiter).toBe('#');
    expect(msg.escapeCharacter).toBe('$');
    expect(msg.get('P-6-2')).toBe('JOHN');
    expect(msg.get('O-5(1)-4')).toBe('B');
  });

  it('resolves escape sequences', () => {
    const msg = AstmMessage.parse(resultMessage);
    expect(msg.get('C-4')).toBe('Sample hemolyzed\\slight');
    const msg2 = AstmMessage.parse(
      'H|\\^&\rC|1|L|a&F&b&S&c&E&d&X0D0A&e&Zlocal&|G\rL|1\r',
    );
    expect(msg2.get('C-4')).toBe('a|b^c&d\r\ne&Zlocal&');
  });

  it('reads records ended by CR LF, or by LF alone', () => {
    const crlf = AstmMessage.parse(resultMessage.replaceAll('\r', '\r\n'));
    expect(crlf.records.length).toBe(10);
    const lf = AstmMessage.parse(resultMessage.replaceAll('\r', '\n'));
    expect(lf.records.length).toBe(10);
  });

  it('reads the null value', () => {
    const msg = AstmMessage.parse('H|\\^&\rP|1|""\rL|1\r');
    expect(msg.get('P-3')).toBeNull();
    expect(msg.toAstmString()).toBe('H|\\^&\rP|1|""\rL|1\r');
  });

  it('reads a Buffer in the encoding given', () => {
    const buf = Buffer.from('H|\\^&\rP|1||||Ş\rL|1\r', 'latin1');
    const msg = AstmMessage.parse(Buffer.from([...buf]), {
      encoding: 'latin1',
    });
    expect(msg.encoding).toBe('latin1');
    const tr = AstmMessage.parse(
      Buffer.from(
        [...'H|\\^&\rP|1||||']
          .map(c => c.charCodeAt(0))
          .concat(
            [0xde],
            [...'\rL|1\r'].map(c => c.charCodeAt(0)),
          ),
      ),
      { encoding: 'windows-1254' },
    );
    expect(tr.get('P-6')).toBe('Ş');
    expect(tr.toBuffer().at(-6)).toBe(0xde);
  });

  it('refuses input that does not start with a header', () => {
    expect(() => AstmMessage.parse('P|1\rL|1\r')).toThrow(AstmError);
    try {
      AstmMessage.parse('\r\rP|1\r');
    } catch (e: any) {
      expect(e.code).toBe(AstmErrorCode.InvalidMessage);
      expect(e.line).toBe(3);
    }
  });

  it('refuses two messages, and reads them with parseAll()', () => {
    const two = resultMessage + '\r' + resultMessage + '\r';
    expect(() => AstmMessage.parse(two)).toThrow(/more than one message/);
    const messages = AstmMessage.parseAll(two);
    expect(messages.length).toBe(2);
    expect(messages[1].records.length).toBe(10);
  });

  it('keeps a value of the wrong type as text, or throws when strict', () => {
    const input = 'H|\\^&\rP|1||||||1980021X\rL|1\r';
    expect(AstmMessage.parse(input).get('P-8')).toBe('1980021X');
    try {
      AstmMessage.parse(input, { strict: true });
      throw new Error('not thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(AstmError);
      expect(e.code).toBe(AstmErrorCode.DataType);
      expect(e.recordType).toBe('P');
      expect(e.fieldPosition).toBe(8);
      expect(e.line).toBe(2);
    }
  });
});
