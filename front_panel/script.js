const ws = new WebSocket(`ws://${window.location.hostname}:8999`);

let connectionAt = `ws://${window.location.hostname}:8999`;
console.log("WS connection at: " + connectionAt);

let cpu_p = document.getElementById("cpu");
let ram_t = document.getElementById("ram_total");
let ram_u = document.getElementById("ram_used");
let disk_t = document.getElementById("disk_total");
let disk_u = document.getElementById("disk_used");
let network = document.getElementById("network");

let cpu_section = document.getElementsByClassName("cSec")[0];
let ramandnet_section = document.getElementsByClassName("ramandnet")[0];
let disk_section = document.getElementsByClassName("dSec")[0];

function getSectionSize(section) {
    let sec_width = section.offsetWidth;
    let sec_height = section.offsetHeight;

    return [sec_width, sec_height];
}

let opts_general = {
    angle: -0.2,
    lineWidth: 0.15,
    radiusScale: 0.6,
    pointer: {
        length: 0.6,
        strokeWidth: 0.035,
        color: "#000000",
    },
    limitMax: true,
    limitMin: true,
    highDpiSupport: true,
    generateGradient: true,
    staticLabels: {
        font: "18px orbitron",
        labels: [0, 60, 100],
        color: "#000000",
        fractionDigits: 0,
    },
    staticZones: [
        { strokeStyle: "#F03E3E", min: 80, max: 100 }, // Red
        { strokeStyle: "#FFDD00", min: 60, max: 80 }, // Yellow
        { strokeStyle: "#30B32D", min: 0, max: 60 }, // Green
    ],
    renderTicks: {
        divisions: 10,
        divWidth: 1.1,
        divLength: 0.7,
        divColor: "#333333",
        subDivisions: 5,
        subLength: 0.4,
        subWidth: 0.6,
        subColor: "#666666",
    },
};

let all_cpu_gauges = [];
let cpu_clusters = new Array(4);

let all_disk_gauges = [];
let all_net_gauges = [];
let ram_gauge;

let numCPUs;

let net_canvas;

