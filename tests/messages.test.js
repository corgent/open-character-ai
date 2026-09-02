import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chat: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/config", () => ({
  default: { ai: { apiKey: "test-muapi-key", defaultCost: 1 } },
  getModelCost: vi.fn(() => 1),
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/chats/[id]/messages/route";
import { DELETE } from "@/app/api/chats/[id]/messages/[messageId]/route";

const authed = (id = "u1") =>
  getServerSession.mockResolvedValue({ user: { id, email: "u@example.com" } });

const jsonReq = (body, headers = {}) =>
  new Request("http://localhost/api/chats/chat1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const params = (id = "chat1", messageId) => ({
  params: Promise.resolve(messageId ? { id, messageId } : { id }),
});

const ownedChat = {
  id: "chat1",
  userId: "u1",
  title: "Existing chat",
  model: null,
  temperature: null,
  maxTokens: null,
  reasoning: null,
  systemPromptOverride: null,
  character: { name: "Test Bot", systemPrompt: "You are a test.", greeting: "Hi!" },
};

describe("messages API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET messages", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await GET(new Request("http://localhost"), params());
      expect(res.status).toBe(401);
    });

    it("returns 404 for chats owned by someone else", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ userId: "other" });
      const res = await GET(new Request("http://localhost"), params());
      expect(res.status).toBe(404);
    });

    it("returns stored messages in chronological order", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ userId: "u1" });
      prisma.message.findMany.mockResolvedValue([
        { id: "m1", role: "user", content: "hello" },
      ]);

      const res = await GET(new Request("http://localhost"), params());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.messages).toHaveLength(1);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { chatId: "chat1" },
        orderBy: { createdAt: "asc" },
      });
    });

    it("seeds the character greeting when the chat is empty", async () => {
      authed("u1");
      prisma.chat.findUnique
        .mockResolvedValueOnce({ userId: "u1" }) // ownership check
        .mockResolvedValueOnce(ownedChat); // full chat for greeting seed
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.create.mockResolvedValue({ id: "g1", role: "assistant", content: "Hi!" });

      const res = await GET(new Request("http://localhost"), params());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.messages).toHaveLength(1);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { chatId: "chat1", role: "assistant", content: "Hi!" },
      });
    });
  });

  describe("POST messages", () => {
    beforeEach(() => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue(ownedChat);
      prisma.user.findUnique.mockResolvedValue({ id: "u1", credits: 50 });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.create
        .mockResolvedValueOnce({ id: "um1", role: "user", content: "hello" })
        .mockResolvedValueOnce({ id: "am1", role: "assistant", content: "world" });
    });

    it("requires message content", async () => {
      const res = await POST(jsonReq({ content: "  " }), params());
      expect(res.status).toBe(400);
    });

    it("rejects with 402 when the user lacks credits", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1", credits: 0 });

      const res = await POST(jsonReq({ content: "hi" }), params());
      expect(res.status).toBe(402);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("deducts credits, posts to the LLM, and stores both messages", async () => {
      const fetchMock = vi
        .fn()
        // First call: submit generation request.
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ request_id: "req1" }),
        })
        // Second call: poll result -> completed.
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "completed", outputs: ["world"] }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(jsonReq({ content: "hello" }), params());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { credits: { decrement: 1 } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(body.remainingCredits).toBe(49);
      expect(body.cost).toBe(1);

      vi.unstubAllGlobals();
    });

    it("skips credit deduction when a custom API key is supplied", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ request_id: "req1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "completed", outputs: ["world"] }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(
        jsonReq({ content: "hello" }, { "x-custom-api-key": "user-key" }),
        params(),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.cost).toBe(0);
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { credits: { decrement: expect.any(Number) } } }),
      );

      vi.unstubAllGlobals();
    });

    it("refunds deducted credits when the LLM call fails", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: "Bad Gateway",
        text: async () => "upstream boom",
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(jsonReq({ content: "hello" }), params());
      expect(res.status).toBe(500);

      // Refund: an increment matching the earlier decrement.
      const refundCall = prisma.user.update.mock.calls.find(
        ([arg]) => arg.data?.credits?.increment === 1,
      );
      expect(refundCall).toBeDefined();

      vi.unstubAllGlobals();
    });
  });

  describe("DELETE message", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await DELETE(new Request("http://localhost"), params("chat1", "m1"));
      expect(res.status).toBe(401);
    });

    it("returns 404 when the message belongs to a different chat", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ userId: "u1" });
      prisma.message.findUnique.mockResolvedValue({ id: "m1", chatId: "other-chat" });

      const res = await DELETE(new Request("http://localhost"), params("chat1", "m1"));
      expect(res.status).toBe(404);
      expect(prisma.message.delete).not.toHaveBeenCalled();
    });

    it("deletes a message in an owned chat", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ userId: "u1" });
      prisma.message.findUnique.mockResolvedValue({ id: "m1", chatId: "chat1" });
      prisma.message.delete.mockResolvedValue({ id: "m1" });

      const res = await DELETE(new Request("http://localhost"), params("chat1", "m1"));
      expect(res.status).toBe(200);
      expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    });
  });
});
