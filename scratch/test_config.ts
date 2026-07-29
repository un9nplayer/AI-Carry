import { initConfig, updateConfig, getConfig } from '../src/config/index.js';

try {
  initConfig();
  console.log("Current default model:", getConfig().defaultModel);
  console.log("Updating defaultModel...");
  updateConfig({ defaultModel: "nvidia/nvidia/nemotron-3-super-120b-a12b" });
  console.log("New default model in memory:", getConfig().defaultModel);
} catch (err: any) {
  console.error("Error updating config:", err);
}
