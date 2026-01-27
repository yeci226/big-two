import { pusherServer } from "@/lib/pusher";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { roomId, action, payload } = await req.json();

    // 廣播事件到 Pusher 頻道
    await pusherServer.trigger(`room-${roomId}`, action, payload);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pusher Error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
