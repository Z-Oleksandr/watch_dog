import { describe, expect, it } from "vitest";

import {
    DATA_TYPE,
    REQUEST_TYPE,
    encodeRequest,
    isStreamFrame,
    parseFrame,
    validateFrame,
} from "./messages.js";

const topology = {
    data_type: 0,
    num_cpus: 8,
    num_disks: 2,
    disks_space: [512, 1024],
    init_ram_total: 16000,
    temp_sensors: [
        { label: "coretemp Core 0", critical: 100 },
        { label: "nvme", critical: null },
    ],
};

const stats = {
    data_type: 1,
    cpu_usage: [1, 2, 3, 4, 5, 6, 7, 8],
    ram_total: 16000,
    ram_used: 4000,
    disks_used_space: [100000, 200000],
    network_received: 12,
    network_transmitted: 8,
    uptime: 4242,
    temperatures: [50, 41],
};

describe("encodeRequest", () => {
    it("serializes_known_requests", () => {
        expect(encodeRequest(REQUEST_TYPE.START_LOG, 4)).toBe('{"type":"start_log","message":4}');
    });

    it("rejects_unknown_types_and_bad_values", () => {
        expect(encodeRequest("nuke", 1)).toBeNull();
        expect(encodeRequest(REQUEST_TYPE.START_LOG, -1)).toBeNull();
        expect(encodeRequest(REQUEST_TYPE.START_LOG, 1.5)).toBeNull();
        expect(encodeRequest(REQUEST_TYPE.START_LOG, "4")).toBeNull();
    });
});

describe("parseFrame", () => {
    it("accepts_objects_with_an_integer_data_type", () => {
        expect(parseFrame('{"data_type":3,"log_list":{}}').ok).toBe(true);
    });

    it("rejects_garbage_and_missing_data_type", () => {
        expect(parseFrame("not json").ok).toBe(false);
        expect(parseFrame("[1,2]").ok).toBe(false);
        expect(parseFrame('{"foo":1}').ok).toBe(false);
        expect(parseFrame('{"data_type":"1"}').ok).toBe(false);
        expect(parseFrame('{"data_type":-1}').ok).toBe(false);
    });
});

describe("validateFrame", () => {
    it("accepts_a_well_formed_topology", () => {
        expect(validateFrame(topology).ok).toBe(true);
    });

    it("rejects_topology_with_wrong_field_types", () => {
        expect(validateFrame({ ...topology, num_cpus: 0 })).toMatchObject({
            ok: false,
            reason: "num_cpus",
        });
        expect(validateFrame({ ...topology, disks_space: ["a"] })).toMatchObject({
            reason: "disks_space",
        });
        expect(validateFrame({ ...topology, temp_sensors: [{ critical: 1 }] })).toMatchObject({
            reason: "temp_sensors[].label",
        });
    });

    it("accepts_a_stats_frame_with_and_without_temperatures", () => {
        expect(validateFrame(stats).ok).toBe(true);
        const { temperatures: _t, ...noTemps } = stats;
        expect(validateFrame(noTemps).ok).toBe(true);
    });

    it("rejects_stats_with_non_numeric_arrays", () => {
        expect(validateFrame({ ...stats, cpu_usage: [1, "2"] })).toMatchObject({
            reason: "cpu_usage",
        });
        expect(validateFrame({ ...stats, uptime: "soon" })).toMatchObject({ reason: "uptime" });
    });

    it("validates_system_info_as_flat_primitives", () => {
        expect(validateFrame({ data_type: 2, host_name: "srv", uptime: 3 }).ok).toBe(true);
        expect(validateFrame({ data_type: 2, nested: {} })).toMatchObject({
            reason: "system_info.nested",
        });
    });

    it("validates_log_list_and_container_list_as_string_maps", () => {
        expect(validateFrame({ data_type: DATA_TYPE.LOG_LIST, log_list: { 0: "a" } }).ok).toBe(
            true
        );
        expect(validateFrame({ data_type: DATA_TYPE.LOG_LIST, log_list: { 0: 1 } }).ok).toBe(false);
        expect(validateFrame({ data_type: DATA_TYPE.CONTAINER_LIST, list: { 0: "db" } }).ok).toBe(
            true
        );
        expect(validateFrame({ data_type: DATA_TYPE.CONTAINER_LIST, list: [] }).ok).toBe(false);
    });

    it("validates_log_data_series", () => {
        const point = { time_stamp: "2025-01-01T00:00:00", value: 1 };
        const frame = {
            data_type: DATA_TYPE.LOG_DATA,
            cnr_data: { cpu: [point], ram: [point] },
            net_data: { network: { down: [point], up: [] } },
        };
        expect(validateFrame(frame).ok).toBe(true);
        expect(
            validateFrame({ ...frame, cnr_data: { cpu: [{ time_stamp: 1, value: 1 }], ram: [] } })
        ).toMatchObject({ reason: "cnr_data" });
        expect(validateFrame({ ...frame, net_data: { network: { down: [] } } })).toMatchObject({
            reason: "net_data.network",
        });
    });

    it("passes_unknown_data_types_through", () => {
        expect(validateFrame({ data_type: 22, log_line: "x" }).ok).toBe(true);
    });
});

describe("isStreamFrame", () => {
    it("requires_a_string_log_line", () => {
        expect(isStreamFrame({ data_type: 22, log_line: "hi" })).toBe(true);
        expect(isStreamFrame({ data_type: 0, num_cpus: 4 })).toBe(false);
        expect(isStreamFrame({ data_type: 22, log_line: 5 })).toBe(false);
    });
});
