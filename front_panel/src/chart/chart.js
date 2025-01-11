import {
    new_assign_button,
    default_buttons,
} from "../button_functions/button_functions";
import { getDisplay2 } from "../dsiplay2/display2";
import { displayLogList } from "../dsiplay2/display_helpers";
import { sendWSMessage } from "../script";
import Chart from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";

Chart.register(zoomPlugin);

class LogChart {
    constructor() {
        this.logList;
        this.logNumber = 0;
        this.options = {
            plugins: {
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                        },
                        pinch: {
                            enabled: true,
                        },
                        mode: "x",
                    },
                    pan: {
                        enabled: true,
                        mode: "x",
                    },
                },
            },
            transitions: {
                show: {
                    animations: {
                        x: {
                            from: 0,
                        },
                        y: {
                            from: 0,
                        },
                    },
                },
                hide: {
                    animations: {
                        x: {
                            to: 0,
                        },
                        y: {
                            to: 0,
                        },
                    },
                },
            },
        };
    }
}

let display = getDisplay2();

let logList;
let logCNRData;
let logNETData;

export function spawn_chart() {
    console.log("spawn_chart called");

    display.write_line("Getting the log list...");

    let logChart = new LogChart();

    get_log_list()
        .then((logList) => {
            if (logList && logList.length != 0) {
                displayLogList(logList).then(() => {
                    logChart.logList = logList;
                    display.pending_choice("Log number: 0");
                    buttonsInitChartOptions(logChart);
                });
            } else {
                display.write_line("There are 0 logs currently");
                display.write_line("Start new log function");
            }
        })
        .catch((error) => {
            display.write_line("Error getting log list.");
            console.error("Error getting log list:", error);
        });
}

export function update_log_list(newLogList) {
    logList = Object.entries(newLogList);
    console.log("logList updated:", logList);
}

function get_log_list() {
    console.log("get_log_list called");
    logList = null;

    sendWSMessage("get_log_list", 0);

    return new Promise((res, rej) => {
        const interval = 100;
        const timeout = 5000;
        const startTime = Date.now();

        let isChecking = false;

        const checkLogList = () => {
            console.log("checkLogList called at", Date.now());
            if (isChecking) return;
            isChecking = true;

            if (logList) {
                isChecking = false;
                res(logList);
            } else if (Date.now() - startTime > timeout) {
                isChecking = false;
                rej(new Error("Timeout waiting for log list"));
            } else {
                isChecking = false;
                setTimeout(checkLogList, interval);
            }
        };

        checkLogList();
    });
}

export function update_log_data(newCNRData, newNETData) {
    logCNRData = Object.entries(newCNRData);
    logNETData = Object.entries(newNETData);
}

function get_log_data(logFileNumber) {
    logCNRData = null;
    logNETData = null;

    sendWSMessage("get_log_data", logFileNumber);

    return new Promise((res, rej) => {
        const interval = 100;
        const timeout = 5000;
        const startTime = Date.now();

        const checkLogData = () => {
            if (logCNRData && logNETData) {
                res({ logCNRData, logNETData });
            } else if (Date.now - startTime > timeout) {
                rej(new Error("Timeout waiting for log data."));
            } else {
                setTimeout(checkLogData, interval);
            }
        };

        checkLogData();
    });
}

function buttonsInitChartOptions(logChart) {
    new_assign_button(
        0,
        () => {
            if (logChart.logNumber != -1) {
                display.pending_choice(
                    "Log file picked: " + logChart.logNumber,
                    true
                );
                default_buttons();
                get_log_data(logChart.logNumber)
                    .then(({ logCNRData, logNETData }) => {
                        display.write_line("Log data received.");
                        buttonsReadyChartOptions(
                            logChart,
                            logCNRData,
                            logNETData
                        );
                        display.write_line("Chart available to show");
                    })
                    .catch((error) => {
                        display.write_line("Error getting log data");
                        console.error("Error getting log data:", error);
                    });
            } else {
                display.pending_choice("Log file pick cancelled", true);
                default_buttons();
            }
        },
        "accept"
    );
    new_assign_button(
        1,
        () => {
            if (logChart.logNumber < logList.length - 1) {
                logChart.logNumber += 1;
                display.pending_choice(
                    `Log number: ${logChart.logNumber}`,
                    false
                );
            }
        },
        "+"
    );
    new_assign_button(
        2,
        () => {
            if (logChart.logNumber > 0) {
                logChart.logNumber -= 1;
                display.pending_choice(
                    `Log number: ${logChart.logNumber}`,
                    false
                );
            } else if (logChart.logNumber == 0) {
                logChart.logNumber = -1;
                display.pending_choice("Log number: cancel?", false);
            }
        },
        "-"
    );
}

function buttonsReadyChartOptions(logChart, logCNRData, logNETData) {
    new_assign_button(
        0,
        () => {
            createChartWindow(
                logChart,
                logCNRData[0][1], // Array of key: value pairs
                logCNRData[1][1], // Array of key: value pairs
                logNETData[0][1] // Object with key: value
            );
            default_buttons();
        },
        "show chart"
    );
}

