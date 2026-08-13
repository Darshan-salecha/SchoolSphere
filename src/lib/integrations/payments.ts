export type PaymentIntent = { id: string; provider: string; amount: number; status: string; redirectUrl?: string };

export type PaymentProvider = {
  createIntent(input: { amount: number; currency: string; reference: string }): Promise<PaymentIntent>;
  capture(intentId: string): Promise<{ status: 'SUCCESS' | 'FAILED'; providerRef: string }>;
};

const mockProvider: PaymentProvider = {
  async createIntent({ amount, reference }) {
    return { id: `mock_${reference}_${Date.now()}`, provider: 'mock', amount, status: 'REQUIRES_CONFIRMATION' };
  },
  async capture(intentId) {
    return { status: 'SUCCESS', providerRef: intentId };
  },
};

const providers: Record<string, PaymentProvider> = { mock: mockProvider };
export const paymentProvider = () => providers[process.env.PAYMENT_PROVIDER ?? 'mock'] ?? mockProvider;
