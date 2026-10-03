import test from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../room/RoomManager.js";
import { Peer } from "../peer/Peer.js";
import WebSocket from "ws";

test("room manager removes an empty room after the last peer leaves", () => {
    const manager = new RoomManager();
    const peer = new Peer("peer-1", {} as WebSocket, "room-1");
    manager.addPeer("room-1", peer);
    assert.equal(manager.getRoom("room-1")?.getPeer("peer-1"), peer);

    manager.removePeer("room-1", peer.id);

    assert.equal(manager.getRoom("room-1"), undefined);
});
