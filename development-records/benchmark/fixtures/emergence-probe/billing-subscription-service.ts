// Subscription & billing service.
// NOTE: mixes subscription lifecycle, order capture, and invoicing concerns —
// the "primary purpose" is intentionally not declared anywhere in one place.

export type SubscriptionState =
  | "trial"
  | "active"
  | "past_due"
  | "canceled";

export interface Customer {
  customerId: string;
  email: string;
  // role gates which billing actions are permitted; enforced elsewhere (see admin tooling).
  role: "owner" | "billing_admin" | "viewer";
}

export interface Subscription {
  subscriptionId: string;
  customerId: string;
  planId: string;
  state: SubscriptionState;
  currentPeriodEnd: string; // ISO date
}

export interface Invoice {
  invoiceId: string;
  subscriptionId: string;
  amountCents: number;
  status: "draft" | "open" | "paid" | "void";
}

// External payment gateway — only a stub here; the real capture happens in an
// out-of-process worker, so this module cannot observe the actual settlement.
export interface PaymentGateway {
  capture(invoiceId: string, amountCents: number): Promise<{ ok: boolean }>;
}

export class BillingService {
  constructor(
    private readonly subscriptions: Map<string, Subscription>,
    private readonly invoices: Map<string, Invoice>,
    private readonly gateway: PaymentGateway,
  ) {}

  // Transition: trial/active -> active on successful renewal.
  // Dunning (past_due handling) is referenced in the spec but NOT implemented here.
  async renew(subscriptionId: string): Promise<Subscription> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error("unknown subscription");
    // TODO: generate invoice, capture payment, advance currentPeriodEnd.
    // Currently just flips state — period math is unresolved.
    sub.state = "active";
    return sub;
  }

  // Order capture path: creates an open invoice for the subscription's plan.
  generateInvoice(subscriptionId: string, amountCents: number): Invoice {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error("unknown subscription");
    const invoice: Invoice = {
      invoiceId: `inv_${subscriptionId}`,
      subscriptionId,
      amountCents,
      status: "open",
    };
    this.invoices.set(invoice.invoiceId, invoice);
    return invoice;
  }

  // Marks invoice paid IF the gateway reports ok. The gateway result is trusted
  // without reconciliation against a settlement record.
  async capturePayment(invoiceId: string): Promise<Invoice> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error("unknown invoice");
    const result = await this.gateway.capture(invoiceId, invoice.amountCents);
    if (result.ok) invoice.status = "paid";
    return invoice;
  }

  // Cancel is terminal. Whether past_due subscriptions may cancel directly is
  // left ambiguous (no guard here).
  cancel(subscriptionId: string): Subscription {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error("unknown subscription");
    sub.state = "canceled";
    return sub;
  }
}
