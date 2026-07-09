<template>
    <div class="lk-dtp">
        <div class="lk-dtp-head">
            <button type="button" class="lk-dtp-nav" :disabled="!canGoPrev" aria-label="Previous month" @click="moveMonth(-1)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
            </button>
            <div class="lk-dtp-month">{{ monthLabel }}</div>
            <button type="button" class="lk-dtp-nav" aria-label="Next month" @click="moveMonth(1)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <div class="lk-dtp-unit">
                <button type="button" class="lk-dtp-step" aria-label="Hour up" @click="adjust('hour', 1)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>
                </button>
                <div class="lk-dtp-value">{{ pad(hour) }}</div>
                <button type="button" class="lk-dtp-step" aria-label="Hour down" @click="adjust('hour', -1)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
            </div>
            <div class="lk-dtp-colon">:</div>
            <div class="lk-dtp-unit">
                <button type="button" class="lk-dtp-step" aria-label="Minutes up" @click="adjust('minute', 5)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>
                </button>
                <div class="lk-dtp-value">{{ pad(minute) }}</div>
                <button type="button" class="lk-dtp-step" aria-label="Minutes down" @click="adjust('minute', -5)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
            </div>
        </div>
    </div>
</template>
<script>
// Custom expiration date-and-time picker (no native datetime chrome). Value
// is a UTC epoch-ms instant; days before `min` are unselectable, and picking
// a day whose kept time-of-day would land in the past clamps forward.
export default {
    name: "expiry-picker",
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
            if (unit === "hour") next.setHours((this.hour + delta + 24) % 24);
            else next.setMinutes((this.minute + delta + 60) % 60);
            this.commit(next);
        }
    }
};
</script>
<style lang="scss" scoped>
// Crystal-glass panel following the .lk-glass recipe (tokens.scss), plus a
// diagonal sheen and the dialog shadow so the picker reads as a floating
// native surface. The backdrop blur is progressive enhancement: transparent
// windows may not composite it (see FileLoader.vue), the layered translucent
// surface carries the look on its own.
.lk-dtp {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px 20px 14px;
    border-radius: 24px;
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.02) 58%),
        var(--surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--bd);
    box-shadow: inset 0 1px 0 var(--glass-edge), var(--dialog-shadow);
    user-select: none;
}

.lk-dtp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
}

.lk-dtp-month {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--text);
}

.lk-dtp-nav,
.lk-dtp-step {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    border-radius: 9px;
    color: var(--dim);
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

    &:focus {
        outline: none;
    }

    &:hover:not(:disabled) {
        background: var(--pill);
        box-shadow: inset 0 0 0 1px var(--pill-bd);
        color: var(--text);
    }

    &:active:not(:disabled) {
        transform: scale(0.88);
    }

    &:disabled {
        opacity: 0.35;
        cursor: default;
    }
}

.lk-dtp-nav {
    width: 32px;
    height: 28px;
}

.lk-dtp-grid {
    display: grid;
    grid-template-columns: repeat(7, 38px);
    gap: 3px;
    justify-content: center;
}

.lk-dtp-weekday {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--faint);
}

.lk-dtp-day {
    width: 38px;
    height: 29px;
    border: none;
    background: none;
    border-radius: 10px;
    font-family: Poppins, sans-serif;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

    &:focus {
        outline: none;
    }

    &:hover:not(:disabled):not(.selected) {
        background: var(--pill);
        box-shadow: inset 0 0 0 1px var(--pill-bd);
    }

    &:active:not(:disabled) {
        transform: scale(0.88);
    }

    &.today:not(.selected) {
        box-shadow: inset 0 0 0 1.5px var(--accent2);
    }

    &.selected {
        background: linear-gradient(135deg, var(--accent2), var(--accent));
        color: #fff;
        font-weight: 600;
        box-shadow: 0 3px 12px rgba(17, 208, 227, 0.45);
        animation: lkDtpPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    &:disabled {
        color: var(--faint);
        opacity: 0.4;
        cursor: default;
    }

    &.blank {
        visibility: hidden;
    }
}

@keyframes lkDtpPop {
    0% { transform: scale(1); }
    45% { transform: scale(1.12); }
    100% { transform: scale(1); }
}

.lk-dtp-time {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding-top: 6px;
    border-top: 1px solid var(--soft-bd);

    > svg {
        width: 17px;
        height: 17px;
        color: var(--faint);
        margin-right: 4px;
    }
}

.lk-dtp-unit {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.lk-dtp-step {
    width: 36px;
    height: 16px;
    border-radius: 7px;
}

.lk-dtp-value {
    min-width: 44px;
    text-align: center;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
    color: var(--text);
}

.lk-dtp-colon {
    font-size: 20px;
    font-weight: 600;
    color: var(--dim);
    padding-bottom: 2px;
}
</style>
