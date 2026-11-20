import type { SendableEvent } from "@signal-app/player"
import { describe, expect, it } from "vitest"
import { GFOSSynthOutput } from "./GFOSSynthOutput"

class FakeSocket {
  readyState = 0
  onopen: WebSocket["onopen"] = null
  onclose: WebSocket["onclose"] = null
  onerror: WebSocket["onerror"] = null
  readonly sent: string[] = []

  send(data: string) {
    this.sent.push(data)
  }

  open() {
    this.readyState = 1
    this.onopen?.call(this as unknown as WebSocket, new Event("open"))
  }
}

const noteOn = {
  type: "channel",
  subtype: "noteOn",
  channel: 2,
  noteNumber: 60,
  velocity: 100,
} satisfies SendableEvent

describe("GFOSSynthOutput", () => {
  it("queues MIDI until connected and sends the versioned bridge contract", () => {
    const socket = new FakeSocket()
    const output = new GFOSSynthOutput(
      "ws://127.0.0.1:4711/midi",
      () => socket as unknown as WebSocket,
    )

    output.sendEvent(noteOn, 0.25, 1234, 7)
    expect(socket.sent).toEqual([])

    socket.open()
    expect(JSON.parse(socket.sent[0])).toEqual({
      protocol: "gfos-midi/1",
      type: "hello",
      client: "GFOpenSignal",
    })
    expect(JSON.parse(socket.sent[1])).toEqual({
      protocol: "gfos-midi/1",
      type: "midi",
      bytes: [0x92, 60, 100],
      delayMs: 250,
      clientTimestampMs: 1234,
      trackId: 7,
    })
  })

  it("clamps negative scheduling delay to immediate playback", () => {
    const socket = new FakeSocket()
    const output = new GFOSSynthOutput(
      "ws://bridge",
      () => socket as unknown as WebSocket,
    )
    output.activate()
    socket.open()

    output.sendEvent(noteOn, -1, 10)
    expect(JSON.parse(socket.sent[1]).delayMs).toBe(0)
  })
})
