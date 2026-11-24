import type { AstmTableDefinition } from '../types.js';

/*
 * The coded values ASTM E1394 lists for its fields, by table name (the
 * standard numbers none). A field names its table in its definition
 * (`table`); the enums in this directory give the same codes names.
 */

function table(
  desc: string,
  values: Record<string, string>,
): Readonly<AstmTableDefinition> {
  return Object.freeze({ desc, values: Object.freeze(values) });
}

export const ASTM_TABLES: Readonly<Record<string, AstmTableDefinition>> =
  Object.freeze({
    ProcessingID: table('Processing ID (H-12)', {
      P: 'Production',
      T: 'Training',
      D: 'Debugging',
      Q: 'Quality control',
    }),
    Sex: table('Patient sex (P-9, S-20)', {
      M: 'Male',
      F: 'Female',
      U: 'Unknown',
    }),
    AdmissionStatus: table('Admission status (P-25)', {
      OP: 'Outpatient',
      PR: 'Preadmit',
      IP: 'Inpatient',
      ER: 'Emergency room',
    }),
    MaritalStatus: table('Marital status (P-30)', {
      M: 'Married',
      S: 'Single',
      D: 'Divorced',
      W: 'Widowed',
      A: 'Separated',
    }),
    Priority: table('Priority (O-6)', {
      S: 'Stat',
      A: 'As soon as possible',
      R: 'Routine',
      C: 'Callback',
      P: 'Preoperative',
    }),
    ActionCode: table('Action code (O-12)', {
      C: 'Cancel request for the battery or tests named',
      A: 'Add the requested tests or batteries to the existing specimen',
      N: 'New requests accompanying a new specimen',
      P: 'Pending specimen',
      L: 'Reserved',
      X: 'Specimen or test already in process',
      Q: 'Treat specimen as a Q/C test specimen',
    }),
    ReportType: table('Report types (O-26)', {
      O: 'Order record; user asking that analysis be performed',
      C: 'Correction of previously transmitted results',
      P: 'Preliminary results',
      F: 'Final results',
      X: 'Results cannot be done, request cancelled',
      I: 'In instrument pending',
      Y: 'No order on record for this test',
      Z: 'No record of this patient',
      Q: 'Response to query',
    }),
    AbnormalFlag: table('Result abnormal flags (R-7)', {
      L: 'Below low normal',
      H: 'Above high normal',
      LL: 'Below panic normal',
      HH: 'Above panic normal',
      '<': 'Below absolute low, off low scale on an instrument',
      '>': 'Above absolute high, off high scale on an instrument',
      N: 'Normal',
      A: 'Abnormal',
      U: 'Significant change up',
      D: 'Significant change down',
      B: 'Better',
      W: 'Worse',
    }),
    ResultStatus: table('Result status (R-9)', {
      C: 'Correction of previously transmitted results',
      P: 'Preliminary results',
      F: 'Final results',
      X: 'Order cannot be done',
      I: 'In instrument, results pending',
      S: 'Partial results',
      M: 'MIC level',
      R: 'Result previously transmitted',
      N: 'Results that contain the necessary information to run a new order',
      Q: 'Response to an outstanding query',
      V: 'Operator verified or approved result',
      W: 'Warning: validity is questionable',
    }),
    CommentSource: table('Comment source (C-3)', {
      P: 'Practice',
      L: 'Information system',
      I: 'Clinical instrument system',
    }),
    CommentType: table('Comment type (C-5)', {
      G: 'Generic or free text comment',
      T: 'Test name comment',
      P: 'Positive test comment',
      N: 'Negative test comment',
      I: 'Instrument flag comment',
    }),
    RequestTimeLimits: table('Nature of request time limits (Q-6)', {
      S: 'Specimen collect date',
      R: 'Result test date',
    }),
    RequestStatus: table('Request information status codes (Q-13)', {
      C: 'Correction of previously transmitted results',
      P: 'Preliminary results',
      F: 'Final results',
      X: 'Results cannot be done, request cancelled',
      I: 'Request results pending',
      S: 'Request partial or unfinalized results',
      M: 'Result is an MIC level',
      R: 'Result previously transmitted',
      A: 'Abort or cancel last request criteria',
      N: 'Requesting new or edited results only',
      O: 'Requesting test orders and demographics only',
      D: 'Requesting demographics only',
    }),
    TerminationCode: table('Termination code (L-3)', {
      N: 'Normal termination',
      T: 'Sender aborted',
      R: 'Receiver requested abort',
      E: 'Unknown system error',
      Q: 'Error in last request for information',
      I: 'No information available from last query',
      F: 'Last request for information processed',
    }),
  });
