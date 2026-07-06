import { indicators } from "../control2/indicator";
import { update_log_list, update_log_data } from "../chart/chart";
import { handle_received_container_list } from "../functions/docker";
import { get_container_stream_register } from "../functions/docker";
import { write_container_log_to_portal } from "../docker_stream/docker_stream_handler";
import { initPanel, updateStats, zeroAll, setNetTesting } from "../panel/panel";
import { renderSystemInfo } from "../panel/info_display";
import { bootOnSystemData, bootOnSystemInfo } from "../boot/boot_sequence";

let ram_max_mb = 1;

export function server_communication(ws) {
    ws.onmessage = function (event) {
        const data_stream = applyMocks(JSON.parse(event.data));

        if (data_stream.data_type == 0 || data_stream.data_type == 2) {
            if (indicators[0]) {
                indicators[0].blinking();
            }
        }

        if (data_stream.data_type == 0) {
            ram_max_mb = data_stream.init_ram_total;
            initPanel(data_stream);
            bootOnSystemData();
        }

        if (data_stream.data_type == 2) {
            bootOnSystemInfo(data_stream);
            renderSystemInfo(data_stream);
        }

        if (data_stream.data_type == 1) {
            updateStats(data_stream);
        }

        if (data_stream.data_type == 3) {
            update_log_list(data_stream.log_list);
        }

        if (data_stream.data_type == 4) {
            update_log_data(
                data_stream.cnr_data,
                data_stream.net_data,
                ram_max_mb
            );
        }

        if (data_stream.data_type == 5) {
            handle_received_container_list(data_stream.list);
        }

        const container_stream_register = get_container_stream_register();
        if (
            container_stream_register.count != 0 &&
            container_stream_register.channels
        ) {
            for (const [containerIndex, channel] of Object.entries(
                container_stream_register.channels
            )) {
                if (Number(channel) === data_stream.data_type) {
                    write_container_log_to_portal(
                        containerIndex,
                        channel,
                        data_stream.log_line
                    );
                }
            }
        }
    };
}

export function zero_gauges() {
    zeroAll();
}

export function max_net_gauges(state) {
    setNetTesting(state);
}

// Dev mocks: ?mock_temps=1|none and/or ?mock_disks=N
const mock_params = new URLSearchParams(window.location.search);
const MOCK_TEMPS = mock_params.get("mock_temps") === "1";
const MOCK_NO_TEMPS = mock_params.get("mock_temps") === "none";
const MOCK_DISKS = Math.min(16, Number(mock_params.get("mock_disks")) || 0);
let mock_tick = 0;

const MOCK_SENSORS = [
    { label: "coretemp Core 0", critical: 105 },
    { label: "coretemp Core 1", critical: 105 },
    { label: "coretemp Core 2", critical: 105 },
    { label: "coretemp Core 3", critical: 105 },
    { label: "nvme Composite", critical: 85 },
    { label: "acpitz thermal", critical: 95 },
];

function applyMocks(data) {
    if (!MOCK_TEMPS && !MOCK_NO_TEMPS && !MOCK_DISKS) return data;

    if (data.data_type == 0) {
        if (MOCK_TEMPS) {
            data.temp_sensors = MOCK_SENSORS;
        }
        if (MOCK_NO_TEMPS) {
            data.temp_sensors = [];
        }
        if (MOCK_DISKS) {
            data.num_disks = MOCK_DISKS;
            data.disks_space = Array.from(
                { length: MOCK_DISKS },
                (_, i) => 256 * (i + 1)
            );
        }
    }

    if (data.data_type == 1) {
        mock_tick++;
        if (MOCK_TEMPS) {
            data.temperatures = MOCK_SENSORS.map(
                (_, i) => 62 + 22 * Math.sin(mock_tick / 8 + i * 1.3)
            );
        }
        if (MOCK_NO_TEMPS) {
            data.temperatures = [];
        }
        if (MOCK_DISKS) {
            data.disks_used_space = Array.from(
                { length: MOCK_DISKS },
                (_, i) => 256000 * (i + 1) * (0.35 + 0.08 * ((i + mock_tick / 60) % 8))
            );
        }
    }

    return data;
}
