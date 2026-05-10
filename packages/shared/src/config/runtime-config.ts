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

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export type LoadRuntimeConfigOptions = {
  repoRoot: string;
  hardwareProfile: string;
  verticalId: string;
  clientId: string;
  env?: NodeJS.ProcessEnv;
  runtimeOverrides?: Record<string, unknown>;
};

function readYamlFile<T>(filePath: string, schema: z.ZodType<T>): T {
  const content = readFileSync(filePath, "utf8");
  const parsed = load(content);
  return schema.parse(parsed);
}

function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const prev = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      out[key] = deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function applyEnvOverrides(
  raw: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): Record<string, unknown> {
  const merged = { ...raw };
  if (env.APP_ENV && merged.app && typeof merged.app === "object") {
    merged.app = { ...(merged.app as Record<string, unknown>), environment: env.APP_ENV };
  }
  if (env.HARDWARE_PROFILE && merged.runtime && typeof merged.runtime === "object") {
    merged.runtime = {
      ...(merged.runtime as Record<string, unknown>),
      hardware_profile: env.HARDWARE_PROFILE
    };
  }
  return merged;
}

export function loadRuntimeConfig(options: LoadRuntimeConfigOptions): RuntimeConfig {
  const { repoRoot, hardwareProfile, verticalId, clientId } = options;

  const globalConfig = readYamlFile(
    resolve(repoRoot, "configs/global.yaml"),
    GlobalConfigSchema
  );
  const hardwareConfig = readYamlFile(
    resolve(repoRoot, `configs/hardware/${hardwareProfile}.yaml`),
    HardwareConfigSchema
  );
  const verticalConfig = readYamlFile(
    resolve(repoRoot, `configs/verticals/${verticalId}.yaml`),
    VerticalConfigSchema
  );
  const clientConfig = readYamlFile(
    resolve(repoRoot, `configs/clients/${clientId}.yaml`),
    ClientConfigSchema
  );

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

  const envMerged = applyEnvOverrides(mergedBase as Record<string, unknown>, options.env ?? process.env);
  const withRuntimeOverrides = deepMerge(envMerged, options.runtimeOverrides ?? {});

  return RuntimeConfigSchema.parse(withRuntimeOverrides);
}
