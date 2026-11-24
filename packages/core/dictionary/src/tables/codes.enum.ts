/* The codes of the tables in astm-tables.ts, by name */

export enum ProcessingID {
  Production = 'P',
  Training = 'T',
  Debugging = 'D',
  QualityControl = 'Q',
}

export enum Sex {
  Male = 'M',
  Female = 'F',
  Unknown = 'U',
}

export enum AdmissionStatus {
  Outpatient = 'OP',
  Preadmit = 'PR',
  Inpatient = 'IP',
  EmergencyRoom = 'ER',
}

export enum MaritalStatus {
  Married = 'M',
  Single = 'S',
  Divorced = 'D',
  Widowed = 'W',
  Separated = 'A',
}

export enum Priority {
  Stat = 'S',
  ASAP = 'A',
  Routine = 'R',
  Callback = 'C',
  Preoperative = 'P',
}

export enum ActionCode {
  Cancel = 'C',
  Add = 'A',
  New = 'N',
  Pending = 'P',
  Reserved = 'L',
  InProcess = 'X',
  QualityControl = 'Q',
}

export enum ReportType {
  Order = 'O',
  Correction = 'C',
  Preliminary = 'P',
  Final = 'F',
  Cancelled = 'X',
  InInstrumentPending = 'I',
  NoOrder = 'Y',
  NoPatient = 'Z',
  QueryResponse = 'Q',
}

export enum AbnormalFlag {
  Low = 'L',
  High = 'H',
  PanicLow = 'LL',
  PanicHigh = 'HH',
  BelowAbsoluteLow = '<',
  AboveAbsoluteHigh = '>',
  Normal = 'N',
  Abnormal = 'A',
  SignificantChangeUp = 'U',
  SignificantChangeDown = 'D',
  Better = 'B',
  Worse = 'W',
}

/** Nature of abnormality testing (R-8): any combination of these codes */
export enum NatureOfAbnormalityTesting {
  AgeBased = 'A',
  SexBased = 'S',
  RaceBased = 'R',
  Generic = 'N',
}

export enum ResultStatus {
  Correction = 'C',
  Preliminary = 'P',
  Final = 'F',
  Cancelled = 'X',
  InInstrumentPending = 'I',
  Partial = 'S',
  MICLevel = 'M',
  PreviouslyTransmitted = 'R',
  NewOrderInformation = 'N',
  QueryResponse = 'Q',
  OperatorVerified = 'V',
  Warning = 'W',
}

export enum CommentSource {
  Practice = 'P',
  InformationSystem = 'L',
  Instrument = 'I',
}

export enum CommentType {
  Generic = 'G',
  TestName = 'T',
  Positive = 'P',
  Negative = 'N',
  InstrumentFlag = 'I',
}

export enum RequestTimeLimits {
  SpecimenCollectDate = 'S',
  ResultTestDate = 'R',
}

export enum RequestStatus {
  Correction = 'C',
  Preliminary = 'P',
  Final = 'F',
  Cancelled = 'X',
  Pending = 'I',
  Partial = 'S',
  MICLevel = 'M',
  PreviouslyTransmitted = 'R',
  Abort = 'A',
  NewOnly = 'N',
  OrdersAndDemographics = 'O',
  DemographicsOnly = 'D',
}

export enum TerminationCode {
  Normal = 'N',
  SenderAborted = 'T',
  ReceiverAborted = 'R',
  SystemError = 'E',
  QueryError = 'Q',
  NoInformation = 'I',
  QueryProcessed = 'F',
}
