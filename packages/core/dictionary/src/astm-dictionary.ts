import { ASTM_RECORDS } from './astm-records.js';
import { ASTM_TYPES } from './astm-types.js';
import { ASTM_TABLES } from './tables/astm-tables.js';
import type {
  AstmDataTypeDefinition,
  AstmRecordDefinition,
  AstmTableDefinition,
} from './types.js';

/** A definition with every part optional, for merging over one */
export type DeepPartial<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * The definitions a message is read and written with: records, data types
 * and tables. The default one (`dictionary`) is ASTM E1394 / LIS2-A2 as the
 * standard defines it; an instrument's own fields and codes go into one made
 * with extend().
 */
export class AstmDictionary {
  records: Record<string, AstmRecordDefinition>;
  types: Record<string, AstmDataTypeDefinition>;
  tables: Record<string, AstmTableDefinition>;

  constructor(args?: {
    records?: Record<string, AstmRecordDefinition>;
    types?: Record<string, AstmDataTypeDefinition>;
    tables?: Record<string, AstmTableDefinition>;
  }) {
    this.records = args?.records || {};
    this.types = args?.types || {};
    this.tables = args?.tables || {};
  }

  /** The text of a code in a table: tableValue('Sex', 'F') is "Female" */
  tableValue(table: string, code: string): string | undefined {
    return this.tables[table]?.values[code];
  }

  /**
   * Creates a dictionary with this one's definitions, the given ones merged
   * over them - a manufacturer's fields of the M record, an instrument's own
   * result flags. Only what is given is copied - every other definition is
   * shared, unchanged, with this dictionary.
   */
  extend(args: {
    records?: Record<string, DeepPartial<AstmRecordDefinition>>;
    types?: Record<string, DeepPartial<AstmDataTypeDefinition>>;
    tables?: Record<string, DeepPartial<AstmTableDefinition>>;
  }): AstmDictionary {
    const dict = new AstmDictionary({
      records: { ...this.records },
      types: { ...this.types },
      tables: { ...this.tables },
    });
    if (args.records) overwrite(dict.records, args.records);
    if (args.types) overwrite(dict.types, args.types);
    if (args.tables) overwrite(dict.tables, args.tables);
    return dict;
  }
}

/**
 * Copy-on-write: a definition may be shared, frozen, by several
 * dictionaries, so the merge goes into a copy that then replaces it in this
 * dictionary alone.
 */
function overwrite(target: Record<string, any>, defs: Record<string, any>) {
  for (const [name, def] of Object.entries(defs)) {
    target[name] = merge(target[name], def);
  }
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function merge(base: unknown, over: unknown): any {
  if (!isPlainObject(over)) return over;
  const out: Record<string, any> = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(over)) {
    out[key] = merge(out[key], value);
  }
  return out;
}

/** ASTM E1394-97 / CLSI LIS2-A2 */
export const dictionary = new AstmDictionary({
  records: { ...ASTM_RECORDS },
  types: { ...ASTM_TYPES },
  tables: { ...ASTM_TABLES },
});
