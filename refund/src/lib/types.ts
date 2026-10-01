export interface NormalizedEmail {
  from: string;
  subject: string;
  html: string;
  text: string;
  receivedAt: string;
  providerMsgId?: string;
}
