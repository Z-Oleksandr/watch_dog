// @ts-check
/**
 * Turns per-disk drive temperatures into the small readings drawn on the
 * storage gauges. Thresholds come from the engine, which knows each drive's
 * type and limits (`disks_temp_warning` in the topology frame).
 */

/** @typedef {{ text: string, alert: boolean }} AuxReading */

/** @param {number} celsius */
const shownCelsius = (celsius) => Math.round(celsius);

/**
 * Compares what the operator sees, so a reading that rounds up to the
 * threshold is red.
 * @param {number} celsius
 * @param {number | null | undefined} warning
 */
const isOverWarning = (celsius, warning) =>
    typeof warning === "number" && shownCelsius(celsius) >= warning;

/**
 * @param {number} celsius
 * @param {boolean} alert
 * @returns {AuxReading}
 */
const reading = (celsius, alert) => ({ text: `${shownCelsius(celsius)}°`, alert });

/**
 * One disk's reading; null when the disk has no temperature.
 * @param {number | null | undefined} celsius
 * @param {number | null | undefined} warning
 * @returns {AuxReading | null}
 */
export function driveReading(celsius, warning) {
    if (typeof celsius !== "number") {
        return null;
    }
    return reading(celsius, isOverWarning(celsius, warning));
}

/**
 * The storage summary: the average drive temperature, unless a drive is at or
 * over its warning threshold, in which case the hottest such drive in red.
 * Null when no disk has a temperature.
 * @param {ReadonlyArray<number | null>} temps
 * @param {ReadonlyArray<number | null>} warnings
 * @returns {AuxReading | null}
 */
export function summarizeDriveTemps(temps, warnings) {
    let sum = 0;
    let count = 0;
    let hottestOver = null;
    temps.forEach((celsius, i) => {
        if (typeof celsius !== "number") {
            return;
        }
        sum += celsius;
        count += 1;
        if (
            isOverWarning(celsius, warnings[i]) &&
            (hottestOver === null || celsius > hottestOver)
        ) {
            hottestOver = celsius;
        }
    });
    if (hottestOver !== null) {
        return reading(hottestOver, true);
    }
    return count === 0 ? null : reading(sum / count, false);
}

/**
 * Whether two per-disk temperature arrays hold the same values. The engine
 * refreshes them every 30 s but repeats them in every 1 Hz stats frame.
 * @param {ReadonlyArray<number | null>} a
 * @param {ReadonlyArray<number | null> | null} b
 */
export function sameTemps(a, b) {
    return b !== null && a.length === b.length && a.every((value, i) => value === b[i]);
}
