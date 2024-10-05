const ws = new WebSocket("ws://127.0.0.1:8999");

let cpu_p = document.getElementById("cpu");
let ram_t = document.getElementById("ram_total");
let ram_u = document.getElementById("ram_used");
let disk_t = document.getElementById("disk_total");
let disk_u = document.getElementById("disk_used");
let network = document.getElementById("network");

let opts_general = {
    angle: -0.2,
    lineWidth: 0.15,
    radiusScale: 0.7,
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
        font: "20px sans-serif",
        labels: [0, 20, 60, 80, 100],
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
let all_disk_gauges = [];
let all_net_gauges = [];
let ram_gauge;

let net_canvas;

ws.onmessage = function (event) {
    const data_stream = JSON.parse(event.data);

    if (data_stream.data_type == 0) {
        // init CPU
        for (let i = 0; i < data_stream.num_cpus; i++) {
            let canvas = document.createElement("canvas");
            canvas.id = `cpuGauge${i}`;
            canvas.width = "200";
            canvas.height = "200";
            canvas.style.margin = "10px";
            document.getElementById("cpu").appendChild(canvas);

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
                font: "20px sans-serif",
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

        // init Disks
        for (let i = 0; i < data_stream.num_disks; i++) {
            let disk_canvas = document.createElement("canvas");
            disk_canvas.id = `diskGauge${i}`;
            disk_canvas.width = "200";
            disk_canvas.height = "200";
            disk_canvas.style.margin = "10px";
            document.getElementById("disks").appendChild(disk_canvas);

            let otps_disk = Object.assign({}, opts_general, {
                staticLabels: {
                    font: "20px sans-serif",
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

        // init Network
        for (let i = 0; i < 2; i++) {
            net_canvas = document.createElement("canvas");
            net_canvas.id = `netCanvas${i}`;
            net_canvas.width = "200";
            net_canvas.height = "200";
            net_canvas.style.margin = "10px";
            document.getElementById("network").appendChild(net_canvas);

            let opts_net = Object.assign({}, opts_general, {
                staticLabels: {
                    font: "20px sans-serif",
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
    }

    if (data_stream.data_type == 1) {
        // CPU
        data_stream.cpu_usage.forEach((usage, index) => {
            if (all_cpu_gauges[index]) {
                all_cpu_gauges[index].set(usage);
            }
        });

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
                font: "20px sans-serif",
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

        if (net_received > 500000) {
            all_net_gauges[0] = new Gauge(net_canvas).setOptions(opts_net_max);
            all_net_gauges[0].maxValue = 1000;
        } else if (net_transmitted > 500000) {
            all_net_gauges[1] = new Gauge(net_canvas).setOptions(opts_net_max);
            all_net_gauges[1].maxValue = 1000;
        }
        all_net_gauges[0].set(net_received / 1000);
        all_net_gauges[1].set(net_transmitted / 1000);
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
    }, 2000);
}

function createRamCanvas() {
    let ram_canvas = document.createElement("canvas");
    ram_canvas.id = `ramGauge`;
    ram_canvas.width = "200";
    ram_canvas.height = "200";
    ram_canvas.style.margin = "10px";
    document.getElementById("ram").appendChild(ram_canvas);
    return ram_canvas;
}
