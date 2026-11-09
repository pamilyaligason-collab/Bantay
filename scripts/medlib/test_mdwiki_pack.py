"""Run: python -m unittest scripts/medlib/test_mdwiki_pack.py  (needs libzim; Pillow optional).
Builds a tiny synthetic ZIM, packs it, checks the pack. Also writes scripts/medlib/fixtures/mini.pack, which the client tests read."""
import importlib.util
import os
import tempfile
import unittest

from libzim.writer import Creator, Hint, Item, StringProvider

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mdwiki_pack', os.path.join(HERE, 'mdwiki-pack.py'))
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)

PAGES = {
    'Hypertension': ('Hypertension', '<html><head><title>x</title></head><body><h1>Hypertension</h1><p>High blood pressure is common.<sup class="reference">[1]</sup></p><h2>Treatment</h2><ul><li>Salt less</li><li>Walk daily</li></ul><div class="navbox">NAV JUNK</div><h2>See also</h2></body></html>'),
    'Diabetes mellitus': ('Diabetes mellitus', '<html><body><p>Diabetes raises blood sugar.</p><p>See <a href="Hypertension">Hypertension</a>.</p></body></html>'),
    'Empty': ('Empty', '<html><body><h1>Empty</h1></body></html>'),
}


class Page(Item):
    def __init__(self, path, title, html):
        super().__init__()
        self.path, self.title, self.html = path, title, html

    def get_path(self): return self.path
    def get_title(self): return self.title
    def get_mimetype(self): return 'text/html'
    def get_contentprovider(self): return StringProvider(self.html)
    def get_hints(self): return {Hint.FRONT_ARTICLE: True}


def make_zim(path):
    with Creator(path).config_indexing(False, 'eng').set_mainpath('Hypertension') as c:
        for k, (t, h) in PAGES.items():
            c.add_item(Page(k, t, h))
        c.add_redirection('HTN', 'Hypertension alias', 'Hypertension', {Hint.FRONT_ARTICLE: False})
        for k, v in {'Title': 'mdwiki test', 'Language': 'eng', 'Creator': 'test', 'Publisher': 'test', 'Description': 'd', 'Name': 'test'}.items():
            c.add_metadata(k, v)


class PackTest(unittest.TestCase):
    def test_pack(self):
        with tempfile.TemporaryDirectory() as d:
            zim, out = os.path.join(d, 't.zim'), os.path.join(d, 't.pack')
            make_zim(zim)
            header, size = mp.build(zim, out, built='2026-11-01')  # pinned so the committed fixture never changes on a rerun
            self.assertEqual(size, os.path.getsize(out))
            self.assertEqual((header['articles'], header['images']), (2, 0))  # the redirect and the empty page are skipped
            self.assertEqual(header['changes'], 'converted to plain text; citations, navigation boxes and edit links removed')
            self.assertEqual(header['licence'], 'CC BY-SA 4.0')
            h, index, get = mp.read_pack(out)
            self.assertEqual(sorted(r[0] for r in index), ['Diabetes mellitus', 'Hypertension'])
            a = get('Hypertension')
            self.assertEqual(a['text'], 'High blood pressure is common.\n\n## Treatment\n- Salt less\n- Walk daily')  # no [1], no navbox, no empty trailing heading
            self.assertEqual(a['url'], 'https://mdwiki.org/wiki/Hypertension')
            self.assertEqual(get('Diabetes mellitus')['url'], 'https://mdwiki.org/wiki/Diabetes_mellitus')
            self.assertEqual(dict((r[0], r[4]) for r in index)['Diabetes mellitus'], 'Diabetes raises blood sugar.')
            with open(os.path.join(HERE, 'fixtures', 'mini.pack'), 'wb') as f, open(out, 'rb') as g:
                f.write(g.read())

    def test_furniture_dropped(self):
        html = '<body><table class="infobox"><tr><td>CAS Number 22007048</td></tr></table><div class="hatnote navigation-not-searchable">For other uses see X</div><p>Dengue is spread by mosquitoes.</p><div class="mw-references-wrap">REF</div><div class="zim-footer">Kiwix</div></body>'
        self.assertEqual(mp.html_to_text(html)[0], 'Dengue is spread by mosquitoes.')

    def test_limit(self):
        with tempfile.TemporaryDirectory() as d:
            zim, out = os.path.join(d, 't.zim'), os.path.join(d, 't.pack')
            make_zim(zim)
            self.assertEqual(mp.build(zim, out, limit=1)[0]['articles'], 1)


if __name__ == '__main__':
    unittest.main()
