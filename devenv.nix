{ pkgs, lib, config, inputs, ... }:

let
  # First lines of every script that needs the Android SDK, which is opt-in (see `android` below).
  requireAndroid = ''
    if [ -z "''${ANDROID_HOME:-}" ]; then
      echo "!! This needs the Android SDK, which is off by default. To enable it, create" >&2
      echo "   devenv.local.nix (gitignored) in the repo root containing:" >&2
      echo "     { android.enable = true; }" >&2
      echo "   then re-enter the shell. The first entry downloads the SDK (several GB)." >&2
      exit 1
    fi
  '';

  # The sync server lives in the core repository (atlastodo/atlas). The scripts that need one talk
  # to EXPO_PUBLIC_API_URL (default http://localhost:8080) and only check that it answers; start
  # one with the core repo's `devenv up` + `cargo run -p atlas-server`, or its Docker image.
  requireServer = ''
    api_url="''${EXPO_PUBLIC_API_URL:-http://localhost:8080}"
    if ! curl -sf "$api_url/health" >/dev/null 2>&1 && ! curl -sf "$api_url/api/health" >/dev/null 2>&1; then
      echo "!! No Atlas server answers at $api_url. The server is in the core repository" >&2
      echo "   (https://github.com/atlastodo/atlas): run it there (devenv up, then" >&2
      echo "   cargo run -p atlas-server), or its image (docs/self-hosting.md there), or point" >&2
      echo "   EXPO_PUBLIC_API_URL at another server. Continuing: the app starts anyway and" >&2
      echo "   shows the sign-in screen's server field." >&2
    fi
  '';
  # The electron the desktop builds run (nix/electron.nix): nixpkgs' or a pinned newer release.
  electron = pkgs.callPackage ./nix/electron.nix { };
