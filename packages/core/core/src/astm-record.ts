import type {
  AstmFieldDefinition,
  AstmRecordDefinition,
} from '@astm-e1394/dictionary';
import {
  AstmField,
  type AstmFieldParseOptions,
  type AstmFieldSerializeOptions,
} from './astm-field.js';
import type { AstmMessage } from './astm-message.js';
import { assignRecord, recordToObject } from './astm-record-object.js';

/**
 * A record: a line of the message, its type the first field. The record
 * type ID is field 1, as the standard numbers fields: record.field(2) of a
 * patient record is its sequence number. In the header, field 2 is the
 * delimiter definition, which the message's delimiters give.
 */
export class AstmRecord {
  declare protected _fields: AstmField[];
  declare protected _definition: AstmRecordDefinition;
  readonly message: AstmMessage;
  readonly recordType: string;

  constructor(message: AstmMessage, recordType: string) {
    this.message = message;
    this.recordType = recordType;
    this._definition = message.dictionary.records[recordType] || {
      fields: {},
    };
    this.clear();
  }

  get definition(): AstmRecordDefinition {
    return this._definition;
  }

  get fields(): AstmField[] {
    return this._fields;
  }

  /** The record's position among the message's records, from 0 */
  get index(): number {
    return this.message.records.indexOf(this);
  }

  /** The sequence number (field 2), for every record but the header */
  get sequence(): number | undefined {
    if (this.recordType === 'H') return;
    const v = this._fields[1]?.getValue();
    return typeof v === 'number' ? v : v ? Number(v) : undefined;
  }

  /** Clears every field but the record type ID */
  clear() {
    this._fields = [];
    this.field(1).setValue(this.recordType);
  }

  /** The field at a position, from 1, created when not there */
  field(position: number): AstmField {
    if (!Number.isInteger(position) || position < 1)
      throw new Error(`Invalid field position (${position})`);
    let field = this._fields[position - 1];
    if (!field) {
      const def: AstmFieldDefinition = this.definition.fields[
        String(position)
      ] || { type: 'ST' };
      field = new AstmField(this, position, def);
      this._fields[position - 1] = field;
    }
    return field;
  }

  /** Defines a field the dictionary does not: a manufacturer's own */
  defineField(position: number, def: AstmFieldDefinition): AstmField {
    if (!Number.isInteger(position) || position < 2)
      throw new Error(`Invalid field position (${position})`);
    return (this._fields[position - 1] = new AstmField(this, position, {
      ...def,
      type: def.type || 'ST',
    }));
  }

  toAstmString(options?: AstmRecordSerializeOptions): string {
    const { fieldDelimiter } = this.message;
    const items: string[] = [this.recordType];
    const isHeader = this.recordType === 'H';
    if (isHeader) {
      items.push(
        this.message.repeatDelimiter +
          this.message.componentDelimiter +
          this.message.escapeCharacter,
      );
    }
    for (let i = isHeader ? 2 : 1; i < this._fields.length; i++) {
      items.push(this._fields[i]?.toAstmString(options) ?? '');
    }
    while (items.length > 1 && !items[items.length - 1]) items.pop();
    const str = items.join(fieldDelimiter);
    if (options?.serializeRecord)
      return String(options.serializeRecord(this, str, options) ?? '');
    return str;
  }

  /**
   * The record as a plain object keyed by field names - PRecord's
   * "PatientName" - see astm-record-object.ts
   */
  toObject<T extends object = Record<string, any>>(): T {
    return recordToObject(this) as T;
  }

  /** Sets fields from an object shaped as toObject() makes it */
  assign(object: Record<string, any>): this {
    assignRecord(this, object);
    return this;
  }

  [Symbol.toPrimitive]() {
    return this.toAstmString();
  }

  /** Reads a record of a message whose delimiters are already known */
  static parse(
    message: AstmMessage,
    input: string,
    options?: AstmRecordParseOptions,
  ): AstmRecord {
    const items = input.split(message.fieldDelimiter);
    const record = new AstmRecord(message, items[0]);
    const isHeader = record.recordType === 'H';
    for (let i = 1; i < items.length; i++) {
      /* H-2 is the delimiter definition itself, not data to split */
      if (isHeader && i === 1) continue;
      record.field(i + 1).fromAstmString(items[i], options);
    }
    return record;
  }
}

export interface AstmRecordParseOptions extends AstmFieldParseOptions {}

export interface AstmRecordSerializeOptions extends AstmFieldSerializeOptions {
  serializeRecord?: (
    record: AstmRecord,
    serializedString: string,
    options?: AstmRecordSerializeOptions,
  ) => string;
}
