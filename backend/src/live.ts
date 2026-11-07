import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { corsOrigin } from "./cors.js";
import { findGroupForMember } from "./groups.js";
import { matchPayload } from "./swipes.js";

let io: Server | undefined;

// Phones connect with { groupId, memberId } in the handshake auth.
// Each group is one Socket.io room named after its group ID.
export function attachLive(server: HttpServer) {
  io = new Server(server, { cors: { origin: corsOrigin } });

  io.use((socket, next) => {
    const { groupId, memberId } = socket.handshake.auth ?? {};
    const group =
      typeof groupId === "string" && typeof memberId === "string"
        ? findGroupForMember(groupId, memberId)
        : undefined;
    if (!group) {
      next(new Error("GROUP_NOT_FOUND"));
      return;
    }
    socket.data.groupId = group.id;
    next();
  });

  io.on("connection", (socket) => {
    const groupId: string = socket.data.groupId;
    socket.join(groupId);
    // Also runs on every reconnect, so a phone that dropped catches up
    const group = findGroupForMember(groupId, socket.handshake.auth.memberId);
    socket.emit("state", { members: group?.members ?? [], match: group?.match ? { restaurant: matchPayload(group.match) } : null });
  });
}

export function emitToGroup(groupId: string, event: string, payload: unknown) {
  io?.to(groupId).emit(event, payload);
}
