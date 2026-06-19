const { execFileSync } = require("node:child_process");
const { dirname } = require("node:path");
const { createRequire } = require("node:module");

const projectRequire = createRequire(__filename);
const electronVersion = projectRequire("electron/package.json").version;
const betterSqlite3Root = dirname(
  projectRequire.resolve("better-sqlite3/package.json"),
);
const prebuildInstallBin = projectRequire.resolve("prebuild-install/bin", {
  paths: [betterSqlite3Root],
});

console.log(
  `Fetching better-sqlite3 prebuild for Electron ${electronVersion}...`,
);

execFileSync(
  process.execPath,
  [prebuildInstallBin, "--runtime", "electron", "--target", electronVersion],
  {
    cwd: betterSqlite3Root,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: electronVersion,
      npm_config_disturl: "https://electronjs.org/headers",
    },
  },
);
