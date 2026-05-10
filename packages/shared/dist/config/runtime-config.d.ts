import { z } from "zod";
export declare const RuntimeConfigSchema: z.ZodObject<{
    app: z.ZodObject<{
        name: z.ZodString;
        environment: z.ZodString;
    }, z.core.$strip>;
    runtime: z.ZodObject<{
        deployment_mode: z.ZodString;
        hardware_profile: z.ZodString;
    }, z.core.$strip>;
    providers: z.ZodRecord<z.ZodString, z.ZodString>;
    selected: z.ZodObject<{
        hardwareProfile: z.ZodString;
        verticalId: z.ZodString;
        clientId: z.ZodString;
    }, z.core.$strip>;
    hardware: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    vertical: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    client: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type LoadRuntimeConfigOptions = {
    repoRoot: string;
    hardwareProfile: string;
    verticalId: string;
    clientId: string;
    env?: NodeJS.ProcessEnv;
    runtimeOverrides?: Record<string, unknown>;
};
export declare function loadRuntimeConfig(options: LoadRuntimeConfigOptions): RuntimeConfig;
