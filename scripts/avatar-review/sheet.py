import sys
from PIL import Image, ImageDraw, ImageFont
pre, out = sys.argv[1], sys.argv[2]
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 22)
W,H=240,400
grid=Image.new('RGB',(W*5+60,H*5+40),(11,11,12)); d=ImageDraw.Draw(grid)
for mi,m in enumerate(range(5,0,-1)):
    d.text((8,40+mi*H+H//2),f'M{m}',fill=(200,200,200),font=font)
    for f in range(1,6):
        grid.paste(Image.open(f'{pre}_F{f}M{m}.png'),(60+(f-1)*W,40+mi*H))
for f in range(1,6): d.text((60+(f-1)*W+W//2-15,6),f'F{f}',fill=(200,200,200),font=font)
grid.save(out+'_grid.png')
rows=[('정면',0),('옆',1.5708),('뒤',3.1416)]
g2=Image.new('RGB',(W*5+80,H*3+40),(11,11,12)); d=ImageDraw.Draw(g2)
for ri,(n,y) in enumerate(rows):
    d.text((8,40+ri*H+H//2),n,fill=(200,200,200),font=font)
    for f in range(1,6): g2.paste(Image.open(f'{pre}_F{f}M3_y{y}.png'),(80+(f-1)*W,40+ri*H))
for f in range(1,6): d.text((80+(f-1)*W+W//2-15,6),f'F{f}',fill=(200,200,200),font=font)
g2.save(out+'_views.png')
