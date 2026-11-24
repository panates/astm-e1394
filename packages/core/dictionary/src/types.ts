/** A record type: H, P, O, R, C, Q, M, S or L */
export interface AstmRecordDefinition {
  desc?: string;
  fields: Record<
    string, // field position, the record type ID being field 1
    AstmFieldDefinition
  >;
}

export interface AstmFieldDefinition {
  /** The data type: a key of AstmDictionary.types */
  type: string;
  desc?: string;
  /** Whether the field may repeat */
  rep?: boolean;
  /** The table its codes are from: a key of AstmDictionary.tables */
  table?: string;
  encode?: (v: any) => string;
  /**
   * Reads a value into what the library holds. `read` is true for a value
   * from ASTM text, which must be in ASTM's own format; false for one given
   * in code, which may be more (a Date, an ISO 8601 date/time).
   */
  decode?: (v: any, read?: boolean) => any;
}

export interface AstmDataTypeDefinition {
  desc?: string;
  /** The components of a composite type, by position from 1 */
  fields?: Record<string, AstmFieldDefinition>;
  encode?: (v: any) => string;
  /** See AstmFieldDefinition.decode */
  decode?: (v: any, read?: boolean) => any;
}

/** The values a coded field takes */
export interface AstmTableDefinition {
  desc?: string;
  /** Code: its text */
  values: Record<string, string>;
}
