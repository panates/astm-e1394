import * as dictionary from '@astm-e1394/dictionary';
import type { AstmRecord } from './astm-record.js';
import type { AstmRepeat } from './astm-repeat.js';

/*
 * A record as a plain object, keyed by the field enums' member names
 * (PRecord.PatientName -> "PatientName"); a composite value is an object
 * keyed by its type's (PNType.LastName -> "LastName"). A field that may
 * repeat is an array. Empty values are left out; the standard's null ("")
 * is null. A position no enum names (a manufacturer's field) is keyed by
 * its number, and so is a component of a field whose type has none.
 *
 * The record type ID (field 1) and the header's delimiter definition (H-2)
 * are not values, and are left out.
 */

type Names = Record<number | string, string | number> | undefined;

const enumOf = (name: string): Names => (dictionary as any)[name];

function nameOf(names: Names, pos: number): string {
  const n = names?.[pos];
  return typeof n === 'string' ? n : String(pos);
}

function positionOf(names: Names, key: string): number {
  const n = names?.[key];
  if (typeof n === 'number') return n;
  const pos = Number(key);
  if (Number.isInteger(pos) && pos > 0) return pos;
  throw new Error(`Unknown field or component "${key}"`);
}

const firstPosition = (record: AstmRecord) =>
  record.recordType === 'H' ? 3 : 2;

function repeatValue(rep: AstmRepeat): unknown {
  const components = rep.components;
  if (!rep.field.isComposite && components.length <= 1) {
    return components[0]?.getValue();
  }
  const names = rep.field.isComposite
    ? enumOf(`${rep.field.definition.type}Type`)
    : undefined;
  const out: Record<string, unknown> = {};
  components.forEach((component, i) => {
    if (component && !component.isEmpty())
      out[nameOf(names, i + 1)] = component.getValue();
  });
  return Object.keys(out).length ? out : undefined;
}

export function recordToObject(record: AstmRecord): Record<string, any> {
  const names = enumOf(`${record.recordType}Record`);
  const out: Record<string, any> = {};
  record.fields.forEach((field, i) => {
    if (!field || i + 1 < firstPosition(record)) return;
    if (field.toAstmString() === '""') {
      out[nameOf(names, i + 1)] = null;
      return;
    }
    if (field.isEmpty()) return;
    const values = field.repeats.map(repeatValue);
    const value = field.definition.rep
      ? values.filter(v => v !== undefined)
      : values[0];
    if (value === undefined) return;
    out[nameOf(names, i + 1)] = value;
  });
  return out;
}

/**
 * Sets a record's fields from an object shaped as recordToObject() makes
 * it. A field given is replaced; one not given is kept; null writes the
 * standard's null (""), undefined clears the field.
 */
export function assignRecord(
  record: AstmRecord,
  object: Record<string, any>,
): void {
  const names = enumOf(`${record.recordType}Record`);
  for (const [key, value] of Object.entries(object)) {
    const pos = positionOf(names, key);
    if (pos < firstPosition(record)) continue;
    const field = record.field(pos);
    field.clear();
    if (value === undefined) continue;
    const reps = Array.isArray(value) ? value : [value];
    const typeNames = enumOf(`${field.definition.type}Type`);
    reps.forEach((repValue, r) => {
      const rep = field.repeat(r);
      if (
        repValue === null ||
        typeof repValue !== 'object' ||
        repValue instanceof Date
      ) {
        rep.setValue(repValue);
        return;
      }
      for (const [cKey, cValue] of Object.entries(repValue)) {
        rep.component(positionOf(typeNames, cKey)).setValue(cValue);
      }
    });
  }
}
