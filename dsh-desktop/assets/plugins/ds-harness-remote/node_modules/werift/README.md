# werift

werift (**We**b**r**tc **I**mplementation **f**or **T**ypeScript)

werift is a WebRTC Implementation for TypeScript (Node.js)

# install

`npm install werift`

## Development setup

Initialize the pinned upstream WPT checkout before running the package-level WPT tooling:

```sh
git submodule update --init --recursive
```

Run the allowlisted upstream WPT subset and coverage from the repository root or from this package:

```sh
npm run wpt --workspace packages/webrtc
npm run wpt:coverage --workspace packages/webrtc
```

Refresh the committed baselines when intentionally expanding upstream coverage:

```sh
npm run wpt --workspace packages/webrtc -- --update-baseline
WPT_UPDATE_COVERAGE_BASELINE=1 npm run wpt:coverage --workspace packages/webrtc
```

# Documentation (WIP)

- [Website](https://shinyoshiaki.github.io/werift-webrtc/website/build/)
- [API Reference](https://shinyoshiaki.github.io/werift-webrtc/website/build/docs/api)

# examples

https://github.com/shinyoshiaki/werift-webrtc/tree/master/examples

### SFU

https://github.com/shinyoshiaki/node-sfu

# demo

## MediaChannel

```sh
yarn media
```

open
https://shinyoshiaki.github.io/werift-webrtc/examples/mediachannel/pubsub/answer

see console & chrome://webrtc-internals/

## DataChannel

run

```sh
yarn datachannel
```

open
https://shinyoshiaki.github.io/werift-webrtc/examples/datachannel/answer

see console & chrome://webrtc-internals/

# RoadMap

## Work in Progress Towards 1.0

- [x] STUN
- [x] TURN
  - [x] UDP
- [x] ICE
  - [x] Vanilla ICE
  - [x] Trickle ICE
- [x] DTLS
  - [x] DTLS-SRTP
  - [x] Curve25519
  - [x] P-256
- [x] DataChannel
- [x] MediaChannel
  - [x] sendonly
  - [x] recvonly
  - [x] sendrecv
  - [x] multi track
- [x] RTP
- [x] RTCP
  - [x] SR/RR
  - [x] Picture Loss Indication
  - [x] ReceiverEstimatedMaxBitrate
  - [x] GenericNack
  - [x] TransportWideCC
- [x] SRTP
- [x] SRTCP
- [x] SDP
- [x] PeerConnection
- [x] Simulcast
  - [x] recv
- [x] BWE
  - [x] sender side BWE
- [ ] Documentation
- [x] Compatibility
  - [x] Chrome
  - [x] FireFox
  - [x] Pion
  - [x] aiortc
  - [x] sipsorcery
- [x] Interop E2E test
  - [x] Chrome
  - ↓↓↓ https://github.com/sipsorcery/webrtc-echoes
  - [x] Pion
  - [x] aiortc
  - [x] sipsorcery
- [ ] Unit Tests
  - [ ] follow [Web Platform Tests](https://github.com/web-platform-tests/wpt)

## Road Map Towards 2.0

- [ ] API compatible with browser RTCPeerConnection
- [ ] ICE
  - [ ] ICE restart
- [ ] SDP
  - [ ] reuse inactive m-line
- [ ] Simulcast
  - [ ] send
- [ ] support more cipher suites

## RTCPeerConnection W3C compatibility notes

API reference markdown can be regenerated with `cd packages/webrtc && npm run doc`.
For this task, the reviewable compatibility notes live in this README and in
`src/peerConnection.ts`; the generated `packages/webrtc/doc/` output is not
tracked in git, so it is not committed as part of this change.

| Status | API | Notes |
| --- | --- | --- |
| Added | `currentLocalDescription`, `pendingLocalDescription`, `currentRemoteDescription`, `pendingRemoteDescription`, `canTrickleIceCandidates`, `sctp` | Public getters now follow W3C-style pending/current description visibility and expose SCTP/canTrickle state. |
| Added | `setLocalDescription()` input compatibility | Accepts omitted `type`, empty `sdp`, and provisional `pranswer`. |
| Added | `setRemoteDescription()` input compatibility | Accepts `pranswer` and `rollback`, updating pending/current descriptions accordingly. |
| Added | `addIceCandidate()` input compatibility | Accepts omitted input, `null`, and `{ candidate: "" }` as end-of-candidates, validates `sdpMid` / `sdpMLineIndex` / `usernameFragment`, updates the matching remote m-section, rejects calls before `remoteDescription` is set, and rejects malformed candidate strings. |
| Added | `RTCConfiguration` compatibility | Accepts `iceServers`, `iceTransportPolicy`, `bundlePolicy`, `rtcpMuxPolicy: "require"`, `iceCandidatePoolSize: 0`, and `certificates`; `setConfiguration(getConfiguration())` round-trips without changing certificates. |
| Deferred | `bundlePolicy: "balanced"` round-trip | `"balanced"` is accepted for input compatibility, but it is internally normalized to werift's `"max-compat"` behavior, so `getConfiguration()` returns `"max-compat"`. |
| Added | `RTCIceServer.urls: string \| string[]` | Arrays are accepted and parsed in order. |
| Added | Standard event names | `signalingstatechange`, `iceconnectionstatechange`, `icegatheringstatechange`, `connectionstatechange`, `negotiationneeded`, `icecandidate`, `track`, and `datachannel` are emitted for `addEventListener`. |
| Not implemented | Legacy callback overloads | Kept out of scope because they are legacy browser APIs. |
| Not implemented | `addStream`, `removeStream`, `createDTMFSender` | These are obsolete; use `addTrack`, `removeTrack`, and transceiver/sender APIs instead. |
| Deferred | `close()` return type | Remains async for backward compatibility even though W3C defines synchronous `undefined`. |
| Deferred | `setLocalDescription()` return type | Non-rollback calls still return the applied `SessionDescription` instead of `Promise<void>` for backward compatibility; the local `rollback` path resolves with `undefined`. |
| Compatible | `setRemoteDescription()` return type | `setRemoteDescription()` resolves `Promise<void>` like the W3C API. |
| Deferred | `RTCPeerConnection.generateCertificate()` | `RTCCertificate` and `RTCConfiguration.certificates` are supported, but the static W3C helper is still optional work. |

# reference

- aiortc https://github.com/aiortc/aiortc
- pion/webrtc https://github.com/pion/webrtc
- etc ....
