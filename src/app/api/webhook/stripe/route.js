import { NextResponse } from "next/server";
import { BillingService } from "@/lib/services/billing";

export async function POST(req) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const result = await BillingService.handleWebhook(body, signature);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Stripe webhook processing error:", error);
    // Signature verification failures must be a 400 so Stripe does not retry endlessly
    const message = error?.message || "Webhook processing failed";
    const isSignatureError = message.toLowerCase().includes("signature");
    return NextResponse.json({ error: message }, { status: isSignatureError ? 400 : 500 });
  }
}
