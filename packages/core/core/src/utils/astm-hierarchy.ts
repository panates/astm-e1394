/*
 * The record hierarchy (ASTM E1394, "Message Logical Structure"):
 *
 *   level 0   H  header
 *   level 1   P  patient, Q request, S scientific, L terminator
 *   level 2   O  order, under a patient
 *   level 3   R  result, under an order
 *
 * C (comment) and M (manufacturer information) records annotate the
 * record before them, and belong to it; so does a record type the
 * standard does not define. A record's sequence number counts the records
 * of its type under the same parent, from 1: the first order of each
 * patient is O|1, the first comment of each result C|1.
 */

const LEVELS: Record<string, number> = {
  H: 0,
  P: 1,
  Q: 1,
  S: 1,
  L: 1,
  O: 2,
  R: 3,
};

/** The record's level, or undefined for one that annotates the record before it */
export function levelOf(recordType: string): number | undefined {
  return LEVELS[recordType];
}

/** The record type a record of this type belongs under, by the standard */
export function parentTypeOf(recordType: string): string | undefined {
  if (recordType === 'O') return 'P';
  if (recordType === 'R') return 'O';
  const level = levelOf(recordType);
  if (level === 1) return 'H';
}

/**
 * The parent of each record, by index: the index of the record it belongs
 * under, -1 for the header and for a record with no record to belong under
 */
export function parentsOf(types: string[]): number[] {
  const parents: number[] = [];
  /** The last record at each level */
  const open: number[] = [];
  /** The last record that is not an annotation */
  let last = -1;
  types.forEach((type, i) => {
    const level = levelOf(type);
    if (level === undefined) {
      parents.push(last);
      return;
    }
    let parent = -1;
    for (let l = level - 1; l >= 0; l--) {
      if (open[l] !== undefined) {
        parent = open[l];
        break;
      }
    }
    parents.push(parent);
    open[level] = i;
    open.length = level + 1;
    last = i;
  });
  return parents;
}

/**
 * The sequence number each record should have, by index: its count among
 * the records of its type under the same parent. Undefined for the header,
 * which has none.
 */
export function expectedSequences(types: string[]): (number | undefined)[] {
  const parents = parentsOf(types);
  const counts = new Map<string, number>();
  return types.map((type, i) => {
    if (type === 'H') return undefined;
    const key = parents[i] + ':' + type;
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return n;
  });
}
