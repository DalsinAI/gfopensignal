import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { createServer } from "node:http"
import { createSocket } from "node:dgram"
import { pathToFileURL } from "node:url"

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const MAX_FRAME_BYTES = 32 * 1024
const MAX_DELAY_MS = 10_000

const isLoopbackName = (value) =>
  value === "127.0.0.1" || value === "localhost" || value === "[::1]"

const originAllowed = (origin) => {
  if (origin === undefined || origin === "null") return true
  try {
    return isLoopbackName(new URL(origin).hostname)
  } catch {
    return false
  }
}

const encodeFrame = (opcode, payload = Buffer.alloc(0)) => {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, body.length]), body])
  }
  return Buffer.concat([
    Buffer.from([0x80 | opcode, 126, body.length >> 8, body.length & 0xff]),
    body,
  ])
}

const decodeFrames = (buffer) => {
  const frames = []
  let offset = 0
  while (buffer.length - offset >= 2) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const final = (first & 0x80) !== 0
    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let headerLength = 2
    if (!final || !masked) throw new Error("unsupported WebSocket frame")
    if (length === 126) {
      if (buffer.length - offset < 4) break
      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      throw new Error("WebSocket frame is too large")
    }
    if (length > MAX_FRAME_BYTES) throw new Error("WebSocket frame is too large")
    const total = headerLength + 4 + length
    if (buffer.length - offset < total) break
    const maskOffset = offset + headerLength
    const payloadOffset = maskOffset + 4
    const payload = Buffer.allocUnsafe(length)
    for (let i = 0; i < length; i++) {
      payload[i] = buffer[payloadOffset + i] ^ buffer[maskOffset + (i & 3)]
    }
    frames.push({ opcode, payload })
    offset += total
  }
  return { frames, remaining: buffer.subarray(offset) }
}

export const createUdpOutput = ({ host = "127.0.0.1", port = 4712 } = {}) => {
  if (!isLoopbackName(host)) {
    throw new Error("GFOpenSignal MIDI output must remain on loopback")
  }
  const socket = createSocket("udp4")
  return {
    description: `AkikoPlus UDP ${host}:${port}`,
    send(bytes) {
      socket.send(Buffer.from(bytes), port, host)
    },
    close() {
      socket.close()
    },
  }
}

export const createCaptureOutput = (path) => {
  const stream = createWriteStream(path, { flags: "a" })
  return {
    description: `capture ${path}`,
    send(bytes, message) {
      stream.write(
        `${JSON.stringify({
          at: new Date().toISOString(),
          bytes: Array.from(bytes),
          trackId: message.trackId,
        })}\n`,
      )
    },
    close() {
      stream.end()
    },
  }
}

export const createBridgeServer = ({
  host = "127.0.0.1",
  port = 4711,
  output = createUdpOutput(),
} = {}) => {
  if (!isLoopbackName(host)) {
    throw new Error("GFOpenSignal bridge must bind to loopback")
  }

  const startedAt = new Date().toISOString()
  const clients = new Set()
  const timers = new Set()
  const stats = {
    acceptedMessages: 0,
    rejectedMessages: 0,
    midiBytes: 0,
  }

  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, {
        "access-control-allow-origin": request.headers.origin ?? "*",
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      })
      response.end(
        JSON.stringify({
          protocol: "gfos-midi/1",
          status: "ok",
          startedAt,
          clients: clients.size,
          output: output.description,
          ...stats,
        }),
      )
      return
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("Not found\n")
  })

  server.on("upgrade", (request, socket) => {
    if (
      request.url !== "/midi" ||
      request.headers.upgrade?.toLowerCase() !== "websocket" ||
      request.headers["sec-websocket-version"] !== "13" ||
      !originAllowed(request.headers.origin)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
      return
    }
    const key = request.headers["sec-websocket-key"]
    if (typeof key !== "string") {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
      return
    }
    const accept = createHash("sha1")
      .update(key + WEBSOCKET_GUID)
      .digest("base64")
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    clients.add(socket)
    let pending = Buffer.alloc(0)

    const reject = () => {
      stats.rejectedMessages++
    }
    const handleText = (payload) => {
      let message
      try {
        message = JSON.parse(payload.toString("utf8"))
      } catch {
        reject()
        return
      }
      if (message?.protocol !== "gfos-midi/1") {
        reject()
        return
      }
      if (message.type === "hello") {
        return
      }
      if (
        message.type !== "midi" ||
        !Array.isArray(message.bytes) ||
        message.bytes.length < 1 ||
        message.bytes.length > 4096 ||
        !message.bytes.every(
          (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
        ) ||
        !Number.isFinite(message.delayMs)
      ) {
        reject()
        return
      }
      const delayMs = Math.min(MAX_DELAY_MS, Math.max(0, message.delayMs))
      const bytes = Uint8Array.from(message.bytes)
      const timer = setTimeout(() => {
        timers.delete(timer)
        output.send(bytes, message)
        stats.acceptedMessages++
        stats.midiBytes += bytes.length
      }, delayMs)
      timers.add(timer)
    }

    socket.on("data", (chunk) => {
      try {
        pending = Buffer.concat([pending, chunk])
        const decoded = decodeFrames(pending)
        pending = decoded.remaining
        for (const frame of decoded.frames) {
          if (frame.opcode === 0x1) handleText(frame.payload)
          else if (frame.opcode === 0x8) socket.end(encodeFrame(0x8))
          else if (frame.opcode === 0x9) socket.write(encodeFrame(0xa, frame.payload))
        }
      } catch {
        reject()
        socket.end(encodeFrame(0x8))
      }
    })
    const removeClient = () => clients.delete(socket)
    socket.on("close", removeClient)
    socket.on("error", removeClient)
  })

  return {
    server,
    stats,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(port, host, () => {
          server.off("error", reject)
          resolve()
        })
      })
      return server.address()
    },
    async close() {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      for (const client of clients) client.destroy()
      clients.clear()
      await new Promise((resolve) => server.close(resolve))
      output.close?.()
    },
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const host = process.env.GFOS_BRIDGE_HOST ?? "127.0.0.1"
  const port = Number.parseInt(process.env.GFOS_BRIDGE_PORT ?? "4711", 10)
  const target = process.env.GFOS_MIDI_UDP ?? "127.0.0.1:4712"
  const separator = target.lastIndexOf(":")
  const output = process.env.GFOS_MIDI_CAPTURE
    ? createCaptureOutput(process.env.GFOS_MIDI_CAPTURE)
    : createUdpOutput({
        host: target.slice(0, separator),
        port: Number.parseInt(target.slice(separator + 1), 10),
      })
  const bridge = createBridgeServer({ host, port, output })
  await bridge.listen()
  console.log(
    `GFOpenSignal bridge listening at ws://${host}:${port}/midi -> ${output.description}`,
  )
  const stop = async () => {
    await bridge.close()
    process.exit(0)
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}