ws.onmessage = function (event) {
    const data_stream = JSON.parse(event.data);

    if (data_stream.data_type == 0) {
        // init CPU
        numCPUs = data_stream.num_cpus;
        let cSec_size = getSectionSize(cpu_section);
        let cpu_container = document.getElementById("cpu");

        let cpuGaugeSize = findGaugeSizeByHeight(
            4, // Split cpu threads into 4 clusters
            cSec_size[0],
            cSec_size[1],
            30
        );

        for (let i = 0; i < 4; i++) {
            // Create label for each cluster
            let label = document.createElement("p");
            label.classList.add("gTitle");
            label.classList.add("cTitle");
            label.appendChild(document.createTextNode(`CPU cluster ${i}`));
            // Create the gauge
            let canvas = document.createElement("canvas");
            canvas.id = `cpuGauge${i}`;

            canvas.width = cpuGaugeSize[0];
            canvas.height = cpuGaugeSize[1];

            cpu_container.appendChild(label);
            cpu_container.appendChild(canvas);

            let cpu_gauge = new Gauge(canvas).setOptions(opts_general);
            cpu_gauge.maxValue = 100;
            cpu_gauge.setMinValue(0);
            cpu_gauge.animationSpeed = 500;

            all_cpu_gauges.push(cpu_gauge);
        }
        start_gauges(all_cpu_gauges);

        // init RAM
        let opts_ram = Object.assign({}, opts_general, {
            staticLabels: {
                font: "18px orbitron",
                labels: [
                    0,
                    (0.8 * data_stream.init_ram_total) / 3,
                    data_stream.init_ram_total / 2,
                    (2.2 * data_stream.init_ram_total) / 3,
                    data_stream.init_ram_total,
                ],
                color: "#000000",
                fractionDigits: 0,
            },
            staticZones: [
                {
                    strokeStyle: "#F03E3E",
                    min: 0.8 * data_stream.init_ram_total,
                    max: data_stream.init_ram_total,
                }, // Red
                {
                    strokeStyle: "#FFDD00",
                    min: 0.6 * data_stream.init_ram_total,
                    max: 0.8 * data_stream.init_ram_total,
                }, // Yellow
                {
                    strokeStyle: "#30B32D",
                    min: 0,
                    max: 0.6 * data_stream.init_ram_total,
                }, // Green
            ],
            renderTicks: {
                divisions: data_stream.init_ram_total,
                divWidth: 1.1,
                divLength: 0.7,
                divColor: "#333333",
                subDivisions: 3,
                subLength: 0.4,
                subWidth: 0.5,
                subColor: "#666666",
            },
        });

        ram_gauge = new Gauge(createRamCanvas()).setOptions(opts_ram);
        ram_gauge.maxValue = data_stream.init_ram_total;
        ram_gauge.setMinValue(0);
        ram_gauge.animationSpeed = 500;

        start_gauges([ram_gauge]);

        // init Network
        let nSec_size = getSectionSize(ramandnet_section);
        let netGaugeSize = findGaugeSizeByWidth(
            3,
            nSec_size[0],
            nSec_size[1],
            50
        );

        for (let i = 0; i < 2; i++) {
            let label = document.createElement("p");
            label.classList.add("gTitle");
            label.classList.add("nTitle");
            if (i == 0) {
                label.appendChild(document.createTextNode("Down"));
            } else {
                label.appendChild(document.createTextNode("Up"));
            }
            document.getElementById("network").appendChild(label);

            net_canvas = document.createElement("canvas");
            net_canvas.id = `netCanvas${i}`;
            net_canvas.width = netGaugeSize[0] - 10;
            net_canvas.height = netGaugeSize[1] - 10;
            document.getElementById("network").appendChild(net_canvas);

            let opts_net = Object.assign({}, opts_general, {
                staticLabels: {
                    font: "18px orbitron",
                    labels: [0, 125, 250, 375, 500],
                    color: "#000000",
                    fractionDigits: 0,
                },
                staticZones: [
                    {
                        strokeStyle: "#30B32D",
                        min: 0,
                        max: 500,
                    }, // Green
                ],
            });

            let net_gauge = new Gauge(net_canvas).setOptions(opts_net);
            net_gauge.maxValue = 500; // Mbps
            net_gauge.setMinValue(0);
            net_gauge.animationSpeed = 500;

            all_net_gauges.push(net_gauge);
        }
        start_gauges(all_net_gauges);

        // init Disks
        let dSec_size = getSectionSize(disk_section);
        let diskGaugeSize = findGaugeSizeByHeight(
            data_stream.num_disks,
            dSec_size[0],
            dSec_size[1],
            50
        );
        for (let i = 0; i < data_stream.num_disks; i++) {
            let disk_canvas = document.createElement("canvas");
            disk_canvas.id = `diskGauge${i}`;
            disk_canvas.width = diskGaugeSize[0];
            disk_canvas.height = diskGaugeSize[1];
            disk_canvas.style.margin = "10px";
            document.getElementById("disks").appendChild(disk_canvas);

            let otps_disk = Object.assign({}, opts_general, {
                staticLabels: {
                    font: "18px orbitron",
                    labels: [
                        0,
                        data_stream.disks_space[i] / 4,
                        data_stream.disks_space[i] / 2,
                        (data_stream.disks_space[i] * 3) / 4,
                        data_stream.disks_space[i],
                    ],
                    color: "#000000",
                    fractionDigits: 0,
                },
                staticZones: [
                    {
                        strokeStyle: "#F03E3E",
                        min: 0.8 * data_stream.disks_space[i],
                        max: data_stream.disks_space[i],
                    }, // Red
                    {
                        strokeStyle: "#30B32D",
                        min: 0,
                        max: 0.8 * data_stream.disks_space[i],
                    }, // Green
                ],
                renderTicks: {
                    divisions: 10,
                    divWidth: 1.1,
                    divLength: 0.7,
                    divColor: "#333333",
                    subDivisions: 5,
                    subLength: 0.4,
                    subWidth: 0.5,
                    subColor: "#666666",
                },
            });

            let disk_gauge = new Gauge(disk_canvas).setOptions(otps_disk);
            disk_gauge.maxValue = data_stream.disks_space[i];
            disk_gauge.setMinValue(0);
            disk_gauge.animationSpeed = 500;

            all_disk_gauges.push(disk_gauge);
        }
        start_gauges(all_disk_gauges);
    }

    if (data_stream.data_type == 2) {
        let display = document.getElementsByClassName("display")[0];
        initDisplay(display);
        setTimeout(() => {
            let column1 = document.createElement("div");
            let column2 = document.createElement("div");
            column1.classList.add("column");
            column2.classList.add("column");
            column2.setAttribute("id", "column2");

            function createPandAppend(topic, info, index) {
                let text = document.createElement("p");
                text.appendChild(document.createTextNode(topic + ": " + info));
                if (index < 4) {
                    column1.appendChild(text);
                } else {
                    column2.appendChild(text);
                }
            }

            Object.entries(data_stream).forEach(([key, value], index) => {
                if (key == "data_type") {
                    return;
                } else {
                    createPandAppend(key, value, index);
                }
            });

            display.appendChild(column1);
            display.appendChild(column2);
        }, 5000);
    }

    if (data_stream.data_type == 1) {
        // CPU
        let per_cluster = numCPUs / 4;
        let cpu_usage_array = data_stream.cpu_usage;

        // Old setting for each thread
        // data_stream.cpu_usage.forEach((usage, index) => {
        //     if (all_cpu_gauges[index]) {
        //         all_cpu_gauges[index].set(usage);
        //     }
        // });

        let i = 0;
        let cluster_index = 0;
        while (i < cpu_usage_array.length) {
            let cluster_sum = 0;
            for (let j = i; j < i + per_cluster; j++) {
                cluster_sum += cpu_usage_array[j];
            }
            let cluster_average = cluster_sum / per_cluster;
            all_cpu_gauges[cluster_index].set(cluster_average);
            cluster_index += 1;
            i += per_cluster;
        }

        // RAM
        ram_gauge.set(data_stream.ram_used);

        // Disks
        data_stream.disks_used_space.forEach((u_s, i) => {
            if (all_disk_gauges[i]) {
                all_disk_gauges[i].set(u_s);
            }
        });

        // Network
        // Data is sent in Kpbs
        let net_received = data_stream.network_received;
        let net_transmitted = data_stream.network_transmitted;

        let opts_net_max = Object.assign({}, opts_general, {
            staticLabels: {
                labels: [0, 250, 500, 750, 1000],
                color: "#000000",
                fractionDigits: 0,
            },
            staticZones: [
                {
                    strokeStyle: "#F03E3E",
                    min: 900,
                    max: 1000,
                }, // Red
                {
                    strokeStyle: "#FFDD00",
                    min: 800,
                    max: 900,
                }, // Yellow
                {
                    strokeStyle: "#30B32D",
                    min: 0,
                    max: 800,
                }, // Green
            ],
        });

        if (net_received > 500000 && all_net_gauges[0].maxValue != 1000) {
            all_net_gauges[0] = new Gauge(net_canvas).setOptions(opts_net_max);
            all_net_gauges[0].maxValue = 1000;
        } else if (
            net_transmitted > 500000 &&
            all_net_gauges[1].maxValue != 1000
        ) {
            all_net_gauges[1] = new Gauge(net_canvas).setOptions(opts_net_max);
            all_net_gauges[1].maxValue = 1000;
        }
        all_net_gauges[0].set(net_received / 1000);
        all_net_gauges[1].set(net_transmitted / 1000);

        // Updating uptime
        updateUptime(data_stream.uptime);
    }
};

