const enabledValues = new Set(["1", "true", "yes", "on"])

const enabled = enabledValues.has(
  (process.env["GFOS_MODE"] ?? "").toLowerCase(),
)

export const gfosConfig = Object.freeze({
  enabled,
  synthBridgeUrl:
    process.env["GFOS_SYNTH_BRIDGE_URL"] ?? "ws://127.0.0.1:4711/midi",
})
