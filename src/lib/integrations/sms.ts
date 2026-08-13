export type SmsProvider = { send(to: string, message: string): Promise<{ id: string; provider: string }> };

const mockProvider: SmsProvider = {
  async send(to, message) {
    // Swap STORAGE/SMS_PROVIDER env for a real gateway; core code never changes.
    console.info(`[sms:mock] -> ${to}: ${message}`);
    return { id: `mock_${Date.now()}`, provider: 'mock' };
  },
};

const providers: Record<string, SmsProvider> = { mock: mockProvider };

export function smsProvider(): SmsProvider {
  return providers[process.env.SMS_PROVIDER ?? 'mock'] ?? mockProvider;
}
export const sendSms = (to: string, message: string) => smsProvider().send(to, message);
