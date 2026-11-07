"""Writes assets/fonts/AtlasSans-{Regular,SemiBold,Bold}.ttf: static, Latin-subset instances of the
variable Noto Sans (SIL OFL 1.1, see assets/fonts/OFL.txt), renamed "Atlas Sans" as the OFL asks of
a modified version. GPUI's text system on Linux does not apply a variable font's weight axis, so the
app ships the weights it uses. Run with fonttools:

  nix shell nixpkgs#python3Packages.fonttools -c python3 crates/atlas-todo-gpui/scripts/fonts.py \\
    "$(nix build --no-link --print-out-paths nixpkgs#noto-fonts)/share/fonts/noto/NotoSans.ttf"
"""

import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"
WEIGHTS = {"Regular": 400, "SemiBold": 600, "Bold": 700}
# Basic Latin, Latin-1, Latin Extended-A/B, general punctuation, currency, arrows, minus.
UNICODES = [*range(0x20, 0x250), *range(0x2000, 0x2070), *range(0x20A0, 0x20C0), *range(0x2190, 0x2200), 0x2212]


def build(source: str, style: str, weight: int) -> None:
    font = instantiateVariableFont(TTFont(source), {"wght": weight, "wdth": 100}, static=True)
    options = Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    names = font["name"]
    for rec in list(names.names):
        if rec.nameID in (16, 17, 21, 22, 25):
            names.removeNames(nameID=rec.nameID)
    family, full, ps = "Atlas Sans", f"Atlas Sans {style}", f"AtlasSans-{style}"
    names.setName(family, 1, 3, 1, 0x409)
    names.setName("Regular" if style == "Regular" else style, 2, 3, 1, 0x409)
    names.setName(full, 4, 3, 1, 0x409)
    names.setName(ps, 6, 3, 1, 0x409)
    names.setName(family, 16, 3, 1, 0x409)
    names.setName(style, 17, 3, 1, 0x409)
    font["OS/2"].usWeightClass = weight
    font.save(OUT / f"{ps}.ttf")
    print(f"wrote {ps}.ttf")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for style, weight in WEIGHTS.items():
        build(sys.argv[1], style, weight)
