/**
 * Development-only frame mocks, enabled with query parameters:
 *   ?mock_temps=1     synthesize six temperature sensors
 *   ?mock_temps=none  report no sensors
 *   ?mock_disks=N     synthesize N disks (max 16) with drive temperatures that
 *                     drift across their HDD (55 °C) / SSD (70 °C) thresholds
 * This module is only bundled in development builds.
 */
import { DATA_TYPE } from "../protocol/messages.js";

const MAX_MOCK_DISKS = 16;
/** Alternating HDD / SSD warning thresholds, as the engine derives them. */
const MOCK_DISK_WARNINGS = [55, 70];

const MOCK_SENSORS = [
    { label: "coretemp Core 0", critical: 105 },
    { label: "coretemp Core 1", critical: 105 },
    { label: "coretemp Core 2", critical: 105 },
    { label: "coretemp Core 3", critical: 105 },
    { label: "nvme Composite", critical: 85 },
    { label: "acpitz thermal", critical: 95 },
];

/** @returns {((frame: object) => object) | null} */
export function createMockPreprocessor(search) {
    const params = new URLSearchParams(search);
    const mockTemps = params.get("mock_temps") === "1";
    const noTemps = params.get("mock_temps") === "none";
    const mockDisks = Math.min(MAX_MOCK_DISKS, Number(params.get("mock_disks")) || 0);
    if (!mockTemps && !noTemps && !mockDisks) {
        return null;
    }
    let tick = 0;

    return function applyMocks(frame) {
        if (frame.data_type === DATA_TYPE.TOPOLOGY) {
            const out = { ...frame };
            if (mockTemps) out.temp_sensors = MOCK_SENSORS;
            if (noTemps) out.temp_sensors = [];
            if (mockDisks) {
                out.num_disks = mockDisks;
                out.disks_space = Array.from({ length: mockDisks }, (_, i) => 256 * (i + 1));
                out.disks_temp_warning = out.disks_space.map(
                    (_, i) => MOCK_DISK_WARNINGS[i % MOCK_DISK_WARNINGS.length]
                );
            }
            return out;
        }
        if (frame.data_type === DATA_TYPE.STATS) {
            tick += 1;
            const out = { ...frame };
            if (mockTemps) {
                out.temperatures = MOCK_SENSORS.map(
                    (_, i) => 62 + 22 * Math.sin(tick / 8 + i * 1.3)
                );
            }
            if (noTemps) out.temperatures = [];
            if (mockDisks) {
                out.disks_used_space = Array.from(
                    { length: mockDisks },
                    (_, i) => 256000 * (i + 1) * (0.35 + 0.08 * ((i + tick / 60) % 8))
                );
                // Every third disk has no sensor; the rest cross their threshold.
                out.disks_temperatures = Array.from({ length: mockDisks }, (_, i) =>
                    i % 3 === 2 ? null : 48 + 8 * i + 10 * Math.sin(tick / 10 + i)
                );
            }
            return out;
        }
        return frame;
    };
}
