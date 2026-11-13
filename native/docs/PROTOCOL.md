# WING native driver — implementation and verification

This driver is original TypeScript implementing the published WING native binary protocol. It uses the native iPad transport; there is no server, computer, OSC subscription, HTTP endpoint, or WebSocket in the live connection. The browser simulation is a separate driver.

**Status:** codec and session behavior have been tested with documented byte fixtures and a fake transport. No physical WING, iPad, or Apple SDK was available for this implementation. Passing these tests does not establish hardware compatibility or that an iPad binary has been compiled.

## Sources and version

The principal source is Patrick-Gilles Maillot's **WING Remote Protocols V3.1.2-a**, for firmware 3.1.2 and later, with native interface details attributed by the document to Behringer:

- [WING Remote Protocols](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md)
- [Source revision e720dcb075b20808ebffad5619d619ae8183deae](https://github.com/pmaillot/WingRemoteProtocols/commit/e720dcb075b20808ebffad5619d619ae8183deae), dated 22 October 2026.

Relevant sections are **Remote communications with WING**, **OSC Tag Type 'blob' or 'binary' use** (published native definition bodies), **WING native / binary data interface**, **Binary Stream Format**, **Node Definition Response**, **Meter Request Tokens**, **Meter Data**, and **Event-driven programming**. These describe identity discovery, wire tokens, escape handling, live property events, schema responses, and meter packet layout.

The independently maintained [libwing documentation](https://docs.rs/libwing/latest/libwing/) and [console implementation](https://docs.rs/libwing/latest/src/libwing/console.rs.html) were cross-checked for request termination and the absence of a set acknowledgement. No libwing implementation code is incorporated. The small published definition bodies in the tests are protocol fixtures, not production hash tables.

## Transport and session boundary

| Purpose | Transport | Peer / behavior |
| --- | --- | --- |
| Identity | UDP to console port 2222 | Unicast `WING?`; validate the reply's selected IP and fields |
| Control and schema | TCP to console port 2222 | Native binary communication channel ID **1** |
| Meter collection requests | Same TCP socket | Native binary communication channel ID **3** |
| Meter packets | UDP to the iPad's returned ephemeral port | Raw report ID and meter words, without TCP escaping |

The document sometimes labels channels with one-based names. This implementation uses actual wire IDs: `DF D1` for control and `DF D3` for meter requests.

The transport accepts a literal local IPv4 address. The current app permits RFC1918 addresses and the usable link-local range; it rejects hostnames, public IPs, ambiguous leading-zero forms, and addresses ending in 0 or 255. This is an application boundary, not a WING protocol requirement. Only packets from the selected native session are consumed. The Swift transport additionally restricts peers to the selected console address.

`connect()` succeeds only after both of these complete:

1. An actual identity response: `WING,ip,name,model,serial,firmware`. The driver does not invent a console name, model, or firmware when discovery fails.
2. Root node definitions containing the expected `ch` and `bus` containers.

TCP connection establishment has the native transport's deadline. Identity has a 3.5-second deadline with unicast retries. Each serialized control request has a 2.5-second deadline. A wrong IP, unsupported schema, malformed stream, dropped connection, or expired request leaves the controller disconnected/error, rather than a simulated success.

The native transport must preserve the entire TCP byte sequence in order, including any bytes received while its connect promise is being delivered. In particular, an initial channel selector cannot be dropped or released after later stream bytes.

## Streaming codec

`src/wing/protocol.ts` provides the incremental stream decoder, checked node-definition parser, request/value encoders, identity parser, and meter codec.

The decoder retains escape state, current communication channel, selected node hash, and incomplete control tokens across TCP chunks. It handles split escape pairs, split UTF-8 strings and numbers, multiple replies in one chunk, and a control token interrupted by another communication channel. Literal `DF` bytes follow the manufacturer's receive algorithm, including repeated `DF` and `DF` followed by a non-reserved byte. Outgoing payloads quote every literal `DF` as `DF DE` and select their channel on every send.

Signed integers, unsigned hashes, lengths, floats, and meter words use the published big-endian format. Normalized float tokens (`D6`) are recognized but are **not** published as dB or used to confirm writes. The driver's values come from the parameter's regular numeric/string data.

Malformed lengths, invalid UTF-8, unknown control tokens, unsupported node types, non-finite values, or oversized input cause a protocol error and close the session. A single definition is limited to 256 KiB; pending control bytes and individual TCP chunks are limited to 1 MiB. The decoder never scans past an unknown token in an attempt to guess where the stream resumes.

## Dynamic schema and paths

Node hashes are resolved from console definitions and cached **only for the current session**. There are no production hash constants for channel, send, or bus nodes.

Root definitions are requested using the documented root selector and definition request. Each subsequent path segment is found among the requested parent's definitions. Matching uses the published node name; unnamed indexed nodes use their returned numeric index. A name/index must resolve uniquely. Definitions provide the parent hash, hash, index, names, type flags, read-only flag, bounds, and enum/string metadata.

The cache records completed collections as well as individual resolved paths, so repeated reads of eight sends reuse `/`, `/ch`, channel, send, and bus definitions. A missing parameter fails immediately after that collection is known; the driver does not retry it through a long chain of timeouts.

The initial UI reads these leaf paths:

| Path | Meaning |
| --- | --- |
| `/ch/n/$name`, `/ch/n/$col` | Effective strip/source-linked display name and color, read-only |
| `/ch/n/name`, `/ch/n/col` | Also supported by the resolver: raw strip metadata |
| `/ch/n/send/b/lvl` | Channel-to-bus send level in dB |
| `/ch/n/send/b/on` | Channel-to-bus send enable, 0 or 1 |
| `/bus/b/name` | Bus name |
| `/bus/b/fdr` | Bus master fader level in dB |

The supported UI range is channels 1–40 and buses 1–16, with eight visible channels. These are stage monitor sends and buses; they are distinct from the console's own `cfg/mon` listening section. No per-send equalizer, routing change, pre/post change, dynamics change, or FX control is implemented in this version.

## Reads, console events, and confirmed writes

The protocol's end-of-request token has no transaction ID. Consequently all definition reads, value reads, and complete write/readback transactions share one queue. Meter requests use their separate channel and report IDs.

Value events for resolved paths are published to `onValue`, including unsolicited console changes and values returned during `get()` or write verification. A value received for another hash does not satisfy the current read. Normal reads complete only after the request end token.

Only these writes pass the driver's allowlist:

- Channel 1–40 to bus 1–16 send level: −144 to +10 dB.
- The same send's `on` flag: exactly 0 or 1.
- Bus 1–16 master fader level: −144 to +10 dB.

The resolved parameter must also have a compatible numeric type, permit writes, and accept the value within its declared bounds. FOH channel faders, phantom power, headamps, bus mute, routing, and all other paths are blocked. The application store separately controls the user-visible editing permission and starts live connections in read-only mode.

WING does not return a dedicated acknowledgement for a set. `set()` therefore sends the value and immediately performs a fresh, serialized read of that same hash. It resolves only after that read ends with a matching value. Integer flags must match exactly; level readbacks currently allow **0.11 dB** for float representation and ordinary fader quantization. The actual reported value is always published; it is never replaced with the desired value.

The 0.11 dB tolerance is deliberately conservative and requires hardware verification over the full fader range. If the console quantizes a very low level more coarsely, the controller may report an unconfirmed write even though it moved the fader. The bench procedure should record those exact requested/reported pairs before changing this tolerance. A changed value, ignored write, or missing readback never becomes an optimistic success.

**An unconfirmed write may already have reached the console.** The driver does not attempt an automatic rollback or resend: another operator could have changed the value in the meantime. Reconnection reads current console state.

## Liveness, teardown, and reconnect

Every four seconds the client queues a normal read of an already resolved leaf. If no leaf has yet been read, it resolves and reads `/bus/1/fdr`. This keeps traffic within the console's documented 10-second receive inactivity limit and verifies that replies still arrive. Only one heartbeat may be queued at a time; it shares the same request queue as user operations and never reads the whole tree.

A timed-out control request closes the session. Continuing on that TCP stream would let a delayed end marker be mistaken for the next request's end. Teardown immediately rejects the active request, cancels all queued work through a session epoch, clears schema/meter state, removes transport listeners, and stops renewal/liveness timers. Late packets and completion callbacks from the old session cannot update the new one.

Disconnect, native suspension, and reconnect do not replay any values. Each fresh session discovers hashes again and reads actual state. Background socket closure is handled by the native plugin; restoring a live app connection still requires the normal identity/schema/read path and the store's read-only policy.

## Meter collection

The driver requests the eight-word channel and bus collection format. It sends the iPad's UDP port, a new client report ID, selected zero-based channel indices, the selected bus index, and collection end. A new selection receives a new report ID. Every 2.5 seconds the current report ID is renewed, before the documented five-second expiry. Old collections expire naturally; their late packets are ignored immediately by report ID.

The UDP payload is a four-byte report ID followed by eight signed 16-bit words per requested source, in request order. Level words are divided by 256 to produce dBFS. For each visible channel the UI gets the larger of its left/right **input** meters. For the selected bus it gets the larger of the left/right **output** meters. These are not separate meters of each channel-to-bus contribution. Gate/dynamics words are present in the packet but not shown.

Packets must have the exact expected length and current report ID. `subscribeMeters()` confirms only that the request was sent; it does not pretend that a UDP meter frame has arrived. Frames carry the actual local receive time so the store can display missing/stale metering.

## Verification performed

Run:

```sh
npm test -- tests/protocol-codec.test.ts tests/protocol-client.test.ts
npx tsc --noEmit
```

The codec tests include independent wire fixtures, every split point of an escaped float reply, repeated escape bytes, interleaved communication channels, signed values, UTF-8 strings, extended definition lengths, published root/DAW definition bodies, malformed and oversized payloads, meter ordering/dB conversion, stale reports, identity validation, and write boundaries.

The fake-console tests change hashes between connections and cover serial discovery, collection caching, spontaneous updates, lack of write acknowledgement, delayed end markers, unrelated values, ignored/read-only writes, queued write cancellation, late packets, missing identity/schema, heartbeat liveness, malformed stream teardown, suspension, and meter renewal/selection.

## Required hardware checks

Before using the app during a show, compile/sign it with Xcode and check it with the intended WING Rack firmware and router. Confirm identity/root definition traversal, source-linked names, all five channel banks and all 16 buses, external changes from the console and another controller, send/bus level readbacks including silence and the low-level range, send enable, Remote Lock TCP rejection, meter port receipt, Wi-Fi interruption, app suspension, and reconnect. Start with editing disabled and use a controlled test session for signal-changing checks.

Those checks are pending. The automated fake transport cannot establish actual firmware timing, Wi-Fi performance, the iOS local-network permission flow, UDP delivery, or live audio behavior.
