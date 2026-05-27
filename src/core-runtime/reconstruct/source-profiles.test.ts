import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  loadReconstructSourceProfiles,
  resolveReconstructSourceProfile,
} from "./source-profiles.js";

const profilesRoot = path.resolve(".onto/processes/reconstruct/source-profiles");

describe("reconstruct source profiles", () => {
  it("loads source profiles keyed by target material kind", async () => {
    const profiles = await loadReconstructSourceProfiles(profilesRoot);

    expect(profiles.map((profile) => profile.target_material_kind).sort()).toEqual([
      "code",
      "database",
      "document",
      "spreadsheet",
    ]);
    expect(profiles.every((profile) => profile.scan_targets.length > 0)).toBe(true);
  });

  it("resolves the spreadsheet source profile", async () => {
    const profile = await resolveReconstructSourceProfile({
      profilesRoot,
      targetMaterialKind: "spreadsheet",
    });

    expect(profile?.title).toBe("Source Profile: Spreadsheet");
    expect(profile?.support_summary).toContain("Design profile only");
  });
});
