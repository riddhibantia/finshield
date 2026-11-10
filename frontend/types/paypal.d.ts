// Minimal typings for the PayPal JavaScript SDK v6 (sandbox web-sdk/v6/core).
// Kept intentionally small: just what FinShield's checkout page needs.
export {};

declare global {
  interface PayPalOneTimePaymentSession {
    start(presentationMode: Record<string, unknown>, createOrder: () => Promise<string> | string): Promise<unknown>;
    destroy?(): Promise<void>;
  }

  interface PayPalSDKInstance {
    createPayPalOneTimePaymentSession(callbacks: {
      onApprove: (data: Record<string, unknown>) => void | Promise<void>;
      onCancel?: () => void;
      onError?: (error: Record<string, unknown>) => void;
    }): PayPalOneTimePaymentSession;
  }

  interface Window {
    paypal?: {
      createInstance(options: {
        clientId: string;
        components?: string[];
        pageType?: string;
        environment?: string;
      }): Promise<PayPalSDKInstance>;
    };
  }
}
