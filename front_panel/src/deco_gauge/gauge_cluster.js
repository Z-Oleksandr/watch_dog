import { DecoGauge } from "./deco_gauge";

const STORAGE_PREFIX = "wd_cluster_";

export class GaugeCluster {
    constructor(container, { id, title, summary, members, collapsed = true }) {
        this.id = id;
        this.member_opts = members;
        this.aggregate = summary.aggregate || "avg";
        this.values = members.map(() => 0);

        this.root = document.createElement("section");
        this.root.className = "deco-cluster";
        container.appendChild(this.root);

        const single = members.length <= 1;
        this._buildHeader(title, members.length, single);

        const summary_slot = document.createElement("div");
        summary_slot.className = "cluster-summary";
        this.root.appendChild(summary_slot);
        this.summary_gauge = new DecoGauge(summary_slot, summary);

        if (single) {
            this.member_gauges = [this.summary_gauge];
            return;
        }

        this.members_wrap = document.createElement("div");
        this.members_wrap.className = "cluster-members";
        const inner = document.createElement("div");
        inner.className = "cluster-members-inner";
        this.members_wrap.appendChild(inner);
        this.root.appendChild(this.members_wrap);

        this.member_gauges = members.map((opts) => {
            const slot = document.createElement("div");
            slot.className = "cluster-member";
            inner.appendChild(slot);
            return new DecoGauge(slot, opts);
        });

        const stored = localStorage.getItem(STORAGE_PREFIX + this.id);
        const expanded = stored === null ? !collapsed : stored === "1";
        this._setExpanded(expanded, true);

        this.header.addEventListener("click", () => this.toggle());
        this.header.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this.toggle();
            }
        });
        summary_slot.addEventListener("click", () => this.toggle());
        summary_slot.classList.add("cluster-toggle");
    }

    _buildHeader(title, count, single) {
        this.header = document.createElement("header");
        this.header.className = "cluster-header";
        const chevron_l = document.createElement("span");
        chevron_l.className = "cluster-chevrons";
        const heading = document.createElement("h2");
        heading.textContent = title;
        const chevron_r = document.createElement("span");
        chevron_r.className = "cluster-chevrons";
        this.header.append(chevron_l, heading, chevron_r);

        if (!single) {
            const badge = document.createElement("span");
            badge.className = "cluster-badge";
            badge.textContent = count;
            const diamond = document.createElement("span");
            diamond.className = "cluster-diamond";
            diamond.textContent = "◆";
            heading.appendChild(badge);
            this.header.appendChild(diamond);
            this.header.classList.add("cluster-toggle");
            this.header.setAttribute("role", "button");
            this.header.setAttribute("tabindex", "0");
        }
        this.root.appendChild(this.header);
    }

    _setExpanded(expanded, skip_store) {
        this.expanded = expanded;
        this.root.classList.toggle("expanded", expanded);
        if (this.header.hasAttribute("role")) {
            this.header.setAttribute("aria-expanded", String(expanded));
        }
        if (!skip_store) {
            localStorage.setItem(STORAGE_PREFIX + this.id, expanded ? "1" : "0");
        }
        if (expanded && this.member_gauges.length > 1) {
            setTimeout(() => this.member_gauges.forEach((g) => g.resize()), 350);
        }
    }

    toggle() {
        this._setExpanded(!this.expanded);
    }

    setValues(values, summary_value) {
        this.values = values;
        if (this.member_gauges.length > 1) {
            this.member_gauges.forEach((gauge, i) => {
                if (values[i] !== undefined) gauge.set(values[i]);
            });
        }
        this.summary_gauge.set(
            summary_value !== undefined ? summary_value : this._summarize(values)
        );
    }

    _summarize(values) {
        if (values.length === 0) return 0;
        if (this.member_gauges.length <= 1) return values[0];
        if (this.aggregate === "max") {
            return Math.max(...values);
        }
        if (this.aggregate === "sum-ratio") {
            const used = values.reduce((a, b) => a + b, 0);
            const capacity = this.member_opts.reduce((a, m) => a + m.max, 0) || 1;
            return (used / capacity) * 100;
        }
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    sweep() {
        this.summary_gauge.sweep();
        if (this.member_gauges.length > 1) {
            this.member_gauges.forEach((gauge, i) => {
                setTimeout(() => gauge.sweep(), i * 60);
            });
        }
    }

    zero() {
        this.summary_gauge.set(this.summary_gauge.opts.min);
        if (this.member_gauges.length > 1) {
            this.member_gauges.forEach((gauge) => gauge.set(gauge.opts.min));
        }
    }
}
