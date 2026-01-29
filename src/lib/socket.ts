import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

    socket = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    // Connection event handlers
    socket.on("connect", () => {
      console.log("✅ Connected to WebSocket server:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Disconnected from WebSocket server:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("🔴 Connection error:", error.message);
    });

    socket.on("reconnect", (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
    });

    socket.on("reconnect_failed", () => {
      console.error("🔴 Reconnection failed");
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log("🔌 Socket disconnected and cleared");
  }
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

// Helper function to emit with error handling
export function emitSafe(event: string, ...args: any[]) {
  if (socket && socket.connected) {
    socket.emit(event, ...args);
    return true;
  } else {
    console.warn(`⚠️ Cannot emit '${event}': socket not connected`);
    return false;
  }
}
