import assert from 'node:assert';
import * as api from '../src/index.js';

describe('@astm-e1394/core', () => {
  it('loads', () => {
    assert.ok(api);
  });
});
