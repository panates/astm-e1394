/** A result message of the shape instruments send: two patients, made-up data */
export const resultMessage = [
  'H|\\^&|||ANALYZER^1.0^SN123|||||LIS||P|LIS2-A2|20250102103000',
  'P|1||PAT001||DOE^JOHN^Q||19800215|M',
  'O|1|SPEC001||^^^GLU\\^^^CREA|R|20250102090000|||||N||||SERUM',
  'R|1|^^^GLU|5.4|mmol/L|3.9 to 6.1|N||F||OPER1|20250102100000|20250102101500|ANALYZER',
  'C|1|I|Sample hemolyzed&R&slight|G',
  'R|2|^^^CREA|135|umol/L|62 to 106|H||F',
  'P|2||PAT002||ROE^JANE',
  'O|1|SPEC002||^^^GLU|S',
  'R|1|^^^GLU|9.8|mmol/L||HH||F',
  'L|1|N',
].join('\r');
