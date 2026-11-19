import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createGroup, exportGroups, findGroupForMember, importGroups, joinGroup, type SavedGroup } from "./groups.js";
import { fileStorage, restore, saveNow } from "./persist.js";

test("an open group, with its swipes, votes and cards, survives being saved and restored", async () => {
  const made = createGroup({ nickname: "host", location: { lat: 1, lng: 2 }, filters: { price: [1, 2] } });
  const guest = joinGroup(made.joinCode, "guest");
  const group = findGroupForMember(made.groupId, made.memberId)!;
  group.restaurants = Promise.resolve([{ id: "r1", name: "Place" } as any]);
  group.swipes.set("r1", new Map([[made.memberId, true], [guest.memberId, false]]));
  group.votes = new Map([[guest.memberId, "r1"]]);
  group.started = true;

  const dir = await mkdtemp(join(tmpdir(), "crave-"));
  try {
    const storage = fileStorage(join(dir, "nested", "state.json"));
    assert.equal(await restore(storage), 0); // nothing saved yet
    await saveNow(storage);

    const saved = JSON.parse((await storage.load())!) as SavedGroup[];
    const copy = saved.find((g) => g.id === made.groupId)!;
    assert.equal(copy.joinCode, made.joinCode);
    assert.deepEqual(copy.swipes, [["r1", [[made.memberId, true], [guest.memberId, false]]]]);

    // Put it back as a restart would (same ids, so it replaces the live copy)
    assert.equal(importGroups([copy]), 1);
    const back = findGroupForMember(made.groupId, guest.memberId)!;
    assert.equal(back.swipes.get("r1")!.get(guest.memberId), false);
    assert.equal(back.votes!.get(guest.memberId), "r1");
    assert.equal(back.started, true);
    assert.equal((await back.restaurants)![0].name, "Place");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("groups past their lifetime aren't restored or saved", async () => {
  createGroup({ nickname: "old", location: { lat: 1, lng: 2 }, filters: {} });
  const future = Date.now() + 48 * 60 * 60 * 1000;
  assert.equal((await exportGroups(future)).length, 0);
  assert.equal(importGroups([{ id: "g_x", joinCode: "9999", location: { lat: 0, lng: 0 }, filters: {}, members: [], hostId: "m", swipes: [], createdAt: 0 }], future), 0);
});
