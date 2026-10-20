import {
    CategoryScale,
    Chart,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";

import { getTheme } from "../../util/theme.js";

Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Legend,
    Tooltip,
    zoomPlugin
);

/** Series longer than this are thinned before charting and drawn without animation. */
const MAX_POINTS = 1500;
const ANIMATE_UP_TO = 1000;
const PADDING_PX = 20;

/** The open window, if any. */
let current = null;

function thin(series) {
    if (series.length <= MAX_POINTS) {
        return series;
    }
    const step = Math.ceil(series.length / MAX_POINTS);
    return series.filter((_, i) => i % step === 0);
}

function timeLabel(point) {
    const t = point.time_stamp;
    const idx = t.indexOf("T");
    return idx === -1 ? t : t.slice(idx + 1);
}

function axisStyle() {
    const theme = getTheme();
    return {
        ticks: { color: theme.creamDim, font: { family: theme.fontBody } },
        grid: { color: theme.grid },
    };
}

function baseOptions(pointCount) {
    const theme = getTheme();
    return {
        responsive: false,
        animation: pointCount > ANIMATE_UP_TO ? false : undefined,
        plugins: {
            legend: { labels: { color: theme.cream, font: { family: theme.fontBody } } },
            tooltip: {
                backgroundColor: theme.lacquerWarm,
                borderColor: theme.brass,
                borderWidth: 1,
                titleColor: theme.brassLight,
                bodyColor: theme.cream,
            },
            zoom: {
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
                pan: { enabled: true, mode: "x" },
            },
        },
    };
}

function dataset(label, data, color) {
    return {
        label,
        data,
        borderColor: color,
        pointBackgroundColor: color,
        fill: false,
        tension: 0.1,
        pointRadius: 1,
        pointHoverRadius: 5,
    };
}

function lineChart(canvas, { labels, datasets, yScale }) {
    return new Chart(canvas.getContext("2d"), {
        type: "line",
        data: { labels, datasets },
        options: {
            ...baseOptions(labels.length),
            scales: { x: axisStyle(), y: { ...yScale, ...axisStyle() } },
        },
    });
}

/**
 * Opens the chart window for one recorded log. Only one window exists at a
 * time; opening another closes the previous one.
 *
 * @param {object} params
 * @param {string} params.title
 * @param {Array<{time_stamp: string, value: number}>} params.cpu
 * @param {Array<{time_stamp: string, value: number}>} params.ram
 * @param {{ down: Array, up: Array }} params.net
 * @param {number} params.ramMax  RAM capacity in MB for the y axis.
 * @param {() => void} [params.onClose]
 * @returns {{ close(): void }}
 */
export function openChartWindow({ title, cpu, ram, net, ramMax, onClose }) {
    closeCurrent();
    const theme = getTheme();
    const abort = new AbortController();
    const charts = [];

    const win = document.createElement("div");
    win.id = "chartWindow";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", `Chart for ${title}`);
    document.body.appendChild(win);
    const width = win.offsetWidth;
    const height = win.offsetHeight;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.id = "closeChart";
    closeButton.textContent = "X";
    closeButton.setAttribute("aria-label", "Close chart");
    win.appendChild(closeButton);

    const heading = document.createElement("div");
    heading.id = "chartTitle";
    heading.textContent = title;
    win.appendChild(heading);

    const cpuSeries = thin(cpu);
    const ramSeries = thin(ram);
    const downSeries = thin(net.down);
    const upSeries = thin(net.up);

    const panels = [
        {
            id: "cpu",
            labels: cpuSeries.map(timeLabel),
            datasets: [
                dataset(
                    "CPU Load (%)",
                    cpuSeries.map((p) => p.value),
                    theme.emerald
                ),
            ],
            yScale: { min: 0, max: 100 },
        },
        {
            id: "ram",
            labels: ramSeries.map(timeLabel),
            datasets: [
                dataset(
                    "Memory Usage (MB)",
                    ramSeries.map((p) => p.value),
                    theme.amber
                ),
            ],
            yScale: { min: 0, max: ramMax },
        },
        {
            id: "net",
            labels: downSeries.map(timeLabel),
            datasets: [
                dataset(
                    "Network Received (KB)",
                    downSeries.map((p) => p.value),
                    theme.steel
                ),
                dataset(
                    "Network Transmitted (KB)",
                    upSeries.map((p) => p.value),
                    theme.brassLight
                ),
            ],
            yScale: {},
        },
    ];

    panels.forEach((panel, index) => {
        const container = document.createElement("div");
        container.className = "chartContainer";
        container.style.gridArea = panel.id;
        const canvas = document.createElement("canvas");
        canvas.id = `chartCanvas${index}`;
        canvas.className = "chartCanvases";
        canvas.width = Math.max(1, width - PADDING_PX);
        canvas.height = Math.max(1, height / panels.length - PADDING_PX);
        container.appendChild(canvas);
        win.appendChild(container);
        charts.push(lineChart(canvas, panel));
    });

    const handle = {
        close() {
            if (current !== handle) return;
            current = null;
            abort.abort();
            for (const chart of charts) {
                chart.destroy();
            }
            win.remove();
            if (onClose) onClose();
        },
    };
    closeButton.addEventListener("click", () => handle.close(), { signal: abort.signal });
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape") handle.close();
        },
        { signal: abort.signal }
    );
    closeButton.focus();
    current = handle;
    return handle;
}

export function closeCurrent() {
    if (current) {
        current.close();
    }
}
