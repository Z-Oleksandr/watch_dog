# Frontend Code Rules & Best Practices

> Reference document for all contributors to the Watch Dog front panel
> (vanilla ES modules / webpack 5 / Express static + WebSocket proxy / Canvas 2D / three.js / Chart.js).
> This defines **how** code is written, structured, and maintained for a production-grade monitoring dashboard.
> It is the frontend counterpart of `engine/code_rules.md` and holds the same bar: solid, efficient, secure.

## Table of Contents

1. [Engineering Principles](#1-engineering-principles)
2. [Architecture & Code Organization](#2-architecture--code-organization)
3. [Language & Module Rules](#3-language--module-rules)
4. [Error Handling](#4-error-handling)
5. [WebSocket Client Discipline](#5-websocket-client-discipline)
6. [Engine Protocol Contract](#6-engine-protocol-contract)
7. [State Management](#7-state-management)
8. [DOM & Rendering](#8-dom--rendering)
9. [Canvas, three.js & Chart.js](#9-canvas-threejs--chartjs)
10. [Timers, Async & Lifecycle](#10-timers-async--lifecycle)
11. [Performance & Memory](#11-performance--memory)
12. [CSS & Theming](#12-css--theming)
13. [Accessibility](#13-accessibility)
14. [Security](#14-security)
15. [Node Server (Express)](#15-node-server-express)
16. [Logging & Observability](#16-logging--observability)
17. [Build, Tooling & Dependencies](#17-build-tooling--dependencies)
18. [Testing](#18-testing)
19. [Production Readiness](#19-production-readiness)
20. [Known Deviations & Migration Path](#20-known-deviations--migration-path)

---

## 1. Engineering Principles

These principles apply to every file, every PR, every decision.

### SOLID (JavaScript-Adapted)

- **Single Responsibility**: One module = one reason to change. A transport module opens the socket and hands out parsed messages. It does not blink an indicator. A gauge draws a value. It does not know where the value came from. If a module imports both `three` and the WebSocket wrapper, it is doing two jobs.
- **Open/Closed**: Extend behavior by registering handlers, not by adding another `if (data_type == N)` branch. New engine message types are added to a dispatch table. New gauge styles are added as theme entries, not as flags threaded through the draw loop.
- **Liskov Substitution**: Anything that presents the same interface must honor the same contract. Every control that exposes `on()` / `off()` / `resetToDefault()` behaves the same way for the caller. A "no-op" implementation that silently ignores calls is a bug, not a substitute.
- **Interface Segregation**: Expose the smallest surface a consumer needs. A button-assignment API takes an index, a callback, and a label. It does not take the whole three.js scene.
- **Dependency Inversion**: Feature modules depend on abstractions (`sendMessage(type, payload)`, `display.writeLine(text)`), never on the raw `WebSocket` instance or a specific DOM node. This is what makes a module testable without a browser.

### DRY, KISS, YAGNI

- **DRY**: When the same "assign three buttons: `+`, `-`, confirm" block appears in the logger, the docker picker, and the chart picker, extract a `numericPicker({ min, max, label, onConfirm })` helper. But do not abstract two things that merely look alike today and will diverge tomorrow.
- **KISS**: A plain object literal dispatch table beats an event-emitter class hierarchy. A `Map` beats a hand-rolled registry with a `count` field that must be kept in sync.
- **YAGNI**: No framework, no state library, no router until the product needs one. The panel is a single screen driven by one socket. Build for that. Refactor when requirements change.

### Fail Fast, Degrade Gracefully

Validate a message the moment it arrives. Reject malformed input at the boundary and never let a half-valid object reach a renderer. But the panel must **never go blank**: a bad frame is logged and dropped, a lost socket shows the error indicator and reconnects, a missing sensor renders as "n/a", not as `NaN` on a brass dial.

### Composition Over Inheritance

Prefer small functions and plain objects composed in an entry point over deep class trees. Classes are fine for things with real lifecycle (a portal window, a gauge bound to a canvas). They are wrong for "a bag of two fields", which is an object literal.

### Immutability by Default

Treat incoming data as read-only. Renderers receive values and draw them. They do not mutate the message object, the shared state, or each other's DOM.

---

## 2. Architecture & Code Organization

### Layer Separation

```
front_panel/
├── public/              ← Static assets served as-is: index.html, css/, fonts/, models/, sound/
├── src/
│   ├── main.js          ← Entry point: wiring only (create transport, mount UI, start boot)
│   ├── transport/       ← WebSocket lifecycle: connect, reconnect, send, parse, dispatch
│   ├── protocol/        ← Wire contract: message type constants, payload validators, encoders
│   ├── state/           ← Application state (topology, latest stats, stream registry)
│   ├── ui/              ← DOM-bound components: display (teleprinter), panel, portals, info display
│   ├── render/          ← Pure drawing: Canvas gauges, three.js controls, Chart.js charts
│   ├── features/        ← User flows that compose the above: logging, docker streaming, chart picker
│   ├── util/            ← Pure helpers: formatting, math, logger
│   └── server.js        ← Node/Express: static hosting + WebSocket proxy (separate runtime!)
├── dist/                ← Build output. Never committed, never edited.
└── webpack.config.js
```

The current tree (`control2/`, `deco_gauge/`, `dsiplay2/`, `docker_stream/`, `functions/`, ...) maps onto these layers. New code lands in the layer it belongs to. Existing modules migrate when they are next touched (see [Section 20](#20-known-deviations--migration-path)).

**Rules:**

1. **The entry point contains no logic.** It imports, constructs, and connects. It does not own the socket, define `sendWSMessage`, or hold `isMobile()`.
2. **Transport knows nothing about the UI.** It emits parsed, validated messages. It never imports an indicator, a gauge, or the display.
3. **Render modules are pure with respect to the network.** They take values in and draw. They never import the transport or send messages.
4. **Features orchestrate.** A feature (e.g. "start a log recording") talks to the display, assigns buttons, and sends a protocol message. It is the only layer allowed to touch all three.
5. **`server.js` is a different program.** It runs under Node, not in the browser. It must not import anything from the browser bundle, and nothing in the bundle may import it.
6. **No circular imports.** If `A` imports `B` and `B` imports `A`, one of them owns something it should not. Break the cycle by moving the shared piece down a layer (usually into `state/` or `protocol/`). Webpack tolerates cycles; humans and tree-shaking do not.

### Module Sizing

- If a file exceeds ~300 lines, split it. `chart.js` (chart config + log fetching + button wiring + rendering) becomes `render/log_chart.js` + `features/chart_picker.js`.
- One module exports one cohesive thing: a class, a small set of related functions, or a constants table. A module that exports `spawn_chart`, `update_log_list`, `update_log_data`, and a theme object is four modules.

### File Naming

- Files and directories: `snake_case.js` (existing convention, keep it).
- One class per file, file named after the class in snake_case: `ContainerOutputPortal` → `container_output_portal.js`.
- Fix typos in directory names when the directory is next refactored (`dsiplay2/` → `display/`). Do not leave them for the next person.

---

## 3. Language & Module Rules

The bundle targets evergreen browsers on the local network. Modern syntax is expected; transpilation is not.

### Declarations & Scope

```js
// ❌ Forbidden
var ws = new WebSocket(url);
let ram_max_mb = 1; // module-level mutable shared state

// ✅ Required
const socket = createTransport(url);
const state = createPanelState(); // one owner, explicit accessors
```

1. `const` by default. `let` only when reassignment is real and local. `var` never.
2. No implicit globals. Every identifier is declared. Nothing is attached to `window` except by explicit, documented decision.
3. Module-level mutable `let` is a code smell. It is acceptable only for a single, private, module-owned handle (the socket, the animation frame id). Anything read by two modules lives in `state/`.

### Naming

| Kind                          | Style                   | Example                              |
| ----------------------------- | ----------------------- | ------------------------------------ |
| Variables, functions, methods | `camelCase`             | `writeLine`, `updateStats`           |
| Classes                       | `PascalCase`            | `DecoGauge`, `ContainerOutputPortal` |
| Module constants              | `UPPER_SNAKE_CASE`      | `RECONNECT_BASE_MS`, `MAX_PORTALS`   |
| Wire protocol fields          | `snake_case`            | `data_type`, `init_ram_total`        |
| Private methods / fields      | `#private` or `_prefix` | `#step(now)`, `_onPointerMove`       |
| Boolean identifiers           | `is` / `has` / `can`    | `isConnected`, `hasTemperatures`     |

Wire field names are `snake_case` because the engine serializes them that way. Everywhere else is `camelCase`. The current mix (`write_line` next to `pendingChoice`) is a deviation to fix on touch, not a style to continue.

### Modules

1. ES modules only. Named exports only; no `export default` (it defeats grep and rename tooling).
2. Import what you use: `import { Box3, Clock } from "three"`, not `import * as THREE`. Namespace imports block tree-shaking of a 600 KB library.
3. `chart.js/auto` registers every controller, scale, and plugin. Register only what the chart uses (`LineController`, `LinearScale`, `CategoryScale`, `PointElement`, `LineElement`, `Legend`, `Tooltip`).
4. No side effects at import time beyond constant definitions. A module that queries the DOM and instantiates a class the moment it is imported (`const display2 = new Display2(...)`) makes import order a hidden dependency and makes the module untestable. Export a factory or an `init()` and call it from the entry point.

### Strictness

1. `===` and `!==` always. `data_type == 0` is a bug waiting for a string.
2. No magic numbers. `5005`, `1.65 * 14`, `42`, `250`, `99899` each get a named constant with a comment explaining the value.
3. Optional chaining and nullish coalescing over manual guards: `entry?.critical ?? DEFAULT_CRITICAL`.
4. Template literals over string concatenation. No `"a" + b + "c"`.
5. `async`/`await` over `.then()` chains. A promise that is intentionally not awaited is marked: `void startBootAnimation(); // fire-and-forget, self-cancelling`.
6. Functions declared with `function` or `const fn = () =>`. Do not mix styles within a module.

### JSDoc on Public Surface

Every exported function, class, and protocol type carries a JSDoc block with parameter types and the failure behavior. This is the type system until TypeScript is adopted, and editors use it for completion and `// @ts-check` validation.

```js
/**
 * Sends a request to the engine.
 * @param {import("../protocol/types").RequestType} type
 * @param {number} payload  Engine expects a number; strings are rejected server-side.
 * @returns {boolean} false when the socket is not OPEN (message is dropped and logged).
 */
export function sendRequest(type, payload) { ... }
```

---

## 4. Error Handling

### No Silent Catch

```js
// ❌ Forbidden
try { ... } catch (e) { }
try { ... } catch (e) { return time; }   // swallows, no log

// ✅ Required
try {
    return formatTimestamp(raw);
} catch (err) {
    log.warn("portal", "unparseable timestamp, showing raw", { raw, err });
    return raw;
}
```

Every `catch` either handles the error meaningfully (with a log line that includes context) or rethrows. A `catch` that returns a fallback silently hides a protocol change until a user notices.

### Errors Are `Error` Instances

```js
// ❌ Forbidden
reject("WebSocket not yet initialized.");
throw "bad channel";

// ✅ Required
class ProtocolError extends Error {
    constructor(message, { dataType, raw } = {}) {
        super(message);
        this.name = "ProtocolError";
        this.dataType = dataType;
        this.raw = raw;
    }
}
throw new ProtocolError("unknown data_type", { dataType, raw: event.data });
```

Domain error classes: `TransportError`, `ProtocolError`, `RenderError`. Rejecting with a string loses the stack trace and breaks `instanceof` checks.

### Boundaries Catch, Internals Throw

1. **The message dispatcher** wraps every handler invocation in `try/catch`. One bad frame must not kill `onmessage` for the rest of the session.
2. **Every `requestAnimationFrame` / `setInterval` callback** guards its body. An exception inside a rAF callback silently stops the loop with no log.
3. **Every event listener** on user input guards its body.
4. **`JSON.parse` on socket data** is always inside a `try/catch` and followed by a shape check (see [Section 6](#6-engine-protocol-contract)).
5. Register `window.addEventListener("error", ...)` and `window.addEventListener("unhandledrejection", ...)` at boot. They log with context and flip the error indicator. Nothing reaches the browser console unhandled.

### User-Facing vs. Developer-Facing

The teleprinter display (`display2`) is UI, not a log sink. It shows what the operator needs ("Connection lost. Reconnecting..."). The developer detail (`err.stack`, the raw frame) goes to the logger. Never write a raw error object to the display.

### `.unwrap()` Equivalents

The frontend's version of `.unwrap()` is `document.querySelector(".x").something` and `indicators[0].on()` without checking that the element or the model loaded. Both throw `TypeError` on a missing dependency and take the whole module down.

```js
// ❌ Forbidden
const cover = document.querySelector(".control2 .cover");
cover.classList.add("open");

// ✅ Required
const cover = document.querySelector(".control2 .cover");
if (!cover) {
    log.error("boot", "cover element missing; skipping reveal animation");
    return;
}
cover.classList.add("open");
```

---

## 5. WebSocket Client Discipline

The engine (`engine/src/config.rs`) enforces: 32 max connections, 64 KB max inbound message, a 100-frame outbound backlog per client, 30 s keepalive pings, close after 3 missed pongs. The client must be a good citizen of those limits.

### One Owner, One Connection

1. Exactly one module (`transport/`) creates the `WebSocket`. Nothing else holds a reference to the raw socket.
2. The transport exposes: `connect()`, `disconnect(reason)`, `send(type, payload)`, `onMessage(handler)`, `onStateChange(handler)`, `getState()`.
3. The page opens **one** socket. Opening a second one for "reset" without closing the first leaks a connection slot on the engine (out of 32). Reset = close with code 1000 + reconnect.

### Connection State Machine

```
IDLE → CONNECTING → OPEN → CLOSING → CLOSED → (backoff) → CONNECTING
```

1. State transitions are explicit and observable. Indicators (`conn`, `stby`, `error`) subscribe to state changes. They are not polled every 5 s.
2. `send()` in any state other than `OPEN` drops the message, logs at `warn`, and returns `false`. It never throws into a button handler.
3. On `close`, the transport records the close code and reason. Codes 1000/1001 are expected; anything else is logged at `error`.

### Reconnect with Backoff

```js
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER = 0.2;

function nextDelay(attempt) {
    const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    return exp * (1 - RECONNECT_JITTER + Math.random() * 2 * RECONNECT_JITTER);
}
```

1. Automatic reconnect with exponential backoff and jitter. A hard-coded `setTimeout(..., 5000)` and a "Try again" message is not a reconnect strategy.
2. Reconnect resets the boot sequence guard so the topology frame (`data_type` 0) is processed again. Stale topology on a fresh socket is a bug.
3. Stop reconnecting when `document.visibilityState === "hidden"` for a long period, resume on `visibilitychange`. A backgrounded tab must not hammer the engine.
4. Reconnect attempts are logged at `info` with the attempt number; the delay is shown on the display so the operator knows the panel is alive.

### Same-Origin Endpoint

```js
// ❌ Hard-codes the engine port and the insecure scheme
const ws = new WebSocket(`ws://${window.location.hostname}:8999`);

// ✅ Same origin, scheme follows the page, single port to expose
const scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${scheme}://${window.location.host}/ws`);
```

The Express server already proxies `/ws` to the engine. Using it means one exposed port (9000), scheme-correct upgrades behind a TLS reverse proxy, and an engine that can bind to `127.0.0.1` only. Direct connection to `8999` is a documented fallback for development, selected by build-time config, not the default.

### Inbound Handling

1. `onmessage` does: parse → validate → dispatch. Nothing else. It contains no `if (data_type == 0)` chains.
2. Handlers must return quickly. Stats arrive at 1 Hz; a handler that takes 100 ms is fine, one that does synchronous layout on 16 gauges is not. Heavy work is scheduled via `requestAnimationFrame` (one redraw per frame, not one per message).
3. Message size: the client never sends more than a small JSON object. Never send a log line, a file, or a base64 blob over the socket.
4. Browsers answer engine pings automatically. Do not implement an application-level heartbeat; do watch for the `close` event that follows 3 missed pongs.

---

## 6. Engine Protocol Contract

The wire format is owned jointly with the engine. It is documented here and in the engine's source doc-comments. Changes to it are coordinated PRs touching both sides.

### Envelope

**Client → Engine** (`engine/src/ws/mod.rs` `IncomingMessage`):

```json
{ "type": "start_log", "message": 4 }
```

`type` is one of: `start_log`, `get_log_list`, `get_log_data`, `get_containers`, `start_container_output`, `stop_container_output`. `message` is always a number. The engine ignores unknown types and unparseable JSON with a warning, so a typo on the client is a silent no-op. Types are constants in `protocol/`, never string literals at call sites.

**Engine → Client**: every frame carries `data_type`:

| `data_type` | Meaning                                   | Cadence                |
| ----------- | ----------------------------------------- | ---------------------- |
| 0           | Topology (cores, disks, sensors, RAM max) | Once per connection    |
| 1           | Live stats                                | 1 Hz (temps every 5th) |
| 2           | System info (OS, host, uptime)            | Once per connection    |
| 3           | Log file list                             | On request             |
| 4           | Log file data (CPU/RAM + net series)      | On request             |
| 5           | Container list                            | On request             |
| ≥ 6         | Container output stream on a channel      | Streaming              |

### Rules

1. **One protocol module.** `protocol/messages.js` holds the `DATA_TYPE` and `REQUEST_TYPE` constants and a validator per frame type. No other file spells `data_type` or a request string.
2. **Validate every inbound frame before use.** A validator checks the presence and JS type of each field the handler reads, and array lengths against the topology (`temperatures.length === temp_sensors.length`). On failure: log at `warn` with the frame, drop it. Never throw from a validator.
3. **Unknown `data_type` is not an error.** It is logged once at `debug` and dropped. Forward compatibility with a newer engine matters because the engine is a separate release artifact.
4. **Never encode structure into a number.** The channel derivation `Number(`${index}99899${channel}`)` is a load-bearing convention with the engine. It is centralized in one function with a doc-comment pointing at the engine decoder, and covered by a unit test. Any future protocol change replaces it with explicit fields.
5. **Dispatch by table, not by chain:**

```js
const HANDLERS = Object.freeze({
    [DATA_TYPE.TOPOLOGY]: handleTopology,
    [DATA_TYPE.STATS]: handleStats,
    [DATA_TYPE.SYSTEM_INFO]: handleSystemInfo,
    [DATA_TYPE.LOG_LIST]: handleLogList,
    [DATA_TYPE.LOG_DATA]: handleLogData,
    [DATA_TYPE.CONTAINER_LIST]: handleContainerList,
});

function dispatch(frame) {
    const handler = HANDLERS[frame.data_type] ?? streamRegistry.handlerFor(frame.data_type);
    if (!handler) {
        log.debug("protocol", "no handler for data_type", { dataType: frame.data_type });
        return;
    }
    try {
        handler(frame);
    } catch (err) {
        log.error("protocol", "handler threw", { dataType: frame.data_type, err });
    }
}
```

6. **Dev mocks are build-gated.** The `?mock_temps` / `?mock_disks` query parameters are useful in development and must compile out of the production bundle (`if (__DEV__)` via webpack `DefinePlugin`). Production builds do not contain code that fabricates sensor data.

---

## 7. State Management

### Single Source of Truth

The panel's state is small: topology (from frame 0), latest stats (frame 1), system info, the container stream registry, connection state, and the display buffer. Each has exactly one owner module in `state/`.

```js
// ❌ Forbidden: state scattered across modules
let ram_max_mb = 1;                       // in server_connection.js
let container_stream_register = new ...;  // in functions/docker.js
let logList; let logCNRData; let ramMax;  // in chart/chart.js

// ✅ Required: one owner, explicit reads
import { topology } from "../state/topology";
const ramMaxMb = topology.get().ramTotalMb;
```

**Rules:**

1. State modules expose `get()`, `set()`/`update()`, and `subscribe(listener)`. Renderers subscribe; they do not poll.
2. The DOM is never used as a store. Reading a value back from `element.textContent` or `element.dataset` to make a decision is forbidden. Read from state, write to DOM.
3. Derived values (percent used, bytes → MB) are computed in one place (a selector function), not in every renderer.
4. State updates are synchronous and atomic. A frame either updates all its fields or none.
5. Registries (`Map`) replace parallel arrays plus a `count`. If a `count` must be kept in sync with a collection, the collection is the wrong shape.

---

## 8. DOM & Rendering

### Query Once, Guard Always

1. Element lookups happen at component construction, not per update. A gauge stores its `canvas` and `ctx`.
2. Every lookup is null-checked. A missing mount point logs at `error` and disables that component. It does not throw at import time.
3. Components accept their root element as a constructor argument. `new Display(rootEl)`, not `document.getElementsByClassName("display_2")[0]` inside the module.

### `textContent`, Never `innerHTML`, for Untrusted Data

Container log lines, hostnames, container names, sensor labels, and log file names all come from the engine and ultimately from the host system or Docker. They are untrusted.

```js
// ❌ Forbidden
row.innerHTML = `<span>${line}</span>`;

// ✅ Required
const span = document.createElement("span");
span.textContent = line;
row.append(span);
```

`innerHTML` is permitted only with a literal string that contains no interpolation. `insertAdjacentHTML`, `outerHTML`, `document.write`, and `eval`/`new Function` are forbidden.

### Write in Batches, Read Before Write

1. Group DOM reads (`offsetWidth`, `getBoundingClientRect`) and then group writes. Interleaving forces synchronous layout on every iteration.
2. Building many nodes: build into a `DocumentFragment`, append once.
3. Per-frame DOM writes (stats at 1 Hz) go through `requestAnimationFrame` so several frames arriving in one tick cause one paint.
4. Style changes go through classes (`el.classList.toggle("open", isOpen)`), not `el.style.x = ...`, except for values that are genuinely computed (a drag position, a transform).

### Event Listener Lifecycle

Every `addEventListener` has a matching removal path, and the listener reference used for removal is the same one that was added.

```js
// ❌ Leaks: added on contentHeader, removed from document
this.contentHeader.addEventListener("mousedown", this._onMouseDown);
document.removeEventListener("mousedown", this._onMouseDown);

// ✅ Required: one AbortController per component, aborted on destroy
this.#abort = new AbortController();
const { signal } = this.#abort;
this.header.addEventListener("pointerdown", this.#onPointerDown, { signal });
document.addEventListener("pointermove", this.#onPointerMove, { signal });
document.addEventListener("pointerup", this.#onPointerUp, { signal });

destroy() {
    this.#abort.abort();
    this.root.remove();
}
```

1. Use `AbortController` signals for listener groups. `destroy()` aborts once.
2. `ResizeObserver` / `IntersectionObserver` / `MutationObserver` instances are `disconnect()`ed or `unobserve()`d on destroy.
3. Prefer pointer events (`pointerdown`/`pointermove`/`pointerup`) over paired mouse + touch listeners. One code path, both inputs.
4. Passive listeners for scroll/touch: `{ passive: true }` unless `preventDefault()` is required.
5. Do not null out every property of `this` in `destroy()`. Abort listeners, remove nodes, release resources, and let GC do its job. Nulling `this.portal` while an in-flight event still references the instance produces `TypeError: cannot read properties of null`.

---

## 9. Canvas, three.js & Chart.js

### One Animation Loop, Paused When Idle

1. One `requestAnimationFrame` loop per renderer type, started when something animates and stopped when nothing does (the gauge animator already does this correctly; three.js `setAnimationLoop` must do the same instead of running unconditionally).
2. Pause all loops on `visibilitychange` → `hidden`. Resume on `visible`. A hidden tab must not spend CPU on brass reflections.
3. `prefers-reduced-motion: reduce` disables needle easing, the teleprinter typing animation, and the boot sweep. Values snap instead.

### Device Pixel Ratio & Resize

1. Canvas backing size = CSS size × `devicePixelRatio`, capped at 2 for expensive layers. Set once on resize, not per frame.
2. Static layers (gauge face, ring gradient, engraving) are rendered once to an offscreen canvas and blitted per frame. Only the needle and digital readout redraw.
3. Resize handling is debounced through a single `ResizeObserver`; resizing sixteen gauges on every observer entry is fine, resizing them on every `pointermove` is not.

### three.js Resource Discipline

1. Every `Geometry`, `Material`, `Texture`, and `WebGLRenderTarget` created at runtime is `dispose()`d when its owner is destroyed. GLTF scenes loaded once at boot are exempt while the page lives.
2. Model loading errors (404, parse failure) are handled: the control panel degrades to a "controls unavailable" state with the display explaining why. `loader.load` without an `onError` callback is forbidden, and an `onError` that only logs is incomplete.
3. Raycasting runs on pointer events, not per frame. Cache the `Raycaster` and `Vector2`; do not allocate in `onPointerMove`.
4. The renderer's size follows its container via `ResizeObserver`, never `window.innerWidth`.
5. `WebGL context lost` is handled (`webglcontextlost` / `webglcontextrestored`): stop the loop, show a notice, re-init on restore.

### Chart.js Discipline

1. `chart.destroy()` before creating a new chart on the same canvas. Re-creating without destroying leaks the old chart's listeners and doubles tooltip handlers.
2. Register only the components in use (see [Section 3](#3-language--module-rules)). No `chart.js/auto`.
3. Large series (a multi-hour log at 5 s samples is thousands of points) use the built-in `decimation` plugin or are down-sampled before being handed to the chart. `animation: false` for series over ~1 000 points.
4. Chart colors and fonts come from the theme module ([Section 12](#12-css--theming)), never hex literals in the chart config.
5. The chart module is loaded on demand (`await import("../render/log_chart")`) so the 1 Hz dashboard never pays for Chart.js it might not use this session.

---

## 10. Timers, Async & Lifecycle

### No `setTimeout` as a Sequencing Primitive

```js
// ❌ Forbidden: "it usually works after 5005 ms"
setTimeout(() => {
    isWSConnected(ws);
    display.write_line("...");
}, 5005);

// ✅ Required: wait for the actual event
await bootSequence.finished; // a Promise resolved by the animation
display.writeLine("WebSocket connection established");
```

1. Logic waits for the thing it depends on (a promise, an event, a state change), not for a guessed number of milliseconds. Timers are for animations and backoff, nothing else.
2. Every `setInterval` handle is stored and there is a code path that clears it. An interval with no owner runs until the tab closes.
3. Every `setTimeout` that touches a component is cancelled in that component's `destroy()`. Use `AbortSignal.timeout()` or store the handle.
4. Cascading `setTimeout` inside loops (77 timers for a loading bar) is replaced by one rAF loop or one interval with a counter.

### Async Hygiene

1. `async` functions are awaited or explicitly marked fire-and-forget (`void fn()` with a comment). An un-awaited promise that rejects is an `unhandledrejection`.
2. `Promise` constructors wrap callback APIs (`loader.load`) once, in a helper. Do not hand-write `new Promise` at every call site.
3. Recursive retry via `setTimeout(() => this.pending_choice(...), 420)` is a spin-wait. Replace with a queue that drains on completion.
4. Race conditions: a feature that assigns button callbacks must first cancel the previous feature's assignment. Use a token (`const token = ++currentFeatureId`) and ignore callbacks from stale tokens.

### Page Lifecycle

1. `beforeunload` / `pagehide`: close the socket with code 1000 so the engine frees the slot immediately rather than after 3 missed pings.
2. `visibilitychange`: pause rendering, keep the socket open (stats keep flowing at 1 Hz, which is cheap), resume rendering on show.
3. Boot: one `init()` in the entry point with a clear order: theme → DOM components → renderers → transport connect → boot animation. Nothing initializes itself at import.

---

## 11. Performance & Memory

### Budgets

| Metric                         | Budget                                  |
| ------------------------------ | --------------------------------------- |
| Production JS bundle (gzipped) | ≤ 350 KB total, dashboard path ≤ 200 KB |
| Time to first gauge on LAN     | ≤ 1.5 s on a mid-range phone            |
| Steady-state CPU (visible tab) | ≤ 5 % of one core on a laptop           |
| Steady-state CPU (hidden tab)  | ~0 %                                    |
| Heap growth over 24 h          | Flat (no unbounded buffers)             |

The dashboard runs 24/7 on a wall-mounted device. Leaks that take a day to matter still matter.

### Bounded Everything

1. The teleprinter buffer (42 lines), portal log containers, and any queue have a hard cap. Portal logs drop the oldest DOM rows beyond `MAX_PORTAL_LINES` (e.g. 500). Container output is unbounded on the engine side; the client must not mirror that.
2. Text queues waiting on the typing animation are capped. If the operator triggers 40 lines while one is typing, coalesce or drop with a "..." marker.
3. No per-message allocation of large objects. Reuse typed arrays for series data; reuse `Path2D` for static gauge geometry.

### Hot Path (1 Hz stats frame)

1. No `console.log` in the stats path. Logging every frame at `debug` is acceptable only behind a runtime flag.
2. No layout reads. Gauges know their size from the last resize.
3. No string formatting for values that did not change. Compare to the previous value first.
4. No `Object.entries()` over registries per frame. Look up by key.

### Loading

1. Fonts are self-hosted with `font-display: swap` and `preload` links for the two faces used above the fold.
2. GLTF models and textures are fetched in parallel, once, with `Promise.all`. Model loading does not block the gauges from rendering.
3. Audio files are loaded lazily on first user interaction (autoplay policy requires a gesture anyway).
4. Static assets get content-hash filenames and long cache headers ([Section 15](#15-node-server-express)).

---

## 12. CSS & Theming

### Tokens Live in CSS, Once

`public/css/deco.css` defines the palette (`--brass`, `--cream`, `--ruby`, ...) on `:root`. This is the single source of truth.

```js
// ❌ Forbidden: the palette copied into JS
ticks: { color: "#b8ad8c" }
const DECO = { brass: "#c9a227", ... }

// ✅ Required: JS reads the tokens
const css = getComputedStyle(document.documentElement);
export const theme = Object.freeze({
    brass: css.getPropertyValue("--brass").trim(),
    cream: css.getPropertyValue("--cream").trim(),
    ...
});
```

Canvas, three.js, and Chart.js render modules import `theme` and never contain a color literal. Changing the palette is a CSS edit, not a hunt through four files.

### Structure

1. One stylesheet per component area (`deco.css` theme + layout, `control_window_style.css`, `chart_style.css`, `portals.css`). New components get their own file. No 2 000-line stylesheet.
2. Class naming: block__element--modifier (`portal__header`, `portal--minimized`). Or a consistent kebab-case prefix per component. Pick one per file and stay with it.
3. No `!important`. If specificity requires it, the selector is wrong.
4. No ID selectors for styling. IDs are for JS mount points and anchors.
5. `z-index` values come from a small scale defined as tokens (`--z-panel: 1`, `--z-portal: 100`, `--z-cover: 1000`). No `z-index: 9999`.
6. Layout with grid/flex and logical units. Fixed pixel heights only for canvas containers that need a stable aspect ratio.

### Motion & Responsiveness

1. Every animation respects `@media (prefers-reduced-motion: reduce)`.
2. Animate `transform` and `opacity` only. Never animate `width`, `height`, `top`, `left`, or `box-shadow` in a loop.
3. Breakpoints at `≤ 768px` (phone: single column) and `≤ 1200px` (tablet: two columns) at minimum. The panel is designed to be opened from a phone on the LAN.
4. `overflow-y: hidden` on `body` is acceptable only with an in-app scroll surface that works on touch. Verify on a real phone, not just DevTools.

---

## 13. Accessibility

The dashboard is a control surface, not a brochure. It must be operable, not merely visible.

1. **Live regions**: the teleprinter display is `aria-live="polite"` and `role="log"` so screen readers announce new lines. Gauges expose their value via `role="meter"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-label`.
2. **Keyboard**: every action reachable via the 3D buttons and toggles has a keyboard equivalent. A hidden but focusable button row (or a `<dialog>` command palette) is acceptable; a WebGL canvas alone is not.
3. **Focus**: `:focus-visible` styles on every interactive element, in brass, high contrast. Never `outline: none` without a replacement.
4. **Contrast**: text on lacquer meets WCAG AA (4.5:1). `--cream-dim` on `--face` is checked, not assumed.
5. **Touch targets**: portal controls and any tappable element are ≥ 44×44 CSS px.
6. **Semantics**: `<main>`, `<aside>`, `<header>`; headings in order; the page `<title>` is human-readable (`Watch Dog`, not `System_Monitor`).
7. **Motion**: see [Section 12](#12-css--theming). Audio never autoplays and has a visible mute toggle.

---

## 14. Security

The panel runs on a LAN and has no authentication. The threat model is: any device on the network can open the page and talk to the engine, and the engine forwards whatever Docker and the OS produce. Treat the LAN as hostile and the engine's data as untrusted.

### Browser

1. **No untrusted HTML.** See [Section 8](#8-dom--rendering). All engine-sourced strings render via `textContent`. ANSI escape stripping is a display nicety, not a security control.
2. **Strict Content Security Policy**, delivered as an HTTP header by the Express server:
   `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
   This requires no inline scripts, no inline styles set via `style=""` attributes in HTML (setting `el.style.x` from JS is fine), and no `eval`. The bundle must be built to satisfy it.
3. **No `eval`, `new Function`, `setTimeout(string)`**, or dynamically constructed script tags.
4. **No secrets in the bundle.** Nothing under `src/` may contain a token, key, or internal hostname. `DefinePlugin` injects only non-sensitive build metadata.
5. **Scheme-correct WebSocket** (`wss:` when the page is `https:`) so a future TLS reverse proxy does not trigger mixed-content blocking.
6. **Input from the operator** (hour counts, indexes) is clamped client-side (`1 ≤ hours ≤ MAX_LOG_HOURS`, `0 ≤ index < list.length`) before it is sent. The engine validates too; the client still does not send garbage.

### Node Server

1. **Serve only build output and public assets.** `express.static(__dirname)` serves `src/`, which exposes `server.js` and every source file over HTTP. Forbidden. Serve `dist/` and `public/` only, with absolute paths resolved from `__dirname`.
2. **Security headers** on every response: `Content-Security-Policy` (above), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Use `helmet` or set them by hand; either way they are tested.
3. **Disable `X-Powered-By`** (`app.disable("x-powered-by")`).
4. **Bind address is configurable** (`FRONT_PANEL_BIND`, default `0.0.0.0` for the documented LAN use case) so a single-device deployment can bind `127.0.0.1`.
5. **The proxy target is configurable** (`ENGINE_ADDR`, default `127.0.0.1:8999`) and never `0.0.0.0` (that is a bind address, not a connect address).
6. **No directory listings**, no `dotfiles: "allow"`, no serving of `.map` files in production unless deliberately enabled.
7. **Request size**: the server accepts no request bodies. If an API is ever added, `express.json({ limit: "16kb" })`.

### Dependencies

1. `package-lock.json` is committed and CI installs with `npm ci`. Never `npm install` in CI.
2. `npm audit --omit=dev` runs in CI and fails on `high` or `critical`.
3. Runtime dependencies are only what the server needs at runtime (`express`, `http-proxy-middleware`). Build tools (`webpack`, `webpack-cli`), the browser libraries bundled into `dist/` (`three`, `chart.js`, `chartjs-plugin-zoom`), and orchestration helpers (`npm-run-all`, `nodemon`) are `devDependencies`. `npm ci --omit=dev` on a release must install the minimum.
4. `ws` is not a direct dependency of this package (the proxy brings its own). Unused dependencies are removed.
5. Adding a dependency requires: a maintained project, a compatible license (GPL-3.0-or-later project; MIT/BSD/Apache-2.0 deps are fine), and a reason it beats 30 lines of local code.
6. Major version upgrades of `three`, `chart.js`, `express`, and `http-proxy-middleware` are their own PR with a manual smoke test on the panel.

---

## 15. Node Server (Express)

`src/server.js` is a production process managed by pm2. It gets the same rigor as the engine.

### Configuration via Environment

| Variable           | Default          | Purpose                |
| ------------------ | ---------------- | ---------------------- |
| `FRONT_PANEL_PORT` | `9000`           | HTTP listen port       |
| `FRONT_PANEL_BIND` | `0.0.0.0`        | Listen address         |
| `ENGINE_ADDR`      | `127.0.0.1:8999` | WebSocket proxy target |
| `FRONT_PANEL_LOG`  | `info`           | Log verbosity          |

Configuration is parsed once at startup into a frozen object, validated (port is an integer in range, address parses), and the process exits with a clear message on invalid config. No `process.env` reads outside the config module.

### Rules

1. **Graceful shutdown**: on `SIGTERM`/`SIGINT`, stop accepting connections, close the HTTP server, let the proxy close upgraded sockets, exit within a bounded timeout (10 s), and exit non-zero if the timeout fires. `pm2 restart` must not leave orphaned sockets.
2. **Health endpoint**: `GET /health` returns `200 {"status":"ok"}` without touching the engine. Used by pm2 and any future load balancer.
3. **Error middleware**: a final `(err, req, res, next)` handler logs and returns a generic 500. Express's default HTML error page leaks stack traces.
4. **404 handler** for unknown paths that are not `/` (SPA fallback is not needed: there is one page).
5. **Static caching**: hashed assets (`main.[contenthash].js`) get `Cache-Control: public, max-age=31536000, immutable`. `index.html` gets `no-cache`.
6. **Proxy errors** (engine down) are handled by the proxy's `on.error` hook: log at `warn`, return 502 for HTTP, close the upgrade cleanly. The Node process must not crash because the engine restarted.
7. **Logging** through the same tiny logger used in the browser (structured, leveled), not bare `console.log`. Startup logs the bind address, port, and proxy target once at `info`.
8. **No business logic.** The server hosts files and proxies a socket. Anything else belongs in the engine.

---

## 16. Logging & Observability

### Levels

| Level   | Use for                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------- |
| `error` | Handler threw, socket closed abnormally, model failed to load, invalid frame that should have been valid |
| `warn`  | Dropped message (socket not open), unknown data_type, reconnect attempt, fallback taken                  |
| `info`  | Connection state changes, feature start/stop (log recording started, portal opened)                      |
| `debug` | Frame received (type only), button assignment, resize events                                             |

### Rules

1. One logger module (`util/logger.js`) exposing `log.error(scope, message, context)` etc. No direct `console.*` outside it.
2. `debug` is compiled out of production (`if (__DEV__)`) or gated by a runtime flag stored in `localStorage` (`watchdog.debug = "1"`). Production consoles are quiet by default.
3. Every log line has a scope (`"transport"`, `"gauge"`, `"portal"`) and a context object, not a concatenated string. `log.warn("transport", "dropped message", { type, state })`.
4. Never log full stats frames at `info`. Never log container output lines at all (they may contain secrets from the container's own logs).
5. The error indicator on the panel reflects `error`-level events. An operator seeing a red lamp can open the console and find the cause within the last few lines.
6. Timing: wrap boot phases with `performance.mark` / `performance.measure` so first-render regressions are measurable in DevTools.

---

## 17. Build, Tooling & Dependencies

### Webpack

```js
// webpack.config.js (target shape)
module.exports = (env, argv) => {
    const isProd = argv.mode === "production";
    return {
        entry: { main: "./src/main.js" },
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: isProd ? "[name].[contenthash].js" : "[name].js",
            clean: true,
        },
        devtool: isProd ? "hidden-source-map" : "eval-cheap-module-source-map",
        plugins: [
            new webpack.DefinePlugin({ __DEV__: JSON.stringify(!isProd) }),
            new HtmlWebpackPlugin({ template: "public/index.html" }),
        ],
        performance: {
            maxAssetSize: 400_000,
            maxEntrypointSize: 400_000,
            hints: isProd ? "error" : false,
        },
    };
};
```

1. Production builds use content hashes, `clean: true`, hidden source maps (kept for debugging, not served), and a bundle size budget that fails the build.
2. `HtmlWebpackPlugin` injects the hashed script name into `index.html`. Hand-maintaining `<script src="/main.js">` breaks the moment hashes are introduced.
3. Dynamic `import()` for Chart.js and the 3D controls so the gauges render before three.js finishes downloading.
4. `mode` is never hard-coded; scripts pass it.

### Linting & Formatting

1. **ESLint** with `eslint:recommended` plus `no-var`, `prefer-const`, `eqeqeq`, `no-implicit-globals`, `no-unused-vars`, `no-console` (allowed only in `util/logger.js`), `import/no-cycle`. Runs in CI and fails the build.
2. **Prettier** with the existing style (4-space indent, double quotes, trailing commas `es5`). Committed `.prettierrc`. CI runs `prettier --check`.
3. **`// @ts-check`** at the top of new modules, with JSDoc types, so editors and `tsc --noEmit --checkJs` catch type errors without a TypeScript migration.
4. **`.editorconfig`** matching Prettier so every editor agrees.

### Scripts & Versions

1. `engines.node` in `package.json` pins the supported major (`>=22`), and an `.nvmrc` matches CI's `node-version`.
2. Script names are `kebab-case` and consistent: `build`, `build:dev`, `start`, `lint`, `format`, `test`, `launch:linux|windows|macos`. No `buildAndLaunch_lin` next to `watch_dog_win`.
3. Scripts that need a platform-specific command use a small Node script, not `start` vs `chmod +x` duplicated per OS.
4. `dist/` is in `.gitignore` and never committed. Release archives are built by CI.
5. The frontend `version` in `package.json` is kept in lockstep with the engine's `Cargo.toml` by the release workflow.

---

## 18. Testing

There are currently no frontend tests. New code that fits a category below ships with tests; existing code gains tests when it is refactored.

### What to Test, and How

| Layer                   | Tool                                           | Examples                                                                                             |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pure utilities          | `node:test` or Vitest                          | `formatSecondsToTime`, `nextDelay`, channel encoding                                                 |
| Protocol validators     | Vitest                                         | Every `data_type` with valid, missing-field, wrong-type, and length-mismatch inputs                  |
| State modules           | Vitest                                         | `subscribe` fires on update, derived selectors, registry add/remove                                  |
| Transport state machine | Vitest + a fake `WebSocket`                    | Backoff sequence, `send` while `CONNECTING` drops, reconnect resets topology                         |
| DOM components          | Vitest + jsdom                                 | Display buffer caps at limit, portal `destroy()` removes listeners, `textContent` used for log lines |
| Renderers               | Vitest + canvas mock, or visual snapshot in CI | Gauge draws value in range, no draw when value unchanged                                             |
| End-to-end              | Playwright against a mock engine               | Page loads, gauges render topology, portal opens on container stream                                 |

### Rules

1. **Test error paths, not just happy paths**: malformed frame, socket closed mid-send, model 404, container list empty.
2. **One logical assertion per test.** Descriptive names: `validates_stats_frame_rejects_temperature_length_mismatch`, not `test_stats`.
3. **No timers in tests.** Use fake timers (`vi.useFakeTimers()`) for backoff and animation logic. A test that sleeps 5 s is broken.
4. **No network in unit tests.** The transport is tested with an injected fake socket that exposes `readyState`, `send`, and event dispatch.
5. **Fixtures for every frame type** live in `test/fixtures/frames/` and are the canonical examples of the protocol. When the engine changes a frame, the fixture changes in the same PR.
6. **CI runs** `lint`, `format:check`, `test`, `build`, and `npm audit` on every PR. Build size budget failure is a CI failure.
7. **Run tests before every commit.**

---

## 19. Production Readiness

### Release Checklist

1. **Server serves only `dist/` and `public/`** — no source exposure.
2. **Security headers and CSP active** and verified with a request.
3. **Proxy target and bind address from environment**, no `0.0.0.0` connect target.
4. **Graceful shutdown implemented** for the Node server.
5. **`/health` endpoint available.**
6. **Client connects via same-origin `/ws`** with scheme derived from the page.
7. **Reconnect with backoff implemented**; no second socket opened on reset.
8. **Every inbound frame validated** before dispatch; unknown types dropped quietly.
9. **No `innerHTML` with engine data.** Audited with `grep -rn innerHTML src/`.
10. **All listeners and observers cleaned up** on component destroy.
11. **Animation loops stop when idle and when the tab is hidden.**
12. **All buffers bounded** (display, portals, queues).
13. **Dev mocks compiled out** of the production bundle (`grep mock_temps dist/` returns nothing).
14. **Bundle within budget**; Chart.js and three.js tree-shaken; no `chart.js/auto`, no `import * as THREE`.
15. **Theme tokens read from CSS**, no color literals in render modules.
16. **`prefers-reduced-motion` honored.**
17. **Lint, format, tests, and audit green in CI.**
18. **Dependencies classified** (`dependencies` vs `devDependencies`) and unused ones removed.
19. **No `console.*` outside the logger; `debug` silent in production.**
20. **Verified on a phone over the LAN**, not only in desktop DevTools.

---

## 20. Known Deviations & Migration Path

The 2026-09-27 hardening pass restructured the frontend into the layers in
[Section 2](#2-architecture--code-organization): `transport/`, `protocol/`,
`state/`, `ui/`, `render/`, `features/`, `util/`, a Node host in `server/` and
a cross-platform launcher in `scripts/`. The server, transport, lifecycle,
theme, bundle and tooling items that this section used to list are resolved.
What remains, ordered by value:

### Open Items

1. **Keyboard access to the 3D controls.** The switches and buttons are only
   reachable by pointer on the WebGL canvas. Add a visually hidden button row
   (or a `<dialog>` command palette) bound to the same `Button` / `ToggleSwitch`
   instances so every flow works from a keyboard.
2. **End-to-end test in CI.** Flows are verified by a scripted DevTools run
   against a live engine (see the commit history for the sequence). Turn that
   into a Playwright test with a mock engine so it runs on every PR.
3. **Renderer tests.** `DecoGauge`, `ControlPanel` and the chart window have no
   automated coverage; they need a canvas mock or visual snapshots.
4. **System info layout at narrow widths.** The "specifications" plaque overlaps
   the first row of the right column below ~900 px; the columns should start
   below the plaque.
5. **Bundle size.** The entry bundle is ~640 KB minified (~160 KB gzipped),
   almost all of it three.js. Chart.js is already a lazy chunk. Loading the
   control panel as a second lazy chunk would let the gauges paint before
   three.js downloads.
6. **Container channel 0.** The wire convention gives container 0 the same
   `data_type` as the topology frame. The dispatcher disambiguates by
   `log_line`; a future protocol revision should give streams their own
   `data_type` and carry the channel as a field.

### Conventions Established

- `main.js` is the only module with side effects at import; everything else
  exports classes or functions and is constructed there.
- Frames are validated in `protocol/messages.js` before any handler runs; a
  frame type without a validator is logged once and dropped.
- Every listener group is owned by an `AbortController`; `destroy()` aborts it.
- Colors and fonts in canvas, WebGL and chart code come from `util/theme.js`,
  which reads the `:root` custom properties in `deco.css`.
- `__DEV__` gates the query-string mocks, the `?ws=` endpoint override and the
  `window.__watchdog` hook used by headless checks; none exist in production.
- The dev build uses a non-`eval` source map because the host's CSP forbids
  `eval`.

---

**Last Updated**: 2026-09-27
