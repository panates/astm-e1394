import type {
  AstmDataTypeDefinition,
  AstmFieldDefinition,
} from '@astm-e1394/dictionary';
import type { AstmComponent } from './astm-component.js';
import type { AstmMessage } from './astm-message.js';
import type { AstmRecord } from './astm-record.js';
import {
  AstmRepeat,
  type AstmRepeatParseOptions,
  type AstmRepeatSerializeOptions,
} from './astm-repeat.js';

/** A field of a record, at its position from 1: the record type ID is field 1 */
export class AstmField {
  declare protected _repeats: AstmRepeat[];
  declare protected _definition: AstmFieldDefinition;
  declare protected _typeDef: AstmDataTypeDefinition;
  readonly record: AstmRecord;
  readonly position: number;

  constructor(record: AstmRecord, position: number, def: AstmFieldDefinition) {
    this.record = record;
    this.position = position;
    this._definition = def;
    this._typeDef = this.message.dictionary.types[def.type] || {};
    this.clear();
  }

  get message(): AstmMessage {
    return this.record.message;
  }

  get definition(): AstmFieldDefinition {
    return this._definition;
  }

  get typeDef(): AstmDataTypeDefinition {
    return this._typeDef;
  }

  /** Whether the field's data type has components of its own */
  get isComposite(): boolean {
    return !!this.typeDef.fields;
  }

  get repeats(): AstmRepeat[] {
    return this._repeats;
  }

  add(): AstmRepeat {
    const rep = new AstmRepeat(this);
    this._repeats.push(rep);
    return rep;
  }

  clear() {
    this._repeats = [];
  }

  isEmpty(): boolean {
    for (const rep of this._repeats) {
      if (!rep.isEmpty()) return false;
    }
    return true;
  }

  /** The repeat at an index, from 0, created when not there */
  repeat(index: number = 0): AstmRepeat {
    if (!Number.isInteger(index) || index < 0)
      throw new Error(`Invalid repeat index (${index})`);
    while (index >= this._repeats.length) this.add();
    return this._repeats[index]!;
  }

  /** Alias of repeat() */
  rep(index: number = 0): AstmRepeat {
    return this.repeat(index);
  }

  /** A component of the first repeat */
  component(position: number = 1): AstmComponent {
    return this.repeat(0).component(position);
  }

  /** Alias of component() */
  comp(position: number = 1): AstmComponent {
    return this.component(position);
  }

  /** The value of a component of the first repeat; the first by default */
  getValue(component?: number): any {
    return this._repeats[0]?.getValue(component);
  }

  /** The value of a component of the first repeat as a Date */
  getDate(component?: number): Date | undefined {
    return this._repeats[0]?.getDate(component);
  }

  setValue(value: any, component?: number): this {
    this.repeat(0).setValue(value, component);
    return this;
  }

  fromAstmString(value: string, options?: AstmFieldParseOptions) {
    this._repeats = [];
    for (const s of value.split(this.message.repeatDelimiter)) {
      this.add().fromAstmString(s, options);
    }
  }

  toAstmString(options?: AstmFieldSerializeOptions): string {
    const { repeatDelimiter } = this.message;
    const items = this._repeats.map(rep => rep.toAstmString(options));
    while (items.length && !items[items.length - 1]) items.pop();
    const str = items.join(repeatDelimiter);
    if (options?.serializeField)
      return String(options.serializeField(this, str, options) ?? '');
    return str;
  }

  [Symbol.toPrimitive]() {
    return this.toAstmString();
  }
}

export interface AstmFieldParseOptions extends AstmRepeatParseOptions {}

export interface AstmFieldSerializeOptions extends AstmRepeatSerializeOptions {
  serializeField?: (
    field: AstmField,
    serializedString: string,
    options?: AstmFieldSerializeOptions,
  ) => string;
}