ws.onopen = function () {
    console.log("WebSocket connection esablished");
};

ws.onerror = function (error) {
    console.error("WebSocket error: ", error);
};

ws.onclose = function () {
    console.log("WebSocket connection closed");
};

function start_gauges(gauges) {
    gauges.forEach((gauge) => {
        gauge.set(0);
    });

    setTimeout(() => {
        gauges.forEach((gauge) => {
            gauge.set(gauge.maxValue);
        });
    }, 500);

    setTimeout(() => {
        gauges.forEach((gauge) => {
            gauge.set(0);
            gauge.animationSpeed = 1024;
        });
    }, 2500);
}

function createRamCanvas() {
    let ram_canvas = document.createElement("canvas");
    ram_canvas.id = `ramGauge`;

    let rSec_size = getSectionSize(ramandnet_section);
    let rGaugeSize = findGaugeSizeByWidth(3, rSec_size[0], rSec_size[1], 50);

    ram_canvas.width = rGaugeSize[0];
    ram_canvas.height = rGaugeSize[1];

    let label = document.createElement("p");
    label.classList.add("gTitle");
    label.appendChild(document.createTextNode("RAM"));
    document.getElementById("ram").appendChild(label);
    document.getElementById("ram").appendChild(ram_canvas);
    return ram_canvas;
}

