import { describe, expect, it } from "vitest";

import { labelText } from "./face.js";

describe("labelText", () => {
    it("tracks_letters_with_hair_spaces_not_ordinary_spaces", () => {
        expect(labelText("Disk")).toBe("D  I  S  K");
    });
});
