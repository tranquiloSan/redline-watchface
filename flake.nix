{
  description = "REDLINE Zepp OS watch face – temporary dev environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # zeus-cli isn't in nixpkgs, so it is npm-installed into ./.nix-npm (project-local, gitignored)
      zeusHook = ''
        export NPM_CONFIG_PREFIX="$PWD/.nix-npm"
        export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
        if ! command -v zeus >/dev/null 2>&1; then
          echo "Installing @zeppos/zeus-cli into ./.nix-npm ..."
          npm install -g @zeppos/zeus-cli >/dev/null
        fi
        echo "zeus $(zeus --version 2>/dev/null | tail -1) ready — try: zeus preview"
      '';
    in
    {
      devShells = forAll (pkgs: {
        # nix develop        → build / preview / install the watch face
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 ];
          shellHook = zeusHook;
        };

        # nix develop .#assets   → re-render the PNG assets after editing tools/studio.html
        assets = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            (pkgs.python3.withPackages (ps: [ ps.playwright ps.pillow ]))
          ];
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          shellHook = zeusHook + ''
            echo "assets: python tools/gen.py assets/default.r/images && python tools/preview.py docs/preview.png"
          '';
        };
      });
    };
}
