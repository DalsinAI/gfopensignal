import { createHash } from "node:crypto"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const version = process.env.GFOS_VERSION ?? "0.1.0-rc1"
const root = resolve(import.meta.dirname, "..")
const out = join(root, "release")
const stage = join(out, `GFOpenSignal-${version}`)
await rm(stage, { recursive: true, force: true })
await mkdir(stage, { recursive: true })

for (const entry of ["dist", "server", "docs", "LICENSE", "README.md"]) {
  await cp(join(root, entry), join(stage, basename(entry)), { recursive: true })
}
const screenshot = join(out, "evidence", "gfopensignal-0.1.0-rc1.png")
if (await readFile(screenshot).then(() => true, () => false)) {
  await mkdir(join(stage, "evidence"), { recursive: true })
  await cp(screenshot, join(stage, "evidence", basename(screenshot)))
}
await writeFile(
  join(stage, "GFOpenSignal"),
  "#!/bin/sh\nset -eu\ncd \"$(dirname \"$0\")\"\nexec node server/launcher.mjs \"$@\"\n",
  { mode: 0o755 },
)
await writeFile(
  join(stage, "RELEASE.json"),
  `${JSON.stringify(
    {
      name: "GFOpenSignal",
      version,
      upstream: "ryohey/signal@dc5e0313c1b1fd279c3f65b505f177532bd113ab",
      license: "MIT",
      bridge: "gfos-midi/1",
      node: ">=24",
    },
    null,
    2,
  )}\n`,
)

const archive = join(out, `GFOpenSignal-${version}-linux-x64.tar.gz`)
const tar = spawnSync("tar", ["-C", out, "-czf", archive, basename(stage)], {
  stdio: "inherit",
})
if (tar.status !== 0) process.exit(tar.status ?? 1)
const data = await readFile(archive)
const digest = createHash("sha256").update(data).digest("hex")
await writeFile(join(out, "SHA256SUMS"), `${digest}  ${basename(archive)}\n`)
console.log(`${archive}\nsha256 ${digest}`)
