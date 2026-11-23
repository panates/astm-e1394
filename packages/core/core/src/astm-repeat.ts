import {
  AstmComponent,
  type AstmComponentParseOptions,
  type AstmComponentSerializeOptions,
} from './astm-component.js';
import type { AstmField } from './astm-field.js';
import type { AstmMessage } from './astm-message.js';
import type { AstmRecord } from './astm-record.js';

/** One value of a field: a field that may repeat holds several */
export class AstmRepeat {
  declare protected _components: AstmComponent[];
  readonly field: AstmField;

  constructor(field: AstmField) {
    this.field = field;
    this.clear();
  }

  get message(): AstmMessage {
    return this.field.message;
  }

  get record(): AstmRecord {
    return this.field.record;
  }

  get components(): AstmComponent[] {
    return this._components;
  }

  /** The repeat's position in its field, from 0 */
  get index(): number {
    return this.field.repeats.indexOf(this);
  }

  clear() {
    this._components = [];
  }

  isEmpty(): boolean {
    for (const component of this._components) {
      if (component && !component.isEmpty()) return false;
    }
    return true;
  }

  /** The component at a position, from 1, created when not there */
  component(position: number = 1): AstmComponent {
    if (!Number.isInteger(position) || position < 1)
      throw new Error(`Invalid component position (${position})`);
    let component = this._components[position - 1];
    if (!component) {
      let def = this.field.typeDef.fields?.[String(position)];
      if (!def) def = position === 1 ? this.field.definition : { type: 'ST' };
      component = new AstmComponent(this, position, def);
      this._components[position - 1] = component;
    }
    return component;
  }

  /** Alias of component() */
  comp(position: number = 1): AstmComponent {
    return this.component(position);
  }

  getValue(component?: number): any {
    return this._components[(component || 1) - 1]?.getValue();
  }

  getDate(component?: number): Date | undefined {
    return this._components[(component || 1) - 1]?.getDate();
  }

  setValue(value: any, component?: number): this {
    this.component(component || 1).setValue(value);
    return this;
  }

  fromAstmString(value: string, options?: AstmRepeatParseOptions) {
    this._components = [];
    const items = value.split(this.message.componentDelimiter);
    items.forEach((s, i) => this.component(i + 1).fromAstmString(s, options));
  }

  toAstmString(options?: AstmRepeatSerializeOptions): string {
    const { componentDelimiter } = this.message;
    const items: string[] = [];
    for (let i = 0; i < this._components.length; i++) {
      items.push(this._components[i]?.toAstmString(options) ?? '');
    }
    while (items.length && !items[items.length - 1]) items.pop();
    return items.join(componentDelimiter);
  }

  [Symbol.toPrimitive]() {
    return this.toAstmString();
  }
}

export interface AstmRepeatParseOptions extends AstmComponentParseOptions {}

export interface AstmRepeatSerializeOptions extends AstmComponentSerializeOptions {}
