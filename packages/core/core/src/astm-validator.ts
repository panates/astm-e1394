import type { AstmComponent } from './astm-component.js';
import { AstmError, AstmErrorCode } from './astm-error.js';
import type { AstmMessage } from './astm-message.js';
import type { AstmRecord } from './astm-record.js';
import {
  expectedSequences,
  levelOf,
  parentsOf,
  parentTypeOf,
} from './utils/astm-hierarchy.js';

export interface AstmValidateOptions {
  /**
   * Check the records: their types, their place in the hierarchy, their
   * sequence numbers and the terminator at the end. Default true.
   */
  structure?: boolean;
  /** Check field values against their data types, and repeats. Default true. */
  fields?: boolean;
  /**
   * Check coded values against their tables. Default false: instruments
   * send codes of their own often; give a dictionary with them (extend())
   * and turn this on.
   */
  tables?: boolean;
}

/**
 * Checks a message and returns what it finds, as AstmErrors carrying a code
 * (AstmErrorCode) and the location:
 *
 * - UnknownRecord: a record type the dictionary does not define;
 * - RecordOutOfPlace: a result with no order before it, an order with no
 *   patient, a record after the terminator;
 * - SequenceNumber: a sequence number missing, or not the record's count
 *   among the records of its type under the same parent;
 * - MissingTerminator: no L record at the end;
 * - DataType: a value its data type cannot read;
 * - Repeat: a field repeated that may not repeat;
 * - TableValue: a code its table does not have (with `tables`).
 */
export function validateMessage(
  message: AstmMessage,
  options?: AstmValidateOptions,
): AstmError[] {
  const errors: AstmError[] = [];
  if (options?.structure !== false) validateStructure(message, errors);
  if (options?.fields !== false || options?.tables) {
    message.records.forEach(record => validateRecord(record, errors, options));
  }
  return errors;
}

const at = (record: AstmRecord, more?: Partial<AstmError.ErrorArgs>) => ({
  recordType: record.recordType,
  recordIndex: record.index,
  ...more,
});

function validateStructure(message: AstmMessage, errors: AstmError[]) {
  const records = message.records;
  const types = records.map(r => r.recordType);
  const parents = parentsOf(types);
  const sequences = expectedSequences(types);
  const terminator = types.indexOf('L');

  records.forEach((record, i) => {
    const type = record.recordType;
    const name = `${type} record ${i + 1}`;
    if (!message.dictionary.records[type]) {
      errors.push(
        new AstmError(`${name}: record type "${type}" is not defined`, {
          code: AstmErrorCode.UnknownRecord,
          ...at(record),
        }),
      );
    }
    if (terminator >= 0 && i > terminator) {
      errors.push(
        new AstmError(`${name} comes after the terminator record`, {
          code: AstmErrorCode.RecordOutOfPlace,
          ...at(record),
        }),
      );
    }
    if (type === 'H') {
      if (i > 0) {
        errors.push(
          new AstmError(`${name}: a message has one header, first`, {
            code: AstmErrorCode.RecordOutOfPlace,
            ...at(record),
          }),
        );
      }
      return;
    }
    const parentType = parentTypeOf(type);
    const parent = records[parents[i]];
    if (parentType && parent?.recordType !== parentType) {
      errors.push(
        new AstmError(
          `${name} is not under a ${parentType} record, as it must be`,
          { code: AstmErrorCode.RecordOutOfPlace, ...at(record) },
        ),
      );
    } else if (levelOf(type) === undefined && !parent) {
      errors.push(
        new AstmError(`${name} has no record before it to belong to`, {
          code: AstmErrorCode.RecordOutOfPlace,
          ...at(record),
        }),
      );
    }
    const seq = record.sequence;
    if (seq !== sequences[i]) {
      errors.push(
        new AstmError(
          seq === undefined || isNaN(seq)
            ? `${name} has no sequence number; ${sequences[i]} expected`
            : `${name} has sequence number ${seq}; ${sequences[i]} expected`,
          {
            code: AstmErrorCode.SequenceNumber,
            ...at(record, { fieldPosition: 2 }),
          },
        ),
      );
    }
  });

  if (types[types.length - 1] !== 'L' && terminator < 0) {
    errors.push(
      new AstmError('The message has no terminator record (L) at its end', {
        code: AstmErrorCode.MissingTerminator,
      }),
    );
  }
}

function validateRecord(
  record: AstmRecord,
  errors: AstmError[],
  options?: AstmValidateOptions,
) {
  const first = record.recordType === 'H' ? 3 : 2;
  record.fields.forEach((field, i) => {
    const pos = i + 1;
    if (!field || pos < first || field.isEmpty()) return;
    const name = `${record.recordType}-${pos}`;
    const repeats = field.repeats.filter(r => !r.isEmpty()).length;
    if (options?.fields !== false && !field.definition.rep && repeats > 1) {
      errors.push(
        new AstmError(`${name} repeats ${repeats} times; it may not repeat`, {
          code: AstmErrorCode.Repeat,
          ...at(record, { fieldPosition: pos, repeatIndex: 1 }),
        }),
      );
    }
    field.repeats.forEach((rep, r) => {
      rep.components.forEach(component => {
        if (!component || component.isEmpty()) return;
        const where = at(record, {
          fieldPosition: pos,
          repeatIndex: r,
          componentPosition: component.position,
        });
        if (options?.fields !== false)
          checkType(component, name, where, errors);
        if (options?.tables) checkTable(component, name, where, errors);
      });
    });
  });
}

/* A value kept as text, its type not able to read it (see AstmComponent) */
function checkType(
  component: AstmComponent,
  name: string,
  where: AstmError.ErrorArgs,
  errors: AstmError[],
) {
  const decode = component.definition.decode || component.typeDef.decode;
  const value = component.getValue();
  if (!decode || value === null || typeof value !== 'string') return;
  try {
    decode(value, true);
  } catch (e: any) {
    errors.push(
      new AstmError(`${name}-${component.position}: ${e.message}`, {
        code: AstmErrorCode.DataType,
        ...where,
      }),
    );
  }
}

function checkTable(
  component: AstmComponent,
  name: string,
  where: AstmError.ErrorArgs,
  errors: AstmError[],
) {
  const tableName = component.definition.table;
  const table = tableName && component.message.dictionary.tables[tableName];
  const value = component.getValue();
  if (!table || value == null) return;
  if (!(String(value) in table.values)) {
    errors.push(
      new AstmError(
        `${name}-${component.position}: "${value}" is not a code of ${tableName}`,
        { code: AstmErrorCode.TableValue, ...where },
      ),
    );
  }
}
