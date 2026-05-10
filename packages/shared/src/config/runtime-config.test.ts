import { describe, expect, test } from "vitest";
import { resolve } from "node:path";
import { loadRuntimeConfig } from "./runtime-config.js";

const repoRoot = resolve(import.meta.dirname, "../../../../");

describe("runtime config loader", () => {
  test("loads demo_transportation client", () => {
    const cfg = loadRuntimeConfig({
      repoRoot,
      hardwareProfile: "rtx5090_single_node",
      verticalId: "transportation",
      clientId: "demo_transportation"
    });

    expect(cfg.app.name).toBe("VoxaFlow");
    expect(cfg.selected.clientId).toBe("demo_transportation");
    expect(cfg.vertical.id).toBe("transportation");
  });

  test("loads demo_homecare client", () => {
    const cfg = loadRuntimeConfig({
      repoRoot,
      hardwareProfile: "rtx5090_single_node",
      verticalId: "home_care",
      clientId: "demo_homecare"
    });

    expect(cfg.selected.clientId).toBe("demo_homecare");
    expect(cfg.hardware.id).toBe("rtx5090_single_node");
  });

  test("applies env and runtime overrides", () => {
    const cfg = loadRuntimeConfig({
      repoRoot,
      hardwareProfile: "rtx5090_single_node",
      verticalId: "transportation",
      clientId: "demo_transportation",
      env: {
        APP_ENV: "test",
        HARDWARE_PROFILE: "cloud_saas"
      },
      runtimeOverrides: {
        selected: {
          clientId: "demo_clinic"
        }
      }
    });

    expect(cfg.app.environment).toBe("test");
    expect(cfg.runtime.hardware_profile).toBe("cloud_saas");
    expect(cfg.selected.clientId).toBe("demo_clinic");
  });
});
