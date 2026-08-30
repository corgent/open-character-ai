const config = {
  appName: "Open Character AI",
  // UI theme accent — must match a [data-theme="..."] block in globals.css
  theme: process.env.NEXT_PUBLIC_THEME || "midnight",
  auth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    secret: process.env.NEXTAUTH_SECRET,
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
    webhook_url: process.env.WEBHOOK_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // price is in USD cents
    plans: {
      basic: { id: "basic", name: "Basic Pack", credits: 100, price: 500 },
      standard: { id: "standard", name: "Standard Pack", credits: 250, price: 1000 },
      pro: { id: "pro", name: "Professional Pack", credits: 600, price: 2000 },
      business: { id: "business", name: "Business Pack", credits: 2000, price: 5000 },
    }
  },
  ai: {
    apiKey: process.env.MU_API_KEY,
    // Credit cost per message for each supported LLM engine.
    // Models not listed here fall back to defaultCost.
    modelCosts: {
      "google/gemini-2.5-flash": 1,
      "openai/gpt-4o": 10,
      "deepseek/deepseek-r1": 10,
      "anthropic/claude-3.5-sonnet": 10,
    },
    defaultCost: 1,
    // Models selectable in the chat tuning panel
    models: [
      "google/gemini-2.5-flash",
      "openai/gpt-4o",
      "deepseek/deepseek-r1",
      "anthropic/claude-3.5-sonnet",
    ],
  }
};

// Returns the credit cost of a single message for the given model.
export function getModelCost(model) {
  const costs = config.ai.modelCosts || {};
  return costs[model] ?? config.ai.defaultCost ?? 1;
}

export default config;
