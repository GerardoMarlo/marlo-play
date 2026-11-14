"""Rebuild outlined wordmarks with FontTools: python -m pip install fonttools brotli."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.tmp-logo-tools'))
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

root = Path(__file__).resolve().parents[1]
out = root / 'public/brand'
out.mkdir(parents=True, exist_ok=True)
def letters(text, family, weight, size, x, y, spacing=0):
    f = TTFont(root / f'node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff')
    gs, cmap = f.getGlyphSet(), f.getBestCmap()
    scale = size / f['head'].unitsPerEm
    paths = []
    for char in text:
        name = cmap[ord(char)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
        paths.append(f'<path d="{pen.getCommands()}"/>')
        x += gs[name].width * scale + spacing
    return ''.join(paths)

# Faithful vectorization of the user-approved image, kept as a source asset.
def mark():
    return (root / 'assets-originals/marlo-approved-path.svg').read_text()
word = letters('marlo', 'fraunces', 800, 73, 187, 82) + letters('games', 'dm-sans', 600, 20, 191, 112, 5)
def svg(content, box, color):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" color="{color}"><title>Marlo Games</title>{content}</svg>'
for name, color in [('ink','#28251f'),('pumpkin','#bd512b'),('white','#ffffff'),('black','#000000')]:
    (out / f'marlo-icon-{name}.svg').write_text(svg(mark(),'0 0 192 136',color))
    (out / f'marlo-logo-{name}.svg').write_text(svg(mark()+f'<g fill="currentColor">{word}</g>','0 0 420 136',color))
(out / 'favicon.svg').write_text(svg('<rect width="192" height="192" rx="40" fill="#fff8ea"/><g transform="translate(0 28)">'+mark()+'</g>','0 0 192 192','#28251f'))
print('Generated SVG assets with outlined typography.')







