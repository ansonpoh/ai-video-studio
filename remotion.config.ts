// Remotion CLI / Studio configuration.
// Every generated project lives in ./projects/<id>/ and its media is addressed
// with staticFile("<id>/..."), so the projects folder is the public directory.
import { Config } from "@remotion/cli/config";

Config.setPublicDir("./projects");
Config.setEntryPoint("./src/video/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
