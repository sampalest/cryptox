import fs from "fs";
import { shell } from "electron";
import { removeEncrypted, removeOriginal } from "@main/deletion.js";

jest.mock("electron", () => ({ shell: { trashItem: jest.fn() } }));

const fileStats = { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false };
const dirStats = { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => true };
const symlinkStats = { isSymbolicLink: () => true, isFile: () => false, isDirectory: () => false };
const socketStats = { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => false };

describe("deletion", () => {
    let lstat, rm, unlink;

    beforeEach(() => {
        shell.trashItem.mockReset().mockResolvedValue();
        lstat = jest.spyOn(fs.promises, "lstat").mockResolvedValue(fileStats);
        rm = jest.spyOn(fs.promises, "rm").mockResolvedValue();
        unlink = jest.spyOn(fs.promises, "unlink").mockResolvedValue();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("removeOriginal", () => {
        it("removes permanently with rm in permanent mode, never via the Trash", async () => {
            await expect(removeOriginal("/tmp/plain.txt", "permanent")).resolves.toEqual({ deleted: true });
            expect(rm).toHaveBeenCalledWith("/tmp/plain.txt", { recursive: true });
            expect(shell.trashItem).not.toHaveBeenCalled();
        });

        it("moves to the Trash in trash mode without touching rm or unlink", async () => {
            await expect(removeOriginal("/tmp/plain.txt", "trash")).resolves.toEqual({ deleted: true });
            expect(shell.trashItem).toHaveBeenCalledWith("/tmp/plain.txt");
            expect(rm).not.toHaveBeenCalled();
            expect(unlink).not.toHaveBeenCalled();
        });

        it("never falls back to permanent removal when the Trash fails for a plaintext original", async () => {
            shell.trashItem.mockRejectedValue(new Error("no trash"));
            await expect(removeOriginal("/tmp/plain.txt", "trash")).resolves.toEqual({ deleted: false, error: true });
            expect(rm).not.toHaveBeenCalled();
            expect(unlink).not.toHaveBeenCalled();
        });

        it("handles directories in both modes", async () => {
            lstat.mockResolvedValue(dirStats);
            await expect(removeOriginal("/tmp/folder", "trash")).resolves.toEqual({ deleted: true });
            await expect(removeOriginal("/tmp/folder", "permanent")).resolves.toEqual({ deleted: true });
        });

        it("refuses symlinks and non-file non-directory targets in both modes", async () => {
            for (const stats of [symlinkStats, socketStats]) {
                lstat.mockResolvedValue(stats);
                for (const mode of ["trash", "permanent"]) {
                    await expect(removeOriginal("/tmp/plain.txt", mode)).resolves.toEqual({ deleted: false });
                }
            }
            expect(shell.trashItem).not.toHaveBeenCalled();
            expect(rm).not.toHaveBeenCalled();
            expect(unlink).not.toHaveBeenCalled();
        });

        it("reports an error when the permanent removal fails", async () => {
            rm.mockRejectedValue(new Error("EACCES"));
            await expect(removeOriginal("/tmp/plain.txt", "permanent")).resolves.toEqual({ deleted: false, error: true });
        });
    });

    describe("removeEncrypted", () => {
        it("unlinks directly in permanent mode, never via the Trash", async () => {
            await expect(removeEncrypted("/tmp/secret.dino", "permanent")).resolves.toEqual({ deleted: true });
            expect(unlink).toHaveBeenCalledWith("/tmp/secret.dino");
            expect(shell.trashItem).not.toHaveBeenCalled();
        });

        it("moves to the Trash in trash mode", async () => {
            await expect(removeEncrypted("/tmp/secret.dino", "trash")).resolves.toEqual({ deleted: true });
            expect(shell.trashItem).toHaveBeenCalledWith("/tmp/secret.dino");
            expect(unlink).not.toHaveBeenCalled();
        });

        it("falls back to a permanent unlink when the Trash is unavailable (ciphertext, safe)", async () => {
            shell.trashItem.mockRejectedValue(new Error("no trash"));
            await expect(removeEncrypted("/tmp/secret.dino", "trash")).resolves.toEqual({ deleted: true });
            expect(unlink).toHaveBeenCalledWith("/tmp/secret.dino");
        });

        it("reports an error when both the Trash and the unlink fallback fail", async () => {
            shell.trashItem.mockRejectedValue(new Error("no trash"));
            unlink.mockRejectedValue(new Error("EACCES"));
            await expect(removeEncrypted("/tmp/secret.dino", "trash")).resolves.toEqual({ deleted: false, error: true });
        });

        it("reports an error when the permanent unlink fails", async () => {
            unlink.mockRejectedValue(new Error("EACCES"));
            await expect(removeEncrypted("/tmp/secret.dino", "permanent")).resolves.toEqual({ deleted: false, error: true });
        });
    });
});
