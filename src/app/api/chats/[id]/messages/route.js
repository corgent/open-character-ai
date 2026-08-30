import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import config, { getModelCost } from "@/lib/config";

// Utility sleep helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// MuAPI polling bounds — prevents hanging a serverless function indefinitely
const POLL_TICK_MS = 1500;
const POLL_TIMEOUT_MS = 90000; // ~90s, within typical serverless limits

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the chat exists and belongs to the current user
    const ownedChat = await prisma.chat.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!ownedChat || ownedChat.userId !== session.user.id) {
      return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
    }

    let messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "asc" },
    });

    // If chat room is blank, seed the character's customized greeting message
    if (messages.length === 0) {
      const chat = await prisma.chat.findUnique({
        where: { id },
        include: { character: true },
      });

      if (!chat) {
        return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
      }

      const greetingMessage = await prisma.message.create({
        data: {
          chatId: id,
          role: "assistant",
          content: chat.character.greeting,
        },
      });

      messages = [greetingMessage];
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[MESSAGES_GET_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  let cost = 0;
  let creditsDeducted = false;
  let userId = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;

    const { id } = await params;
    const body = await req.json();
    const { content, imageUrl } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    // Fetch the chat (with its persisted tuning settings) and verify ownership
    const chat = await prisma.chat.findUnique({
      where: { id },
      include: { character: true },
    });

    if (!chat || chat.userId !== userId) {
      return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
    }

    // Persisted per-chat settings act as the source of truth; the request may
    // only narrow them further, and unknown values fall back to defaults.
    const model = body.model || chat.model || "google/gemini-2.5-flash";
    const temperature = body.temperature ?? chat.temperature ?? 1.0;
    const maxTokens = body.maxTokens ?? chat.maxTokens ?? 2048;
    const reasoning = body.reasoning ?? chat.reasoning ?? false;
    const systemPromptOverride = body.systemPromptOverride ?? chat.systemPromptOverride ?? null;

    // Extract custom API key if present
    const headerApiKey = req.headers.get("x-custom-api-key");
    const customApiKey = headerApiKey || body.customApiKey || session.user.customApiKey || null;
    const isUsingCustomKey = Boolean(customApiKey && customApiKey.trim().length > 0);

    // Cost is derived server-side from the selected model tier
    cost = isUsingCustomKey ? 0 : getModelCost(model);

    // 1. Fetch user's credit balance if using site credits
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User profile not found in database" }, { status: 404 });
    }

    if (!isUsingCustomKey && user.credits < cost) {
      return NextResponse.json(
        {
          error: `Insufficient credits. This model requires ${cost} credit${cost === 1 ? "" : "s"} per message but you only have ${user.credits} remaining.`,
          required: cost,
          remaining: user.credits,
        },
        { status: 402 },
      );
    }

    // Fetch the last 10 messages for conversational context
    const previousMessages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Reverse to chronological order
    previousMessages.reverse();

    // Format the conversational history
    let historyBlock = "";
    if (previousMessages.length > 0) {
      const formattedHistory = previousMessages
        .map((m) => `${m.role === "user" ? "User" : chat.character.name}: ${m.content}`)
        .join("\n\n");
      historyBlock = `\n\n### RECENT CONVERSATION HISTORY ###\n${formattedHistory}\n\n`;
    }

    const baseSystemPrompt =
      systemPromptOverride && systemPromptOverride.trim().length > 0
        ? systemPromptOverride
        : chat.character.systemPrompt;

    const enhancedSystemPrompt = `${baseSystemPrompt}${historyBlock}
IMPORTANT:
- Reply to the USER's latest message naturally based on the above recent conversation history.
- Do not repeat the history.
- You are roleplaying as ${chat.character.name}. Write your response directly in first-person as ${chat.character.name}.
- Do NOT start your response with "User: ...", "${chat.character.name}: ...", or similar labels. Just output the dialogue itself.`;

    // 2. Deduct credits first if not using custom key
    if (!isUsingCustomKey && cost > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: cost } },
      });
      creditsDeducted = true;
    }

    // 3. Save the User's submitted message
    const userMessage = await prisma.message.create({
      data: {
        chatId: id,
        role: "user",
        content,
        imageUrl,
      },
    });

    // 4. Connect to MuAPI
    const apiKey = isUsingCustomKey ? customApiKey.trim() : config.ai.apiKey;
    if (!apiKey) {
      throw new Error("API key is missing.");
    }

    // Select endpoint depending on whether an image was attached or not
    const isVision = !!imageUrl;
    const apiUrl = isVision
      ? "https://api.muapi.ai/api/v1/openrouter-vision"
      : "https://api.muapi.ai/api/v1/any-llm-models";

    const payload = {
      prompt: content,
      system_prompt: enhancedSystemPrompt,
      model,
      temperature: parseFloat(temperature),
      max_tokens: parseInt(maxTokens),
      reasoning: !!reasoning,
    };

    if (isVision) {
      payload.images_list = [imageUrl];
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[MUAPI_LLM_ERROR]", errText);
      throw new Error(`Upstream API error: ${response.statusText}`);
    }

    const data = await response.json();
    const requestId = data.request_id;

    if (!requestId) {
      throw new Error("Did not receive a request_id from upstream server.");
    }

    // 5. Bounded server-side polling loop to retrieve results
    let completedText = "";
    let status = "processing";
    const pollDeadline = Date.now() + POLL_TIMEOUT_MS;

    while (status === "processing") {
      if (Date.now() > pollDeadline) {
        throw new Error("Generation timed out waiting for the upstream system. Please try again.");
      }

      await delay(POLL_TICK_MS);

      const checkRes = await fetch(`https://api.muapi.ai/api/v1/predictions/${requestId}/result`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        status = checkData.status || checkData.state || "processing";

        if (status === "completed" || status === "succeeded") {
          completedText =
            checkData.outputs?.[0] ||
            (typeof checkData.output === "string" ? checkData.output : "") ||
            checkData.output?.text ||
            checkData.output?.choices?.[0]?.message?.content ||
            checkData.response ||
            "";
          status = "completed"; // normalize
          break;
        } else if (status === "failed") {
          throw new Error("Generation task failed on the upstream system.");
        }
      } else {
        console.warn(`[POLL_TICK_ERROR] Status code: ${checkRes.status}`);
      }
    }

    // 6. Save and commit assistant response
    const assistantMessage = await prisma.message.create({
      data: {
        chatId: id,
        role: "assistant",
        content: completedText || "Hello! How can I help you?",
      },
    });

    // 7. Auto-title brand new chats from the first user message
    if (!chat.title) {
      const autoTitle = content.trim().slice(0, 60);
      prisma.chat
        .update({ where: { id }, data: { title: autoTitle } })
        .catch((err) => console.error("[CHAT_AUTOTITLE_ERROR]", err));
    }

    return NextResponse.json({
      userMessage,
      assistantMessage,
      remainingCredits: isUsingCustomKey ? "∞" : user.credits - cost,
      cost,
    });
  } catch (error) {
    console.error("[MESSAGES_POST_ERROR]", error);

    // Auto-refund credits to the user if deduction occurred but completion failed
    if (creditsDeducted && userId && cost > 0) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: cost } },
        });
        console.log(`[CREDITS_REFUNDED] Refunded ${cost} credits to user ${userId} due to execution error.`);
      } catch (refundError) {
        console.error("[REFUND_FATAL_ERROR]", refundError);
      }
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
