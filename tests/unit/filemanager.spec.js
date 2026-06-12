import FileManager from "@shared/filemanager.js";

describe("FileManager", () => {
    it("derives names and extensions from a file path", () => {
        const file = new FileManager("/tmp/cryptox/example.ctx");

        expect(file.path).toBe("/tmp/cryptox/example.ctx");
        expect(file.name).toBe("example.ctx");
        expect(file.extension()).toBe("ctx");
    });
});

