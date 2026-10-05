const express = require("express");
const http = require("http");
const crypto = require("crypto");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = 8;
const TOTAL_ROUNDS = 5;
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const prompts = [
  ["What is something people pretend to understand?", "Cryptocurrency"],
  ["What is the worst thing to hear during a first date?", "I forgot your name"],
  ["What is something that should never be microwaved?", "A metal spoon"],
  ["What is a terrible superpower to have?", "Always knowing when someone is lying"],
  ["What instantly ruins a vacation?", "Forgetting your passport"],
];
const rooms = new Map();

const app = express();
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed by the server."));
  },
};

app.use(cors(corsOptions));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    ...corsOptions,
    methods: ["GET", "POST"],
  },
});

const cleanName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, 20);
const cleanCode = (code) => String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
const playerList = (room) => [...room.players.values()];
const connected = (room) => playerList(room).filter((player) => player.connected);
const error = (socket, message) => socket.emit("game:error", { message });
const newCode = () => {
  let code;
  do code = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 5);
  while (rooms.has(code));
  return code;
};
const publicState = (room, socketId) => {
  const players = playerList(room).map((player) => ({
    ...player,
    hasSubmittedExplanation: Boolean(room.explanations[player.id]),
    hasVoted: Boolean(room.votes[player.id]),
  }));
  const state = {
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    players,
    prompt: room.prompt?.[0] || null,
    answer: null,
    explanations: {},
    votes: {},
    roundScores: {},
    roundWinnerId: null,
    blufferId: null,
    winnerId: null,
  };
  if (room.phase === "explanation" || room.phase === "voting") {
    state.answer = room.blufferId === socketId ? null : room.prompt?.[1];
  }
  if (room.phase === "voting") {
    state.explanations = { ...room.explanations };
  }
  if (room.phase === "round-results" || room.phase === "game-over") {
    Object.assign(state, {
      answer: room.prompt?.[1],
      explanations: room.explanations,
      votes: room.votes,
      roundScores: room.roundScores,
      roundWinnerId: room.roundWinnerId,
      blufferId: room.blufferId,
      winnerId: room.winnerId,
    });
  }
  return state;
};
const broadcast = (room) => playerList(room).forEach((player) => {
  if (player.connected) io.to(player.id).emit("room:state", publicState(room, player.id));
});
const resetRound = (room) => {
  room.explanations = {};
  room.votes = {};
  room.roundScores = {};
  room.roundWinnerId = null;
};
const startRound = (room) => {
  const players = connected(room);
  room.round += 1;
  room.prompt = prompts[Math.floor(Math.random() * prompts.length)];
  room.blufferId = players[Math.floor(Math.random() * players.length)].id;
  room.phase = "explanation";
  resetRound(room);
  broadcast(room);
};
const beginVoting = (room) => {
  room.phase = "voting";
  broadcast(room);
};
const finishRound = (room) => {
  const counts = {};
  connected(room).forEach((player) => { counts[player.id] = 0; });
  Object.values(room.votes).forEach((id) => { if (counts[id] !== undefined) counts[id] += 1; });
  const max = Math.max(...Object.values(counts), 0);
  const suspects = Object.keys(counts).filter((id) => counts[id] === max && max > 0);
  const caught = suspects.includes(room.blufferId);
  connected(room).forEach((player) => {
    let score = player.id === room.blufferId ? (caught ? 0 : 3) : 0;
    if (player.id !== room.blufferId && room.votes[player.id] === room.blufferId) score = 2;
    player.score += score;
    room.roundScores[player.id] = score;
  });
  room.roundWinnerId = caught ? room.blufferId : suspects[0] || null;
  room.phase = room.round >= TOTAL_ROUNDS ? "game-over" : "round-results";
  if (room.phase === "game-over") {
    room.winnerId = connected(room).sort((a, b) => b.score - a.score)[0]?.id || null;
  }
  broadcast(room);
};

