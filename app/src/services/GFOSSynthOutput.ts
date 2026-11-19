import type { SendableEvent, SynthOutput } from "@signal-app/player"
import { serialize } from "midifile-ts"

const SOCKET_CONNECTING = 0
const SOCKET_OPEN = 1
const MAX_QUEUED_MESSAGES = 512

type SocketFactory = (url: string) => WebSocket

type BridgeMidiMessage = {
  protocol: "gfos-midi/1"
  type: "midi"
  bytes: number[]
  delayMs: number
  clientTimestampMs: number
  trackId?: number
}

/**
 * Sends Signal's scheduled MIDI stream to the local GFOS host service.
 *
 * The host owns final scheduling because its monotonic clock is not shared
 * with the browser. delayMs is therefore relative to receipt; the client
 * timestamp is diagnostic only.
 */
export class GFOSSynthOutput implements SynthOutput {
  private socket: WebSocket | null = null
  private readonly queuedMessages: string[] = []

  constructor(
    private readonly url: string,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}

  activate(): void {
    if (
      this.socket?.readyState === SOCKET_CONNECTING ||
      this.socket?.readyState === SOCKET_OPEN
    ) {
      return
    }

    const socket = this.socketFactory(this.url)
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) {
        return
      }
      socket.send(
        JSON.stringify({
          protocol: "gfos-midi/1",
          type: "hello",
          client: "GFOpenSignal",
        }),
      )
      this.flushQueue(socket)
    }

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null
      }
    }
    socket.onerror = () => {
      // A later MIDI event retries the connection. The browser reports the
      // transport error itself; no network service is required for editing.
    }
  }

  sendEvent(
    event: SendableEvent,
    delayTime: number,
    timestampNow: number,
    trackId?: number,
  ): void {
    const message: BridgeMidiMessage = {
      protocol: "gfos-midi/1",
      type: "midi",
      bytes: Array.from(serialize({ ...event, deltaTime: 0 }, false)),
      delayMs: Math.max(0, delayTime * 1000),
      clientTimestampMs: timestampNow,
      ...(trackId === undefined ? {} : { trackId }),
    }

    const encoded = JSON.stringify(message)
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(encoded)
      return
    }

    if (this.queuedMessages.length === MAX_QUEUED_MESSAGES) {
      this.queuedMessages.shift()
    }
    this.queuedMessages.push(encoded)
    this.activate()
  }

  private flushQueue(socket: WebSocket) {
    while (
      this.socket === socket &&
      socket.readyState === SOCKET_OPEN &&
      this.queuedMessages.length > 0
    ) {
      const message = this.queuedMessages.shift()
      if (message !== undefined) {
        socket.send(message)
      }
    }
  }
}
