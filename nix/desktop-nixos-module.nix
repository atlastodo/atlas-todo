# programs.atlas-desktop — install and configure the Atlas Todo desktop application on NixOS.
{ config, lib, ... }:

let
  cfg = config.programs.atlas-desktop;
in
{
  options.programs.atlas-desktop = {
    enable = lib.mkEnableOption "Atlas Todo desktop application";

    package = lib.mkOption {
      type = lib.types.package;
      defaultText = lib.literalExpression "atlas-todo.packages.\${system}.atlas-desktop";
      description = "The Atlas Todo desktop package to install.";
    };

    checkUpdates = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to allow Atlas Todo to check for updates online. Disabled by default on NixOS.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
  };
}
