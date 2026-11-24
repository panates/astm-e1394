/*
 * ASTM E1394 date and time values: YYYYMMDD for a date, YYYYMMDDHHMMSS for
 * a date and time, read with the trailing parts left out
 * (YYYYMMDDHHMM). The standard has no time zone: a time is the sender's
 * local time, taken to be ours.
 *
 * A value read from a message is kept as written - its precision is part of
 * it - and only checked. A Date is written in local time.
 */

const DT = /^(\d{4})(\d{2})(\d{2})$/;
const TS = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function checkParts(
  value: string,
  month: string,
  day: string,
  hour?: string,
  minute?: string,
  second?: string,
  what = 'date/time',
) {
  const bad =
    +month < 1 ||
    +month > 12 ||
    +day < 1 ||
    +day > 31 ||
    (hour && +hour > 23) ||
    (minute && +minute > 59) ||
    (second && +second > 59);
  if (bad) throw new TypeError(`Value "${value}" is not a valid ASTM ${what}`);
}

/**
 * A Date, or an ISO 8601 string (2025-01-02T03:04:05Z) given in code, as a
 * Date; undefined for an ASTM value - and ASTM text read is never taken as
 * ISO
 */
function asDate(value: Date | string, read?: boolean): Date | undefined {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new TypeError('Invalid Date');
    return value;
  }
  if (!read && /^\d{4}-\d{2}/.test(String(value).trim())) {
    const d = new Date(String(value).trim());
    if (isNaN(d.getTime())) {
      throw new TypeError(`Value "${value}" is not a valid date`);
    }
    return d;
  }
}

/** A Date as an ASTM date and time, in local time: 20250102060405 */
export function formatAstmDateTime(date: Date): string {
  return (
    formatAstmDate(date) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/** A Date as an ASTM date, its local date: 20250102 */
export function formatAstmDate(date: Date): string {
  return (
    pad(date.getFullYear(), 4) + pad(date.getMonth() + 1) + pad(date.getDate())
  );
}

/**
 * An ASTM date, or date and time, as a Date in local time. Missing parts
 * are their lowest: "202501021230" is 12:30:00.
 */
export function parseAstmDateTime(value: string): Date {
  const v = value.trim();
  const m = TS.exec(v);
  if (!m) throw new TypeError(`Value "${value}" is not a valid ASTM date/time`);
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  checkParts(v, mo, d, h, mi, s);
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Date and time: a value read is kept as written once checked; a Date is formatted */
export function toAstmDateTime(value: Date | string, read?: boolean): string {
  const date = asDate(value, read);
  if (date) return formatAstmDateTime(date);
  const v = String(value).trim();
  const m = TS.exec(v);
  if (!m) throw new TypeError(`Value "${value}" is not a valid ASTM date/time`);
  checkParts(v, m[2], m[3], m[4], m[5], m[6]);
  return v;
}

/** Date: a value read is kept as written once checked; a Date is formatted */
export function toAstmDate(value: Date | string, read?: boolean): string {
  const date = asDate(value, read);
  if (date) return formatAstmDate(date);
  const v = String(value).trim();
  const m = DT.exec(v);
  if (!m) throw new TypeError(`Value "${value}" is not a valid ASTM date`);
  checkParts(v, m[2], m[3], undefined, undefined, undefined, 'date');
  return v;
}
