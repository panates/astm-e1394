import { expect } from 'expect';
import {
  AstmMessage,
  HRecord,
  ORecord,
  PRecord,
  RRecord,
  UTIType,
} from '../src/index.js';
import { resultMessage } from './fixtures.js';

describe('serialize', () => {
  it('writes a message back as it was read', () => {
    const msg = AstmMessage.parse(resultMessage);
    expect(msg.toAstmString()).toBe(resultMessage + '\r');
  });

  it('writes in the delimiters the message was read with', () => {
    const input = 'H!@#$\rP!1!!!!DOE#JOHN\rC!1!L!a$F$b!G\rL!1!N\r';
    expect(AstmMessage.parse(input).toAstmString()).toBe(input);
  });

  it('writes records with another terminator', () => {
    const msg = AstmMessage.parse(resultMessage);
    expect(msg.toAstmString({ recordTerminator: '\r\n' })).toBe(
      resultMessage.replaceAll('\r', '\r\n') + '\r\n',
    );
  });

  it('builds a message, numbering its records', () => {
    const msg = new AstmMessage();
    msg.header.field(HRecord.DateAndTimeOfMessage).setValue('20250102103000');
    msg.header.field(HRecord.ProcessingID).setValue('P');
    const p = msg.addRecord('P');
    p.field(PRecord.PatientName).setValue('DOE', 1).setValue('JOHN', 2);
    p.field(PRecord.Birthdate).setValue(new Date(1980, 1, 15));
    const o = msg.addRecord('O');
    o.field(ORecord.SpecimenID).setValue('S1');
    o.field(ORecord.UniversalTestID).setValue(
      'GLU',
      UTIType.ManufacturerLocalCode,
    );
    o.field(ORecord.UniversalTestID)
      .repeat(1)
      .setValue('CREA', UTIType.ManufacturerLocalCode);
    msg.addRecord('R').field(RRecord.DataOrMeasurementValue).setValue(5.4);
    msg.addRecord('C').field(4).setValue('a|b^c\\d&e\rf');
    msg.addRecord('R');
    msg.addRecord('O');
    msg.addRecord('L').field(3).setValue('N');
    expect(msg.toAstmString()).toBe(
      [
        'H|\\^&||||||||||P||20250102103000',
        'P|1||||DOE^JOHN||19800215000000',
        'O|1|S1||^^^GLU\\^^^CREA',
        'R|1||5.4',
        'C|1||a&F&b&S&c&R&d&E&e&X0D&f',
        'R|2',
        'O|2',
        'L|1|N',
        '',
      ].join('\r'),
    );
  });

  it('refuses a value its type cannot read', () => {
    const msg = new AstmMessage();
    const p = msg.addRecord('P');
    expect(() => p.field(PRecord.Birthdate).setValue('15.02.1980')).toThrow(
      TypeError,
    );
    expect(() => p.field(PRecord.SequenceNumber).setValue('x')).toThrow(
      TypeError,
    );
  });

  it('writes Buffers in the message encoding', () => {
    const msg = new AstmMessage();
    msg.encoding = 'windows-1254';
    msg.addRecord('P').field(6).setValue('Ş');
    expect(msg.toBuffer().includes(0xde)).toBe(true);
  });
});
