import { log } from "../../util/logger.js";
import { DecoGauge } from "./deco_gauge.js";

const STORAGE_PREFIX = "wd_cluster_";
/** Matches the `.cluster-members` grid transition in deco.css. */
const EXPAND_TRANSITION_MS = 350;

function readExpanded(id) {
    try {
        return localStorage.getItem(STORAGE_PREFIX + id);
    } catch {
        return null;
    }
}

function writeExpanded(id, expanded) {
    try {
        localStorage.setItem(STORAGE_PREFIX + id, expanded ? "1" : "0");
    } catch (err) {
        log.debug("cluster", "could not persist expanded state", { id, err });
    }
}

/**
 * A summary gauge plus an expandable grid of member gauges (one per CPU
 * group, sensor group or disk). Expansion state persists per cluster id.
 */
export class GaugeCluster {
    #abort = new AbortController();
    #expandTimer = null;

    constructor(container, { id, title, summary, members, collapsed = true }) {
        this.id = id;
        this.memberOpts = members;
        this.aggregate = summary.aggregate || "avg";
        /** The summary readout turns ruby whenever a member's does. */
        this.alertFromMembers = Boolean(summary.alertFromMembers);
        this.values = members.map(() => 0);

        this.root = document.createElement("section");
        this.root.className = "deco-cluster";
        container.appendChild(this.root);

        const single = members.length <= 1;
        this.#buildHeader(title, members.length, single);

        const summarySlot = document.createElement("div");
        summarySlot.className = "cluster-summary";
        this.root.appendChild(summarySlot);
        this.summaryGauge = new DecoGauge(summarySlot, summary);

        if (single) {
            this.memberGauges = [this.summaryGauge];
            return;
        }

        this.membersWrap = document.createElement("div");
        this.membersWrap.className = "cluster-members";
        const inner = document.createElement("div");
        inner.className = "cluster-members-inner";
        this.membersWrap.appendChild(inner);
        this.root.appendChild(this.membersWrap);

        this.memberGauges = members.map((opts) => {
            const slot = document.createElement("div");
            slot.className = "cluster-member";
            inner.appendChild(slot);
            return new DecoGauge(slot, opts);
        });

        const stored = readExpanded(this.id);
        const expanded = stored === null ? !collapsed : stored === "1";
        this.#setExpanded(expanded, true);

        const { signal } = this.#abort;
        this.header.addEventListener("click", () => this.toggle(), { signal });
        this.header.addEventListener(
            "keydown",
            (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    this.toggle();
                }
            },
            { signal }
        );
        summarySlot.addEventListener("click", () => this.toggle(), { signal });
        summarySlot.classList.add("cluster-toggle");
    }

    #buildHeader(title, count, single) {
        this.header = document.createElement("header");
        this.header.className = "cluster-header";
        const chevronL = document.createElement("span");
        chevronL.className = "cluster-chevrons";
        const heading = document.createElement("h2");
        heading.textContent = title;
        const chevronR = document.createElement("span");
        chevronR.className = "cluster-chevrons";
        this.header.append(chevronL, heading, chevronR);

        if (!single) {
            const badge = document.createElement("span");
            badge.className = "cluster-badge";
            badge.textContent = String(count);
            heading.appendChild(badge);
            this.header.classList.add("cluster-toggle");
            this.header.setAttribute("role", "button");
            this.header.setAttribute("tabindex", "0");
        }
        this.root.appendChild(this.header);
    }

    #setExpanded(expanded, skipStore) {
        this.expanded = expanded;
        this.root.classList.toggle("expanded", expanded);
        if (this.header.hasAttribute("role")) {
            this.header.setAttribute("aria-expanded", String(expanded));
        }
        if (!skipStore) {
            writeExpanded(this.id, expanded);
        }
        if (expanded && this.memberGauges.length > 1) {
            clearTimeout(this.#expandTimer);
            this.#expandTimer = setTimeout(
                () => this.memberGauges.forEach((g) => g.resize()),
                EXPAND_TRANSITION_MS
            );
        }
    }

    toggle() {
        this.#setExpanded(!this.expanded);
    }

    setValues(values, summaryValue) {
        this.values = values;
        if (this.memberGauges.length > 1) {
            this.memberGauges.forEach((gauge, i) => {
                if (values[i] !== undefined) gauge.set(values[i]);
            });
        }
        this.summaryGauge.set(summaryValue !== undefined ? summaryValue : this.#summarize(values));
        if (this.alertFromMembers && this.memberGauges.length > 1) {
            this.summaryGauge.setForcedAlert(
                this.memberGauges.some(
                    (gauge, i) => values[i] !== undefined && gauge.isAlertAt(values[i])
                )
            );
        }
    }

    /**
     * Shows secondary readings (drive temperatures) above the hubs. With a
     * single member the summary gauge is that member, so only
     * `summaryReading` is drawn.
     * @param {Array<{ text: string, alert: boolean } | null>} memberReadings
     * @param {{ text: string, alert: boolean } | null} summaryReading
     */
    setAuxReadings(memberReadings, summaryReading) {
        if (this.memberGauges.length > 1) {
            this.memberGauges.forEach((gauge, i) => gauge.setAuxReading(memberReadings[i] ?? null));
        }
        this.summaryGauge.setAuxReading(summaryReading);
    }

    #summarize(values) {
        if (values.length === 0) return 0;
        if (this.memberGauges.length <= 1) return values[0];
        if (this.aggregate === "max") {
            return Math.max(...values);
        }
        if (this.aggregate === "sum-ratio") {
            const used = values.reduce((a, b) => a + b, 0);
            const capacity = this.memberOpts.reduce((a, m) => a + m.max, 0) || 1;
            return (used / capacity) * 100;
        }
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    sweep() {
        this.summaryGauge.sweep();
        if (this.memberGauges.length > 1) {
            this.memberGauges.forEach((gauge) => gauge.sweep());
        }
    }

    zero() {
        this.setAuxReadings([], null);
        this.summaryGauge.setForcedAlert(false);
        this.summaryGauge.set(this.summaryGauge.opts.min);
        if (this.memberGauges.length > 1) {
            this.memberGauges.forEach((gauge) => gauge.set(gauge.opts.min));
        }
    }

    destroy() {
        clearTimeout(this.#expandTimer);
        this.#abort.abort();
        this.summaryGauge.destroy();
        if (this.memberGauges.length > 1) {
            this.memberGauges.forEach((gauge) => gauge.destroy());
        }
        this.root.remove();
    }
}
