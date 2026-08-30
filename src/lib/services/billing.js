import { stripe } from "../stripe";
import config from "../config";
import { prisma } from "../prisma";
import { UserService } from "./user";

export const BillingService = {
  async createCheckoutSession(userId, planId) {
    const plan = config.stripe.plans[planId];
    if (!plan) throw new Error("Invalid plan selected");

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${plan.name} — ${plan.credits} Credits`,
              description: `Purchase ${plan.credits} credits for AI character chats.`,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${config.auth.url}/pricing?success=true`,
      cancel_url: `${config.auth.url}/pricing?canceled=true`,
      metadata: { userId, planId, credits: plan.credits.toString() },
    });

    return session.url;
  },

  async handleWebhook(body, signature) {
    const event = stripe.webhooks.constructEvent(body, signature, config.stripe.webhookSecret);
    if (event.type !== "checkout.session.completed") {
      return { success: false, reason: "unhandled_event_type" };
    }

    const session = event.data.object;
    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits || "0", 10);

    if (!userId || credits <= 0) {
      return { success: false, reason: "missing_metadata" };
    }

    // Idempotency: record the processed checkout session/event first. If a
    // record already exists, this is a Stripe retry and must not re-credit.
    try {
      await prisma.payment.create({
        data: {
          stripeEventId: event.id,
          stripeCheckoutSessionId: session.id,
          userId,
          credits,
          amount: session.amount_total ?? null,
        },
      });
    } catch (err) {
      // Unique constraint violation => already processed
      if (err?.code === "P2002") {
        console.log(`[WEBHOOK_DUPLICATE] Checkout session ${session.id} already processed, skipping.`);
        return { success: true, duplicate: true, userId, credits };
      }
      throw err;
    }

    await UserService.addCredits(userId, credits);
    console.log(`[WEBHOOK_SUCCESS] Added ${credits} credits to user ${userId} (session ${session.id})`);
    return { success: true, userId, credits };
  }
};
