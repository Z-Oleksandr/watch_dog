import { spawnChart, showLatestChart } from "./chart_picker.js";
import { startContainerStdout } from "./docker_stream.js";
import { startLogger } from "./logging.js";
import { resetConnection } from "./reconnect.js";

/** Pause before a sub-menu starts, so the display finishes its line first. */
const FEATURE_START_DELAY_MS = 1000;

/**
 * Wires the default meaning of every button and toggle, and the sub-menus
 * the "functions" and "ext buttons" toggles expose.
 * @param {import("./context.js").PanelContext} ctx
 */
export function installMenu(ctx) {
    const { display, controls, panel } = ctx;
    const [button0, button1, button2] = controls.buttons;
    const [functionsToggle, extButtonsToggle, netTestToggle] = controls.toggles;

    button0.setDefault(() => spawnChart(ctx), "get chart");
    button1.setDefault(() => display.clear(), "clear D2");
    button2.setDefault(() => resetConnection(ctx), "reset WS");

    const backToFunctions = () => showExtraFunctions();

    function enableExtraFunctions() {
        display.writeLine("Enable extra functions");
        button0.assign(() => {
            display.writeLine("Start logging setup");
            setTimeout(() => startLogger(ctx, backToFunctions), FEATURE_START_DELAY_MS);
        }, "logging");
        button1.assign(() => {
            display.writeLine("Start container stdout");
            setTimeout(() => startContainerStdout(ctx, backToFunctions), FEATURE_START_DELAY_MS);
        }, "docker log");
        button2.assign(() => display.writeLine("Nothing here for now."), "button 2");
    }

    function showExtraFunctions() {
        if (extButtonsToggle.state) {
            extButtonsToggle.toggle().then(enableExtraFunctions);
        } else {
            enableExtraFunctions();
        }
    }

    function hideExtraFunctions() {
        controls.resetButtons();
        if (display.isPending) {
            display.pendingChoice("Canceled", true);
        }
        display.writeLine("Disable extra functions");
    }

    function enableExtButtons() {
        button0.assign(() => showLatestChart(ctx), "latest log");
        button1.assign(() => display.scrollUp(), "scroll up");
        button2.assign(() => display.scrollDown(), "scroll down");
    }

    functionsToggle.setDefault(showExtraFunctions, hideExtraFunctions, "functions");

    extButtonsToggle.setDefault(
        () => {
            if (functionsToggle.state) {
                functionsToggle.toggle().then(enableExtButtons);
            } else {
                enableExtButtons();
            }
        },
        () => controls.resetButtons(),
        "ext buttons"
    );

    netTestToggle.setDefault(
        () => {
            display.writeLine("Testing net gauges");
            panel.setNetTesting(true);
        },
        () => {
            display.writeLine("Finished testing net gauges");
            panel.setNetTesting(false);
        },
        "net_g test"
    );
}
