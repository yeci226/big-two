import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// CORS 配置
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://localhost:3000",
    "https://big-two-eosin.vercel.app",
    /\.vercel\.app$/,
  ],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["*"],
};

app.use(cors(corsOptions));
app.use(express.json());

// 根路徑處理
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Big Two WebSocket Server",
    version: "1.0.0",
    socketPath: "/socket.io/",
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://localhost:3000",
      "https://big-two-eosin.vercel.app",
      /\.vercel\.app$/,
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["*"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
  allowEIO3: true,
  path: "/socket.io/",
});

// In-memory game state storage
interface GameRoom {
  roomId: string;
  gameState: any;
  players: Map<string, string>; // socket.id -> playerId
  hostId: string | null;
  lastUpdate: number;
}

const rooms = new Map<string, GameRoom>();

// Clean up old rooms (older than 1 hour)
setInterval(
  () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.size === 0 || room.lastUpdate < oneHourAgo) {
        rooms.delete(roomId);
        console.log(`Cleaned up room: ${roomId}`);
      }
    }
  },
  5 * 60 * 1000,
); // Check every 5 minutes

io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Join room
  socket.on("join-room", (roomId: string, playerData: any) => {
    console.log(`🚪 Player ${playerData.name} joining room: ${roomId}`);

    socket.join(roomId);

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        roomId,
        gameState: null,
        players: new Map(),
        hostId: playerData.id, // First person joining is host
        lastUpdate: Date.now(),
      });
      console.log(
        `👑 Player ${playerData.name} initialized room as host: ${roomId}`,
      );
    }

    const room = rooms.get(roomId)!;
    room.players.set(socket.id, playerData.id);
    room.lastUpdate = Date.now();

    // If there's no host (e.g. previous host left), current one takes over
    if (!room.hostId) {
      room.hostId = playerData.id;
    }

    // Send current game state and host info
    socket.emit("host-assigned", room.hostId);
    if (room.gameState) {
      socket.emit("game-state-sync", {
        ...room.gameState,
        hostId: room.hostId, // Force sync hostId
      });
    }

    // Notify others
    io.to(roomId).emit("player-joined", playerData);
  });

  // Leave room
  socket.on("leave-room", (roomId: string, playerId: string) => {
    console.log(`🚪 Player ${playerId} leaving room: ${roomId}`);

    socket.leave(roomId);

    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(socket.id);
      room.lastUpdate = Date.now();

      // Check if player still has other sockets in this room
      const remainingSockets = Array.from(room.players.values()).filter(
        (pid) => pid === playerId,
      );
      if (remainingSockets.length === 0) {
        io.to(roomId).emit("player-left", playerId);

        // If host left, nominate new host
        if (room.hostId === playerId) {
          const nextPlayerId = Array.from(room.players.values())[0];
          room.hostId = nextPlayerId || null;
          if (room.hostId) {
            io.to(roomId).emit("host-assigned", room.hostId);
          }
        }
      }
    }
  });

  // Game state update
  socket.on("game-update", (roomId: string, gameState: any) => {
    const room = rooms.get(roomId);
    if (room) {
      room.gameState = gameState;
      room.lastUpdate = Date.now();
    }

    // Broadcast to all clients in the room (including sender for auth sync)
    io.to(roomId).emit("game-update", gameState);
  });

  // Broadcast action (like Pusher's trigger)
  socket.on(
    "broadcast",
    (data: { roomId: string; action: string; payload: any }) => {
      const { roomId, action, payload } = data;

      const room = rooms.get(roomId);
      if (room) {
        room.lastUpdate = Date.now();

        // Update game state if action is game-update
        if (action === "game-update") {
          room.gameState = payload;
        }
      }

      // Broadcast to all clients
      io.to(roomId).emit(action, payload);
    },
  );

  // Request current state
  socket.on("request-state", (roomId: string) => {
    const room = rooms.get(roomId);
    if (room && room.gameState) {
      socket.emit("game-state-sync", room.gameState);
    }
  });

  // Find an available auto-room
  socket.on("find-auto-room", () => {
    for (const [roomId, room] of rooms.entries()) {
      if (
        room.gameState &&
        room.gameState.isPublic &&
        !room.gameState.isStarted &&
        room.gameState.isAutoRoom &&
        room.players.size < 4
      ) {
        console.log(`🔍 Room found for quick join: ${roomId}`);
        socket.emit("room-found", roomId);
        return;
      }
    }
    socket.emit("room-not-found");
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);

    // Remove from all rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        const playerId = room.players.get(socket.id);
        room.players.delete(socket.id);
        room.lastUpdate = Date.now();

        // Notify other players ONLY if this was the last socket for this player
        if (playerId) {
          const remainingSockets = Array.from(room.players.values()).filter(
            (pid) => pid === playerId,
          );
          if (remainingSockets.length === 0) {
            io.to(roomId).emit("player-left", playerId);

            // Host migration on disconnect
            if (room.hostId === playerId) {
              const nextPlayerId = Array.from(room.players.values())[0];
              room.hostId = nextPlayerId || null;
              if (room.hostId) {
                io.to(roomId).emit("host-assigned", room.hostId);
              }
            }
          }
        }
      }
    }
  });
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    connections: io.engine.clientsCount,
    uptime: process.uptime(),
  });
});

// Get room info
app.get("/rooms/:roomId", (req: Request, res: Response) => {
  const room = rooms.get(req.params.roomId as string);
  if (room) {
    res.json({
      roomId: room.roomId,
      players: room.players.size,
      hasGameState: !!room.gameState,
      lastUpdate: room.lastUpdate,
    });
  } else {
    res.status(404).json({ error: "Room not found" });
  }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(
    `📡 CORS origin: ${process.env.CORS_ORIGIN || "http://localhost:3000"}`,
  );
});
