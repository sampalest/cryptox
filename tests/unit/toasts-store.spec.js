import { createPinia, setActivePinia } from "pinia";
import { useToastStore } from "@/store/toasts.js";

describe("toasts store", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        setActivePinia(createPinia());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("stacks toasts with their severity", () => {
        const store = useToastStore();
        store.error("boom");
        store.warning("careful");
        store.info("fyi");
        expect(store.toasts.map(toast => toast.kind)).toEqual(["error", "warning", "info"]);
        expect(store.toasts.map(toast => toast.message)).toEqual(["boom", "careful", "fyi"]);
    });

    it("auto-dismisses each toast after the timeout", () => {
        const store = useToastStore();
        store.error("boom");
        jest.advanceTimersByTime(4999);
        expect(store.toasts).toHaveLength(1);
        jest.advanceTimersByTime(1);
        expect(store.toasts).toHaveLength(0);
    });

    it("auto-dismisses independently per toast", () => {
        const store = useToastStore();
        store.error("first");
        jest.advanceTimersByTime(3000);
        store.info("second");
        jest.advanceTimersByTime(2000);
        expect(store.toasts.map(toast => toast.message)).toEqual(["second"]);
    });

    it("dismiss removes only the given toast", () => {
        const store = useToastStore();
        store.error("first");
        store.error("second");
        store.dismiss(store.toasts[0].id);
        expect(store.toasts.map(toast => toast.message)).toEqual(["second"]);
    });

    it("keeps distinct ids for identical messages", () => {
        const store = useToastStore();
        store.error("same");
        store.error("same");
        expect(store.toasts[0].id).not.toBe(store.toasts[1].id);
    });
});