function createChartWindow(logChart, cpuLog, ramLog, netLog) {
    let topContainer = document.getElementsByClassName("thatsAllFolks")[0];

    let chartWindow = document.createElement("div");
    chartWindow.id = "chartWindow";

    topContainer.appendChild(chartWindow);

    let [chartWindowWidth, chartWindowHeight] = [
        chartWindow.offsetWidth,
        chartWindow.offsetHeight,
    ];

    let closeChartButton = document.createElement("div");
    closeChartButton.id = "closeChart";
    closeChartButton.textContent = "X";

    chartWindow.appendChild(closeChartButton);

    closeChartButton.addEventListener("click", () => closeChartWindow());

    let chartTitle = document.createElement("div");
    chartTitle.id = "chartTitle";
    console.log(logChart.logList);
    chartTitle.textContent = logChart.logList[logChart.logNumber][1];

    chartWindow.appendChild(chartTitle);

    const chartData = [
        { id: "cpu", chartFn: getChart0, log: cpuLog },
        { id: "ram", chartFn: getChart1, log: ramLog },
        { id: "net", chartFn: getChart2, log: netLog },
    ];

    chartData.forEach((data, index) => {
        let chartContainer = document.createElement("div");
        chartContainer.className = "chartContainer";
        chartContainer.style.gridArea = data.id;

        let chartCanvas = document.createElement("canvas");
        chartCanvas.id = `chartCanvas${index}`;
        chartCanvas.className = "chartCanvases";
        chartCanvas.width = chartWindowWidth - 20;
        chartCanvas.height = chartWindowHeight / 3 - 20;
        chartContainer.appendChild(chartCanvas);

        chartWindow.appendChild(chartContainer);

        data.chartFn(logChart, chartCanvas, data.log);
    });
}

function closeChartWindow() {
    let topContainer = document.getElementsByClassName("thatsAllFolks")[0];
    topContainer.removeChild(document.getElementById("chartWindow"));

    display.write_line("Chart window closed.");
}

function getChart0(logChart, canvasElement, cpuLog) {
    const ctx = canvasElement.getContext("2d");

    let labels = [];
    let logData = [];

    cpuLog.forEach((elem) => {
        labels.push(elem.time_stamp.split("T")[1]);
        logData.push(elem.value);
    });

    let data = {
        labels: labels,
        datasets: [
            {
                label: "CPU Load (%)",
                data: logData,
                borderColor: "rgba(75, 192, 192, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(75, 192, 192, 1)",
                pointRadius: 1,
                pointHoverRadius: 5,
            },
        ],
    };

    new Chart(ctx, {
        type: "line",
        data: data,
        options: logChart.options,
    });
}

function getChart1(logChart, canvasElement, ramLog) {
    const ctx = canvasElement.getContext("2d");

    let labels = [];
    let logData = [];

    ramLog.forEach((elem) => {
        labels.push(elem.time_stamp.split("T")[1]);
        logData.push(elem.value);
    });

    let data = {
        labels: labels,
        datasets: [
            {
                label: "Memory Usage (GB)",
                data: logData,
                borderColor: "rgba(153, 102, 255, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(153, 102, 255, 1)",
                pointRadius: 1,
                pointHoverRadius: 5,
            },
        ],
    };

    new Chart(ctx, {
        type: "line",
        data: data,
        options: logChart.options,
    });
}

function getChart2(logChart, canvasElement, netLog) {
    const ctx = canvasElement.getContext("2d");

    let labels = [];

    let downLogData = [];
    let upLogData = [];

    netLog.down.forEach((elem) => {
        labels.push(elem.time_stamp.split("T")[1]);
        downLogData.push(elem.value);
    });

    netLog.up.forEach((elem) => {
        upLogData.push(elem.value);
    });

    let data = {
        labels: labels,
        datasets: [
            {
                label: "Network Received (KB)",
                data: downLogData,
                borderColor: "rgba(255, 159, 64, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(255, 159, 64, 1)",
                pointRadius: 1,
                pointHoverRadius: 5,
            },
            {
                label: "Network Transmitted (KB)",
                data: upLogData,
                borderColor: "rgba(64, 67, 255, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(64, 67, 255, 1)",
                pointRadius: 1,
                pointHoverRadius: 5,
            },
        ],
    };

    new Chart(ctx, {
        type: "line",
        data: data,
        options: logChart.options,
    });
}

export function show_latest_chart() {
    display.write_line("Getting latest log chart");

    let logChart = new LogChart();

    get_log_list().then((logList) => {
        if (logList && logList.length != 0) {
            logChart.logList = logList;
            const latestLogIndex = logList.length - 1;
            logChart.logNumber = latestLogIndex;
            get_log_data(latestLogIndex).then(({ logCNRData, logNETData }) => {
                createChartWindow(
                    logChart,
                    logCNRData[0][1],
                    logCNRData[1][1],
                    logNETData[0][1]
                );
            });
        } else {
            display.write_line("There are 0 logs currently");
            display.write_line("Start new log function");
        }
    });
}
