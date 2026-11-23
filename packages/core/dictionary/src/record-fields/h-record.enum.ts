/** Field positions of the Message Header record (H) */
export enum HRecord {
  RecordTypeID = 1,
  DelimiterDefinition = 2,
  MessageControlID = 3,
  AccessPassword = 4,
  SenderNameOrID = 5,
  SenderStreetAddress = 6,
  ReservedField = 7,
  SenderTelephoneNumber = 8,
  CharacteristicsOfSender = 9,
  ReceiverID = 10,
  CommentOrSpecialInstructions = 11,
  ProcessingID = 12,
  VersionNumber = 13,
  DateAndTimeOfMessage = 14,
}
