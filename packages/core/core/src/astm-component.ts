import type {
  AstmDataTypeDefinition,
  AstmFieldDefinition,
} from '@astm-e1394/dictionary';
import { parseAstmDateTime, toAstmDateTime } from '@astm-e1394/dictionary';
import { AstmError, AstmErrorCode } from './astm-error.js';
import type { AstmField } from './astm-field.js';
import type { AstmMessage } from './astm-message.js';
import type { AstmRecord } from './astm-record.js';
import type { AstmRepeat } from './astm-repeat.js';
import { astmEscape, astmUnescape } from './utils/astm-escape.js';

/**
 * A component of a field's repeat: the smallest part of an ASTM message. A
 * field with one component - most of them - is its first component.
 *
 * Its value is undefined when empty, null for the standard's null ("") - "delete
 * this value" - and otherwise what its data type reads: text, a number, or
 * a date/time kept as written (see getDate()).
 */
export class AstmComponent {
  protected _value?: any;
  declare protected _definition: AstmFieldDefinition;
  declare protected _typeDef: AstmDataTypeDefinition;
  readonly repeat: AstmRepeat;
  readonly position: number;

  constructor(repeat: AstmRepeat, position: number, def: AstmFieldDefinition) {
    this.repeat = repeat;
    this.position = position;
    this._definition = def;
    this._typeDef = this.message.dictionary.types[def.type] || {};
  }

  get message(): AstmMessage {
    return this.repeat.message;
  }

  get record(): AstmRecord {
    return this.repeat.record;
  }

  get field(): AstmField {
    return this.repeat.field;
  }

  get definition(): AstmFieldDefinition {
    return this._definition;
  }

  get typeDef(): AstmDataTypeDefinition {
    return this._typeDef;
  }

  get value(): any {
    return this._value;
  }

  set value(value: any) {
    this.setValue(value);
  }

  isEmpty(): boolean {
    return this._value === undefined || this._value === '';
  }

  clear() {
    this._value = undefined;
  }

  getValue(): any {
    return this._value;
  }

  /**
   * The value as a Date, for a date or date/time value: read as local time.
   * Undefined when empty.
   */
  getDate(): Date | undefined {
    const v = this._value;
    if (v == null || v === '') return;
    if (v instanceof Date) return v;
    return parseAstmDateTime(String(v));
  }

  /**
   * Sets the value, read by the data type as one given in code: a date/time
   * field takes a Date or an ISO 8601 string. A value the type cannot read
   * throws a TypeError.
   */
  setValue(value: any): this {
    if (value == null || value === '') {
      this._value = value === '' ? undefined : value;
      return this;
    }
    const decode = this.definition.decode || this.typeDef.decode;
    this._value = decode ? decode(value, false) : value;
    return this;
  }

  fromAstmString(value: string, options?: AstmComponentParseOptions) {
    if (value === '') {
      this._value = undefined;
      return;
    }
    if (value === '""') {
      this._value = null;
      return;
    }
    const text = astmUnescape(value, this.message);
    const decode = this.definition.decode || this.typeDef.decode;
    if (!decode) {
      this._value = text;
      return;
    }
    try {
      this._value = decode(text, true);
    } catch (e: any) {
      /* Not strict: the value is kept as text, for validate() to report */
      this._value = text;
      if (!options?.strict) return;
      const location = `${this.record.recordType}-${this.field.position}-${this.position}`;
      const err = new AstmError(
        `${location} holds a value of the wrong data type. ${e.message}`,
        {
          code: AstmErrorCode.DataType,
          recordType: this.record.recordType,
          fieldPosition: this.field.position,
          repeatIndex: this.repeat.index,
          componentPosition: this.position,
        },
      );
      err.stack = e.stack;
      throw err;
    }
  }

  toAstmString(options?: AstmComponentSerializeOptions): string {
    let v = this._value;
    if (v === null) return '""';
    if (v === undefined) return '';
    const encode = this.definition.encode || this.typeDef.encode;
    if (encode) {
      try {
        v = encode(v);
      } catch {
        v = String(v);
      }
    } else if (v instanceof Date) v = toAstmDateTime(v);
    const str = astmEscape(String(v), this.message);
    if (options?.serializeComponent)
      return String(options.serializeComponent(this, str, options) ?? '');
    return str;
  }

  [Symbol.toPrimitive]() {
    return this.toAstmString();
  }
}

export interface AstmComponentParseOptions {
  /**
   * Throw an AstmError for a value its data type cannot read. Default false:
   * the value is kept as text, and validate() reports it.
   */
  strict?: boolean;
}

export interface AstmComponentSerializeOptions {
  serializeComponent?: (
    component: AstmComponent,
    serializedString: string,
    options?: AstmComponentSerializeOptions,
  ) => string;
}
