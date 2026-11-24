import type { AstmDictionary } from '@astm-e1394/dictionary';
import {
  dictionary as defaultDictionary,
  HRecord,
  parseAstmDateTime,
} from '@astm-e1394/dictionary';
import iconv from 'iconv-lite';
import { AstmError, AstmErrorCode } from './astm-error.js';
import { AstmMessageNode } from './astm-message-node.js';
import { assignMessage, messageToObject } from './astm-message-object.js';
import { getPathValue, setPathValue } from './astm-path.js';
import {
  AstmRecord,
  type AstmRecordParseOptions,
  type AstmRecordSerializeOptions,
} from './astm-record.js';
import { type AstmValidateOptions, validateMessage } from './astm-validator.js';
import {
  COMPONENT_DELIMITER,
  CR,
  ESCAPE_CHARACTER,
  FIELD_DELIMITER,
  LF,
  REPEAT_DELIMITER,
} from './constants.js';
import { expectedSequences, parentsOf } from './utils/astm-hierarchy.js';

/**
 * An ASTM E1394 message: the records from a header (H) to a terminator (L).
 * A new message holds a header with the standard delimiters and the time it
 * was made (H-14).
 */
export class AstmMessage {
  declare protected _records: AstmRecord[];
  protected _dictionary: AstmDictionary;
  fieldDelimiter: string = FIELD_DELIMITER;
  repeatDelimiter: string = REPEAT_DELIMITER;
  componentDelimiter: string = COMPONENT_DELIMITER;
  escapeCharacter: string = ESCAPE_CHARACTER;
  /**
   * The encoding a Buffer is read in and toBuffer() writes, and the bytes of
   * &Xhhhh& escape sequences are. The standard names none; instruments use
   * ASCII or a code page of their own. Default UTF-8, which reads ASCII.
   */
  encoding: string = 'utf8';

  constructor(dictionary?: AstmDictionary) {
    this._dictionary = dictionary || defaultDictionary;
    this.clear();
  }

  get dictionary(): AstmDictionary {
    return this._dictionary;
  }

  get records(): AstmRecord[] {
    return this._records;
  }

  /** The header record */
  get header(): AstmRecord {
    return this.getRecord('H')!;
  }

  /** Clears the message to a new header, with the standard delimiters */
  clear() {
    this._clear();
    this.addRecord('H')
      .field(HRecord.DateAndTimeOfMessage)
      .setValue(new Date());
  }

  /**
   * Adds a record, at the end or at an index. A record added at the end gets
   * its sequence number (field 2): the next one of its type under the same
   * parent (see renumber()).
   */
  addRecord(recordType: string, index?: number): AstmRecord {
    if (!/^[A-Z][A-Z0-9]*$/.test(recordType))
      throw new Error(`Invalid record type "${recordType}"`);
    const record = new AstmRecord(this, recordType);
    if (index !== undefined && index < this._records.length) {
      this._records.splice(index, 0, record);
      return record;
    }
    this._records.push(record);
    if (recordType !== 'H') {
      const seq = expectedSequences(this._records.map(r => r.recordType));
      record.field(2).setValue(seq[seq.length - 1]);
    }
    return record;
  }

  /** Removes a record */
  removeRecord(record: AstmRecord): void {
    const i = this._records.indexOf(record);
    if (i >= 0) this._records.splice(i, 1);
  }

  /**
   * A record of a type: the first, the one at an index from 0, or the one
   * after a given one
   */
  getRecord(
    recordType: string,
    indexOrAfter?: number | AstmRecord,
  ): AstmRecord | undefined {
    return pick(
      this._records.filter(r => r.recordType === recordType),
      indexOrAfter,
    );
  }

  /** A record of a type, counted from the last (see getRecord()) */
  getRecordFromLast(
    recordType: string,
    indexOrAfter?: number | AstmRecord,
  ): AstmRecord | undefined {
    return pick(
      this._records.filter(r => r.recordType === recordType).reverse(),
      indexOrAfter,
    );
  }

  /** The records of a type, in order */
  getRecords(recordType: string): AstmRecord[] {
    return this._records.filter(r => r.recordType === recordType);
  }

  /**
   * The value at a path - "P-6-1", "R(2)-4", "/P(1)/O/R-4" (see AstmPath).
   * A path with no field gives the record.
   */
  get(path: string): any {
    return getPathValue(this, path);
  }

  /** The value at a path as a Date, read as local time */
  getDate(path: string): Date | undefined {
    const v = this.get(path);
    if (v == null || v === '') return;
    if (v instanceof Date) return v;
    return parseAstmDateTime(String(v));
  }

  /** Sets the value at a path (see get() and AstmPath) */
  set(path: string, value: any): this {
    setPathValue(this, path, value);
    return this;
  }

  /**
   * The records in their hierarchy, from the header: patients under it,
   * orders under their patient, results under their order, comments under
   * the record before them (see utils/astm-hierarchy.ts). A record with no
   * record to belong under - an order before any patient - goes under the
   * header.
   */
  buildTree(): AstmMessageNode {
    const records = this._records;
    const parents = parentsOf(records.map(r => r.recordType));
    const root = new AstmMessageNode(records[0]);
    const nodes: AstmMessageNode[] = [root];
    for (let i = 1; i < records.length; i++) {
      const parent = nodes[parents[i]] || root;
      const node = new AstmMessageNode(records[i], parent);
      parent.children.push(node);
      nodes.push(node);
    }
    return root;
  }

