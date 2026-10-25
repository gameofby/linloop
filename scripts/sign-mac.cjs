const path = require("node:path");
const { signAsync } = require("@electron/osx-sign");

// electron-builder 25 does not support identity: "-". Sign local builds
// after packaging; Developer ID builds use electron-builder's normal signer.
module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin") return;
  if (context.packager.platformSpecificBuildOptions.identity !== null) return;
  // Universal builds merge these temporary bundles before the final afterPack.
  // Signing them first creates different CodeResources files that cannot merge.
  if (/-(?:x64|arm64)-temp$/.test(context.appOutDir)) return;

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`Ad-hoc signing ${app} (not notarized)`);
  await signAsync({
    app,
    identity: "-",
    identityValidation: false,
    platform: "darwin",
    preAutoEntitlements: false,
    optionsForFile: () => ({ hardenedRuntime: false }),
  });
};
