import iconv from 'iconv-lite';
import {
  COMPONENT_DELIMITER,
  ESCAPE_CHARACTER,
  FIELD_DELIMITER,
  REPEAT_DELIMITER,
} from '../constants.js';

/*
 * Escape sequences (ASTM E1394, "Escape Delimiter"):
 *
 * - &F& &S& &R& &E& stand for the field, component, repeat delimiters and
 *   the escape character itself.
 * - &Xhhhh& is hexadecimal data: bytes, in the message's encoding. Control
 *   characters are written this way: a raw CR would end the record.
 * - &Zcccc& is a locally defined sequence, an instruction to the receiver:
 *   kept as it is, and written back unchanged.
 * - Any other sequence is text, kept as written: instruments send a lone
 *   escape character as text often enough.
 */

/** The delimiters a value is escaped and read with */
export interface AstmDelimiters {
  fieldDelimiter: string;
  repeatDelimiter: string;
  componentDelimiter: string;
  escapeCharacter: string;
  /** The encoding &Xhhhh& bytes are read and written in. Default UTF-8. */
  encoding?: string;
}

const STANDARD: AstmDelimiters = {
  fieldDelimiter: FIELD_DELIMITER,
  repeatDelimiter: REPEAT_DELIMITER,
  componentDelimiter: COMPONENT_DELIMITER,
  escapeCharacter: ESCAPE_CHARACTER,
};

/** A value written in a message: delimiters and control characters escaped */
export function astmEscape(
  value: string,
  delimiters: AstmDelimiters = STANDARD,
): string {
  const d = delimiters;
  const e = d.escapeCharacter;
  const codes: Record<string, string> = {
    [d.fieldDelimiter]: 'F',
    [d.componentDelimiter]: 'S',
    [d.repeatDelimiter]: 'R',
    [e]: 'E',
  };
  const local = `${escapeRegExp(e)}Z[^${escapeRegExp(stopsOf(d))}\\r\\n]*${escapeRegExp(e)}`;
  const pattern = new RegExp(
    `(${local})|([${Object.keys(codes).map(escapeRegExp).join('')}])|([\\x00-\\x08\\x0A-\\x1F\\x7F])`,
    'g',
  );
  return String(value).replace(pattern, (x, preserved, delimiter) => {
    if (preserved) return preserved;
    if (delimiter) return e + codes[delimiter] + e;
    const hex = iconv
      .encode(x, d.encoding || 'utf8')
      .toString('hex')
      .toUpperCase();
    return e + 'X' + hex + e;
  });
}

/** A value read from a message, its escape sequences resolved */
export function astmUnescape(
  value: string,
  delimiters: AstmDelimiters = STANDARD,
): string {
  const d = delimiters;
  const e = escapeRegExp(d.escapeCharacter);
  return value.replace(
    new RegExp(`${e}([^${escapeRegExp(stopsOf(d))}\\r\\n]*)${e}`, 'g'),
    (item, s: string) => {
      if (s === 'F') return d.fieldDelimiter;
      if (s === 'S') return d.componentDelimiter;
      if (s === 'R') return d.repeatDelimiter;
      if (s === 'E') return d.escapeCharacter;
      if (/^X([0-9a-f]{2})+$/i.test(s)) {
        return iconv.decode(
          Buffer.from(s.substring(1), 'hex'),
          d.encoding || 'utf8',
        );
      }
      return item;
    },
  );
}

/** Characters an escape sequence never holds */
function stopsOf(d: AstmDelimiters): string {
  return (
    d.escapeCharacter +
    d.fieldDelimiter +
    d.componentDelimiter +
    d.repeatDelimiter
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&');
}
