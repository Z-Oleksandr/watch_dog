import { describe, expect, it } from "vitest";

import { DATA_TYPE, validateFrame } from "../protocol/messages.js";
import { RECORDING_TICKS_PER_POINT, SEEDED_RECORDINGS } from "./config.js";
import { SimulatedMachine } from "./machine.js";
import { Random } from "./random.js";
import { RecordingStore, fileStamp, pointStamp } from "./recordings.js";

const NOW = Date.UTC(2026, 9, 20, 8, 30, 0);

function build() {
    let now = NOW;
    const store = new RecordingStore({ random: new Random(4), now: () => now });
    const advance = (ms) => {
        now += ms;
    };
    return { store, advance };
}

describe("stamps", () => {
    it("format_like_the_engine", () => {
        const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
        expect(fileStamp(date)).toBe("2026-01-02_03-04-05");
        expect(pointStamp(date)).toBe("2026-01-02T03:04:05");
    });
});

describe("RecordingStore", () => {
    it("lists_seeded_recordings_oldest_first", () => {
        const { store } = build();
        const frame = store.listFrame();
        expect(frame.data_type).toBe(DATA_TYPE.LOG_LIST);
        expect(validateFrame(frame).ok).toBe(true);
        const names = Object.values(frame.log_list);
        expect(names).toHaveLength(SEEDED_RECORDINGS.length);
        expect([...names].sort()).toEqual(names);
        names.forEach((name) => expect(name).toMatch(/^log_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/));
    });

    it("serves_seeded_recordings_the_panel_accepts", () => {
        const { store } = build();
        SEEDED_RECORDINGS.forEach(({ hours }, index) => {
            const frame = store.dataFrame(index);
            expect(validateFrame(frame).ok).toBe(true);
            const points = (hours * 3600) / RECORDING_TICKS_PER_POINT;
            expect(frame.cnr_data.cpu).toHaveLength(points);
            expect(frame.net_data.network.down).toHaveLength(points);
        });
    });

    it("returns_null_for_an_unknown_index", () => {
        expect(build().store.dataFrame(99)).toBeNull();
    });

    it("records_live_ticks_into_a_new_latest_recording", () => {
        const { store, advance } = build();
        const machine = new SimulatedMachine(new Random(8));
        expect(store.start(1)).toBe(true);
        const latest = SEEDED_RECORDINGS.length;
        expect(store.listFrame().log_list[latest]).toBe("log_2026-10-20_08-30-00");

        const ticks = [];
        for (let i = 0; i < RECORDING_TICKS_PER_POINT * 2; i += 1) {
            advance(1000);
            const frame = machine.tick();
            ticks.push(frame);
            store.record(frame);
        }
        const data = store.dataFrame(latest);
        expect(validateFrame(data).ok).toBe(true);
        expect(data.cnr_data.cpu).toHaveLength(2);
        const firstWindow = ticks.slice(0, RECORDING_TICKS_PER_POINT);
        const downSum = firstWindow.reduce((sum, f) => sum + f.network_received, 0);
        expect(data.net_data.network.down[0].value).toBe(downSum);
        expect(data.cnr_data.ram[0].value).toBe(firstWindow.at(-1).ram_used);
    });

    it("refuses_a_second_recording_while_one_runs", () => {
        const { store } = build();
        expect(store.start(1)).toBe(true);
        expect(store.start(2)).toBe(false);
    });

    it("finishes_a_recording_after_its_duration", () => {
        const { store, advance } = build();
        const machine = new SimulatedMachine(new Random(8));
        store.start(1);
        for (let i = 0; i < 3600; i += 1) {
            advance(1000);
            store.record(machine.tick());
        }
        expect(store.start(1)).toBe(true);
    });
});
