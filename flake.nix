{
  description = "Atlas Todo app: the desktop app, the web app build, and the desktop NixOS & Home Manager modules";

  # The sync server and its NixOS module (services.atlas-todo) are in the core repository:
  # use `github:atlastodo/atlas` as the input for those. This flake re-exports nothing of it.

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      bun2nix,
    }:
    let
      lib = nixpkgs.lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;

      # The root package.json is the single source of truth: version:bump keeps every manifest in
      # lockstep with it, so no bump step is needed here.
      version = (builtins.fromJSON (builtins.readFile ./package.json)).version;

      # Adds atlas-web-dist and atlas-desktop to a package set.
      overlay = final: _prev: {
        atlas-web-dist = final.callPackage ./nix/packages/web-dist.nix {
          inherit version;
          bun2nix = bun2nix.packages.${final.stdenv.hostPlatform.system}.default;
        };
        atlas-desktop = final.callPackage ./nix/packages/atlas-desktop.nix {
          inherit version;
          bun2nix = bun2nix.packages.${final.stdenv.hostPlatform.system}.default;
          # nixpkgs' electron, or a pinned newer release while nixpkgs lacks a security fix.
          electron = final.callPackage ./nix/electron.nix { };
        };
      };

      pkgsFor = system: nixpkgs.legacyPackages.${system}.extend overlay;

      # Wraps a module file so its `package` defaults to this flake's build.
      withPackage =
        file: optionPath: name:
        { lib, pkgs, ... }:
        {
          imports = [ file ];
          config = lib.setAttrByPath (optionPath ++ [ "package" ]) (
            lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.${name}
          );
        };
    in
    {
      overlays.default = overlay;

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          inherit (pkgs) atlas-desktop;
          # The web app built from source with no API URL baked in: users type their server on the
          # sign-in screen. A core server serves it as services.atlas-todo.staticDir.
          web-dist = pkgs.atlas-web-dist;
          default = pkgs.atlas-desktop;
        }
      );

      nixosModules = rec {
        # programs.atlas-desktop
        desktop = withPackage ./nix/desktop-nixos-module.nix [
          "programs"
          "atlas-desktop"
        ] "atlas-desktop";
        atlas-desktop = desktop;
        default = desktop;
      };

      homeManagerModules = rec {
        desktop = withPackage ./nix/desktop-home-manager-module.nix [
          "programs"
          "atlas-desktop"
        ] "atlas-desktop";
        atlas-desktop = desktop;
        default = desktop;
      };

      checks = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          inherit (self.packages.${system}) atlas-desktop web-dist;

          home-manager-module-eval =
            let
              eval = lib.evalModules {
                specialArgs = { inherit pkgs; };
                modules = [
                  {
                    options.home.packages = lib.mkOption {
                      type = lib.types.listOf lib.types.package;
                      default = [ ];
                    };
                  }
                  self.homeManagerModules.default
                  { programs.atlas-desktop.enable = true; }
                ];
              };
            in
            pkgs.runCommand "hm-module-eval-test" { } ''
              echo "HM Desktop package: ${builtins.elemAt eval.config.home.packages 0}"
              touch "$out"
            '';
        }
      );
    };
}
