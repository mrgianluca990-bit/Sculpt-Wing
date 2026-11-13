# WING native API — Sculpt Wing 0.5

## Scope and verification

This extends the original Capacitor native TCP/UDP driver. The Swift WingSocketPlugin is unchanged. Writes use live firmware node metadata; the old CH→BUS/BUS-fader allowlist is removed.

Verified with TypeScript and automated tests against independent synthetic protocol fixtures. **No physical WING, Apple SDK build, signed iOS installation, or real Wi-Fi connection was available.** Tests do not certify real-console behavior, firmware compatibility, or iOS local-network permission handling.

An installed iPhone/iPad app can use this native transport through the local router without a computer during use. A web browser alone does not gain raw TCP/UDP access from this driver.

## Public methods

Import WingClient from src/wing/client; NativeTransport from src/wing/native; public types from src/wing/types. NodeDefinition/NodeMetadata are also re-exported from protocol.ts.

~~~ts
const client = new WingClient(new NativeTransport());
await client.connect('192.168.1.62');
await client.describe('/');                       // root metadata
await client.list('/');                           // root children
await client.list('/ch/1/eq', { refresh: true });   // explicit invalidation
const meta = await client.describe('/ch/1/eq/1f');
await client.get(meta.path);
await client.set(meta.path, 1000, { revision: meta.revision });
await client.set('/ch/1/send/1/mode', 'PRE');
await client.set('/fx/1/mdl', 'VSS3');
const action = await client.trigger('/fx/1/load', 1);
await client.disconnect();
~~~

- describe(path): Promise<NodeMetadata>
- list(path, options?: {refresh?: boolean}): Promise<NodeMetadata[]>
- get(path): Promise<WingValue>
- set(path, value, options?: {revision?: number}): Promise<void>
- trigger(path, value = 1, options?: {revision?: number}): Promise<{actual?: WingValue}>
- readTree(path, options?: {depth?: number}): Promise<Record<string, WingValue>>
- onValue((path, value) => ...), onStatus((status, message?) => ...)
- onSchemaChange(({path, revision, model?}) => ...)
- subscribeStripMeters(selection): Promise<void>
- onStripMeters(frame => ...), onMeters(frame => ...)
- Legacy subscribeMeters(channels, bus) remains available.

Every event registration returns an unsubscribe function. WingSchemaDriver extends legacy WingDriver; offline/demo drivers can retain the smaller interface.

## Metadata and typed validation

~~~ts
type WingValue = number | string;
interface NodeDefinition {
  parent: number; id: number; index: number;
  name: string; longName: string; flags: number;
  type: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readOnly: boolean;
  min?: number; max?: number; steps?: number; maxLength?: number;
  items?: Array<{ value: WingValue; label: string }>;
}
interface NodeMetadata extends NodeDefinition {
  path: string;
  unit: number;       // flags & 15
  revision: number;   // monotonic session/subtree revision
}
~~~

| Type | Meaning | Native set encoding |
|---|---|---|
| 0 | Container | Not writable |
| 1 | Linear float | D5 float32 |
| 2 | Logarithmic float | D5 float32 |
| 3 | Fader level | D5 float32 |
| 4 | Integer | Compact integer / signed int16 / signed int32 |
| 5 | String enum | Exact firmware string; never dropdown index |
| 6 | Float enum | Exact permitted value as float32 |
| 7 | String | Length-prefixed UTF-8 |

Units: 0 none, 1 dB, 2 percent, 3 ms, 4 Hz, 5 metres, 6 seconds, 7 octaves. Unknown units are retained without a fabricated label.

Returned metadata/enum items are defensive copies. The driver validates the actual cached firmware definition. Read-only, wrong types, invalid enum values, out-of-range numbers and overlong strings cannot reach the set socket.

String maxLength and the 256-byte wire maximum are enforced on encoded UTF-8 bytes. Type-3 metadata has no bounds/steps payload; its documented −144…+10 dB limits are applied. Unknown or ambiguous paths fail rather than silently selecting the wrong hash.

### Confirmation

Persistent set operations perform a fresh serialized readback. Integer/string values must match. Numeric enums match float32 representations. Linear/log float confirmation includes float32 precision and half a declared firmware step: linear spacing (max-min)/(steps-1), logarithmic spacing in log-ratio space.

Native type-3 definitions carry no quantization curve. Fader confirmation therefore uses float32 precision only. **Actual WING fader quantization remains a hardware acceptance item.** An unexpected quantized readback is published as actual state and generates an unconfirmed-write error. The old universal 0.11-unit margin is not applied to Hz/ms/plugin parameters.

Trigger operations validate, transmit and freshly read the actual value without requiring equality to the trigger input. A self-resetting action can return actual:0. This reports dispatch/readback, **not proof that the action completed**. Refresh the owning processor/device afterwards. Use set for persistent values.

