/** What an AstmError is about: parsing and validate() report these */
export enum AstmErrorCode {
  /** The message does not start with a header record, or is not one message */
  InvalidMessage = 'INVALID_MESSAGE',
  /** A record type the dictionary does not define */
  UnknownRecord = 'UNKNOWN_RECORD',
  /** A record where the hierarchy has no place for it: R with no O before it */
  RecordOutOfPlace = 'RECORD_OUT_OF_PLACE',
  /** A sequence number missing or not the next one */
  SequenceNumber = 'SEQUENCE_NUMBER',
  /** No terminator record (L) at the end */
  MissingTerminator = 'MISSING_TERMINATOR',
  /** A value its data type cannot read */
  DataType = 'DATA_TYPE',
  /** A field repeated that may not repeat */
  Repeat = 'REPEAT',
  /** A code its table does not have */
  TableValue = 'TABLE_VALUE',
}

export class AstmError extends Error {
  code?: AstmErrorCode;
  /** The line of the message, from 1, for an error found while parsing */
  line?: number;
  recordType?: string;
  /** The record's position among the message's records, from 0 */
  recordIndex?: number;
  fieldPosition?: number;
  repeatIndex?: number;
  componentPosition?: number;

  constructor(message: string, args?: AstmError.ErrorArgs) {
    super(message);
    this.name = 'AstmError';
    if (args?.code) this.code = args.code;
    if (args?.line != null) this.line = args.line;
    if (args?.recordType) this.recordType = args.recordType;
    if (args?.recordIndex != null) this.recordIndex = args.recordIndex;
    if (args?.fieldPosition != null) this.fieldPosition = args.fieldPosition;
    if (args?.repeatIndex != null) this.repeatIndex = args.repeatIndex;
    if (args?.componentPosition != null)
      this.componentPosition = args.componentPosition;
  }
}

export namespace AstmError {
  export interface ErrorArgs {
    code?: AstmErrorCode;
    line?: number;
    recordType?: string;
    recordIndex?: number;
    fieldPosition?: number;
    repeatIndex?: number;
    componentPosition?: number;
  }
}
