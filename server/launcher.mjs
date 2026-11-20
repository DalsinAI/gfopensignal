import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createBridgeServer, createCaptureOutput, createUdpOutput } from "./bridge.mjs"

const root = normalize(join(fileURLToPath(new URL("..", import.meta.url)), "dist"))
const host = "127.0.0.1"
const webPort = Number.parseInt(process.env.GFOS_WEB_PORT ?? "4179", 10)
const bridgePort = Number.parseInt(process.env.GFOS_BRIDGE_PORT ?? "4711", 10)
const target = process.env.GFOS_MIDI_UDP ?? "127.0.0.1:4712"
const separator = target.lastIndexOf(":")
const output = process.env.GFOS_MIDI_CAPTURE
  ? createCaptureOutput(process.env.GFOS_MIDI_CAPTURE)
  : createUdpOutput({
      host: target.slice(0, separator),
      port: Number.parseInt(target.slice(separator + 1), 10),
    })

const bridge = createBridgeServer({ host, port: bridgePort, output })
await bridge.listen()

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
}

const web = createServer((request, response) => {
  const requestPath = request.url === "/" ? "/edit.html" : request.url.split("?")[0]
  const path = normalize(join(root, decodeURIComponent(requestPath)))
  if (!path.startsWith(`${root}/`) || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("Not found\n")
    return
  }
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": types[extname(path)] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  })
  createReadStream(path).pipe(response)
})

await new Promise((resolve, reject) => {
  web.once("error", reject)
  web.listen(webPort, host, () => resolve())
})

const url = `http://${host}:${webPort}/edit.html`
console.log(`GFOpenSignal ${url}`)
console.log(`MIDI bridge ws://${host}:${bridgePort}/midi -> ${output.description}`)

if (!process.argv.includes("--no-open") && process.env.GFOS_NO_OPEN !== "1") {
  const opener =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  spawn(opener[0], opener[1], { detached: true, stdio: "ignore" }).unref()
}

const stop = async () => {
  await new Promise((resolve) => web.close(resolve))
  await bridge.close()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
