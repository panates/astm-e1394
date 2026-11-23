# @astm-e1394/dictionary

Record and field definitions of ASTM E1394 (LIS2-A2).

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/@astm-e1394/dictionary
[npm-url]: https://npmjs.org/package/@astm-e1394/dictionary
[downloads-image]: https://img.shields.io/npm/dm/@astm-e1394/dictionary.svg
[downloads-url]: https://npmjs.org/package/@astm-e1394/dictionary
[ci-test-image]: https://github.com/panates/astm-e1394/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/astm-e1394/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/astm-e1394/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/astm-e1394

## Install

```bash
npm install @astm-e1394/dictionary
```

`@astm-e1394/core` installs it and exports everything it has.

## Contents

- Record definitions of ASTM E1394-97 / CLSI LIS2-A2: H, P, O, R, C, Q, M, S and L, with each field's data type, whether it repeats, and the table of its codes.
- Enums of field positions (`PRecord.PatientName` is 6) and component positions (`PNType.FirstName` is 2).
- Code tables and their enums (`Priority.Stat` is `S`).
- Date, date/time and number codecs.

An instrument's own fields and codes go into a dictionary made with `extend()`:

```typescript
import { dictionary } from '@astm-e1394/dictionary';

const ours = dictionary.extend({
  records: { M: { fields: { '3': { type: 'ST', desc: 'Reagent lot' } } } },
  tables: { AbnormalFlag: { values: { '*': 'Instrument flag' } } },
});
```

## License

[MIT](https://github.com/panates/astm-e1394/blob/main/LICENSE)
