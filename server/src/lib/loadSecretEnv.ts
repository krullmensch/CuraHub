// Import first (right after dotenv) in every entry point: index.ts and all scripts.
import { applySecretFiles } from './secretEnv';

applySecretFiles(process.env);
