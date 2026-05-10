import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
const GlobalConfigSchema = z.object({
    app: z.object({
        name: z.string(),
        environment: z.string()
    }),
    runtime: z.object({
        deployment_mode: z.string(),
        hardware_profile: z.string()
    }),
    providers: z.record(z.string(), z.string())
});
const HardwareConfigSchema = z.object({
    hardware: z.object({
        id: z.string()
    }).passthrough()
});
const VerticalConfigSchema = z.object({
    vertical: z.object({
        id: z.string()
    }).passthrough()
}).passthrough();
const ClientConfigSchema = z.object({
    client: z.object({
        id: z.string()
    }).passthrough()
}).passthrough();
export const RuntimeConfigSchema = z.object({
    app: z.object({
        name: z.string(),
        environment: z.string()
    }),
    runtime: z.object({
        deployment_mode: z.string(),
        hardware_profile: z.string()
    }),
    providers: z.record(z.string(), z.string()),
    selected: z.object({
        hardwareProfile: z.string(),
        verticalId: z.string(),
        clientId: z.string()
    }),
    hardware: z.record(z.string(), z.unknown()),
    vertical: z.record(z.string(), z.unknown()),
    client: z.record(z.string(), z.unknown())
});
function readYamlFile(filePath, schema) {
    const content = readFileSync(filePath, "utf8");
    const parsed = load(content);
    return schema.parse(parsed);
}
function deepMerge(base, overlay) {
    const out = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        const prev = out[key];
        if (value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            prev &&
            typeof prev === "object" &&
            !Array.isArray(prev)) {
            out[key] = deepMerge(prev, value);
        }
        else {
            out[key] = value;
        }
    }
    return out;
}
function applyEnvOverrides(raw, env) {
    const merged = { ...raw };
    if (env.APP_ENV && merged.app && typeof merged.app === "object") {
        merged.app = { ...merged.app, environment: env.APP_ENV };
    }
    if (env.HARDWARE_PROFILE && merged.runtime && typeof merged.runtime === "object") {
        merged.runtime = {
            ...merged.runtime,
            hardware_profile: env.HARDWARE_PROFILE
        };
    }
    return merged;
}
export function loadRuntimeConfig(options) {
    const { repoRoot, hardwareProfile, verticalId, clientId } = options;
    const globalConfig = readYamlFile(resolve(repoRoot, "configs/global.yaml"), GlobalConfigSchema);
    const hardwareConfig = readYamlFile(resolve(repoRoot, `configs/hardware/${hardwareProfile}.yaml`), HardwareConfigSchema);
    const verticalConfig = readYamlFile(resolve(repoRoot, `configs/verticals/${verticalId}.yaml`), VerticalConfigSchema);
    const clientConfig = readYamlFile(resolve(repoRoot, `configs/clients/${clientId}.yaml`), ClientConfigSchema);
    const mergedBase = {
        app: globalConfig.app,
        runtime: globalConfig.runtime,
        providers: globalConfig.providers,
        selected: {
            hardwareProfile,
            verticalId,
            clientId
        },
        hardware: hardwareConfig.hardware,
        vertical: verticalConfig.vertical,
        client: clientConfig.client
    };
    const envMerged = applyEnvOverrides(mergedBase, options.env ?? process.env);
    const withRuntimeOverrides = deepMerge(envMerged, options.runtimeOverrides ?? {});
    return RuntimeConfigSchema.parse(withRuntimeOverrides);
}
//# sourceMappingURL=runtime-config.js.map