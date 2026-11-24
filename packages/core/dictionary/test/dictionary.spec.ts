import { expect } from 'expect';
import * as api from '../src/index.js';
import {
  ASTM_RECORDS,
  ASTM_TYPES,
  dictionary,
  parseAstmDateTime,
  toAstmDate,
  toAstmDateTime,
  toAstmNumber,
  toAstmSequenceNumber,
} from '../src/index.js';

describe('dictionary', () => {
  it('names every record field in its enum, at the same position', () => {
    for (const [type, def] of Object.entries(ASTM_RECORDS)) {
      const names = (api as any)[`${type}Record`];
      expect(names).toBeDefined();
      for (const pos of Object.keys(def.fields)) {
        expect(typeof names[pos]).toBe('string');
      }
      const count = Object.values(names).filter(
        v => typeof v === 'number',
      ).length;
      expect(count).toBe(Object.keys(def.fields).length);
    }
  });

  it('names every component of a composite type in its enum', () => {
    for (const [type, def] of Object.entries(ASTM_TYPES)) {
      if (!def.fields) continue;
      const names = (api as any)[`${type}Type`];
      expect(names).toBeDefined();
      for (const pos of Object.keys(def.fields)) {
        expect(typeof names[pos]).toBe('string');
      }
    }
  });

  it('defines every type and table the records refer to', () => {
    for (const def of Object.values(ASTM_RECORDS)) {
      for (const field of Object.values(def.fields)) {
        expect(dictionary.types[field.type]).toBeDefined();
        if (field.table) expect(dictionary.tables[field.table]).toBeDefined();
      }
    }
  });

  it('gives the text of a code', () => {
    expect(dictionary.tableValue('Sex', 'F')).toBe('Female');
    expect(dictionary.tableValue('Sex', 'Z')).toBeUndefined();
  });

  it('extends without changing the dictionary it extends', () => {
    const ext = dictionary.extend({
      records: { M: { fields: { '3': { type: 'ST', desc: 'Our field' } } } },
      tables: { AbnormalFlag: { values: { '*': 'Instrument flag' } } },
    });
    expect(ext.records.M.fields['3'].desc).toBe('Our field');
    expect(ext.records.M.fields['2'].type).toBe('SI');
    expect(dictionary.records.M.fields['3']).toBeUndefined();
    expect(ext.tableValue('AbnormalFlag', '*')).toBe('Instrument flag');
    expect(ext.tableValue('AbnormalFlag', 'H')).toBe('Above high normal');
    expect(dictionary.tableValue('AbnormalFlag', '*')).toBeUndefined();
    expect(ext.records.P).toBe(dictionary.records.P);
  });
});

describe('dates', () => {
  it('keeps a date/time read as written, once checked', () => {
    expect(toAstmDateTime('20250102', true)).toBe('20250102');
    expect(toAstmDateTime('202501021230', true)).toBe('202501021230');
    expect(toAstmDateTime('20250102123045', true)).toBe('20250102123045');
    expect(() => toAstmDateTime('20251302', true)).toThrow(TypeError);
    expect(() => toAstmDateTime('2025-01-02', true)).toThrow(TypeError);
  });

  it('writes a Date in local time', () => {
    const d = new Date(2025, 0, 2, 3, 4, 5);
    expect(toAstmDateTime(d)).toBe('20250102030405');
    expect(toAstmDate(d)).toBe('20250102');
  });

  it('takes an ISO 8601 string given in code', () => {
    const iso = new Date(2025, 0, 2, 3, 4, 5).toISOString();
    expect(toAstmDateTime(iso)).toBe('20250102030405');
  });

  it('parses a date/time as local time', () => {
    expect(parseAstmDateTime('202501021230')).toEqual(
      new Date(2025, 0, 2, 12, 30, 0),
    );
  });
});

describe('numbers', () => {
  it('reads numbers', () => {
    expect(toAstmNumber('12.5')).toBe(12.5);
    expect(toAstmNumber('-3')).toBe(-3);
    expect(toAstmNumber('12345678901234567890')).toBe('12345678901234567890');
    expect(() => toAstmNumber('12,5')).toThrow(TypeError);
  });

  it('reads sequence numbers', () => {
    expect(toAstmSequenceNumber('2')).toBe(2);
    expect(() => toAstmSequenceNumber('-1')).toThrow(TypeError);
  });
});
