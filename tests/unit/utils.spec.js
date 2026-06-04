import Utils from "@/utils.js";

describe("Utils", () => {
    it("pads short extensions to the ctx metadata width", () => {
        expect(Utils.fillExtension("txt")).toBe("*****txt");
    });

    it("truncates long extensions to fit the ctx metadata width", () => {
        expect(Utils.fillExtension("longextension")).toBe("longe...");
    });
});
