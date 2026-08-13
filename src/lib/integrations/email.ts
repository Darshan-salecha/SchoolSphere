export type EmailProvider = {
  send(to: string, subject: string, body: string): Promise<{ id: string; provider: string }>;
};

const mockProvider: EmailProvider = {
  async send(to, subject) {
    console.info(`[email:mock] -> ${to}: ${subject}`);
    return { id: `mock_${Date.now()}`, provider: 'mock' };
  },
};

const providers: Record<string, EmailProvider> = { mock: mockProvider };
export const emailProvider = () => providers[process.env.EMAIL_PROVIDER ?? 'mock'] ?? mockProvider;
export const sendEmail = (to: string, subject: string, body: string) => emailProvider().send(to, subject, body);
