# @astm-e1394/core

Parses, builds and serializes ASTM E1394 (LIS2-A2) messages and records.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/@astm-e1394/core
[npm-url]: https://npmjs.org/package/@astm-e1394/core
[downloads-image]: https://img.shields.io/npm/dm/@astm-e1394/core.svg
[downloads-url]: https://npmjs.org/package/@astm-e1394/core
[ci-test-image]: https://github.com/panates/astm-e1394/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/astm-e1394/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/astm-e1394/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/astm-e1394

## Install

```bash
npm install @astm-e1394/core
```

## Usage

```typescript
import { AstmMessage, PRecord, RRecord } from '@astm-e1394/core';

const msg = AstmMessage.parse(text);

msg.get('P-6-1'); // the first patient's last name
msg.get('/P(1)/O/R(2)-4'); // the second patient's first order's third result

for (const r of msg.getRecords('R')) {
  console.log(r.field(RRecord.UniversalTestID).getValue(4), r.field(RRecord.DataOrMeasurementValue).getValue());
}

const errors = msg.validate();
```

Building a message numbers its records as the hierarchy has them:

```typescript
const msg = new AstmMessage();
msg.addRecord('P').field(PRecord.PatientName).setValue('DOE', 1);
msg.addRecord('O'); // O|1, under the patient
msg.addRecord('L').field(3).setValue('N');
msg.toAstmString(); // records ended by CR
```

- Fields are numbered as the standard numbers them: the record type ID is field 1, so `P-2` is the patient's sequence number.
- A message is read in the delimiters its header declares, and written back in them.
- `buildTree()` gives the records in their hierarchy: patients under the header, orders under their patient, results under their order, comments under the record before them.
- `toObject()` and `assign()` give and take the message as a plain object shaped as that hierarchy.
- `AstmMessage.parseAll()` reads input that holds several messages.
- A Buffer is read in `options.encoding` (UTF-8 by default); the standard names no character set.