function findGaugeSizeByHeight(number, conWidth, conHeight, spacing) {
    let gaugeHeight = Math.floor(conHeight / number) - spacing;
    let gaugeWidth = gaugeHeight;

    if (gaugeWidth > 476) {
        gaugeWidth = 476;
        gaugeHeight = 476;
    }

    return [gaugeWidth, gaugeHeight];
}

function findGaugeSizeByWidth(number, conWidth, conHeight, spacing) {
    return findGaugeSizeByHeight(number, conHeight, conWidth, spacing);
}

function findGaugeSizeQuadro(number, conWidth, conHeight, spacing) {
    let cols, rows;
    let root = Math.sqrt(number);
    if (Number.isInteger(root)) {
        cols = root;
        rows = root;
    } else {
        cols = Math.ceil(root);
        rows = Math.floor(root);
    }

    let gaugeWidth;
    let gaugeHeight;

    if (conHeight > conWidth) {
        let hold = cols;
        cols = rows;
        rows = hold;
        if (number > 4) {
            opts_general.staticLabels.font = "9px orbitron";
            conHeight -= 50;
            conWidth -= 10;
        } else {
            opts_general.staticLabels.font = "12px orbitron";
            conHeight -= 180;
            conWidth -= 30;
        }
        gaugeWidth = Math.floor(conWidth / cols) - spacing;
        gaugeHeight = gaugeWidth;
    } else {
        gaugeWidth = Math.floor(conWidth / cols) - spacing;
        gaugeHeight = gaugeWidth;
    }

    if (gaugeWidth > 476) {
        gaugeWidth = 476;
        gaugeHeight = 476;
    }

    return [gaugeWidth, gaugeHeight];
}

function updateUptime(value) {
    const location = document.getElementById("column2");
    const p_items = location.querySelectorAll("p");
    for (const p of p_items) {
        if (p.textContent.includes("uptime")) {
            p.textContent = "uptime: " + value;
        }
    }
}

function initDisplay(display) {
    const greeting_container = document.createElement("div");
    greeting_container.classList.add("displayGreetingContainer");
    const greeting = document.createElement("p");
    greeting.classList.add("displayGreeting");
    greeting.textContent = "watch_dog - system monitor";
    greeting_container.appendChild(greeting);
    display.appendChild(greeting_container);
    setTimeout(() => {
        display.removeChild(greeting_container);
    }, 4000);
}
