{
  description = "Atlas Todo: local-first todo & tasks — server and desktop NixOS & Home Manager modules";

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

      # The workspace version is the single source of truth: version:bump keeps
      # Cargo.toml in lockstep with package.json, so no bump step is needed here.
      version = (builtins.fromTOML (builtins.readFile ./Cargo.toml)).workspace.package.version;

      # Adds atlas-server, atlas-web-dist and atlas-desktop to a package set.
      overlay = final: _prev: {
        atlas-server = final.callPackage ./nix/packages/atlas-server.nix { inherit version; };
        atlas-web-dist = final.callPackage ./nix/packages/web-dist.nix {
          inherit version;
          bun2nix = bun2nix.packages.${final.stdenv.hostPlatform.system}.default;
        };
        atlas-desktop = final.callPackage ./nix/packages/atlas-desktop.nix {
          inherit version;
          bun2nix = bun2nix.packages.${final.stdenv.hostPlatform.system}.default;
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
          inherit (pkgs) atlas-server atlas-desktop;
          web-dist = pkgs.atlas-web-dist;
          default = pkgs.atlas-server;
        }
      );

      nixosModules = rec {
        # services.atlas-todo
        server = withPackage ./nix/server-module.nix [ "services" "atlas-todo" ] "atlas-server";
        atlas-todo = server;

        # programs.atlas-desktop
        desktop = withPackage ./nix/desktop-nixos-module.nix [
          "programs"
          "atlas-desktop"
        ] "atlas-desktop";
        atlas-desktop = desktop;

        default = {
          imports = [
            server
            desktop
          ];
        };
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
          inherit (self.packages.${system}) atlas-server atlas-desktop web-dist;

          # Boots a VM with the server module and exercises it end to end.
          server-vm = pkgs.testers.runNixOSTest (
            import ./nix/tests/server.nix {
              module = self.nixosModules.default;
              webDist = self.packages.${system}.web-dist;
            }
          );

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
