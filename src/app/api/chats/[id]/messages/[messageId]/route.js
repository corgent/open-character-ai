import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, messageId } = await params;

    // Verify chat ownership before touching its messages
    const chat = await prisma.chat.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!chat || chat.userId !== session.user.id) {
      return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.chatId !== id) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await prisma.message.delete({ where: { id: messageId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MESSAGE_DELETE_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
