import type { AstmFieldDefinition, AstmRecordDefinition } from './types.js';

/*
 * The records of ASTM E1394-97 and CLSI LIS2-A2, which carries E1394 on
 * unchanged. Fields are numbered as the standard numbers them: the record
 * type ID is field 1, so P-2 is the patient record's sequence number and
 * H-2 the delimiter definition.
 *
 * The enums in record-fields/ name the same positions; a test keeps them in
 * step with this file.
 */

type Field = [
  type: string,
  desc: string,
  options?: { rep?: boolean; table?: string },
];

function record(desc: string, fields: Field[]): Readonly<AstmRecordDefinition> {
  const out: Record<string, AstmFieldDefinition> = {};
  fields.forEach(([type, fieldDesc, options], i) => {
    out[String(i + 1)] = Object.freeze({ type, desc: fieldDesc, ...options });
  });
  return Object.freeze({ desc, fields: Object.freeze(out) });
}

const RECORD_TYPE: Field = ['ST', 'Record Type ID'];
const SEQUENCE: Field = ['SI', 'Sequence Number'];

export const ASTM_RECORDS: Readonly<Record<string, AstmRecordDefinition>> =
  Object.freeze({
    H: record('Message Header', [
      RECORD_TYPE,
      ['ST', 'Delimiter Definition'],
      ['ST', 'Message Control ID'],
      ['ST', 'Access Password'],
      ['ST', 'Sender Name or ID'],
      ['AD', 'Sender Street Address'],
      ['ST', 'Reserved Field'],
      ['ST', 'Sender Telephone Number', { rep: true }],
      ['ST', 'Characteristics of Sender'],
      ['ST', 'Receiver ID'],
      ['ST', 'Comment or Special Instructions'],
      ['ID', 'Processing ID', { table: 'ProcessingID' }],
      ['ST', 'Version Number'],
      ['TS', 'Date and Time of Message'],
    ]),
    P: record('Patient Information', [
      RECORD_TYPE,
      SEQUENCE,
      ['ST', 'Practice Assigned Patient ID'],
      ['ST', 'Laboratory Assigned Patient ID'],
      ['ST', 'Patient ID No. 3'],
      ['PN', 'Patient Name'],
      ['ST', "Mother's Maiden Name"],
      ['TS', 'Birthdate'],
      ['ID', 'Patient Sex', { table: 'Sex' }],
      ['ST', 'Patient Race-Ethnic Origin'],
      ['AD', 'Patient Address'],
      ['ST', 'Reserved Field'],
      ['ST', 'Patient Telephone Number', { rep: true }],
      ['CN', 'Attending Physician ID', { rep: true }],
      ['ST', 'Special Field 1'],
      ['ST', 'Special Field 2'],
      ['CQ', 'Patient Height'],
      ['CQ', 'Patient Weight'],
      ['ST', "Patient's Known or Suspected Diagnosis", { rep: true }],
      ['ST', 'Patient Active Medications', { rep: true }],
      ['ST', "Patient's Diet"],
      ['ST', 'Practice Field No. 1'],
      ['ST', 'Practice Field No. 2'],
      ['TS', 'Admission and Discharge Dates', { rep: true }],
      ['ID', 'Admission Status', { table: 'AdmissionStatus' }],
      ['ST', 'Location'],
      ['ST', 'Nature of Alternative Diagnostic Code and Classifiers'],
      ['ST', 'Alternative Diagnostic Code and Classification', { rep: true }],
      ['ST', 'Patient Religion'],
      ['ID', 'Marital Status', { table: 'MaritalStatus' }],
      ['ST', 'Isolation Status', { rep: true }],
      ['ST', 'Language'],
      ['ST', 'Hospital Service'],
      ['ST', 'Hospital Institution'],
      ['ST', 'Dosage Category'],
    ]),
    O: record('Test Order', [
      RECORD_TYPE,
      SEQUENCE,
      ['ST', 'Specimen ID'],
      ['ST', 'Instrument Specimen ID'],
      ['UTI', 'Universal Test ID', { rep: true }],
      ['ID', 'Priority', { table: 'Priority' }],
      ['TS', 'Requested/Ordered Date and Time'],
      ['TS', 'Specimen Collection Date and Time'],
      ['TS', 'Collection End Time'],
      ['CQ', 'Collection Volume'],
      ['ST', 'Collector ID'],
      ['ID', 'Action Code', { table: 'ActionCode' }],
      ['ST', 'Danger Code'],
      ['ST', 'Relevant Clinical Information'],
      ['TS', 'Date/Time Specimen Received'],
      ['SPD', 'Specimen Descriptor'],
      ['CN', 'Ordering Physician'],
      ['ST', "Physician's Telephone Number"],
      ['ST', 'User Field No. 1'],
      ['ST', 'User Field No. 2'],
      ['ST', 'Laboratory Field No. 1'],
      ['ST', 'Laboratory Field No. 2'],
      ['TS', 'Date/Time Results Reported or Last Modified'],
      ['ST', 'Instrument Charge to Computer System'],
      ['ST', 'Instrument Section ID'],
      ['ID', 'Report Types', { table: 'ReportType' }],
      ['ST', 'Reserved Field'],
      ['ST', 'Location or Ward of Specimen Collection'],
      ['ST', 'Nosocomial Infection Flag'],
      ['ST', 'Specimen Service'],
      ['ST', 'Specimen Institution'],
    ]),
    R: record('Result', [
      RECORD_TYPE,
      SEQUENCE,
      ['UTI', 'Universal Test ID'],
      ['ST', 'Data or Measurement Value'],
      ['ST', 'Units'],
      ['ST', 'Reference Ranges'],
      ['ID', 'Result Abnormal Flags', { table: 'AbnormalFlag' }],
      ['ST', 'Nature of Abnormality Testing'],
      ['ID', 'Result Status', { table: 'ResultStatus' }],
      ['TS', 'Date of Change in Instrument Normative Values or Units'],
      ['ST', 'Operator Identification'],
      ['TS', 'Date/Time Test Started'],
      ['TS', 'Date/Time Test Completed'],
      ['ST', 'Instrument Identification'],
    ]),
    C: record('Comment', [
      RECORD_TYPE,
      SEQUENCE,
      ['ID', 'Comment Source', { table: 'CommentSource' }],
      ['ST', 'Comment Text', { rep: true }],
      ['ID', 'Comment Type', { table: 'CommentType' }],
    ]),
    Q: record('Request Information', [
      RECORD_TYPE,
      SEQUENCE,
      ['ST', 'Starting Range ID Number'],
      ['ST', 'Ending Range ID Number'],
      ['UTI', 'Universal Test ID', { rep: true }],
      ['ID', 'Nature of Request Time Limits', { table: 'RequestTimeLimits' }],
      ['TS', 'Beginning Request Results Date and Time'],
      ['TS', 'Ending Request Results Date and Time'],
      ['ST', 'Requesting Physician Name'],
      ['ST', 'Requesting Physician Telephone Number'],
      ['ST', 'User Field No. 1'],
      ['ST', 'User Field No. 2'],
      ['ID', 'Request Information Status Codes', { table: 'RequestStatus' }],
    ]),
    M: record('Manufacturer Information', [RECORD_TYPE, SEQUENCE]),
    S: record('Scientific', [
      RECORD_TYPE,
      SEQUENCE,
      ['ST', 'Analytical Method'],
      ['ST', 'Instrumentation'],
      ['ST', 'Reagents'],
      ['ST', 'Units of Measure'],
      ['ST', 'Quality Control'],
      ['ST', 'Specimen Descriptor'],
      ['ST', 'Reserved Field'],
      ['ST', 'Container'],
      ['ST', 'Specimen ID'],
      ['ST', 'Analyte'],
      ['ST', 'Result'],
      ['ST', 'Result Units'],
      ['TS', 'Collection Date and Time'],
      ['TS', 'Result Date and Time'],
      ['ST', 'Analytical Preprocessing Steps'],
      ['ST', 'Patient Diagnosis'],
      ['TS', 'Patient Birthdate'],
      ['ID', 'Patient Sex', { table: 'Sex' }],
      ['ST', 'Patient Race'],
    ]),
    L: record('Message Terminator', [
      RECORD_TYPE,
      SEQUENCE,
      ['ID', 'Termination Code', { table: 'TerminationCode' }],
    ]),
  });
