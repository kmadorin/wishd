import { describe, it, expect } from "vitest";
import { parseSseChunk } from "./EventStream";

describe("parseSseChunk", () => {
  it("parses single complete event", () => {
    const buffer = `data: {"type":"chat.delta","delta":"hi"}\n\n`;
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual([{ type: "chat.delta", delta: "hi" }]);
    expect(rest).toBe("");
  });

  it("retains incomplete trailing event in rest", () => {
    const buffer = `data: {"type":"chat.delta","delta":"a"}\n\ndata: {"type":"cha`;
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual([{ type: "chat.delta", delta: "a" }]);
    expect(rest).toBe(`data: {"type":"cha`);
  });

  it("ignores non-data lines", () => {
    const buffer = `: comment\nevent: foo\ndata: {"type":"result","ok":true}\n\n`;
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual([{ type: "result", ok: true }]);
    expect(rest).toBe("");
  });
});
