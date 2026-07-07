// Well-known system sensor names -> gauge-friendly display names (max ~13 chars).
// Matched against grouped labels (trailing digits stripped); first match wins.
const SENSOR_NAMES = [
    [/coretemp package/i, "CPU Package"],
    [/coretemp core/i, "CPU Core"],
    [/k10temp tctl/i, "CPU"],
    [/k10temp tdie/i, "CPU Die"],
    [/k10temp tccd/i, "CPU CCD"],
    [/cpu[_ ]?thermal/i, "CPU"],
    [/soc[_ ]?thermal/i, "SoC"],
    [/pacc mtr/i, "P-Cores"],
    [/eacc mtr/i, "E-Cores"],
    [/soc mtr/i, "SoC"],
    [/ane mtr/i, "Neural Eng"],
    [/gpu mtr/i, "GPU"],
    [/isp mtr/i, "ISP"],
    [/pmu\d* tdie/i, "CPU Die"],
    [/pmu\d* tdev/i, "Power IC"],
    [/pmu\d* tcal/i, "Calibration"],
    [/gas gauge/i, "Battery"],
    [/battery/i, "Battery"],
    [/nand/i, "SSD"],
    [/nvme/i, "NVMe SSD"],
    [/drivetemp/i, "Hard Drive"],
    [/acpitz/i, "Mainboard"],
    [/pch[_ ]/i, "Chipset"],
    [/amdgpu junction/i, "GPU Hotspot"],
    [/amdgpu mem/i, "GPU Memory"],
    [/amdgpu|nouveau|radeon|nvidia/i, "GPU"],
    [/iwlwifi|wifi|wlan|airport|mt76|mt79/i, "Wi-Fi"],
    [/spd5118|dimm/i, "Memory"],
    [/ambient/i, "Ambient"],
];

export function friendlySensorName(system_name) {
    for (const [pattern, display] of SENSOR_NAMES) {
        if (pattern.test(system_name)) {
            return display;
        }
    }
    return system_name;
}
