import type { AstmMessage } from './astm-message.js';
import type { AstmMessageNode } from './astm-message-node.js';
import type { AstmRecord } from './astm-record.js';

/**
 * A location in a message:
 *
 *   P-6-1            the first patient record, field 6, component 1
 *   R(2)-4           the third result record of the message, field 4
 *   O-5(1)-4         O-5's second repeat, component 4
 *   /P(1)/O/R(2)-4   through the hierarchy: the second patient's first
 *                    order's third result
 *
 * Field and component numbers count from 1, the record type ID being field
 * 1; numbers in parentheses (record and repeat indexes) count from 0. A path
 * starting with "/" goes through the hierarchy from the header; without it,
 * the record is searched in the whole message.
 */
export interface AstmPath {
  /** The records above the target, for a path through the hierarchy */
  parents: { recordType: string; index: number }[];
  recordType: string;
  recordIndex: number;
  /** Whether the path goes through the hierarchy */
  hierarchical: boolean;
  field?: number;
  repeat: number;
  component?: number;
}

const STEP = /^([A-Z][A-Z0-9]*)(?:\((\d+)\))?$/;
const TARGET =
  /^([A-Z][A-Z0-9]*)(?:\((\d+)\))?(?:-(\d+)(?:\((\d+)\))?(?:-(\d+))?)?$/;

export function parseAstmPath(path: string): AstmPath {
  const hierarchical = path.startsWith('/');
  const steps = (hierarchical ? path.substring(1) : path).split('/');
  const last = steps.pop()!;
  if (!hierarchical && steps.length) throw invalid(path);
  const parents = steps.map(step => {
    const m = STEP.exec(step);
    if (!m) throw invalid(path);
    return { recordType: m[1], index: m[2] ? Number(m[2]) : 0 };
  });
  const m = TARGET.exec(last);
  if (!m) throw invalid(path);
  const out: AstmPath = {
    parents,
    hierarchical,
    recordType: m[1],
    recordIndex: m[2] ? Number(m[2]) : 0,
    repeat: m[4] ? Number(m[4]) : 0,
  };
  if (m[3]) out.field = Number(m[3]);
  if (m[5]) out.component = Number(m[5]);
  if (out.field === 0 || out.component === 0) throw invalid(path);
  return out;
}

function invalid(path: string) {
  return new Error(`Invalid path "${path}"`);
}

/** The record a path names, or undefined when the message has none there */
export function findPathRecord(
  message: AstmMessage,
  path: AstmPath,
): AstmRecord | undefined {
  if (!path.hierarchical) {
    return message.getRecord(path.recordType, path.recordIndex);
  }
  let node: AstmMessageNode | undefined = message.buildTree();
  if (!node) return;
  for (const step of path.parents) {
    node = node.getNode(step.recordType, step.index);
    if (!node) return;
  }
  return node.getRecord(path.recordType, path.recordIndex);
}

export function getPathValue(message: AstmMessage, path: string): any {
  const p = parseAstmPath(path);
  const record = findPathRecord(message, p);
  if (!record) return;
  if (!p.field) return record;
  const field = record.fields[p.field - 1];
  return field?.repeats[p.repeat]?.getValue(p.component);
}

/**
 * Sets the value at a path. A record the message does not have is added
 * when the path names the next one of its type in the whole message (R(2)
 * when there are two); through the hierarchy, the record must be there.
 */
export function setPathValue(
  message: AstmMessage,
  path: string,
  value: any,
): void {
  const p = parseAstmPath(path);
  if (!p.field) throw new Error(`Path "${path}" names no field`);
  let record = findPathRecord(message, p);
  if (!record) {
    const count = message.records.filter(
      r => r.recordType === p.recordType,
    ).length;
    if (p.hierarchical || p.recordIndex !== count)
      throw new Error(`The message has no record at "${path}"`);
    record = message.addRecord(p.recordType);
  }
  if (p.field === 1 || (record.recordType === 'H' && p.field === 2))
    throw new Error(`"${path}" is not a value`);
  record.field(p.field).repeat(p.repeat).setValue(value, p.component);
}
