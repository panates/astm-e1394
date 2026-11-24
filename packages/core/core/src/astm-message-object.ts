import type { AstmMessage } from './astm-message.js';
import type { AstmMessageNode } from './astm-message-node.js';

/*
 * A message as a plain object, shaped as its hierarchy is (see
 * AstmMessage.buildTree()):
 *
 *   {
 *     H: { SenderNameOrID: 'LIS', ... },
 *     P: [{ PatientName: { LastName: 'Doe' }, ...,
 *           O: [{ SpecimenID: '1001', ...,
 *                 R: [{ DataOrMeasurementValue: 4.5, ..., C: [{ ... }] }] }] }],
 *     L: [{ TerminationCode: 'N' }],
 *   }
 *
 * The header's fields are under "H"; every other record is in an array
 * under its type, in the record it belongs under - the header's children at
 * the top. Each record is AstmRecord.toObject(), which leaves its sequence
 * number out: the hierarchy gives it.
 */

const SEQUENCE = 'SequenceNumber';

function nodeToObject(node: AstmMessageNode): Record<string, any> {
  const out = node.record.toObject();
  delete out[SEQUENCE];
  delete out['2'];
  for (const child of node.children) {
    (out[child.recordType] ||= []).push(nodeToObject(child));
  }
  return out;
}

export function messageToObject(message: AstmMessage): Record<string, any> {
  const tree = message.buildTree();
  const out: Record<string, any> = { H: tree.record.toObject() };
  for (const child of tree.children) {
    (out[child.recordType] ||= []).push(nodeToObject(child));
  }
  return out;
}

/** Record types are keys of one capital letter, or a letter and digits */
const isRecordKey = (key: string) => /^[A-Z][A-Z0-9]*$/.test(key);

/**
 * Sets a message from an object shaped as messageToObject() makes it: the
 * header assigned, every other record replaced. Records are added as the
 * object lists them - each record before the ones under it - and numbered
 * by the hierarchy.
 */
export function assignMessage(
  message: AstmMessage,
  object: Record<string, any>,
): void {
  const header = message.header;
  for (const record of [...message.records]) {
    if (record !== header) message.removeRecord(record);
  }
  if (object.H) header.assign(object.H);
  const add = (obj: Record<string, any>) => {
    for (const [type, items] of Object.entries(obj)) {
      if (!isRecordKey(type) || type === 'H') continue;
      for (const item of Array.isArray(items) ? items : [items]) {
        const fields: Record<string, any> = {};
        for (const [k, v] of Object.entries(item || {})) {
          if (!isRecordKey(k)) fields[k] = v;
        }
        message.addRecord(type).assign(fields);
        add(item || {});
      }
    }
  };
  add(object);
  message.renumber();
}
