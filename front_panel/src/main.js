import { installMenu } from "./features/menu.js";
import { createRequest } from "./features/context.js";
import { createDispatcher } from "./protocol/dispatch.js";
import { DATA_TYPE, REQUEST_TYPE } from "./protocol/messages.js";
import { ControlPanel } from "./render/controls/controls.js";
import { createStores } from "./state/stores.js";
import { StreamRegistry } from "./state/streams.js";
import { resolveSocketUrl } from "./transport/endpoint.js";
import { STATE, Transport } from "./transport/socket.js";
import { BootSequence } from "./ui/boot/boot_sequence.js";
import { Display } from "./ui/display/display.js";
import { attachDisplayScroll } from "./ui/display/scroll.js";
import { InfoDisplay } from "./ui/panel/info_display.js";
import { Panel } from "./ui/panel/panel.js";
import { PortalManager } from "./ui/portals/portal_manager.js";
import { isMobile, prefersReducedMotion } from "./util/device.js";
import { log } from "./util/logger.js";
import { getTheme } from "./util/theme.js";

const INDICATOR = Object.freeze({ CONNECTED: 0, STANDBY: 1, ERROR: 2 });

function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`required element missing: ${selector}`);
    }
    return element;
}

function installGlobalErrorHandlers() {
    window.addEventListener("error", (event) => {
        log.error("window", "uncaught error", {
            message: event.message,
            source: event.filename,
            line: event.lineno,
        });
    });
    window.addEventListener("unhandledrejection", (event) => {
        log.error("window", "unhandled rejection", { reason: event.reason });
    });
}

/**
 * The 3D panel needs WebGL. Without it the rest of the dashboard still works,
 * so a renderer failure degrades to "controls unavailable" instead of aborting.
 * @returns {ControlPanel | null}
 */
function createControls(root, display) {
    try {
        const controls = new ControlPanel(root, requireElement("#control2"), {
            onUnassigned: (kind) => display.writeLine(`No function assigned to this ${kind}`),
        });
        controls.resetButtons = () => controls.buttons.forEach((b) => b.resetToDefault());
        return controls;
    } catch (err) {
        log.error("main", "control panel unavailable", { err });
        root.classList.add("controls-unavailable");
        return null;
    }
}

async function main() {
    installGlobalErrorHandlers();
    getTheme();
    const reducedMotion = prefersReducedMotion();

    const displayRoot = requireElement(".display_2");
    const display = new Display(displayRoot, { isMobile: isMobile(), reducedMotion });
    attachDisplayScroll(displayRoot, display);

    const panel = new Panel({
        cpu: requireElement("#cpu-cluster"),
        temp: requireElement("#temp-cluster"),
        storage: requireElement("#storage-cluster"),
        ram: requireElement("#ram-gauge"),
        netDown: requireElement("#net-down-gauge"),
        netUp: requireElement("#net-up-gauge"),
    });
    const info = new InfoDisplay(requireElement(".display"));

    const controlsRoot = requireElement(".control2");
    const controls = createControls(controlsRoot, display);

    const stores = createStores();
    const streams = new StreamRegistry();
    const transport = new Transport({ url: resolveSocketUrl(window.location) });
    const portals = new PortalManager({
        onClosed: (channel) => {
            streams.close(channel);
            transport.send(REQUEST_TYPE.STOP_CONTAINER_OUTPUT, channel);
        },
    });

    let preprocess;
    if (__DEV__) {
        const { createMockPreprocessor } = await import("./dev/mocks.js");
        preprocess = createMockPreprocessor(window.location.search) || undefined;
    }

    const dispatch = createDispatcher({
        handlers: {
            [DATA_TYPE.TOPOLOGY]: (f) => stores.topology.set(f),
            [DATA_TYPE.STATS]: (f) => stores.stats.set(f),
            [DATA_TYPE.SYSTEM_INFO]: (f) => stores.systemInfo.set(f),
            [DATA_TYPE.LOG_LIST]: (f) => stores.logList.set(f),
            [DATA_TYPE.LOG_DATA]: (f) => stores.logData.set(f),
            [DATA_TYPE.CONTAINER_LIST]: (f) => stores.containerList.set(f),
        },
        isStreamChannel: (channel) => streams.has(channel),
        onStreamLine: (channel, line) =>
            portals.open(channel, streams.nameFor(channel)).addLine(line),
        preprocess,
    });
    transport.addEventListener("message", (event) => dispatch(event.detail));

    stores.topology.subscribe((frame) => panel.applyTopology(frame));
    stores.systemInfo.subscribe((frame) => info.render(frame));
    stores.stats.subscribe((frame) => {
        panel.applyStats(frame);
        info.updateUptime(frame.uptime);
    });

    // Indicator state is remembered so it can be applied once the models load.
    let connected = false;
    function showConnection(state) {
        connected = state;
        if (!controls) return;
        const lamp = controls.indicators[INDICATOR.CONNECTED];
        const errorLamp = controls.indicators[INDICATOR.ERROR];
        if (!lamp || !errorLamp) return;
        if (state === true) {
            lamp.on();
            errorLamp.off();
        } else if (state === "connecting") {
            lamp.blink();
            errorLamp.off();
        } else {
            lamp.off();
            errorLamp.on();
        }
    }

    const boot = new BootSequence({
        panel,
        info,
        cover: controlsRoot.querySelector(".cover"),
        reducedMotion,
    });

    function announceConnected() {
        display.writeLine("WebSocket connection established");
        display.writeLine(`WS connection at: ${transport.url}`);
        showConnection(true);
    }

    transport.addEventListener("statechange", (event) => {
        const { state, closeCode } = event.detail;
        if (state === STATE.CONNECTING) {
            showConnection("connecting");
        } else if (state === STATE.OPEN) {
            log.info("main", "connected", { url: transport.url });
            if (!boot.hasRun) {
                boot.run().then(() => {
                    display.writeLine("Display 2 initialized.");
                    announceConnected();
                });
            } else {
                announceConnected();
            }
        } else if (state === STATE.CLOSED) {
            streams.clear();
            if (boot.hasRun) {
                display.writeLine("WebSocket connection closed");
                panel.zero();
            }
            showConnection(false);
            if (closeCode && closeCode !== 1000 && closeCode !== 1001) {
                log.warn("main", "abnormal close", { closeCode });
            }
        }
    });
    transport.addEventListener("reconnect", (event) => {
        const { attempt, delayMs } = event.detail;
        display.writeLine(
            `Reconnecting in ${Math.max(1, Math.round(delayMs / 1000))}s (attempt ${attempt})`
        );
    });

    window.addEventListener("pagehide", () => transport.disconnect("page unloading"));

    const ctx = {
        transport,
        stores,
        streams,
        display,
        panel,
        controls,
        request: createRequest(transport),
    };

    if (__DEV__) {
        // Lets headless checks and DevTools drive the panel without raycasting.
        window.__watchdog = ctx;
    }

    transport.connect();

    if (!controls) {
        display.writeLine("Control panel unavailable: WebGL is not supported here");
        return;
    }
    const modelsLoaded = await controls.ready;
    if (modelsLoaded) {
        installMenu(ctx);
    } else {
        display.writeLine("Control panel unavailable: 3D models failed to load");
    }
    showConnection(connected);
}

main().catch((err) => {
    log.error("main", "fatal startup error", { err });
});
