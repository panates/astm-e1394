import { expect } from 'expect';
import { AstmMessage } from '../src/index.js';
import { resultMessage } from './fixtures.js';

describe('hierarchy', () => {
  it('builds the tree of records', () => {
    const tree = AstmMessage.parse(resultMessage).buildTree();
    expect(tree.recordType).toBe('H');
    expect(tree.children.map(n => n.recordType)).toEqual(['P', 'P', 'L']);
    const p1 = tree.getNode('P')!;
    const o1 = p1.getNode('O')!;
    expect(o1.getNodes('R').length).toBe(2);
    const r1 = o1.getNode('R')!;
    expect(r1.getNode('C')!.record.field(4).getValue()).toBe(
      'Sample hemolyzed\\slight',
    );
    expect(r1.getNode('C')!.parent).toBe(r1);
    expect(
      tree.getNode('P', 1)!.getNode('O')!.getRecord('R')!.field(4).getValue(),
    ).toBe('9.8');
  });

  it('gets and sets values by path', () => {
    const msg = AstmMessage.parse(resultMessage);
    expect(msg.get('R(1)-4')).toBe('135');
    expect(msg.get('/P(1)/O/R-4')).toBe('9.8');
    expect(msg.get('/P/O/R(1)-7')).toBe('H');
    expect(msg.get('O-5(1)-4')).toBe('CREA');
    expect(msg.get('P(5)-6')).toBeUndefined();
    expect(msg.getDate('R-12')).toEqual(new Date(2025, 0, 2, 10, 0, 0));
    msg.set('/P(1)/O/R-4', '10.1');
    expect(msg.get('R(2)-4')).toBe('10.1');
    msg.set('P-6-2', 'JIM');
    expect(msg.get('P-6')).toBe('DOE');
    expect(msg.get('P-6-2')).toBe('JIM');
    expect(() => msg.get('P-x')).toThrow(/Invalid path/);
    expect(() => msg.set('/P(3)-6', 'X')).toThrow(/no record/);
    expect(() => msg.set('P-1', 'X')).toThrow(/not a value/);
  });

  it('renumbers records by the hierarchy', () => {
    const msg = AstmMessage.parse(
      'H|\\^&\rP|5\rO|7\rR|9\rR|9\rC|4\rC|4\rO|1\rP|1\rO|1\rL|3\r',
    );
    msg.renumber();
    expect(msg.records.map(r => r.sequence)).toEqual([
      undefined,
      1,
      1,
      1,
      2,
      1,
      2,
      2,
      2,
      1,
      1,
    ]);
  });

  it('gives the message as an object and takes it back', () => {
    const msg = AstmMessage.parse(resultMessage);
    const obj = msg.toObject();
    expect(obj.H.ProcessingID).toBe('P');
    expect(obj.P.length).toBe(2);
    expect(obj.P[0].PatientName).toEqual({
      LastName: 'DOE',
      FirstName: 'JOHN',
      MiddleName: 'Q',
    });
    expect(obj.P[0].O[0].UniversalTestID).toEqual([
      { ManufacturerLocalCode: 'GLU' },
      { ManufacturerLocalCode: 'CREA' },
    ]);
    expect(obj.P[0].O[0].R[0].C[0].CommentText).toEqual([
      'Sample hemolyzed\\slight',
    ]);
    expect(obj.L).toEqual([{ TerminationCode: 'N' }]);
    const copy = new AstmMessage().assign(obj);
    expect(copy.toAstmString()).toBe(msg.toAstmString());
  });
});
