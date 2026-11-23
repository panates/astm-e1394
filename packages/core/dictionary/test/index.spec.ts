import assert from 'node:assert';
import * as api from '../src/index.js';

describe('@astm-e1394/dictionary', () => {
  it('loads', () => {
    assert.ok(api);
  });
});
