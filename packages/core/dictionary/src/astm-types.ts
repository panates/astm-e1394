import { toAstmDate, toAstmDateTime } from './astm-date.util.js';
import { toAstmNumber, toAstmSequenceNumber } from './astm-number.util.js';
import type { AstmDataTypeDefinition, AstmFieldDefinition } from './types.js';

/*
 * The data types. ASTM E1394 describes each field's value in words; these
 * names give those descriptions a type each, so a field reads and writes
 * its value the same way everywhere. Composite types name their components,
 * which the enums in type-fields/ name too.
 */

function components(
  desc: string,
  names: [type: string, desc: string][],
): Readonly<AstmDataTypeDefinition> {
  const fields: Record<string, AstmFieldDefinition> = {};
  names.forEach(([type, fieldDesc], i) => {
    fields[String(i + 1)] = Object.freeze({ type, desc: fieldDesc });
  });
  return Object.freeze({ desc, fields: Object.freeze(fields) });
}

export const ASTM_TYPES: Readonly<Record<string, AstmDataTypeDefinition>> =
  Object.freeze({
    ST: Object.freeze({ desc: 'Text' }),
    ID: Object.freeze({ desc: 'Coded value' }),
    NM: Object.freeze({ desc: 'Number', decode: toAstmNumber }),
    SI: Object.freeze({
      desc: 'Sequence number',
      decode: toAstmSequenceNumber,
    }),
    DT: Object.freeze({ desc: 'Date', decode: toAstmDate, encode: toAstmDate }),
    TS: Object.freeze({
      desc: 'Date and time',
      decode: toAstmDateTime,
      encode: toAstmDateTime,
    }),
    PN: components('Person name', [
      ['ST', 'Last Name'],
      ['ST', 'First Name'],
      ['ST', 'Middle Name'],
      ['ST', 'Suffix'],
      ['ST', 'Title'],
    ]),
    CN: components('Physician', [
      ['ST', 'ID'],
      ['ST', 'Last Name'],
      ['ST', 'First Name'],
      ['ST', 'Middle Name'],
      ['ST', 'Suffix'],
      ['ST', 'Title'],
    ]),
    AD: components('Address', [
      ['ST', 'Street Address'],
      ['ST', 'City'],
      ['ST', 'State'],
      ['ST', 'Zip Code'],
      ['ST', 'Country Code'],
    ]),
    UTI: components('Universal test ID', [
      ['ST', 'Universal Test ID'],
      ['ST', 'Universal Test ID Name'],
      ['ST', 'Universal Test ID Type'],
      ['ST', 'Manufacturer Local Code'],
    ]),
    SPD: components('Specimen descriptor', [
      ['ST', 'Specimen Type'],
      ['ST', 'Specimen Source'],
    ]),
    CQ: components('Quantity', [
      ['NM', 'Value'],
      ['ST', 'Units'],
    ]),
  });
