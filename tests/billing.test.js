import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { create: vi.fn() },
    user: { update: vi.fn() },
  },
}));

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { BillingService } from "@/lib/services/billing";

describe("BillingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCheckoutSession", () => {
    it("rejects invalid plan ids", async () => {
      await expect(
        BillingService.createCheckoutSession("u1", "not-a-plan"),
      ).rejects.toThrow("Invalid plan");
    });

    it("creates a checkout session with plan-derived credits in metadata", async () => {
      stripe.checkout.sessions.create.mockResolvedValue({
        url: "https://checkout.stripe.com/test",
      });
      const url = await BillingService.createCheckoutSession("u1", "pro");
      expect(url).toBe("https://checkout.stripe.com/test");

      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.metadata.userId).toBe("u1");
      expect(call.metadata.credits).toBe("600");
      expect(call.line_items[0].price_data.unit_amount).toBe(2000);
    });
  });

  describe("handleWebhook", () => {
    const makeEvent = () => ({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          amount_total: 2000,
          metadata: { userId: "u1", credits: "600" },
        },
      },
    });

    it("credits the user on checkout.session.completed", async () => {
      stripe.webhooks.constructEvent.mockReturnValue(makeEvent());
      prisma.payment.create.mockResolvedValue({ id: "pay_1" });
      prisma.user.update.mockResolvedValue({ id: "u1", credits: 650 });

      const result = await BillingService.handleWebhook("raw", "sig");
      expect(result.success).toBe(true);
      expect(result.credits).toBe(600);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { credits: { increment: 600 } },
      });
    });

    it("is idempotent — duplicate events do not double-credit", async () => {
      stripe.webhooks.constructEvent.mockReturnValue(makeEvent());
      prisma.payment.create.mockRejectedValue({ code: "P2002" });

      const result = await BillingService.handleWebhook("raw", "sig");
      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("ignores non-checkout event types", async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_2",
        type: "payment_intent.created",
        data: { object: {} },
      });
      const result = await BillingService.handleWebhook("raw", "sig");
      expect(result.success).toBe(false);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it("skips credit when metadata is missing", async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_3",
        type: "checkout.session.completed",
        data: { object: { id: "cs_2", metadata: {} } },
      });
      const result = await BillingService.handleWebhook("raw", "sig");
      expect(result.success).toBe(false);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });
  });
});
