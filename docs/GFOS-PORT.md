# GFOpenSignal port

GFOpenSignal keeps Signal's MIT-licensed editor and domain engine, and adds a
local GFOS runtime mode for the x86 Cradle host. The Amiga remains the user-facing
system; the host performs the modern browser UI and sends scheduled MIDI to
GFOpenSynth or AkikoPlus.

## Current port slice

- Upstream is pinned by Git history to `ryohey/signal` commit `dc5e0313c1`.
- `pnpm build:gfos` creates the static GFOS build.
- Firebase and Sentry are not initialized in GFOS mode.
- The stock remote SoundFont and metronome downloads are not used in GFOS mode.
- Local editing, browser storage, MIDI import/export and autosave remain available.
- Playback is sent to `ws://127.0.0.1:4711/midi` by default.
- The included launcher starts the loopback-only WebSocket service and static
  editor together. The service sends raw MIDI datagrams to AkikoPlus on
  `127.0.0.1:4712` by default.

No SoundFont or game/media data is bundled by this port. GFOpenSynth/AkikoPlus
or a user-supplied MIDI destination owns synthesis.

## Bridge contract: `gfos-midi/1`

The browser opens the configured WebSocket and sends a hello record:

```json
{"protocol":"gfos-midi/1","type":"hello","client":"GFOpenSignal"}
```

Each scheduled MIDI event is a JSON record:

```json
{
  "protocol": "gfos-midi/1",
  "type": "midi",
  "bytes": [144, 60, 100],
  "delayMs": 25,
  "clientTimestampMs": 1234.5,
  "trackId": 7
}
```

`delayMs` is relative because the browser and host service do not share a
monotonic-clock epoch. The host queues the MIDI bytes for that delay and then
routes them to GFOpenSynth or AkikoPlus. `clientTimestampMs` is diagnostic.

The browser keeps at most 512 messages while connecting and discards the oldest
message if that bound is exceeded. Editing remains usable if the bridge is not
running.

## Build

Requires Node 24 and the pinned pnpm version from `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm build:gfos
```

Set `GFOS_SYNTH_BRIDGE_URL` before the build to use another local endpoint.

## Run the x86 package

The release package requires Node.js 24 or newer. On the selected Cradle
machine, enable the matching loopback ingress with:

```sh
AC_AKIKO_MIDI_UDP=4712 a1200native [...]
```

Then launch the editor and bridge together:

```sh
./GFOpenSignal
```

Both listeners bind only to `127.0.0.1`. `GFOS_MIDI_UDP=127.0.0.1:PORT`
selects a different AkikoPlus instance. `GFOS_MIDI_CAPTURE=/path/events.jsonl`
captures scheduled events for diagnostics without sending them to a synth.

## RC1 qualification

- The x86 bridge service, bounded scheduler and health endpoint are covered by
  Node integration tests.
- AkikoPlus's native GFOpenSynth path accepts the loopback datagrams through
  the same parser and audio engine as its Amiga MIDI device.
- The editor starts without Web-MIDI permission in GFOS mode and displays the
  live bridge state.
- Lint, TypeScript, the full upstream tests, normal/GFOS production builds,
  package hashes and a clean-browser screenshot are release gates in CI.

