import { buildApp } from "./app.js";

const app = buildApp();

const port = Number(process.env.BACKEND_API_PORT ?? 3000);
const host = process.env.BACKEND_API_HOST ?? "0.0.0.0";

const start = async () => {
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
