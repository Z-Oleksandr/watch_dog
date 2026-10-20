import { describe, expect, it } from "vitest";

import { DATA_TYPE, validateFrame } from "../protocol/messages.js";
import { CPU, DISKS, RAM, TEMP_SENSORS } from "./config.js";
import { SimulatedMachine } from "./machine.js";
import { Random } from "./random.js";

const TICKS = 1000;

function run(seed = 1) {
    const machine = new SimulatedMachine(new Random(seed));
    return { machine, frames: Array.from({ length: TICKS }, () => machine.tick()) };
}

describe("SimulatedMachine", () => {
    it("produces_a_topology_the_panel_accepts", () => {
        const topology = new SimulatedMachine(new Random(1)).topology();
        expect(topology.data_type).toBe(DATA_TYPE.TOPOLOGY);
        expect(validateFrame(topology).ok).toBe(true);
        expect(topology.num_cpus).toBe(CPU.cores);
        expect(topology.disks_space).toHaveLength(DISKS.length);
        expect(topology.disks_temp_warning).toHaveLength(DISKS.length);
        expect(topology.temp_sensors).toHaveLength(TEMP_SENSORS.length);
    });

    it("keeps_the_engine_key_order_for_system_info", () => {
        const info = new SimulatedMachine(new Random(1)).systemInfo();
        expect(Object.keys(info)).toEqual([
            "data_type",
            "system_name",
            "kernel_version",
            "cpu_arch",
            "os_version",
            "host_name",
            "uptime",
            "docker",
        ]);
        expect(validateFrame(info).ok).toBe(true);
    });

    it("produces_only_stats_frames_the_panel_accepts", () => {
        const { frames } = run();
        for (const frame of frames) {
            expect(validateFrame(frame)).toMatchObject({ ok: true });
        }
    });

    it("keeps_every_reading_within_physical_bounds", () => {
        const { frames } = run(3);
        for (const frame of frames) {
            expect(frame.cpu_usage).toHaveLength(CPU.cores);
            frame.cpu_usage.forEach((usage) => {
                expect(usage).toBeGreaterThanOrEqual(0);
                expect(usage).toBeLessThanOrEqual(100);
            });
            expect(frame.ram_used).toBeGreaterThan(0);
            expect(frame.ram_used).toBeLessThanOrEqual(RAM.totalMb);
            frame.disks_used_space.forEach((used, i) => {
                expect(used).toBeGreaterThanOrEqual(0);
                expect(used).toBeLessThanOrEqual(DISKS[i].sizeGb * 1000);
            });
            expect(frame.network_received).toBeGreaterThanOrEqual(0);
            expect(frame.network_transmitted).toBeGreaterThanOrEqual(0);
            expect(frame.temperatures).toHaveLength(TEMP_SENSORS.length);
            expect(frame.disks_temperatures).toHaveLength(DISKS.length);
        }
    });

    it("reports_no_temperature_for_a_disk_without_a_sensor", () => {
        const { frames } = run();
        const sensorless = DISKS.findIndex((disk) => disk.warningC === null);
        expect(frames.every((f) => f.disks_temperatures[sensorless] === null)).toBe(true);
    });

    it("advances_uptime_by_one_second_per_tick", () => {
        const machine = new SimulatedMachine(new Random(5));
        const start = machine.uptime;
        const frames = [machine.tick(), machine.tick()];
        expect(frames.map((f) => f.uptime)).toEqual([start + 1, start + 2]);
        expect(machine.systemInfo().uptime).toBe(start + 2);
    });

    it("shows_load_bursts_and_traffic_bursts", () => {
        const { frames } = run(11);
        const peakCpu = Math.max(...frames.flatMap((f) => f.cpu_usage));
        const peakDown = Math.max(...frames.map((f) => f.network_received));
        expect(peakCpu).toBeGreaterThan(50);
        expect(peakDown).toBeGreaterThan(10_000);
    });

    it("is_deterministic_for_a_seed", () => {
        expect(run(21).frames).toEqual(run(21).frames);
    });
});
