import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chat: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/chats/route";
import { PATCH, DELETE } from "@/app/api/chats/[id]/route";

const authed = (id = "u1") =>
  getServerSession.mockResolvedValue({ user: { id, email: "u@example.com" } });

const jsonReq = (body, url = "http://localhost/api/chats") =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const params = (id) => ({ params: Promise.resolve({ id }) });

describe("chats API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/chats", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("lists the current user's chats", async () => {
      authed("u1");
      prisma.chat.findMany.mockResolvedValue([{ id: "chat1" }]);

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.chats).toHaveLength(1);
      expect(prisma.chat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1" } }),
      );
    });
  });

  describe("POST /api/chats", () => {
    it("requires a character id", async () => {
      authed();
      const res = await POST(jsonReq({}));
      expect(res.status).toBe(400);
    });

    it("reuses an existing chat for the same character", async () => {
      authed("u1");
      prisma.chat.findFirst.mockResolvedValue({ id: "existing", characterId: "c1" });

      const res = await POST(jsonReq({ character_id: "c1" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.chat.id).toBe("existing");
      expect(prisma.chat.create).not.toHaveBeenCalled();
    });

    it("creates a new chat when none exists", async () => {
      authed("u1");
      prisma.chat.findFirst.mockResolvedValue(null);
      prisma.chat.create.mockResolvedValue({ id: "new", characterId: "c1" });

      const res = await POST(jsonReq({ character_id: "c1" }));
      const body = await res.json();

      expect(body.chat.id).toBe("new");
      expect(prisma.chat.create).toHaveBeenCalledWith({
        data: { userId: "u1", characterId: "c1" },
        include: { character: true },
      });
    });

    it("forceNew always creates a fresh chat", async () => {
      authed("u1");
      prisma.chat.create.mockResolvedValue({ id: "fresh", characterId: "c1" });

      await POST(jsonReq({ character_id: "c1", forceNew: true }));
      expect(prisma.chat.findFirst).not.toHaveBeenCalled();
      expect(prisma.chat.create).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/chats/[id]", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await PATCH(jsonReq({ title: "x" }), params("chat1"));
      expect(res.status).toBe(401);
    });

    it("returns 404 for chats owned by another user", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ id: "chat1", userId: "other" });
      const res = await PATCH(jsonReq({ title: "x" }), params("chat1"));
      expect(res.status).toBe(404);
    });

    it("rejects empty update payloads", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ id: "chat1", userId: "u1" });
      const res = await PATCH(jsonReq({}), params("chat1"));
      expect(res.status).toBe(400);
    });

    it("clamps temperature to the 0–2 range", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ id: "chat1", userId: "u1" });
      prisma.chat.update.mockResolvedValue({ id: "chat1" });

      await PATCH(jsonReq({ temperature: 5 }), params("chat1"));
      expect(prisma.chat.update).toHaveBeenCalledWith({
        where: { id: "chat1" },
        data: { temperature: 2 },
      });
    });

    it("clamps maxTokens to the 256–4096 range", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ id: "chat1", userId: "u1" });
      prisma.chat.update.mockResolvedValue({ id: "chat1" });

      await PATCH(jsonReq({ maxTokens: 10 }), params("chat1"));
      expect(prisma.chat.update).toHaveBeenCalledWith({
        where: { id: "chat1" },
        data: { maxTokens: 256 },
      });
    });

    it("persists model and system prompt overrides", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ id: "chat1", userId: "u1" });
      prisma.chat.update.mockResolvedValue({ id: "chat1" });

      await PATCH(
        jsonReq({ model: "openai/gpt-4o", systemPromptOverride: "Be terse." }),
        params("chat1"),
      );
      expect(prisma.chat.update).toHaveBeenCalledWith({
        where: { id: "chat1" },
        data: { model: "openai/gpt-4o", systemPromptOverride: "Be terse." },
      });
    });
  });

  describe("DELETE /api/chats/[id]", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await DELETE(new Request("http://localhost"), params("chat1"));
      expect(res.status).toBe(401);
    });

    it("deletes an owned chat", async () => {
      authed("u1");
      prisma.chat.findUnique.mockResolvedValue({ id: "chat1", userId: "u1" });
      prisma.chat.delete.mockResolvedValue({ id: "chat1" });

      const res = await DELETE(new Request("http://localhost"), params("chat1"));
      expect(res.status).toBe(200);
      expect(prisma.chat.delete).toHaveBeenCalledWith({ where: { id: "chat1" } });
    });
  });
});
