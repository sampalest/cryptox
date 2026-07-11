<template>
    <div class="lk-dtp">
        <div class="lk-dtp-head">
            <button type="button" class="lk-dtp-nav" :disabled="!canGoPrev" aria-label="Previous month" @click="moveMonth(-1)">
                <lk-icon name="chevron-left-bold" :size="15" aria-hidden="true" />
            </button>
            <div class="lk-dtp-month">{{ monthLabel }}</div>
            <button type="button" class="lk-dtp-nav" aria-label="Next month" @click="moveMonth(1)">
                <lk-icon name="chevron-right" :size="15" aria-hidden="true" />
            </button>
        </div>
        <div class="lk-dtp-grid">
            <div v-for="day in weekdays" :key="day" class="lk-dtp-weekday">{{ day }}</div>
            <button
                v-for="cell in cells"
                :key="cell.key"
                type="button"
                class="lk-dtp-day"
                :class="{ blank: cell.blank, selected: cell.selected, today: cell.today }"
                :disabled="cell.blank || cell.disabled"
                :tabindex="cell.blank ? -1 : 0"
                :aria-label="cell.blank ? undefined : cell.label"
                @click="selectDay(cell)"
            >{{ cell.blank ? "" : cell.day }}</button>
        </div>
        <div class="lk-dtp-time">
            <lk-icon name="clock" :size="15" aria-hidden="true" />
            <div class="lk-dtp-unit" @wheel.prevent="onWheel('hour', $event)">
                <button type="button" class="lk-dtp-step" aria-label="Hour up" @click="adjust('hour', 1)">
                    <lk-icon name="chevron-up" :size="13" aria-hidden="true" />
                </button>
                <div class="lk-dtp-value">{{ pad(hour) }}</div>
                <button type="button" class="lk-dtp-step" aria-label="Hour down" @click="adjust('hour', -1)">
                    <lk-icon name="chevron-down" :size="13" aria-hidden="true" />
                </button>
            </div>
            <div class="lk-dtp-colon">:</div>
            <div class="lk-dtp-unit" @wheel.prevent="onWheel('minute', $event)">
                <button type="button" class="lk-dtp-step" aria-label="Minutes up" @click="adjust('minute', 1)">
                    <lk-icon name="chevron-up" :size="13" aria-hidden="true" />
                </button>
                <div class="lk-dtp-value">{{ pad(minute) }}</div>
                <button type="button" class="lk-dtp-step" aria-label="Minutes down" @click="adjust('minute', -1)">
                    <lk-icon name="chevron-down" :size="13" aria-hidden="true" />
                </button>
            </div>
        </div>
    </div>
</template>
<script>
// Custom expiration date-and-time picker (no native datetime chrome). Value
// is a UTC epoch-ms instant; days before `min` are unselectable, and picking
// a day whose kept time-of-day would land in the past clamps forward.
import LkIcon from "@/components/ui/LkIcon.vue";

export default {
    name: "expiry-picker",
    components: {
        "lk-icon": LkIcon
    },
    props: {
        modelValue: {
            type: Number,
            required: true
        },
        min: {
            type: Number,
            default: () => Date.now()
        }
    },
    emits: ["update:modelValue"],
    data() {
        const selected = new Date(this.modelValue);
        return {
            viewYear: selected.getFullYear(),
            viewMonth: selected.getMonth()
        };
    },
    created() {
        // Wheel accumulator, non-reactive: trackpads emit many tiny deltas,
        // so steps fire per WHEEL_NOTCH of accumulated travel, not per event.
        this._wheel = { hour: 0, minute: 0 };
    },
    computed: {
        weekdays() {
            return ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
        },
        selected() {
            return new Date(this.modelValue);
        },
        hour() {
            return this.selected.getHours();
        },
        minute() {
            return this.selected.getMinutes();
        },
        monthLabel() {
            const label = new Date(this.viewYear, this.viewMonth, 1)
                .toLocaleDateString(undefined, { month: "long", year: "numeric" });
            return label.charAt(0).toUpperCase() + label.slice(1);
        },
        canGoPrev() {
            const minDate = new Date(this.min);
            return this.viewYear > minDate.getFullYear()
                || (this.viewYear === minDate.getFullYear() && this.viewMonth > minDate.getMonth());
        },
        cells() {
            const first = new Date(this.viewYear, this.viewMonth, 1);
            const offset = (first.getDay() + 6) % 7;
            const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
            const today = new Date();
            const cells = [];
            for (let blank = 0; blank < offset; blank++) {
                cells.push({ key: `blank-${blank}`, blank: true });
            }
            for (let day = 1; day <= daysInMonth; day++) {
                const endOfDay = new Date(this.viewYear, this.viewMonth, day, 23, 59, 59, 999);
                cells.push({
                    key: `day-${day}`,
                    blank: false,
                    day,
                    disabled: endOfDay.getTime() < this.min,
                    selected: this.isSameDay(this.selected, this.viewYear, this.viewMonth, day),
                    today: this.isSameDay(today, this.viewYear, this.viewMonth, day),
                    label: new Date(this.viewYear, this.viewMonth, day).toLocaleDateString()
                });
            }
            return cells;
        }
    },
    methods: {
        pad(value) {
            return String(value).padStart(2, "0");
        },
        isSameDay(date, year, month, day) {
            return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
        },
        moveMonth(delta) {
            const view = new Date(this.viewYear, this.viewMonth + delta, 1);
            this.viewYear = view.getFullYear();
            this.viewMonth = view.getMonth();
        },
        commit(date) {
            // A choice that would land in the past springs forward instead of
            // silently arming an already-expired instant.
            let ms = date.getTime();
            if (ms <= this.min) {
                const bumped = new Date(this.min + 5 * 60 * 1000);
                bumped.setSeconds(0, 0);
                ms = bumped.getTime();
            }
            this.$emit("update:modelValue", ms);
        },
        selectDay(cell) {
            if (cell.blank || cell.disabled) return;
            this.commit(new Date(this.viewYear, this.viewMonth, cell.day, this.hour, this.minute));
        },
        adjust(unit, delta) {
            const next = new Date(this.modelValue);
            if (unit === "hour") next.setHours(((this.hour + delta) % 24 + 24) % 24);
            else next.setMinutes(((this.minute + delta) % 60 + 60) % 60);
            this.commit(next);
        },
        onWheel(unit, event) {
            const WHEEL_NOTCH = 20;
            const travelled = this._wheel[unit] + event.deltaY;
            const steps = Math.trunc(travelled / WHEEL_NOTCH);
            this._wheel[unit] = travelled - steps * WHEEL_NOTCH;
            // Wheel up increases, wheel down decreases.
            if (steps !== 0) this.adjust(unit, -steps);
        }
    }
};
</script>
