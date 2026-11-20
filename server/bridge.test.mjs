import assert from "node:assert/strict"
import { test } from "node:test"
import { createBridgeServer } from "./bridge.mjs"

const waitFor = async (predicate, timeoutMs = 1000) => {
  const end = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > end) throw new Error("timed out")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test("bridge accepts the gfos-midi/1 contract and exposes health", async () => {
  const received = []
  const output = {
    description: "test output",
    send(bytes, message) {
      received.push({ bytes: Array.from(bytes), trackId: message.trackId })
    },
  }
  const bridge = createBridgeServer({ port: 0, output })
  const address = await bridge.listen()
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/midi`)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  socket.send(
    JSON.stringify({ protocol: "gfos-midi/1", type: "hello", client: "test" }),
  )
  socket.send(
    JSON.stringify({
      protocol: "gfos-midi/1",
      type: "midi",
      bytes: [0x90, 60, 100],
      delayMs: 10,
      trackId: 4,
    }),
  )
  await waitFor(() => received.length === 1)
  assert.deepEqual(received, [{ bytes: [0x90, 60, 100], trackId: 4 }])

  const health = await fetch(`http://127.0.0.1:${address.port}/health`).then((r) =>
    r.json(),
  )
  assert.equal(health.status, "ok")
  assert.equal(health.acceptedMessages, 1)
  assert.equal(health.midiBytes, 3)
  assert.equal(health.output, "test output")
  socket.close()
  await bridge.close()
})

test("bridge rejects malformed MIDI without reaching the output", async () => {
  const received = []
  const bridge = createBridgeServer({
    port: 0,
    output: { description: "test output", send: (bytes) => received.push(bytes) },
  })
  const address = await bridge.listen()
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/midi`)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  socket.send(
    JSON.stringify({
      protocol: "gfos-midi/1",
      type: "midi",
      bytes: [0x90, 999],
      delayMs: 0,
    }),
  )
  await waitFor(() => bridge.stats.rejectedMessages === 1)
  assert.equal(received.length, 0)
  socket.close()
  await bridge.close()
})
