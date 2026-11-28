import { Config } from "@remotion/cli/config";

// public/ at the repo root contains an `assets` junction to the repo's
// assets/ tree, matching the CompSpec footage paths ("assets/...").
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