in
{
  # ---------------------------------------------------------------------------
  # Atlas Todo app development environment.
  #
  # Provides every tool needed to build and test the app reproducibly:
  #   - Node + Bun (apps/mobile: the React Native + Expo app and its web export; apps/electron)
  #   - the Android SDK, opt-in (native Android builds)
  #   - Electron (desktop)
  #
  # The sync server (Rust + PostgreSQL) and the core packages are in the core repository,
  # https://github.com/atlastodo/atlas; this app installs the core packages from its releases.
  #
  # `devenv shell` drops you into this env; the scripts below wrap the common workflows. See
  # CONTRIBUTING.md for usage.
  # ---------------------------------------------------------------------------

  # --- Android SDK & Emulator ------------------------------------------------
  # Opt-in: several GB that only native Android work needs (Expo Go and EAS cloud builds don't).
  # Enable it per machine with a devenv.local.nix containing `{ android.enable = true; }`.
  android = {
    enable = lib.mkDefault false;
    platforms.version = [ "34" "35" "36" "37" ];
    systemImageTypes = [ "google_apis_playstore" ];
    abis = [ "x86_64" ];
    buildTools.version = [ "34.0.0" "35.0.0" "36.0.0" "37.0.0" ];
    ndk.version = [ "27.0.12077973" "27.1.12297006" ];
    cmake.version = [ "3.22.1" ];
    emulator.enable = true;
    systemImages.enable = true;
    reactNative.enable = true;
  };

  languages.javascript = {
    enable = true;
    # Node 26, matching `engines` and CI. Node is the runtime; Bun is the package manager. Bun is
    # pinned to 1.4.2 through this lock's nixpkgs, in lockstep with .bun-version (CI).
    package = pkgs.nodejs_26;
    bun.enable = true;
  };

  # --- Packages / tooling ----------------------------------------------------
  packages = with pkgs; [
    git
    curl
    # Desktop tooling
    electron
  ];

  env = {
    ELECTRON_OVERRIDE_DIST_PATH = "${electron}/bin";
  } // lib.optionalAttrs config.android.enable {
    # Gradle/JVM heap for native Android builds; mkForce replaces the android module's GRADLE_OPTS.
    GRADLE_OPTS = lib.mkForce "-Dorg.gradle.jvmargs=\"-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError\" -XX:MaxMetaspaceSize=1024m -Xmx4096m";
    JAVA_TOOL_OPTIONS = "-XX:MaxMetaspaceSize=1024m -Xmx4096m";
    _JAVA_OPTIONS = "-XX:MaxMetaspaceSize=1024m -Xmx4096m";
  };

  # --- Scripts (developer entry points) --------------------------------------
  # Release helper: bump the version across ALL manifests in lockstep (the "version the manifests"
  # rule). `version:bump 0.13.4` sets an explicit version; `version:bump patch|minor|major` steps it.
  # Then commit `chore(release): vX.Y.Z` and tag `vX.Y.Z` to release.
  scripts."version:bump".exec = ''bash "$DEVENV_ROOT/scripts/bump-version.sh" "$@"'';
  # Mobile (React Native + Expo). `mobile:dev` starts the Metro dev server -- scan the QR with
  # Expo Go on the phone. `--tunnel` when the phone isn't on the same LAN as this machine. No
  # Android SDK / Xcode needed for this path; real store builds go through EAS.
  #
  # `REACT_NATIVE_PACKAGER_HOSTNAME` publishes this machine's Tailscale IP in the QR, for a phone
  # that reaches it over a tailnet -- e.g. one routing its traffic through a Tailscale exit node.
  # Without it Expo publishes the LAN IP (192.168.x.x), which such a phone sends through the exit
  # node; it can't hairpin back to the LAN, so Expo Go shows "request timed out". A tailnet peer
  # address is reachable directly (exit nodes route internet only, not tailnet peers). Sits behind
  # `command -v tailscale` so a box without Tailscale just gets plain `bun run start`.
  #
  # Note the terminal still prints `Waiting on http://localhost:<port>` -- that is the local
  # convenience link, not what the phone is told. The QR / manifest `bundleUrl` carries the hostname
  # exported here.
  scripts."mobile:dev".exec = ''
    ts_ip="$(command -v tailscale >/dev/null 2>&1 && tailscale ip -4 2>/dev/null || true)"
    export REACT_NATIVE_PACKAGER_HOSTNAME="''${REACT_NATIVE_PACKAGER_HOSTNAME:-$ts_ip}"
    export EXPO_PUBLIC_API_URL="''${EXPO_PUBLIC_API_URL:-http://localhost:8080}"
    cd "$DEVENV_ROOT/apps/mobile" && bun run start "$@"
  '';
  # `web:dev` -- the RN-web app (apps/mobile via react-native-web) on the Expo web dev server,
  # pointed at EXPO_PUBLIC_API_URL (default http://localhost:8080, a server from the core
  # repository). Open the URL Expo prints (usually http://localhost:8081), sign up, add a task or
  # two, and widen to >=768px for the desktop sidebar.
  scripts."web:dev".exec = requireServer + ''
    set -euo pipefail
    cd "$DEVENV_ROOT/apps/mobile"
    # EXPO_UNSTABLE_HEADLESS disables the standalone React Native DevTools ("fusebox") shell, whose
    # prebuilt binary can't load on NixOS ("libglib-2.0.so.0: cannot open shared object file").
    # It's harmless but noisy, and the web app is debugged in the browser's own devtools, so the
    # shell is useless here anyway. Deliberately NOT set for mobile:dev -- headless there would
    # suppress the QR code the phone needs.
    EXPO_PUBLIC_API_URL="$api_url" EXPO_UNSTABLE_HEADLESS=1 bun run web "$@"
  '';
  # `screenshots` -- regenerate docs/screenshots: a throwaway Postgres and the core server's image
  # (ATLAS_SERVER_IMAGE, default the core release this app pins) serve a fresh web export on :8090,
  # and scripts/screenshots.mjs seeds a demo account and captures it in headless Chromium (from the
  # flake's nixpkgs). Needs Docker.
  scripts."screenshots".exec = ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "!! screenshots needs a running Docker daemon." >&2; exit 1; }
    # The core release the app pins. It was published before the core repository was renamed, so it
    # exists under the old image name only; later core releases are ghcr.io/atlastodo/atlas:X.Y.Z.
    image="''${ATLAS_SERVER_IMAGE:-ghcr.io/atlastodo/atlas:0.1.14}"
    work="$(mktemp -d)"
    net="atlas-screenshots-$$"
    cleanup() {
      docker rm -f "$net-server" "$net-db" >/dev/null 2>&1 || true
      docker network rm "$net" >/dev/null 2>&1 || true
      rm -rf "$work"
    }
    trap cleanup EXIT
    (cd apps/mobile && EXPO_PUBLIC_API_URL=/api bunx expo export --platform web --output-dir "$work/web")
    chmod -R a+rX "$work"
    docker network create "$net" >/dev/null
    docker run -d --rm --name "$net-db" --network "$net" \
      -e POSTGRES_USER=atlas -e POSTGRES_PASSWORD=atlas -e POSTGRES_DB=atlas postgres:16-alpine >/dev/null
    until docker exec "$net-db" pg_isready -U atlas -d atlas -q; do sleep 1; done
    docker run -d --rm --name "$net-server" --network "$net" -p 127.0.0.1:8090:8080 \
      -e DATABASE_URL=postgres://atlas:atlas@"$net-db":5432/atlas \
      -e JWT_SECRET="$(head -c 48 /dev/urandom | base64)" \
      -e STATIC_DIR=/srv/web -v "$work/web:/srv/web:ro" "$image" >/dev/null
    until curl -sf http://localhost:8090/api/health >/dev/null; do sleep 1; done
    chromium="$(nix build --inputs-from . --no-link --print-out-paths nixpkgs#chromium)/bin/chromium"
    # devenv's LD_LIBRARY_PATH points Chromium at libraries from another glibc.
    env -u LD_LIBRARY_PATH CHROMIUM="$chromium" BASE_URL=http://localhost:8090 node scripts/screenshots.mjs
    nix run --inputs-from . nixpkgs#pngquant -- --force --ext .png --quality 80-95 --skip-if-larger docs/screenshots/*.png
  '';
  # Named test:all -- a script called "test" collides with the shell builtin, so `devenv shell
  # test` silently exits 0 instead of running this.
  # `set -e` so any failing step fails the script, not just the last one.
  scripts."test:all".exec = ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    # `--bun` runs vitest itself under Bun's runtime (supported since Bun 1.4), matching CI.
    (cd apps/electron && bunx --bun vitest run)
    # jest-expo must run under real Node (`bun run` only starts it).
    (cd apps/mobile && bun run test)
  '';
  # Every workspace's typecheck (mobile and electron, as CI's `Lint (TypeScript)`), oxlint
  # (`.oxlintrc.json`), `prettier --check` and the shipped licences.
  # One command per line: under `set -e` a failure on the left of `&&` would not stop the script.
  scripts.lint.exec = ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    (cd apps/mobile && bun run typecheck)
    (cd apps/electron && bun run typecheck)
    bunx oxlint .
    bunx prettier --check .
    node scripts/third-party-licenses.mjs --check
    # devenv.yaml follows the flake's nixpkgs; devenv.lock holds a copy of it.
    node scripts/check-devenv-lock.mjs
    # nix/bun.nix must match bun.lock, or the flake's web-dist/atlas-desktop builds fail offline.
    if command -v nix >/dev/null; then
      fresh="$(mktemp)"
      nix run --inputs-from . bun2nix -- -c ../ -o "$fresh"
      cmp -s "$fresh" nix/bun.nix || { rm -f "$fresh"; echo "nix/bun.nix is stale: run nix:bun-lock" >&2; exit 1; }
      rm -f "$fresh"
    fi
  '';
  scripts.fmt.exec = ''
    cd "$DEVENV_ROOT"
    bunx prettier --write .
  '';
  scripts."build:ios".exec = "cd \"$DEVENV_ROOT/apps/mobile\" && bunx eas-cli build --profile preview --platform ios \"$@\"";
  scripts."build:ios:local".exec = "cd \"$DEVENV_ROOT/apps/mobile\" && bunx eas-cli build --profile preview --platform ios --local \"$@\"";
  scripts."update:ios".exec = "cd \"$DEVENV_ROOT/apps/mobile\" && bunx eas-cli update --channel preview \"$@\"";
  scripts."build:android".exec = "cd \"$DEVENV_ROOT/apps/mobile\" && bunx eas-cli build --profile preview --platform android \"$@\"";
  # The --local builds and Gradle run on this machine, so they need the (opt-in) Android SDK.
  scripts."build:android:local".exec = requireAndroid + ''
    cd "$DEVENV_ROOT/apps/mobile" && bunx eas-cli build --profile preview --platform android --local "$@"
  '';
  scripts."build:android:aab".exec = requireAndroid + ''
    cd "$DEVENV_ROOT/apps/mobile" && EAS_BUILD_NO_EXPO_GO_WARNING=true bunx eas-cli build --profile production --platform android --local "$@"
  '';
  scripts."bundle:android:release".exec = requireAndroid + ''
    cd "$DEVENV_ROOT/apps/mobile/android" && ./gradlew bundleRelease "$@"
  '';
  # The last release build's permissions against docs/android-permissions.md (release.yml runs it too).
  scripts."android:permissions".exec = ''node "$DEVENV_ROOT/apps/mobile/scripts/check-android-permissions.mjs" "$@"'';
  scripts."update:android".exec = "cd \"$DEVENV_ROOT/apps/mobile\" && bunx eas-cli update --channel preview --platform android \"$@\"";
  scripts."clean:mobile".exec = "cd \"$DEVENV_ROOT/apps/mobile\" && bun run clean";
  scripts."clean:all".exec = "cd \"$DEVENV_ROOT\" && (cd apps/mobile && bun run clean) && rm -rf apps/mobile/node_modules/.cache apps/electron/dist";

  # Desktop (Electron): the Expo web dev server (started if :8081 is free) and Electron in dev
  # mode against it, talking to EXPO_PUBLIC_API_URL (default http://localhost:8080).
  scripts."desktop:dev".exec = requireServer + ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    log_dir="''${TMPDIR:-/tmp}"
    expo_pid=""
    cleanup() {
      echo; echo ">> Shutting down desktop dev environment..."
      [ -n "$expo_pid" ] && kill "$expo_pid" 2>/dev/null || true
      wait 2>/dev/null || true
    }
    trap cleanup EXIT INT TERM

    echo ">> Building @atlastodo/electron..."
    (cd apps/electron && bun run build)

    if (exec 3<>"/dev/tcp/localhost/8081") 2>/dev/null; then
      exec 3>&- 2>/dev/null || true
      echo ">> Metro dev server already running on :8081"
    else
      echo ">> Starting Expo web dev server... log: $log_dir/atlas-expo-web.log"
      (cd apps/mobile && EXPO_PUBLIC_API_URL="$api_url" EXPO_UNSTABLE_HEADLESS=1 bun run web) >"$log_dir/atlas-expo-web.log" 2>&1 &
      expo_pid="$!"
      i=0; while [ "$i" -lt 120 ]; do (exec 3<>"/dev/tcp/localhost/8081") 2>/dev/null && { exec 3>&- 2>/dev/null || true; break; }; sleep 1; i=$((i + 1)); done
    fi

    echo ">> Launching Atlas Todo desktop app..."
    # devenv's LD_LIBRARY_PATH points Electron at libraries built against another glibc.
    (cd apps/electron && env -u LD_LIBRARY_PATH "${electron}/bin/electron" dist/main.js --dev "$@")
  '';

  scripts."desktop:start".exec = ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    echo ">> Exporting web bundle..."
    (cd apps/mobile && bun run export:web)
    echo ">> Building @atlastodo/electron..."
    (cd apps/electron && bun run build)
    echo ">> Starting Atlas Todo desktop..."
    # devenv's LD_LIBRARY_PATH points Electron at libraries built against another glibc.
    (cd apps/electron && env -u LD_LIBRARY_PATH "${electron}/bin/electron" dist/main.js "$@")
  '';
  scripts."desktop:package".exec = ''bash "$DEVENV_ROOT/scripts/package-desktop.sh" "$@"'';
  # Refresh everything Dependabot cannot update (the devenv and flake locks, the Bun pins, the whole
  # bun.lock, the Expo SDK packages, the core pin, nix/bun.nix): scripts/update-deps.sh, which
  # .github/workflows/deps-refresh.yml runs weekly.
  scripts."deps:update".exec = ''bash "$DEVENV_ROOT/scripts/update-deps.sh" "$@"'';
  # Refresh nix/flake.desktop.lock, the nixpkgs pin shipped inside the desktop tarball's flake.
  # The template is not named flake.nix, so it is locked from a temporary copy.
  scripts."desktop:flake-update".exec = ''
    set -euo pipefail
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    cp "$DEVENV_ROOT/nix/flake.desktop.nix" "$tmp/flake.nix"
    cp "$DEVENV_ROOT/nix/flake.desktop.lock" "$tmp/flake.lock"
    nix flake update --flake "path:$tmp"
    cp "$tmp/flake.lock" "$DEVENV_ROOT/nix/flake.desktop.lock"
  '';
  # Regenerate nix/bun.nix (the flake's npm dependency set, read by bun2nix) from bun.lock, with
  # the bun2nix version the flake locks. Run after every change to bun.lock; `lint` checks it.
  scripts."nix:bun-lock".exec = ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    nix run --inputs-from . bun2nix -- -c ../ -o nix/bun.nix
  '';

  # The web app as the release's atlas-todo-web-X.Y.Z.tar.gz (+ .sha256) in dist-web/, the asset a
  # core server image or flake pinned to this release downloads; `web:release-tarball <dir>`
  # writes it elsewhere.
  scripts."web:release-tarball".exec = ''
    set -euo pipefail
    cd "$DEVENV_ROOT"
    scripts/web-release-tarball.sh "$@"
  '';

  # Android Emulator workflow scripts
  scripts."emulator:create".exec = requireAndroid + ''
    echo ">> Checking/creating Android Virtual Device (pixel-11-pro)..."
    if avdmanager list avd | grep -q "Name: pixel-11-pro"; then
      echo ">> AVD 'pixel-11-pro' already exists."
    else
      echo "no" | avdmanager create avd \
        --force \
        --name pixel-11-pro \
        --package 'system-images;android-34;google_apis_playstore;x86_64' \
        --device 'pixel_7_pro'
      ini_file="$HOME/.android/avd/pixel-11-pro.ini"
      if [ -f "$ini_file" ]; then
        echo "avd.ini.displayname=Pixel 11 Pro" >> "$ini_file"
      fi
      echo ">> AVD 'pixel-11-pro' (Pixel 11 Pro) created successfully."
    fi
  '';
  scripts."emulator:start".exec = requireAndroid + ''
    if ! avdmanager list avd | grep -q "Name: pixel-11-pro"; then
      echo ">> AVD not found. Creating..."
      emulator:create
    fi
    export LD_LIBRARY_PATH="$ANDROID_HOME/emulator/lib64:$ANDROID_HOME/emulator/lib64/qt/lib:''${LD_LIBRARY_PATH:-}"
    echo ">> Starting Android emulator (Pixel 11 Pro)..."
    emulator -avd pixel-11-pro -gpu host "$@"
  '';
  scripts."emulator:headless".exec = requireAndroid + ''
    if ! avdmanager list avd | grep -q "Name: pixel-11-pro"; then
      echo ">> AVD not found. Creating..."
      emulator:create
    fi
    export LD_LIBRARY_PATH="$ANDROID_HOME/emulator/lib64:$ANDROID_HOME/emulator/lib64/qt/lib:''${LD_LIBRARY_PATH:-}"
    echo ">> Starting headless Android emulator (Pixel 11 Pro)..."
    emulator -avd pixel-11-pro -no-window -no-audio -gpu off "$@"
  '';
  # The native Android dev build on a device or emulator, against EXPO_PUBLIC_API_URL (default
  # http://localhost:8080, reversed to the device with adb).
  scripts."mobile:android".exec = requireAndroid + requireServer + ''
    set -euo pipefail
    adb reverse tcp:8081 tcp:8081 2>/dev/null || true
    adb reverse tcp:8080 tcp:8080 2>/dev/null || true
    echo ">> Starting Android app against $api_url..."
    cd "$DEVENV_ROOT/apps/mobile"
    EXPO_PUBLIC_API_URL="$api_url" EXPO_UNSTABLE_HEADLESS=1 bun run android "$@"
  '';

  enterShell = ''
    if [ -n "''${DEVENV_PROFILE:-}" ]; then
      export PATH="$DEVENV_PROFILE/bin:$PATH"
    fi
    echo "Atlas Todo app dev shell -- node $(node --version), bun $(bun --version)"
    echo "Scripts: web:dev, mobile:dev, desktop:dev, test:all, lint, fmt (the server is in atlastodo/atlas)"
    if [ -n "''${ANDROID_HOME:-}" ]; then
      echo "Android: emulator:start, mobile:android, build:android:local, bundle:android:release"
    else
      echo "Android SDK off -- enable it with a devenv.local.nix containing { android.enable = true; }"
    fi
  '';

  enterTest = ''
    test:all
  '';

  # See full reference at https://devenv.sh/reference/options/
}
