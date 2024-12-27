import { getDisplay2 } from "../dsiplay2/display2";
import Chart from "chart.js/auto";

let display = getDisplay2();

export function spawn_chart() {
    display.write_line("Getting the chart.");
    createChartWindow();
}

function createChartWindow() {
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

    const chartData = [
        { id: "cpu", chartFn: getChart0 },
        { id: "ram", chartFn: getChart1 },
        { id: "net", chartFn: getChart2 },
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

        data.chartFn(chart);
    });
}

function closeChartWindow() {
    let topContainer = document.getElementsByClassName("thatsAllFolks")[0];
    topContainer.removeChild(document.getElementById("chartWindow"));

    display.write_line("Chart window closed.");
}

function getChart0(canvasElement) {
    const ctx = canvasElement.getContext("2d");

    let data = {
        labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        datasets: [
            {
                label: "CPU Load (%)",
                data: [12, 15, 18, 22, 25, 20, 30, 35, 33, 28],
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

function getChart1(canvasElement) {
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

function getChart2(canvasElement) {
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
                pointBackgroundColor: "rgba(255, 159, 64, 1)",
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
