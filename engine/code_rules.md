# Engine Code Rules & Best Practices

> Reference document for all contributors to the Watch Dog engine (Rust / Tokio / tokio-tungstenite / sysinfo / bollard).
> The engine is a long-running system-monitoring daemon on headless servers. It must be **correct, bounded, cheap to run, and safe to expose on a local network**: a monitoring tool that destabilizes, slows down or opens up the machine it watches has failed at its only job.
> These rules define **how** code is written, structured, and maintained. They are the bar for every change, not aspirations.

## Table of Contents

1. [Scope & Operating Model](#1-scope--operating-model)
2. [Engineering Principles](#2-engineering-principles)
3. [Architecture & Code Organization](#3-architecture--code-organization)
4. [Error Handling](#4-error-handling)
5. [Input Validation](#5-input-validation)
6. [Wire Protocol Contract](#6-wire-protocol-contract)
7. [Async & Concurrency](#7-async--concurrency)
8. [Resource Bounds & WebSocket Discipline](#8-resource-bounds--websocket-discipline)
9. [Performance & Efficiency](#9-performance--efficiency)
10. [Hardware Topology & Measurements](#10-hardware-topology--measurements)
11. [File System & Recorded Logs](#11-file-system--recorded-logs)
12. [Docker Integration](#12-docker-integration)
13. [Configuration](#13-configuration)
14. [Serialization](#14-serialization)
15. [Logging & Observability](#15-logging--observability)
16. [Security](#16-security)
17. [Cross-Platform Support](#17-cross-platform-support)
18. [Dependencies & Toolchain](#18-dependencies--toolchain)
19. [Testing](#19-testing)
20. [Version Control & Releases](#20-version-control--releases)
21. [Production Readiness Checklist](#21-production-readiness-checklist)
22. [Known Gaps (Hardening Backlog)](#22-known-gaps-hardening-backlog)

---

## 1. Scope & Operating Model

Every rule below follows from how the engine actually runs:

- **Single binary, single instance per host.** Shipped as a prebuilt executable for Linux x86_64, Windows x86_64 and macOS arm64, started by the front_panel npm scripts from `engine/app_<os>/` and usually kept alive by a process manager (pm2).
- **One protocol: WebSocket on `0.0.0.0:8999` by default.** The browser panel (served separately by `front_panel` on port 9000) connects directly to the engine.
- **Unauthenticated, LAN-facing.** Any device that can reach the port can connect. The engine is therefore read-only by design (see [Security](#16-security)).
- **Runs for months.** Anything that grows without bound (memory, tasks, file handles, log files) is a bug, even if it takes weeks to show up.
- **Shares the machine it monitors.** Its own CPU, memory and I/O cost is part of what it reports. Idle cost must be ~zero and active cost must not scale with the number of open browsers.

---

## 2. Engineering Principles

These principles apply to every file, every PR, every decision.

### SOLID (Rust-Adapted)

- **Single Responsibility**: One module = one reason to change. `sampler` samples, `ws::sink` owns the outbound socket, `logfiles::recorder` records. A request handler in `ws::read` dispatches — it does not read sysfs, walk directories or talk to Docker itself. If a function needs many `&mut` references, it is doing too much.
- **Open/Closed**: Extend behavior by adding new modules and new `match` arms for new message types, not by threading special cases through existing ones. A new data source gets its own module and its own `data_type`; it does not piggyback on an existing payload.
- **Liskov Substitution**: Any type implementing a trait must honor that trait's contract. The custom `log::Log` implementation must never panic or block indefinitely, because every other module relies on logging being safe to call anywhere.
- **Interface Segregation**: Pass each task only what it needs. `AppContext` is the composition root for a connection, but leaf functions take the specific `Arc<DockerMonitor>`, `LogIndex` or `Arc<ConnectionSink>` they use — not the whole context.
- **Dependency Inversion**: Dependencies are passed explicitly (`AppContext`, `CancellationToken`, `TaskTracker`), never reached for through globals, `lazy_static`, or `static mut`. This keeps modules testable and shutdown deterministic.

### DRY, KISS, YAGNI

- **DRY**: Constants live once in `config.rs`. Repeated error-and-log blocks around the same operation are extracted into a helper. But two similar functions serving different payloads are fine — don't couple unrelated wire formats to save a few lines.
- **KISS**: A `match` on a closed set of message types beats a handler registry with dynamic dispatch. Rust enums over trait objects when the variants are known at compile time.
- **YAGNI**: No plugin systems, no multi-host clustering, no databases, no HTTP framework until the product needs them. The engine does one job; keep the dependency and code footprint proportional to it.

### Ownership & Borrowing as Design Tools

- **Taking ownership (`self`, moved values)** is a consuming operation — e.g. `HardwareHandles` are moved into `spawn_blocking` and moved back out, making it impossible for two samplers to touch them at once.
- **Borrowing (`&self`)** is a read; **mutable borrowing (`&mut self`)** is an exclusive write.
- **Shared immutable data is `Arc<T>` / `Arc<str>`** built once and cloned by reference count, not by content (see `Topology::system_data_json`, `StatsSnapshot::json`).

Don't fight the borrow checker with `.clone()` — if you need to clone on a hot path, ask whether ownership is modeled correctly.

### Fail Fast at Startup, Degrade Gracefully at Runtime

- **Startup**: if the engine cannot do its core job (logger install, topology probe, socket bind), log the reason and exit with `ExitCode::FAILURE`. A process manager restarting a broken binary in a loop is visible; a half-working daemon is not.
- **Runtime**: a failure scoped to one client, one request, one container stream or one sensor ends *that* scope, is logged, and leaves everything else running. Optional subsystems (Docker, temperature sensors) degrade to "unavailable" instead of failing the engine.

### Composition Over Inheritance

Rust has no inheritance. Use small functions, wrapper types (newtypes), and trait composition. Prefer many small, testable functions composed in the task that uses them.

---

## 3. Architecture & Code Organization

### Module Layout

```
src/
├── main.rs              ← Composition root: logger, topology probe, sampler, accept loop, shutdown
├── config.rs            ← Every tunable constant and env-var lookup, each with a doc comment explaining why
├── logging.rs           ← Leveled stdout/stderr logger (log facade)
├── topology.rs          ← One-time hardware enumeration → Topology + HardwareHandles
├── sampler.rs           ← The single sampling task; serializes once, broadcasts Arc<StatsSnapshot>
├── system_stats.rs      ← Per-tick collection (blocking; called only from spawn_blocking)
├── system_info.rs       ← Static host description, probed once
├── temperatures.rs      ← Sensor discovery, filtering and reading
├── disk_temps/          ← Drive temperatures: sysfs discovery at startup, hwmon reads, per-drive thresholds
├── helpers.rs           ← Small pure helpers (disk filtering)
├── ws/
│   ├── mod.rs           ← AppContext, IncomingMessage
│   ├── connection.rs    ← Per-connection lifecycle: admission, handshake, static payloads, stream, keepalive
│   ├── read.rs          ← Inbound message loop and request dispatch
│   └── sink.rs          ← Shared, timeout-bounded outbound half of a socket
├── logfiles/            ← Recording, listing and replaying stat logs
└── docker_mon/          ← Optional Docker container listing and log streaming
```

**Rules:**

1. **`main.rs` wires, it does not compute.** It builds shared state, spawns long-lived tasks, runs the accept loop and orchestrates shutdown.
2. **`ws::read` dispatches, it does not implement.** Each message type calls into the owning module (`logfiles`, `docker_mon`, `recorder`). Anything that can take more than a few microseconds is spawned on the `TaskTracker` so the read loop keeps draining the socket (and keeps seeing pongs).
3. **Only `ws::sink::ConnectionSink` writes to a socket.** No other module holds a `SplitSink`.
4. **Blocking collection code (`system_stats`, `temperatures::read_temperatures`, directory scans) is synchronous and pure of Tokio.** The async caller decides where it runs.
5. **Dependency direction points inward:** `ws` depends on domain modules; domain modules never import from `ws` except `ConnectionSink` for sending their reply.
6. **Every constant with operational meaning lives in `config.rs`**, not inline.

### Module Sizing

- If a file exceeds ~300 lines, split it along responsibilities (e.g. `recorder.rs` → accumulation vs. file writing).
- One error type per domain where errors are returned (`TopologyError`), not one global `AppError`.
- Name things for what they do. New identifiers must be descriptive and professional; legacy names (`is_not_pidor`) should be renamed when their module is next touched.

---

## 4. Error Handling

### No Panics in Production Paths

`.unwrap()`, `.expect()`, `panic!`, `unreachable!`, `todo!`, `unimplemented!`, unchecked indexing (`v[i]`) and unchecked slicing on runtime data are **forbidden outside tests**. A panic in a spawned task silently kills that task (a stalled sampler, a leaked stream); a panic in `main` kills monitoring for the whole host.

```rust
// ❌ Forbidden
let component = list[index];
let addr = env::var("WATCH_DOG_ADDR").unwrap();

// ✅ Required
let temperature = match list.get(index) {
    Some(component) => component.temperature(),
    None => 0.0,
};
```

`unwrap_or`, `unwrap_or_else`, `unwrap_or_default` are fine — they don't panic.

**Exception**: `.expect("reason")` is acceptable in tests, with a message stating why it cannot fail.

### Handle Errors Where the Context Is

- At the point where an error is **handled** (logged, degraded, or turned into an exit code), use an explicit `match` and log with context: peer address, channel, file path, operation name, and the error itself.
- `?` is allowed inside small helpers that return `Result`/`Option` to a caller that immediately handles it with context (e.g. `get_index_and_channel`, `ensure_dir`). It is not allowed to bubble errors through layers where the context would be lost.

```rust
// ✅ Handled at the boundary, with context
let listener = match TcpListener::bind(&addr).await {
    Ok(listener) => listener,
    Err(e) => {
        error!("Failed to bind {}: {}", addr, e);
        return ExitCode::FAILURE;
    }
};
```

### Never Silently Discard Errors

- `let _ = ...` on a `Result` is allowed only where failure is genuinely irrelevant and a comment says why (e.g. writing to stderr inside the logger itself).
- Functions that deliver to a client return a meaningful signal (`ConnectionSink::send_text` returns `bool`) and producers **must stop** producing when it reports the connection unusable.

### Typed Errors

1. Errors that cross module boundaries are enums implementing `Display` (and `Debug`), carrying the source error.
2. Business conditions get semantic variants, not repurposed I/O errors.
3. Raw internal errors (paths, OS errors, Docker errors) are logged server-side and never sent to the client.

---

## 5. Input Validation

Every byte from the socket is untrusted — the engine is reachable by anything on the LAN.

**Rules:**

1. **Parse into typed structs** (`IncomingMessage`) with serde. Unparseable messages are logged at `warn` and ignored; they never close other functionality or panic.
2. **Unknown `type` values are logged and ignored**, never guessed at.
3. **Validate numeric ranges and narrow safely.** Client numbers arrive as `u64`; converting to a smaller type uses `u32::try_from(..)` with explicit handling, never a truncating `as` cast. Durations, positions and indices are range-checked against a documented maximum.
4. **Client values are keys, never resources.** A client sends a *position* or *index*; the engine resolves it against state it owns (`LogIndex`, `DockerMonitor::containers`). Client input is never used directly as a file path, container ID, Docker option, or format string.
5. **Validate before doing work.** Reject bad input before spawning tasks, touching the file system, or contacting Docker.
6. **Size limits are enforced at the transport** (`MAX_MESSAGE_SIZE`, `max_frame_size`), not after allocation.
7. **Arithmetic on client or hardware values is checked or saturating** (`checked_mul`, `saturating_sub`) — overflow wraps silently in release builds.

---

## 6. Wire Protocol Contract

The engine and `front_panel` are released together, but they are separate processes and a browser tab can outlive an engine restart. The JSON wire format is a public contract.

### Message Registry

Every outbound message carries a numeric `data_type`:

| `data_type` | Payload | Sent |
| --- | --- | --- |
| `0` | `SystemData` — CPUs, disks, RAM, temperature sensors, optional `disks_temp_warning` | First message of every connection |
| `1` | `SystemStats` — live readings, optional `disks_temperatures` (refreshed every `DISK_TEMP_INTERVAL`) | Every `STATS_INTERVAL` after `CLIENT_STREAM_DELAY` |
| `2` | `SystemInfo` — host description, uptime, Docker version | Second message of every connection |
| `3` | Log list | Reply to `get_log_list` |
| `4` | Log data | Reply to `get_log_data` |
| `5` | Container list | Reply to `get_containers` |
| channel | `{ data_type: <channel>, log_line }` — container log line | While a container stream is active |

Inbound messages are `{ "type": "<name>", "message": <u64> }` with types `start_log`, `get_log_list`, `get_log_data`, `get_containers`, `start_container_output`, `stop_container_output`.

**Rules:**

1. **This table is updated in the same change** that adds, removes or alters a message.
2. **New `data_type` values must not collide** with existing ones or with the container channel range.
3. **Message order is part of the contract**: `0` then `2` then, after the boot delay, `1`. The front-end builds its gauges from `0` and indexes later readings against it.
4. **Positional arrays are part of the contract**: `disks_used_space[i]`, `disks_temperatures[i]` and `disks_temp_warning[i]` ↔ `disks_space[i]`, `temperatures[i]` ↔ `temp_sensors[i]`, for the life of the process. `null` marks a disk without a drive temperature; both drive-temperature fields are omitted when no disk has a sensor.
5. **Field order is part of the contract where the front-end relies on it** (`SystemInfo` is laid out by key order). Don't reorder struct fields casually.
6. **Stable sentinel values stay stable** (`DOCKER_UNAVAILABLE = "false"` is displayed verbatim).
7. **Breaking changes** (removing/renaming a field, changing a type, unit, meaning or order) are made in lockstep with `front_panel` and use a `!` conventional commit so the release is a major bump.
8. **Additive changes are preferred**: new optional fields, new `data_type`s.

---

## 7. Async & Concurrency

### Never Block the Tokio Runtime

```rust
// ❌ Forbidden — sysfs/procfs reads on a runtime worker (an NVMe sensor alone blocks ~12 ms)
let stats = system_stats::collect(&mut handles, &topology, temps);

// ✅ Required
let sampled = tokio::task::spawn_blocking(move || {
    let stats = system_stats::collect(&mut handles, &topology, temps);
    (handles, stats)
})
.await;
```

**Rules:**

1. All `sysinfo` refreshes, `WalkDir` scans, `which` lookups and `std::fs` calls run in `spawn_blocking` (or use `tokio::fs`).
2. Never `std::thread::sleep` — use `tokio::time::sleep` / `interval`.
3. Never hold a `std::sync::Mutex` guard across `.await`. Use `tokio::sync::Mutex` when a lock must span an await, and keep every critical section as short as possible — copy what you need out and drop the guard.
4. Any lock that is held across I/O (the `ConnectionSink` write lock) must have both the acquisition and the I/O bounded by a timeout.
5. `interval`s set `MissedTickBehavior` explicitly (`Delay` for sampling and keepalive) so a stall does not produce a burst of catch-up ticks.
6. Atomics use the weakest *correct* ordering and a comment when the choice is non-obvious; flags guarding "only one at a time" use `compare_exchange`.

### Task Lifecycle

1. **Every task is spawned through the shared `TaskTracker`** (`ctx.tracker.spawn`). Bare `tokio::spawn` is forbidden — untracked tasks escape graceful shutdown.
2. **Every long-running task observes a `CancellationToken`** in a `tokio::select!` alongside its main await: the global `shutdown` token or a per-connection `child_token()`.
3. **Every task has a defined end**: peer closed, cancellation, send failure, or its natural completion. No task may loop forever waiting on something that can never happen.
4. **Cleanup is explicit and idempotent**: a closing connection cancels its token, stops all container streams (`StreamRegistry::stop_all`), sends a close frame, and releases its connection permit. Running cleanup twice must be harmless.
5. **Tasks do not panic** (see [Error Handling](#4-error-handling)). A task that finds shared state corrupted logs at `error` and cancels shutdown rather than continuing on bad data (as the sampler does).

### Graceful Shutdown

On `SIGINT`/`SIGTERM` (`SIGINT` only on non-Unix):

1. Stop accepting new connections.
2. Cancel the root `CancellationToken`; every task observes it.
3. Recorders flush what they have to disk.
4. Connections send a WebSocket close frame (`CloseCode::Away`).
5. Close the `TaskTracker` and wait up to `SHUTDOWN_GRACE`, then exit regardless.

New subsystems must plug into this sequence; `pm2 restart` must never corrupt a log file or leave a client hanging on a dead socket.

---

## 8. Resource Bounds & WebSocket Discipline

Every resource driven by clients has an explicit upper bound defined in `config.rs`.

| Resource | Bound | Mechanism |
| --- | --- | --- |
| Concurrent connections | `MAX_CONNECTIONS` (32) | `Semaphore::try_acquire_owned`; excess refused before the handshake |
| Inbound message / frame size | `MAX_MESSAGE_SIZE` (64 KiB) | `WebSocketConfig` |
| Outbound stats backlog per client | `BROADCAST_CAPACITY` (100) | `broadcast` channel drops oldest frames |
| Slow-consumer tolerance | `MAX_LAG_EVENTS` (3) | Connection closed after repeated lag |
| Blocked send | `SEND_TIMEOUT` (30 s) | Lock acquisition and each send are timed out |
| Dead peer | `PING_INTERVAL` × `MAX_MISSED_PONGS` | Keepalive loop cancels the connection |
| Container streams | One per channel per connection | `StreamRegistry` refuses duplicates |
| Concurrent recordings | One | `Recorder` `AtomicBool` guard |
| Shutdown wait | `SHUTDOWN_GRACE` (10 s) | `timeout(tracker.wait())` |

**Rules:**

1. **No unbounded queues, maps, or `Vec`s fed by clients.** A new feature that buffers per-client or per-request data must add a bound here.
2. **A slow client never slows others.** Per-client state is per-client; the sampler never waits on a subscriber.
3. **Closing is orderly**: send a close frame, then close the sink; both bounded by timeouts.
4. **The boot delay (`CLIENT_STREAM_DELAY`) is part of the UX contract** with the front-end boot animation. Frames buffered during it are discarded, not replayed.
5. **Per-connection resources die with the connection.** Container streams are registered per connection so one tab closing never affects another, and nothing outlives its socket.

---

## 9. Performance & Efficiency

The engine is a guest on the machine it measures.

**Rules:**

1. **Sample once, serialize once, broadcast `Arc`s.** Cost must be O(1) in the number of connected clients for sampling and serialization; per-client work is limited to sending an already-built frame.
2. **Zero cost when idle.** The sampler skips all work while `receiver_count() == 0`. New periodic work must follow the same rule or justify why it can't.
3. **Refresh only what is reported.** Never call `System::refresh_all()` or refresh processes — they walk every process on the host. Use targeted refreshes (`refresh_cpu_usage`, `refresh_memory`, `disks.refresh`, `networks.refresh`).
4. **Expensive readings run on a slower cadence** (temperatures every `TEMP_INTERVAL`, drive temperatures every `DISK_TEMP_INTERVAL`) and cached values are reused in between. Cadences restart after an idle period so a new client never sees readings cached before it.
5. **Probe static data once at startup** (`Topology`, `SystemInfoTemplate`, Docker version); refresh only the parts that change (uptime).
6. **No O(n²) growth over time.** Long-running jobs must not re-read, re-parse or re-sort accumulated data on every iteration.
7. **Avoid allocations and clones on the per-tick path**; pre-size collections (`Vec::with_capacity`) where the size is known.
8. **Measure before optimizing and document why.** Performance-motivated code carries a comment with the reason and the measured cost (see `config::TEMP_INTERVAL`).

---

## 10. Hardware Topology & Measurements

### Enumerate Once

`topology::probe()` enumerates CPUs, disks and temperature sensors exactly once, and the resulting `HardwareHandles` are the only instances ever refreshed. `sysinfo` does not guarantee stable ordering across re-enumeration, and the front-end is positional, so **re-enumerating would silently attribute readings to the wrong gauge.** Hot-plugged hardware requires an engine restart; this is documented in the README and is the intended trade-off.

### Units

Units are part of the wire contract and are consistent per field:

| Field | Unit |
| --- | --- |
| `disks_space` | GB (10⁹ bytes) |
| `disks_used_space` | MB (10⁶ bytes) |
| `init_ram_total`, `ram_total`, `ram_used` | MB (10⁶ bytes) |
| `network_received`, `network_transmitted` | KB (10³ bytes) since previous tick |
| `cpu_usage` | percent per logical CPU |
| `temperatures`, `critical`, `disks_temperatures`, `disks_temp_warning` | °C |
| `uptime` | seconds |

**Rules:**

1. Name the unit in a doc comment on every numeric field that has one.
2. Never mix decimal and binary units within the payload.
3. Hardware values are untrusted too: subtract with `saturating_sub`, filter non-finite floats (`NaN` serializes to `null` and breaks charts), and reject implausible readings (see `is_plausible_temperature`).
4. Filter virtual and system filesystems (`tmpfs`, `overlay`, `devtmpfs`, `/boot`, snap mounts) and count a device mounted multiple times once.
5. Missing hardware (no sensors, no disks) produces empty arrays and a `warn`, never an error or a panic.

---

## 11. File System & Recorded Logs

**Rules:**

1. **All paths are built by the engine** from `config::LOG_DIR` and server-generated timestamps. No client-supplied string ever reaches a path.
2. **Writes must not leave a corrupt file on crash or shutdown.** Write to a temporary file in the same directory, then rename over the target.
3. **Recordings are bounded**: a maximum duration is enforced, and memory held per recording is proportional to that bound.
4. **Recorded data is time-stamped in UTC** (ISO 8601, `%Y-%m-%dT%H:%M:%S`).
5. **Unreadable or malformed log files are skipped with a `warn`**, never fatal to listing or to other files.
6. **Directory creation is idempotent** (`ensure_dir`); file-system errors are logged with the path.
7. **Runtime output never goes into the source tree.** Logs are written to `LOG_DIR`, which is git-ignored; sample data used by tests lives in a dedicated fixtures location.

---

## 12. Docker Integration

**Rules:**

1. **Docker is optional.** Absence of the binary, an unreachable socket or a failed version query degrades to `DOCKER_UNAVAILABLE` with a log line; the rest of the engine is unaffected.
2. **Read-only API use only**: list containers, read logs, read version. The engine must never start, stop, remove, exec into, or otherwise mutate containers, images, volumes or networks — access to the Docker socket is root-equivalent, and the engine's socket is unauthenticated.
3. **Containers are addressed by a server-side index** refreshed on each `get_containers`; the client never supplies a container ID or name.
4. **One Docker client** is created at startup and shared; don't open a connection per request.
5. **Every log stream is cancellable** via its `CancellationToken`, registered in the connection's `StreamRegistry`, and removed when it ends by itself.
6. **Log lines are forwarded, not interpreted or logged** by the engine; container output may contain secrets.

---

## 13. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WATCH_DOG_ADDR` | `0.0.0.0:8999` | Bind address |
| `WATCH_DOG_LOG` (falls back to `RUST_LOG`) | `info` | Log level |

**Rules:**

1. Environment variables are read only in `config.rs` / `logging.rs`, at startup.
2. Empty or unrecognized values fall back to a safe default with a `warn`; values that make the engine unable to function (e.g. an unbindable address) fail startup with a clear message.
3. **No magic numbers.** Every interval, limit and size is a named constant in `config.rs` with a doc comment explaining *why* it has that value and what depends on it.
4. Derived values (tick ratios) are computed from the source constants, never hard-coded, and have a test that pins the expected ratio.
5. Adding or changing an environment variable updates the README configuration table in the same change.
6. No secrets are configured through the engine; if that ever changes, they are never logged or echoed.

---

## 14. Serialization

### Handle All Serialization Errors

```rust
// ❌ Forbidden
let json = serde_json::to_string(&payload).unwrap();

// ✅ Required
let json = match serde_json::to_string(&payload) {
    Ok(json) => json,
    Err(e) => {
        error!("Failed to serialize the container list: {}", e);
        return;
    }
};
```

**Rules:**

1. All wire structs use `#[derive(Serialize)]` with `#[serde(rename_all = "snake_case")]`. JSON fields are always snake_case.
2. Prefer typed structs over `json!` so the shape is checked at compile time; `json!` is acceptable only for trivially small, local payloads.
3. Optional fields use `#[serde(skip_serializing_if = "Option::is_none")]`; the front-end must tolerate their absence.
4. Floats that can be `NaN`/infinite are sanitized before serialization.
5. Payloads shared between clients are serialized once into `Arc<str>`.
6. Deserializing files the engine wrote itself still handles failure — files can be truncated, edited or from an older version.

---

## 15. Logging & Observability

The engine uses the `log` facade with the minimal logger in `logging.rs`: timestamped, leveled lines; `warn`/`error` to stderr, the rest to stdout. The process manager owns persistence and rotation.

### Log Levels

| Level | Use for |
| --- | --- |
| `error!()` | Failures of the engine itself: serialization, file writes, a failed sampling task, Docker API errors |
| `warn!()` | Degraded or suspicious conditions: refused connection, slow client dropped, invalid client message, missing sensors |
| `info!()` | Lifecycle: startup summary (hardware detected, bind address, Docker version), connection open/close, recording start/finish, shutdown |
| `debug!()` | Per-request detail, ignored frames, stream start/stop, cleanup |
| `trace!()` | Per-tick detail; never enabled in production |

**Rules:**

1. Every handled error is logged with context: peer `addr`, channel, path, operation.
2. **Nothing per-tick at `info` or above.** At 1 Hz across many clients this would drown the log and cost CPU. Repeated conditions in hot loops are logged once or rate-limited.
3. Never log container log contents, file contents, or anything that may carry secrets.
4. Log output format is for humans; don't build monitoring that parses it.
5. The logger itself must never panic or block; write failures are ignored by design.

---

## 16. Security

### Threat Model

The engine exposes host telemetry to anyone who can reach its port. Accepted: read access to CPU/RAM/disk/network/temperature data, host name, OS/kernel versions, and Docker container names and logs for clients on the trusted LAN. **Not accepted**: any client gaining the ability to change the host, read arbitrary files, exhaust its resources, or reach it from outside the LAN by default.

### Rules

1. **Read-only surface.** No message type may execute commands, modify files outside `LOG_DIR`, change system state, or mutate Docker. Any future control feature requires authentication first.
2. **Operators control exposure.** The bind address is configurable; documentation recommends `127.0.0.1` when remote access isn't needed, and firewalling port 8999 to the LAN otherwise. The engine must never be exposed to the internet.
3. **Resource exhaustion is a security issue.** Every client-driven resource is bounded (see [Resource Bounds](#8-resource-bounds--websocket-discipline)).
4. **Cross-site WebSocket hijacking**: browsers don't apply same-origin policy to WebSockets, so any web page a LAN user visits could connect to the engine. The handshake should validate the `Origin` header against the panel's origin (configurable).
5. **No path traversal, no injection**: client input is only ever a lookup key (see [Input Validation](#5-input-validation)).
6. **Least privilege**: the engine must work as an unprivileged user. Docker access requires membership in the `docker` group, which is root-equivalent; document it as an opt-in trade-off, never require it.
7. **No `unsafe` code.** The crate should declare `#![forbid(unsafe_code)]`.
8. **Error messages sent to clients are generic**; OS errors, paths and stack details stay in server logs.
9. **Dependencies are audited** (`cargo audit` / `cargo deny`) and kept current for security fixes.

---

## 17. Cross-Platform Support

Supported targets: **Linux x86_64** (primary — headless servers), **Windows x86_64**, **macOS arm64**.

**Rules:**

1. Platform-specific code is gated with `#[cfg(...)]` and has a working fallback on the other platforms (as `wait_for_signal` falls back to `SIGINT` on non-Unix).
2. Assume nothing about hardware availability: temperature sensors, `hwmon`, Docker and certain mount points may be absent.
3. Linux-specific filtering (virtual filesystems, `/boot`, snap mounts) must not wrongly exclude legitimate disks on other platforms.
4. Paths are built with `Path`/`PathBuf` joins where portability matters; the relative `LOG_DIR` assumes the working directory set by the front_panel launch scripts, which must stay in sync.
5. A change that compiles only on the author's OS is not done; the release workflow builds all three targets and must stay green.

---

## 18. Dependencies & Toolchain

**Rules:**

1. **Minimal dependencies.** Every new crate needs a reason the standard library or an existing dependency can't cover. Prefer well-maintained, widely used crates; enable only the features you use.
2. **`Cargo.lock` is committed** and CI builds with `--locked`.
3. **Formatting**: `cargo fmt` clean — no exceptions.
4. **Linting**: `cargo clippy --all-targets -- -D warnings` clean. `#[allow(clippy::...)]` only with a comment explaining why.
5. **Edition 2021**, stable toolchain only; no nightly features.
6. Upgrading `sysinfo`, `tokio-tungstenite` or `bollard` across a major version is its own change, reviewed for behavior changes (ordering, units, defaults).

---

## 19. Testing

### Rules

1. **Unit tests live next to the code** in `#[cfg(test)] mod tests`. Async tests use `#[tokio::test]`.
2. **Extract logic into pure functions so it is testable** without hardware, sockets or Docker: filtering (`is_monitored_disk`, `is_usable_sensor`), parsing (`get_index_and_channel`, `parse_level`), aggregation (`Accumulator`), cadence (`temp_every_n_ticks`).
3. **Test error and edge paths**, not just happy paths: empty inputs, `NaN`, zero durations, missing separators, duplicate registrations, overflow boundaries.
4. **Use explicit assertions** (`assert_eq!`, `assert!(matches!(..))`). `.expect("why this can't fail")` is allowed in tests; bare `.unwrap()` is not.
5. **One logical behavior per test, with a descriptive name**: `registry_refuses_a_duplicate_channel`, not `test_registry`.
6. **Every bug fix adds a regression test** that fails without the fix.
7. **Protocol-level integration tests** should cover the connection lifecycle over a real local socket: first message is `data_type` 0, then 2; oversize frames are rejected; connection limit is enforced; shutdown sends a close frame.
8. **Tests are deterministic**: no dependence on the host's real hardware values, wall-clock timing, or network. Use `tokio::time::pause()` for time-based logic.
9. **`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --locked` pass before every commit.**

---

## 20. Version Control & Releases

1. **Conventional Commits drive versioning** (see `RELEASING.md`): `fix:`/`perf:` → patch, `feat:` → minor, `!` or `BREAKING CHANGE:` → major. Choose the type honestly — it determines what users receive.
2. **Wire-protocol breaks are breaking changes** (`feat!:` / `fix!:`) even if the engine's Rust API didn't change.
3. **The git tag is the source of truth** for the version; `Cargo.toml`'s version is injected at release time.
4. **Never commit build output or runtime data**: binaries (`app_*`), `target/`, recorded logs.
5. **Documentation changes ship with the code change**: README (configuration, behavior), this file, and the protocol table in [§6](#6-wire-protocol-contract).
6. Small, focused commits; each one builds and passes tests.

---

## 21. Production Readiness Checklist

A change is ready to merge when:

1. **No `unwrap`/`expect`/`panic!`/unchecked indexing outside tests.**
2. **Every handled error is logged with context**; nothing is silently discarded.
3. **All client input is parsed, range-checked and safely narrowed**; client values are only lookup keys.
4. **No blocking calls on the async runtime.**
5. **Every spawned task is tracked, cancellable, and ends.**
6. **Every client-driven resource is bounded**, with the bound in `config.rs`.
7. **Cost does not scale with client count**, and idle cost stays ~zero.
8. **Wire protocol unchanged, or changed in lockstep with `front_panel`** and documented in §6.
9. **Positional and unit invariants preserved.**
10. **Graceful shutdown still flushes recordings and closes sockets cleanly.**
11. **No new write capability on the host or on Docker.**
12. **Builds on all three release targets.**
13. **`fmt`, `clippy -D warnings` and tests pass**; new behavior and bug fixes have tests.
14. **README and this document updated** where behavior, configuration or protocol changed.

---

## 22. Known Gaps (Hardening Backlog)

Places where the current code does not yet meet these rules. Fix them opportunistically when touching the area, or as dedicated changes; remove each entry once resolved.

1. **Unbounded recording duration**: `start_log`'s `duration_in_hours` (client `u64`) is multiplied by 3600 unchecked in `logfiles::recorder::run` — overflow panics in debug and wraps in release. Enforce a maximum duration and use `checked_mul` ([§5](#5-input-validation), [§11](#11-file-system--recorded-logs)).
2. **Truncating casts of client input**: `incoming.message as u32` in `ws::read` for `get_log_data` and `stop_container_output`. Use `u32::try_from` ([§5](#5-input-validation)).
3. **Container channel collides with `data_type` 0**: container index 0 encodes to channel 0, the same value as the `SystemData` message ([§6](#6-wire-protocol-contract), rule 2).
4. **Non-atomic log writes**: `write_json` truncates and rewrites the target file in place; a crash mid-write corrupts the recording ([§11](#11-file-system--recorded-logs)).
5. **No `Origin` validation** on the WebSocket handshake ([§16](#16-security), rule 4).
6. **No `#![forbid(unsafe_code)]`** at the crate root ([§16](#16-security)).
7. **CI treats `fmt` and `clippy` as advisory**; they should be blocking, with clippy at `-D warnings` (which now passes). No `cargo audit` step ([§18](#18-dependencies--toolchain)).
8. **No protocol-level integration tests** ([§19](#19-testing), rule 7).
9. **Committed runtime data**: `engine/log_2024-12-28_*.json` are old recorded logs in the source tree ([§20](#20-version-control--releases), rule 4).
10. **Log retention**: nothing limits the number or total size of files in `LOG_DIR`.

---

**Last Updated**: 2026-09-27
