# Watch Dog

This is a system resources monitoring app, developed primarily for headless servers.
The main idea is to be able to see the state of the server's system using any device connected to the local network.

## How to run:

### Prerequisites:

-   You need to have node and npm installed in order to run the front-end of the app.

### Steps (from a release, recommended):

1. Download `watch_dog-vX.Y.Z-full.tar.gz` from the [GitHub Releases](https://github.com/Z-Oleksandr/watch_dog/releases) page.
2. Unpack it: `tar -xzf watch_dog-vX.Y.Z-full.tar.gz`. All binaries in the release are packed inside the archives: the full bundle ships with the front-end already built and prebuilt engine binaries for Linux (x86_64), Windows (x86_64) and macOS (arm64) in `engine/app_linux|app_windows|app_macos`. The standalone `engine-*` archives contain just the engine executable for that platform, for updating an existing installation.
3. Move to front_panel dir `cd front_panel/`
4. Execute `npm ci --omit=dev`
5. Execute `npm run watch_dog` (works on Linux, Windows and macOS; the older `watch_dog_win` / `watch_dog_mac` names still work as aliases)
6. In browser open `http://localhost:9000`

P.S.: for drive temps see [Drive temperatures](#drive-temperatures).

### Steps (from source):

1. Clone the project.
2. Either download the engine archive for your platform from [Releases](https://github.com/Z-Oleksandr/watch_dog/releases) and unpack it into `engine/app_linux/` (or `app_windows/` / `app_macos/`), for example `tar -xzf engine-linux-x86_64-vX.Y.Z.tar.gz -C engine/app_linux/`, or build it yourself with `cd engine && cargo build --release` and use `npm run launch` later instead of `npm run watch_dog`.
3. Move to front_panel dir `cd front_panel/`
4. Execute `npm install`
5. Execute `npm run build`
6. Execute `npm run watch_dog` (or `npm run launch` to use the engine you built in `engine/target/release`)
7. In browser open `http://localhost:9000`

P.S.: for drive temps see [Drive temperatures](#drive-temperatures).

And that is basically it, **however** that is more of a test run. In order to fulfill the main purpose of the app it has to run in the background on a server (as an example we will take a server running a linux OS) and be accessible at any time from any other device in the local network (it could also be set up to only be accessible from one specific device, but we will save that for later).

1. This step remains the same => download and unpack the release (or clone and build from source).
2. If the server has SATA drives (HDD or SATA SSD), load the `drivetemp` kernel module so their temperatures can be shown, now and on every boot: `sudo modprobe drivetemp && echo drivetemp | sudo tee /etc/modules-load.d/drivetemp.conf`. NVMe drives need nothing. This is the only step that needs root; the app itself runs as a normal user. See [Drive temperatures](#drive-temperatures).
3. Choose a process manager, which will allow the app to run in the background, for example pm2 (a process manager for Node.js apps)
4. Execute `npm install -g pm2`
5. Move to front_panel dir `cd front_panel/`
6. Execute `npm ci --omit=dev` (from a release) or `npm install && npm run build` (from source)
7. Start the app `pm2 start npm --name watch_dog -- run watch_dog`
8. If you have firewall enabled, allow access at port 9000: `ufw allow 9000`. The browser talks to the engine through the front panel (`/ws`), so port 8999 stays closed; the launcher binds the engine to `127.0.0.1` only.
9. Now you can access the app from any device in your local network at `http://<server-private-ip>:9000`
10. To have pm2 automatically run on system startup execute: `pm2 startup`

Note: the launcher makes the engine binary executable itself. If that fails (read-only filesystem), run `chmod +x engine/app_linux/engine` from the project root.

### Front panel configuration (optional)

`npm run watch_dog` / `npm run launch` start two processes: the Node host (`front_panel/server`) that serves the page and proxies the WebSocket, and the engine. Both read optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FRONT_PANEL_PORT` | `9000` | Port the page is served on. |
| `FRONT_PANEL_BIND` | `0.0.0.0` | Address the page is served on. Use `127.0.0.1` for a single-machine setup. |
| `ENGINE_ADDR` | `127.0.0.1:8999` | Where the host forwards `/ws` to. Must match the engine's `WATCH_DOG_ADDR`. |
| `FRONT_PANEL_LOG` | `info` | Host log verbosity: `off`, `error`, `warn`, `info` or `debug`. |

`GET /health` on the front panel port returns `{"status":"ok"}` for process managers and reverse proxies. If you put the panel behind HTTPS, the page connects with `wss://` automatically.

### Engine configuration (optional)

The engine reads two environment variables, both optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WATCH_DOG_ADDR` | `0.0.0.0:8999` | Address the engine binds to. When started through the npm scripts it defaults to `127.0.0.1:8999`, since browsers reach it through the front panel's proxy. |
| `WATCH_DOG_LOG` | `info` | Log verbosity: `off`, `error`, `warn`, `info`, `debug` or `trace`. `RUST_LOG` is honoured too. |

The engine stops cleanly on `SIGINT` and `SIGTERM`, closing open browser connections with a proper close frame first, so `pm2 restart watch_dog` and `pm2 stop watch_dog` are safe.

Note: the set of disks and temperature sensors is detected once when the engine starts. If you attach a new drive, restart the engine to have it appear on the panel.

### Drive temperatures

Each storage gauge shows its drive's temperature above the needle hub, refreshed every 30 seconds. When there are several disks, the summary gauge shows the average, or the hottest drive that is over its limit. The number turns red at a threshold that depends on the drive type:

To activate:
`sudo modprobe drivetemp && echo drivetemp | sudo tee /etc/modules-load.d/drivetemp.conf`

To undo: 
`sudo rm /etc/modules-load.d/drivetemp.conf && sudo modprobe -r drivetemp`

| Drive | Red from |
| --- | --- |
| Spinning disk (HDD) | 55 °C |
| NVMe / SSD reporting its own limit | That limit (NVMe WCTEMP) minus 5 °C |
| SSD without a reported limit | 70 °C |

A disk on LVM, LUKS or software RAID shows the hottest drive beneath it, against the strictest threshold among them.

- Linux: temperatures are read from the kernel's hwmon sensors. The engine needs no root for this.
- macOS (Apple silicon): the internal SSD's temperature (the `NAND` sensor, also shown in the Temperature section as "SSD") is shown on the system disk. External drives show no temperature.
- Windows: not supported yet.
- NVMe drives work out of the box on kernel 5.5 or newer.
- SATA drives need the `drivetemp` kernel module (setup step 2 above). The engine logs a hint at startup for every SATA drive without a sensor. After loading the module, restart the engine (`pm2 restart watch_dog`), since sensors are detected once at startup.
- Reading a SATA drive's temperature sends it a SMART command, which on some HDDs resets the spin-down timer. Drives are only read while a panel is open, so disks can still spin down when nobody is watching.
- ZFS datasets and network shares have no single drive behind them and show no temperature.

Temperature section gauges turn their reading red at 90 °C, or earlier for a sensor whose critical value is low (at 85 % of it, where its red zone starts). The summary turns red whenever any sensor does.

## Instruction manual:

### Start logging process

-   In order to start the process of logging system stats (cpu, ram and network) you need to follow these steps:

1. Flip the `functions` toggle switch
2. Press the `logging` button
3. Using `+` and `-` buttons select the duration of the log recording (in hours)
4. Press `start` button (to cancel flip the `functions` toggle switch)

That's it - the process of recording logs has started.

### Display charts for a log

-   You can choose a previously created log file and display the data as a diagram.

1. Press `get chart` button
2. Using `+` and `-` buttons select the number of the log, which you want to display
3. Press `accept` button
4. Press `show chart` button

That's it - a visual representation of the chosen log will be displayed.

### Display latest log on a chart

-   You can use a shortcut and directly display the latest available log. If a logging process is in progress - the state at the moment of request, of the log, which is being created, will be displayed. The logging process will continue nonetheless.

1. Flip the `ext buttons` toggle switch
2. Press `latest log` button

That's it - a visual representation of the latest log will be displayed.

### Scrolling

-   Display2 can be scrolled using mouse wheel or by touch. Additionaly under `ext buttons` scrolling with buttons can be enabled.

## Development

From `front_panel/`:

- `npm run dev` serves the page with automatic restarts of the host (run the engine separately with `npm run launch:none` plus `cargo run` in `engine/`, or use `npm run launch`).
- `npm run build:dev` rebuilds the bundle on every change; `npm run build` produces the production bundle in `dist/`.
- `npm run check` runs ESLint, Prettier and the Vitest suite; CI runs the same plus `npm audit` on runtime dependencies.
- Development builds accept `?ws=ws://host:8999` to connect straight to a remote engine, and `?mock_temps=1|none` / `?mock_disks=N` to fake sensors (mocked disks include drive temperatures). Neither exists in production builds.
- Coding rules live in `engine/code_rules.md` and `front_panel/code_rules.md`.