  /**
   * Sets every record's sequence number (field 2) to its count among the
   * records of its type under the same parent
   */
  renumber(): this {
    const seq = expectedSequences(this._records.map(r => r.recordType));
    this._records.forEach((record, i) => {
      if (seq[i] !== undefined) record.field(2).setValue(seq[i]);
    });
    return this;
  }

  /**
   * The message as a plain object, shaped as its hierarchy is: the header's
   * fields under "H", every other record in an array under its type, in the
   * record it belongs under (see astm-message-object.ts)
   */
  toObject(): Record<string, any> {
    return messageToObject(this);
  }

  /** Sets the message from an object shaped as toObject() gives it */
  assign(object: Record<string, any>): this {
    assignMessage(this, object);
    return this;
  }

  /**
   * Checks the message against the standard and its dictionary, and returns
   * the problems found; an empty list when there are none (see
   * AstmValidateOptions)
   */
  validate(options?: AstmValidateOptions): AstmError[] {
    return validateMessage(this, options);
  }

  /**
   * The message as ASTM text: each record ended by a CR, or by the
   * `recordTerminator` given
   */
  toAstmString(options?: AstmMessageSerializeOptions): string {
    const end = options?.recordTerminator ?? CR;
    return this._records.map(r => r.toAstmString(options) + end).join('');
  }

  /** The message as ASTM text, encoded in the message's encoding */
  toBuffer(options?: AstmMessageSerializeOptions): Buffer {
    return iconv.encode(this.toAstmString(options), this.encoding);
  }

  /** Reads a message, replacing this one's records (see AstmMessage.parse()) */
  parse(input: string | Buffer, options?: AstmMessageParseOptions) {
    if (options?.encoding) this.encoding = options.encoding;
    const text = Buffer.isBuffer(input)
      ? iconv.decode(input, this.encoding)
      : String(input);
    this._clear();
    const lines = splitRecords(text);
    const first = lines.findIndex(l => l.text);
    const header = first >= 0 ? lines[first] : undefined;
    if (!header || header.text[0] !== 'H' || header.text.length < 5) {
      throw new AstmError('A message must start with a header record (H)', {
        code: AstmErrorCode.InvalidMessage,
        line: header?.line ?? 1,
      });
    }
    const h = header.text;
    this.fieldDelimiter = h[1];
    this.repeatDelimiter = h[2];
    this.componentDelimiter = h[3];
    this.escapeCharacter = h[4];
    for (const { text: line, line: n } of lines.slice(first)) {
      if (!line) continue;
      if (line[0] === 'H' && this._records.length) {
        throw new AstmError(
          'The input holds more than one message: read it with AstmMessage.parseAll()',
          { code: AstmErrorCode.InvalidMessage, line: n },
        );
      }
      try {
        this._records.push(AstmRecord.parse(this, line, options));
      } catch (e: any) {
        const err = e instanceof AstmError ? e : new AstmError(e.message);
        if (e !== err) err.stack = e.stack;
        err.line = n;
        err.recordIndex = this._records.length;
        throw err;
      }
    }
  }

  protected _clear() {
    this._records = [];
    this.fieldDelimiter = FIELD_DELIMITER;
    this.repeatDelimiter = REPEAT_DELIMITER;
    this.componentDelimiter = COMPONENT_DELIMITER;
    this.escapeCharacter = ESCAPE_CHARACTER;
  }

  /**
   * Reads a message from ASTM text. Records end with a CR; a message with
   * no CR at all is read as ended by LF, and a LF after a CR is dropped.
   * The delimiters are the ones the header declares.
   */
  static parse(
    input: string | Buffer,
    options?: AstmMessageParseOptions,
  ): AstmMessage {
    const message = new AstmMessage(options?.dictionary);
    message.parse(input, options);
    return message;
  }

  /** Reads every message of an input that holds several, each from its header */
  static parseAll(
    input: string | Buffer,
    options?: AstmMessageParseOptions,
  ): AstmMessage[] {
    const text = Buffer.isBuffer(input)
      ? iconv.decode(input, options?.encoding || 'utf8')
      : String(input);
    const chunks: string[] = [];
    for (const { text: line } of splitRecords(text)) {
      if (!line) continue;
      if (line[0] === 'H' || !chunks.length) chunks.push('');
      chunks[chunks.length - 1] += line + CR;
    }
    return chunks.map(chunk => AstmMessage.parse(chunk, options));
  }
}

export interface AstmMessageParseOptions extends AstmRecordParseOptions {
  dictionary?: AstmDictionary;
  /** The encoding a Buffer is read in (see AstmMessage.encoding) */
  encoding?: string;
}

export interface AstmMessageSerializeOptions extends AstmRecordSerializeOptions {
  /** What ends each record. Default CR, as the standard has it. */
  recordTerminator?: string;
}

function splitRecords(text: string): { text: string; line: number }[] {
  const parts = text.includes(CR)
    ? text.replaceAll(CR + LF, CR).split(CR)
    : text.split(LF);
  return parts.map((t, i) => ({ text: t, line: i + 1 }));
}

function pick<T>(items: T[], indexOrAfter?: number | T): T | undefined {
  if (indexOrAfter == null) return items[0];
  if (typeof indexOrAfter === 'number') return items[indexOrAfter];
  const i = items.indexOf(indexOrAfter);
  return i < 0 ? undefined : items[i + 1];
}
