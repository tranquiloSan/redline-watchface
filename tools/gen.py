import sys, os
from playwright.sync_api import sync_playwright

out = sys.argv[1]  # .../assets/default.r/images
here = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(device_scale_factor=1)
    pg.goto('file://' + os.path.join(here, 'studio.html'))
    pg.evaluate('document.fonts.load("700 20px BC")')
    pg.evaluate('document.fonts.load("italic 700 20px BC")')
    pg.evaluate('document.fonts.load("600 20px BC")')
    pg.wait_for_timeout(500)
    names = pg.evaluate('window.ASSETS')
    for n in names:
        pg.evaluate(f'renderAsset({n!r})')
        path = os.path.join(out, n + '.png')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        pg.locator('#stage svg').screenshot(path=path, omit_background=True)
    print(len(names), 'assets')
    b.close()
