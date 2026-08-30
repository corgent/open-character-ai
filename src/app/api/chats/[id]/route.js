import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOwnedChat(id, userId) {
  const chat = await prisma.chat.findUnique({ where: { id } });
  if (!chat || chat.userId !== userId) return null;
  return chat;
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const chat = await getOwnedChat(id, session.user.id);
    if (!chat) {
      return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = {};

    if (body.title !== undefined) {
      data.title = body.title ? String(body.title).slice(0, 100) : null;
    }
    if (body.model !== undefined) {
      data.model = body.model ? String(body.model) : null;
    }
    if (body.temperature !== undefined) {
      const t = parseFloat(body.temperature);
      data.temperature = Number.isFinite(t) ? Math.min(Math.max(t, 0), 2) : null;
    }
    if (body.maxTokens !== undefined) {
      const m = parseInt(body.maxTokens, 10);
      data.maxTokens = Number.isFinite(m) ? Math.min(Math.max(m, 256), 4096) : null;
    }
    if (body.reasoning !== undefined) {
      data.reasoning = body.reasoning === null ? null : Boolean(body.reasoning);
    }
    if (body.systemPromptOverride !== undefined) {
      data.systemPromptOverride = body.systemPromptOverride
        ? String(body.systemPromptOverride)
        : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const updated = await prisma.chat.update({ where: { id }, data });
    return NextResponse.json({ chat: updated });
  } catch (error) {
    console.error("[CHAT_PATCH_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const chat = await getOwnedChat(id, session.user.id);
    if (!chat) {
      return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
    }

    // Messages cascade-delete via the Prisma relation
    await prisma.chat.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHAT_DELETE_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
