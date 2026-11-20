import styled from "@emotion/styled"
import MusicNote from "mdi-react/MusicNoteIcon"
import { useSyncExternalStore } from "react"
import { useStores } from "../../hooks/useStores"
import { IconStyle } from "./Navigation"

const Status = styled.div`
  align-items: center;
  align-self: center;
  background: color-mix(in srgb, var(--color-background) 78%, transparent);
  border: 1px solid var(--color-divider);
  border-radius: 999px;
  color: var(--color-text-secondary);
  display: flex;
  font-size: 0.7rem;
  gap: 0.45rem;
  margin-right: 0.5rem;
  padding: 0.3rem 0.65rem;

  &::before {
    background: var(--bridge-color);
    border-radius: 50%;
    box-shadow: 0 0 0.45rem var(--bridge-color);
    content: "";
    height: 0.45rem;
    width: 0.45rem;
  }
`

export const GFOSBridgeStatus = () => {
  const { gfosSynth } = useStores()
  const bridgeStatus = useSyncExternalStore(
    gfosSynth?.subscribeStatus ?? (() => () => undefined),
    gfosSynth?.getStatus ?? (() => "disconnected" as const),
  )

  const label =
    bridgeStatus === "connected"
      ? "AkikoPlus bridge ready"
      : bridgeStatus === "connecting"
        ? "Connecting to AkikoPlus"
        : "AkikoPlus bridge offline"
  const color =
    bridgeStatus === "connected"
      ? "#58d68d"
      : bridgeStatus === "connecting"
        ? "#f5b041"
        : "#85929e"

  return (
    <Status
      aria-label={label}
      title="Local AkikoPlus / GFOpenSynth MIDI bridge"
      style={{ "--bridge-color": color } as React.CSSProperties}
    >
      <MusicNote style={{ ...IconStyle, width: "1rem", height: "1rem" }} />
      {label}
    </Status>
  )
}
