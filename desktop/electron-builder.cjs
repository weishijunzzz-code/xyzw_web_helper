module.exports = {
  appId: "com.xyzw.tokenmanager",
  productName: "XYZW 游戏管理系统",
  directories: { output: "release", buildResources: "resources" },
  files: ["main.cjs", "server.cjs", "proxies.cjs", "web/**/*", "package.json"],
  asar: true,
  npmRebuild: false,
  artifactName: "XYZW-Desktop-${version}-${os}-${arch}.${ext}",
  mac: {
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    category: "public.app-category.games",
    identity: null,
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    artifactName: "XYZW-Desktop-${version}-windows-setup.${ext}",
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    installerLanguages: ["zh_CN", "en_US"],
    shortcutName: "XYZW 游戏管理系统",
  },
};
