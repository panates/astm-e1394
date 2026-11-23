import type { AstmRecord } from './astm-record.js';

/**
 * A record in the message's hierarchy, with the records that belong under
 * it: a patient's orders and comments, an order's results (see
 * AstmMessage.buildTree()).
 */
export class AstmMessageNode {
  readonly record: AstmRecord;
  readonly children: AstmMessageNode[] = [];
  parent?: AstmMessageNode;

  constructor(record: AstmRecord, parent?: AstmMessageNode) {
    this.record = record;
    this.parent = parent;
  }

  get recordType(): string {
    return this.record.recordType;
  }

  /** The child records of a type, in order */
  getNodes(recordType: string): AstmMessageNode[] {
    return this.children.filter(n => n.recordType === recordType);
  }

  /**
   * A child record of a type: the first, the one at an index from 0, or the
   * one after a given one
   */
  getNode(
    recordType: string,
    indexOrAfter?: number | AstmMessageNode,
  ): AstmMessageNode | undefined {
    const nodes = this.getNodes(recordType);
    if (indexOrAfter == null) return nodes[0];
    if (typeof indexOrAfter === 'number') return nodes[indexOrAfter];
    const i = nodes.indexOf(indexOrAfter);
    return i < 0 ? undefined : nodes[i + 1];
  }

  /** The record of a child node (see getNode()) */
  getRecord(
    recordType: string,
    indexOrAfter?: number | AstmMessageNode,
  ): AstmRecord | undefined {
    return this.getNode(recordType, indexOrAfter)?.record;
  }
}
