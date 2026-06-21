import FileManager from "@shared/filemanager.js";

describe("FileManager", () => {
    it("derives names and extensions from a file path", () => {
        const file = new FileManager("/tmp/cryptox/example.ctx");

        expect(file.path).toBe("/tmp/cryptox/example.ctx");
        expect(file.name).toBe("example.ctx");
        expect(file.extension()).toBe("ctx");
    });

    it("derives the name from a Windows path too (CODE-02)", () => {
        const file = new FileManager("C:\\Users\\me\\secret.txt");

        expect(file.name).toBe("secret.txt");
        expect(file.extension()).toBe("txt");
    });
});

