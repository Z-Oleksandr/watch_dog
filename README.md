# Watch Dog

This is a system resources monitoring app, developed primarily for headless servers.
The main idea is to be able to see the state of the server's system using any device connected to the local network.

## How to run:

### Prerequisites:

-   You need to have node and npm installed in order to run the front-end of the app.

### Steps (from a release — recommended):

1. Download `watch_dog-vX.Y.Z-full.tar.gz` from the [GitHub Releases](https://github.com/Z-Oleksandr/watch_dog/releases) page and unpack it. It ships with the front-end already built and prebuilt engine binaries for Linux (x86_64), Windows (x86_64) and macOS (arm64).
2. Move to front_panel dir `cd front_panel/`
3. Execute `npm ci --omit=dev`
4.  - On Windows: execute `npm run watch_dog_win`
    - On Linux: execute `npm run watch_dog`
    - On macOS: execute `npm run watch_dog_mac`
5. In browser open `http://localhost:9000`

### Steps (from source):

1. Clone the project.
2. Either download the engine binary for your platform from [Releases](https://github.com/Z-Oleksandr/watch_dog/releases) into `engine/app_linux/` (or `app_windows/` / `app_macos/`), or build it yourself with `cd engine && cargo build --release` and use `npm run launch` later instead of `npm run watch_dog`.
3. Move to front_panel dir `cd front_panel/`
4. Execute `npm install`
5. Execute `npm run build`
6.  - On Windows: execute `npm run watch_dog_win`
    - On Linux: execute `npm run watch_dog`
    - On macOS: execute `npm run watch_dog_mac`
7. In browser open `http://localhost:9000`

And that is basically it, **however** that is more of a test run. In order to fulfill the main purpose of the app it has to run in the background on a server (as an example we will take a server running a linux OS) and be accessible at any time from any other device in the local network (it could also be set up to only be accessible from one specific device, but we will save that for later).

1. This step remains the same => download and unpack the release (or clone and build from source).
2. Choose a process manager, which will allow the app to run in the background, for example pm2 (a process manager for Node.js apps)
3. Execute `npm install -g pm2`
4. Move to front_panel dir `cd front_panel/`
5. Execute `npm ci --omit=dev` (from a release) or `npm install && npm run build` (from source)
6. Start the app `pm2 start npm --name watch_dog -- run watch_dog`
7. If you have firewall enabled, you need to allow access at port 9000 for the front_end and at port 8999 for the engine `ufw allow 9000 && ufw allow 8999`
8. Now you can access the app from any device in your local network at `http://<server-private-ip>:9000`
9. To have pm2 automatically run on system startup execute: `pm2 startup`

Note: On a linux system you might need to make sure the binary has executable permissions. For example from project root execute: `chmod +x /engine/app_linux/engine`

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
