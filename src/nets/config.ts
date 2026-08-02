export const DISABLE_CACHE_MODE = process.env.DISABLE_CACHE?.toLowerCase() === "true" || process.argv.includes("dev");

export const configuredToken = process.env.CONFIGURED_AUTH_BEARER;

export const DISABLE_WRITES = true;

export const DISABLE_AUTHORIZATION_MODE = !configuredToken || DISABLE_CACHE_MODE;

export const CACHE_SCHEMA_VERSION = 1;

export const TRUST_PROXY = true;

export const MAIA_THREE_PATH = DISABLE_CACHE_MODE ? "./models/maia3_simplified.onnx" : process.env.MAIA_THREE_PATH;

export const LEELA_PATH = DISABLE_CACHE_MODE ? "./models/t1-256x10.onnx" : process.env.LEELA_MODEL_PATH;

export const ELITE_LEELA_PATH = DISABLE_CACHE_MODE ? "./models/eliteleelav2.onnx" : process.env.ELITE_LEELA_MODEL_PATH;

export const PORT = process.env.PORT || 8080;

