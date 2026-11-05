"""Builds the favicons from the union symbol (the share image is make_og_image.cjs).

Run from the front folder:  py -I brand-src/make_assets.py
Needs Pillow (not a project dependency). The symbol comes from src/assets/.
"""
from PIL import Image


CREAM = (255, 244, 224)

symbol = Image.open('src/assets/union-symbol.png').convert('RGBA')


def fit(img, size):
    return img.resize((size, size), Image.LANCZOS)


# favicons: the coloured symbol on transparent (readable on light and dark tabs)
fit(symbol, 32).save('public/favicon-32.png', optimize=True)
fit(symbol, 192).save('public/favicon-192.png', optimize=True)
fit(symbol, 48).save('public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

# apple touch icon: iOS fills transparency with black, so it gets the cream background
icon = Image.new('RGBA', (180, 180), CREAM + (255,))
pad = 18
icon.alpha_composite(fit(symbol, 180 - 2 * pad), (pad, pad))
icon.convert('RGB').save('public/apple-touch-icon.png', optimize=True)

print('done')
