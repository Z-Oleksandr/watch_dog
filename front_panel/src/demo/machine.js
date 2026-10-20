import { DATA_TYPE } from "../protocol/messages.js";
import {
    CPU,
    DISK_ACTIVITY,
    DISKS,
    NETWORK,
    RAM,
    SYSTEM_INFO,
    TEMP_SENSORS,
    TEMPERATURE_JITTER_C,
    TEMPERATURE_RESPONSE,
    UPTIME_RANGE_S,
} from "./config.js";
import { clamp } from "./random.js";

const MB_PER_GB = 1000;
const PERCENT = 100;
const DECIMALS = 10;

const roundTenth = (value) => Math.round(value * DECIMALS) / DECIMALS;
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const approach = (current, target, response) => current + (target - current) * response;

/**
 * A plausible home server whose readings evolve one tick (one second) at a
 * time. Produces frames in the exact shape and key order the engine sends.
 */
export class SimulatedMachine {
    #random;
    #uptime;
    #cpu;
    #cpuTargets;
    #ramUsed;
    #diskUsed;
    #diskTemps;
    #sensorTemps;
    #downBurst = 0;
    #upBurst = 0;

    /** @param {import("./random.js").Random} random */
    constructor(random) {
        this.#random = random;
        this.#uptime = random.int(UPTIME_RANGE_S.min, UPTIME_RANGE_S.max);
        this.#cpuTargets = Array.from({ length: CPU.cores }, () => this.#idleLoad());
        this.#cpu = [...this.#cpuTargets];
        this.#ramUsed = RAM.baselineMb;
        this.#diskUsed = DISKS.map((disk) => disk.sizeGb * MB_PER_GB * disk.usedFraction);
        this.#diskTemps = DISKS.map((disk) => disk.idleC);
        this.#sensorTemps = TEMP_SENSORS.map((sensor) => sensor.idleC);
    }

    get uptime() {
        return this.#uptime;
    }

    /** The `data_type` 0 frame. */
    topology() {
        return {
            data_type: DATA_TYPE.TOPOLOGY,
            num_cpus: CPU.cores,
            num_disks: DISKS.length,
            disks_space: DISKS.map((disk) => disk.sizeGb),
            init_ram_total: RAM.totalMb,
            temp_sensors: TEMP_SENSORS.map(({ label, critical }) => ({ label, critical })),
            disks_temp_warning: DISKS.map((disk) => disk.warningC),
        };
    }

    /** The `data_type` 2 frame, with the current uptime. */
    systemInfo() {
        const { system_name, kernel_version, cpu_arch, os_version, host_name, docker } =
            SYSTEM_INFO;
        return {
            data_type: DATA_TYPE.SYSTEM_INFO,
            system_name,
            kernel_version,
            cpu_arch,
            os_version,
            host_name,
            uptime: this.#uptime,
            docker,
        };
    }

    /** Advances the machine by one second and returns the `data_type` 1 frame. */
    tick() {
        this.#uptime += 1;
        this.#advanceCpu();
        const load = mean(this.#cpu) / PERCENT;
        this.#advanceRam(load);
        this.#advanceDisks(load);
        this.#advanceSensors(load);
        const [received, transmitted] = this.#sampleNetwork();

        return {
            data_type: DATA_TYPE.STATS,
            cpu_usage: this.#cpu.map(roundTenth),
            ram_total: RAM.totalMb,
            ram_used: Math.round(this.#ramUsed),
            disks_used_space: this.#diskUsed.map(Math.round),
            network_received: received,
            network_transmitted: transmitted,
            uptime: this.#uptime,
            temperatures: this.#sensorTemps.map(roundTenth),
            disks_temperatures: this.#diskTemps.map((t) => (t === null ? null : roundTenth(t))),
        };
    }

    #idleLoad() {
        return this.#random.between(CPU.idle.min, CPU.idle.max);
    }

    #advanceCpu() {
        const random = this.#random;
        this.#cpuTargets = this.#cpuTargets.map((target) => {
            if (random.chance(CPU.burstChance)) {
                return random.between(CPU.burstTarget.min, CPU.burstTarget.max);
            }
            return random.chance(CPU.settleChance) ? this.#idleLoad() : target;
        });
        this.#cpu = this.#cpu.map((current, i) => {
            const next = approach(current, this.#cpuTargets[i], CPU.response);
            return clamp(next + random.between(-CPU.jitter, CPU.jitter), 0, PERCENT);
        });
    }

    #advanceRam(load) {
        const target = RAM.baselineMb + RAM.loadMb * load;
        const drift = this.#random.between(-RAM.driftMb, RAM.driftMb);
        this.#ramUsed = clamp(
            approach(this.#ramUsed, target, RAM.response) + drift,
            RAM.totalMb * RAM.minFraction,
            RAM.totalMb * RAM.maxFraction
        );
    }

    #advanceDisks(load) {
        const random = this.#random;
        const { growthMbPerTick, cleanupChance, cleanupFraction } = DISK_ACTIVITY;
        this.#diskUsed = this.#diskUsed.map((used, i) => {
            const capacity = DISKS[i].sizeGb * MB_PER_GB;
            const shrink = random.chance(cleanupChance) ? capacity * cleanupFraction : 0;
            const grow = random.between(growthMbPerTick.min, growthMbPerTick.max);
            return clamp(used + grow - shrink, 0, capacity);
        });
        this.#diskTemps = this.#diskTemps.map((current, i) => {
            if (current === null) return null;
            const { temperatureLoadC, temperatureResponse, temperatureJitter } = DISK_ACTIVITY;
            const target = DISKS[i].idleC + temperatureLoadC * load;
            const jitter = random.between(-temperatureJitter, temperatureJitter);
            return approach(current, target, temperatureResponse) + jitter;
        });
    }

    #advanceSensors(load) {
        this.#sensorTemps = this.#sensorTemps.map((current, i) => {
            const sensor = TEMP_SENSORS[i];
            const target = sensor.idleC + sensor.loadC * load;
            const jitter = this.#random.between(-TEMPERATURE_JITTER_C, TEMPERATURE_JITTER_C);
            return approach(current, target, TEMPERATURE_RESPONSE) + jitter;
        });
    }

    #sampleNetwork() {
        const random = this.#random;
        if (this.#downBurst === 0 && random.chance(NETWORK.burstChance)) {
            this.#downBurst = random.int(NETWORK.burstTicks.min, NETWORK.burstTicks.max);
        }
        if (this.#upBurst === 0 && random.chance(NETWORK.burstChance)) {
            this.#upBurst = random.int(NETWORK.burstTicks.min, NETWORK.burstTicks.max);
        }
        const down = this.#trafficKb(this.#downBurst > 0, NETWORK.burstDownKb, NETWORK.idleDownKb);
        const up = this.#trafficKb(this.#upBurst > 0, NETWORK.burstUpKb, NETWORK.idleUpKb);
        this.#downBurst = Math.max(0, this.#downBurst - 1);
        this.#upBurst = Math.max(0, this.#upBurst - 1);
        return [down, up];
    }

    #trafficKb(bursting, burstRange, idleRange) {
        const range = bursting ? burstRange : idleRange;
        const base = this.#random.between(range.min, range.max);
        const spread = 1 + this.#random.between(-NETWORK.burstJitter, NETWORK.burstJitter);
        return Math.max(0, Math.round(base * spread));
    }
}
