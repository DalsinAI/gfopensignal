# GFOpenSignal 0.1.0-rc1 receipt

GFOpenSignal is the x86-hosted GFOS port of the MIT Signal MIDI sequencer.
Upstream history is preserved at `dc5e0313c1b1fd279c3f65b505f177532bd113ab`.

## RC contents

- Offline GFOS editor: no Firebase, Sentry, remote SoundFont or account path.
- Local import, editing, autosave and MIDI export.
- `gfos-midi/1` WebSocket client with bounded pre-connect queue.
- Loopback-only x86 bridge with bounded messages and scheduling delay.
- AkikoPlus raw-MIDI output, capture diagnostics and JSON health status.
- One launcher for the bridge and static editor.
- Visible bridge state in the editor.

## Required companion

AkikoPlus/GFOpenSynth host ingress is implemented in the focused
[`DalsinAI/gfosmotherboards#206`](https://github.com/DalsinAI/gfosmotherboards/pull/206).
It is default-off and binds only to loopback when `AC_AKIKO_MIDI_UDP` is set.

## Evidence

- app TypeScript: passed
- touched-file Biome: passed
- app tests: 46/46 passed
- bridge integration: 2/2 passed
- AkikoPlus native MIDI port/ingress: 19/19 passed
- normal and GFOS production builds: required by LumaVault CI
- screenshot: `evidence/gfopensignal-0.1.0-rc1.png`
- archive checksum: `SHA256SUMS`

The release remains a candidate until both focused PRs are reviewed and the
published archive is exercised with the selected Cradle instance.
