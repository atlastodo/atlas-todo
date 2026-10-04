# The Electron desktop app, built from source: the compiled Electron main
# process plus the web export, run with nixpkgs' electron.
{
  lib,
  stdenv,
  callPackage,
  bun2nix,
  nodejs_26,
  electron,
  makeWrapper,
  copyDesktopItems,
  makeDesktopItem,
  atlas-web-dist,
  version,
}:

stdenv.mkDerivation {
  pname = "atlas-desktop";
  inherit version;

  src = callPackage ./js-source.nix { };

  nativeBuildInputs = [
    bun2nix.hook
    nodejs_26
    makeWrapper
    copyDesktopItems
  ];

  bunDeps = bun2nix.fetchBunDeps { bunNix = ../bun.nix; };

  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  dontUseBunBuild = true;
  dontUseBunCheck = true;
  dontUseBunInstall = true;

  buildPhase = ''
    runHook preBuild

    cd apps/electron
    node node_modules/typescript/bin/tsc -p tsconfig.build.json
    # Release marker, read by main.js: turns off dev mode (--dev) for good.
    node -e 'require("fs").writeFileSync("dist/release.json", JSON.stringify({ release: true, version: process.argv[1] }) + "\n")' \
      ${lib.escapeShellArg version}
    cd ../..

    runHook postBuild
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "atlas-desktop";
      desktopName = "Atlas Todo";
      genericName = "Todo & Task Management";
      comment = "Local-first todo and task management";
      exec = "atlas-desktop %u";
      icon = "atlas-todo";
      terminal = false;
      startupWMClass = "atlas-desktop";
      categories = [
        "Office"
        "ProjectManagement"
      ];
      mimeTypes = [ "x-scheme-handler/atlastodo" ];
    })
  ];

  # Same layout as the release tarball (scripts/package-desktop.sh), which
  # main.js resolves web-dist/ and assets/ against.
  installPhase = ''
    runHook preInstall

    app=$out/share/atlas-desktop
    mkdir -p $app/assets
    cp -r apps/electron/dist apps/electron/package.json $app/
    ln -s ${atlas-web-dist} $app/web-dist
    cp apps/mobile/assets/icon.png apps/electron/assets/tray*.png $app/assets/

    install -Dm644 apps/mobile/assets/icon.png $out/share/icons/hicolor/512x512/apps/atlas-todo.png
    install -Dm644 apps/mobile/assets/icon.png $out/share/pixmaps/atlas-todo.png

    makeWrapper ${lib.getExe electron} $out/bin/atlas-desktop \
      --add-flags "$app/dist/main.js" \
      --add-flags "--no-update" \
      --add-flags "--class=atlas-desktop" \
      --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations}}"

    runHook postInstall
  '';

  meta = {
    description = "Atlas Todo desktop application powered by Electron";
    homepage = "https://github.com/atlastodo/atlas-todo";
    license = lib.licenses.agpl3Only;
    platforms = lib.platforms.linux;
    mainProgram = "atlas-desktop";
  };
}
