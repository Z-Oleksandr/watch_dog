import {
    new_assign_button,
    default_buttons,
} from "../button_functions/button_functions";
import { getDisplay2 } from "../dsiplay2/display2";
import { sendWSMessage } from "../script";
import Chart from "chart.js/auto";

class LogChart {
    constructor() {
        this.logList;
        this.logNumber = 0;
    }
}

let display = getDisplay2();

let logList;
let logCNRData;
let logNETData;

export function spawn_chart() {
    display.write_line("Getting the log list...");

    let logChart = new LogChart();

    get_log_list()
        .then((logList) => {
            display.write_line("Log list:");
            logList.forEach(([index, log]) => {
                display.write_line(index + ": " + log);
            });

            logChart.logList = logList;

            display.write_line("Pick log to display");
            display.pending_choice("Log number: 0");
            buttonsInitChartOptions(logChart);
        })
        .catch((error) => {
            display.write_line("Error getting log list.");
            console.error("Error getting log list:", error);
        });
}

export function update_log_list(newLogList) {
    logList = Object.entries(newLogList);
}

function get_log_list() {
    logList = null;

    sendWSMessage("get_log_list", 0);

    return new Promise((res, rej) => {
        const interval = 100;
        const timeout = 5000;
        const startTime = Date.now();

        const checkLogList = () => {
            if (logList) {
                res(logList);
            } else if (Date.now() - startTime > timeout) {
                rej(new Error("Timeout waiting for log list"));
            } else {
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
            display.pending_choice(
                "Log file picked: " + logChart.logNumber,
                true
            );
            default_buttons();
            get_log_data(logChart.logNumber)
                .then(({ logCNRData, logNETData }) => {
                    display.write_line("Log data received.");

                    console.log("CNR:", logCNRData);
                    console.log("NET:", logNETData);

                    buttonsReadyChartOptions(logCNRData, logNETData);
                })
                .catch((error) => {
                    display.write_line("Error getting log data");
                    console.error("Error getting log data:", error);
                });
        },
        "Accept"
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
            if (logChart.logNumber > 1) {
                logChart.logNumber -= 1;
                display.pending_choice(
                    `Log number: ${logChart.logNumber}`,
                    false
                );
            }
        },
        "-"
    );
}

function buttonsReadyChartOptions(logCNRData, logNETData) {
    new_assign_button(
        0,
        () => {
            createChartWindow(
                logCNRData[0][1],
                logCNRData[1][1],
                logNETData[0][1]
            );
        },
        "show chart"
    );
}

function createChartWindow(cpuLog, ramLog, netLog) {
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
    chartTitle.textContent = "Log file 0";

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

        let chart = document.createElement("canvas");
        chart.id = `chartCanvas${index}`;
        chart.className = "chartCanvases";
        chart.width = chartWindowWidth - 20;
        chart.height = chartWindowHeight / 3 - 20;
        chartContainer.appendChild(chart);

        chartWindow.appendChild(chartContainer);

        data.chartFn(chart, data.log);
    });
}

function closeChartWindow() {
    let topContainer = document.getElementsByClassName("thatsAllFolks")[0];
    topContainer.removeChild(document.getElementById("chartWindow"));

    display.write_line("Chart window closed.");
}

function getChart0(canvasElement, cpuLog) {
    const ctx = canvasElement.getContext("2d");

    let labels = [];
    let logData = [];

    cpuLog.forEach((elem) => {
        labels.push(elem.time_stamp);
    });

    cpuLog.forEach((elem) => {
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
                pointRadius: 5,
                pointHoverRadius: 7,
            },
        ],
    };

    new Chart(ctx, {
        type: "line",
        data: data,
        options: {
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
            },
        },
    });
}

function getChart1(canvasElement, ramLog) {
    const ctx = canvasElement.getContext("2d");

    let data = {
        labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        datasets: [
            {
                label: "Memory Usage (%)",
                data: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95],
                borderColor: "rgba(153, 102, 255, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(153, 102, 255, 1)",
                pointRadius: 5,
                pointHoverRadius: 7,
            },
        ],
    };

    new Chart(ctx, {
        type: "line",
        data: data,
        options: {
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
            },
        },
    });
}

function getChart2(canvasElement, netLog) {
    const ctx = canvasElement.getContext("2d");

    let data = {
        labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        datasets: [
            {
                label: "Network Down Usage (%)",
                data: [0, 25, 70, 4, 12, 78, 70, 100, 9, 10],
                borderColor: "rgba(255, 159, 64, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(255, 159, 64, 1)",
                pointRadius: 5,
                pointHoverRadius: 7,
            },
            {
                label: "Network Up Usage (%)",
                data: [10, 45, 15, 80, 0, 6, 70, 30, 90, 20],
                borderColor: "rgba(64, 67, 255, 1)",
                fill: false,
                lineTension: 0.1,
                pointBackgroundColor: "rgba(64, 67, 255, 1)",
                pointRadius: 5,
                pointHoverRadius: 7,
            },
        ],
    };

    new Chart(ctx, {
        type: "line",
        data: data,
        options: {
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
            },
        },
    });
}