## Efficient selected-node reads

~~~ts
await client.readTree('/ch/1');                // depth:0
await client.readTree('/ch/1/eq');             // direct plugin parameters
await client.readTree('/ch/1', {depth: 1});    // optional extra level
~~~

Default depth 0 enumerates only immediate children, then sends ONE native data request for the selected container. A channel read returns direct scalar leaves such as fader/mute/name/pan without enumerating all processors and sends. A processor read learns its model if needed and lists its parameters, then requests that processor's data.

Higher depth enumerates that many additional levels. Accepted depth: 0…8; maximum traversal: 4096 nodes. These are convenience-traversal limits, not a restriction on accessible console functions. A leaf is also accepted and returns a single entry. Missing values are omitted, not replaced by zero.

The console can send deeper values in the same data reply. The client decodes them but returns only leaves whose metadata was enumerated. Known leaves also generate onValue events. A model revision change during the read rejects the stale snapshot. Do not recursively enumerate all 76 strips just to draw faders.

## Model changes and stale controls

The client automatically tracks channel filter/gate/EQ/dynamics and FX model selectors. A /mdl update can reuse a hash for a different name/type/unit/range (for example, EQ STD parameter 7 is 1q; SOUL parameter 7 is lmg).

On a known model change, the driver advances that subtree's revision, invalidates descendant definitions/paths/aliases, keeps the model selector known, rejects old queued writes and emits onSchemaChange. The UI must invalidate that editor, then list/readTree it again. A first model write establishes the previous model first, so stale queued edits are protected even on first use.

Pass the editor's original meta.revision to set/trigger to reject a gesture started before a model change but released after it. Without an explicit revision, the revision is captured when queued. Explicit list refresh and reconnect also advance revisions. Incoming changed definitions outside a definition request invalidate their owning subtree.

Do not call list({refresh:true}) unconditionally from onSchemaChange; refresh itself emits a schema event. A normal list/readTree is the appropriate response.

## Real strip meters

~~~ts
await client.subscribeStripMeters({
  ch: [1, 2, 40], aux: [1, 8], bus: [1, 16],
  main: [1, 4], mtx: [1, 8]
});
client.onStripMeters(frame => { /* full typed frame */ });
~~~

| Key | Range | Native group |
|---|---:|---:|
| ch | 1…40 | A0 |
| aux | 1…8 | A1 |
| bus | 1…16 | A2 |
| main | 1…4 | A3 |
| mtx | 1…8 | A4 |

Ordering is CH, AUX, BUS, MAIN, MTX, preserving index order within each family. Wire indexes are zero-based. Every collection gets a new report ID; stale IDs and wrong packet lengths are dropped.

StripMeterFrame includes channels, auxiliaries, buses, mains, matrices, reportId, receivedAt and strips. Scalar maps contain maximum stereo input dB for CH/AUX and maximum stereo output dB for BUS/MAIN/MTX. The strips map uses short family keys; each selected strip has:

~~~ts
{
  input: [leftDb, rightDb],
  output: [leftDb, rightDb],
  gateKey: number, dynKey: number,
  gateGainRaw: number, dynGainRaw: number
}
~~~

Each standard strip is eight signed big-endian 16-bit words. Audio/key levels are divided by 256. Gate/dynamics gain words stay raw because gain-reduction scaling depends on the selected processor. They must not be displayed as invented dB gain reduction.

All 76 strips fit in a 1220-byte packet including report ID. Meter renewal: 2.5 s (documented expiry 5 s). Control keepalive: 4 s (TCP inactivity expiry 10 s). onMeters remains compatible and receives extended fields too; onStripMeters has the complete required type.

Not yet implemented: FX-slot state meters, DCA/monitor/RTA groups or V2 strip-state meters. Their different sizes/scaling need explicit decoders.

## Existing lifecycle safeguards retained

TCP 2222 carries native control and meter requests. UDP identity and the local UDP meter listener remain unchanged. There is one pending control request; timeout invalidates the session because the end token carries no request ID. Socket transmission is not ACK.

Old session IDs/packets, queued old-session writes and background suspension remain isolated. Background closes the session; reconnect is explicit and does not replay demo values. Mixer state remains authoritative.

## Sources and checks

Protocol source: Patrick-Gilles Maillot, WING Remote Protocols, local v3.1.2-a reference; native-interface/token tables, node flags, dynamic plugin mapping, meter request/data tables.

- https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md
- https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf
- https://developer.apple.com/documentation/network

From native:

~~~sh
npm test
./node_modules/.bin/tsc -b
npm run build
~~~

The schema tests use an independent synthetic console with authentic byte structures, enum/string wire expectations, typed metadata, a model that reuses a hash, delayed requests, a self-resetting action and complete 76-strip meter packets. They verify the software contract, not hardware behavior.