io.on("connection", (socket) => {
  socket.on("room:create", ({ name } = {}) => {
    const playerName = cleanName(name);
    if (!playerName) return error(socket, "Enter a player name first.");
    const code = newCode();
    const room = {
      code, phase: "lobby", round: 0, prompt: null, blufferId: null,
      players: new Map(), explanations: {}, votes: {}, roundScores: {},
      roundWinnerId: null, winnerId: null,
    };
    room.players.set(socket.id, { id: socket.id, name: playerName, isHost: true, score: 0, connected: true });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room:created", { code });
    broadcast(room);
  });

  socket.on("room:join", ({ code, name } = {}) => {
    const room = rooms.get(cleanCode(code));
    const playerName = cleanName(name);
    if (!playerName) return error(socket, "Enter a player name first.");
    if (!room) return error(socket, "Room not found. Check the room code.");
    if (room.phase !== "lobby") return error(socket, "This game has already started.");
    if (connected(room).length >= MAX_PLAYERS) return error(socket, "This room is full.");
    if (connected(room).some((player) => player.name.toLowerCase() === playerName.toLowerCase())) {
      return error(socket, "That player name is already being used.");
    }
    room.players.set(socket.id, { id: socket.id, name: playerName, isHost: false, score: 0, connected: true });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit("room:joined", { code: room.code });
    broadcast(room);
  });

  socket.on("room:start", () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.id);
    if (!room || !player) return error(socket, "You are not in a room.");
    if (!player.isHost) return error(socket, "Only the host can start the game.");
    if (connected(room).length < 2) return error(socket, "At least 2 players are required to start.");
    startRound(room);
  });

  socket.on("game:submit-explanation", ({ explanation } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players.has(socket.id)) return error(socket, "You are not in a room.");
    const text = String(explanation || "").trim().slice(0, 280);
    if (room.phase !== "explanation") return error(socket, "The explanation phase is over.");
    if (!text) return error(socket, "Write an explanation before submitting.");
    room.explanations[socket.id] = text;
    if (connected(room).every((player) => room.explanations[player.id])) beginVoting(room);
    else broadcast(room);
  });

  socket.on("game:begin-voting", () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.id);
    if (!room || !player) return error(socket, "You are not in a room.");
    if (!player.isHost) return error(socket, "Only the host can open voting.");
    if (room.phase !== "explanation") return error(socket, "Voting cannot be opened right now.");
    beginVoting(room);
  });

  socket.on("game:submit-vote", ({ playerId } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players.has(socket.id)) return error(socket, "You are not in a room.");
    if (room.phase !== "voting") return error(socket, "Voting is not active.");
    if (!room.players.has(playerId) || playerId === socket.id) return error(socket, "Choose another player.");
    if (room.votes[socket.id]) return error(socket, "You already voted.");
    room.votes[socket.id] = playerId;
    if (connected(room).every((player) => room.votes[player.id])) finishRound(room);
    else broadcast(room);
  });

  socket.on("game:next-round", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players.get(socket.id)?.isHost) return error(socket, "Only the host can start the next round.");
    if (room.phase !== "round-results") return error(socket, "The next round is not available yet.");
    startRound(room);
  });

  socket.on("game:play-again", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players.get(socket.id)?.isHost) return error(socket, "Only the host can restart the game.");
    room.phase = "lobby";
    room.round = 0;
    room.prompt = null;
    room.winnerId = null;
    playerList(room).forEach((player) => { player.score = 0; });
    resetRound(room);
    broadcast(room);
  });

  socket.on("room:leave", () => {
    const room = rooms.get(socket.data.roomCode);
    if (room) {
      room.players.delete(socket.id);
      const remaining = connected(room);
      if (!remaining.length) rooms.delete(room.code);
      else {
        if (!remaining.some((player) => player.isHost)) remaining[0].isHost = true;
        delete room.explanations[socket.id];
        delete room.votes[socket.id];
        broadcast(room);
      }
    }
    socket.leave(socket.data.roomCode);
    socket.data.roomCode = null;
    socket.emit("room:left");
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) player.connected = false;
    const remaining = connected(room);
    if (!remaining.length) rooms.delete(room.code);
    else {
      if (!remaining.some((item) => item.isHost)) remaining[0].isHost = true;
      delete room.explanations[socket.id];
      delete room.votes[socket.id];
      broadcast(room);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bluff Battle server running on port ${PORT}`);
});
