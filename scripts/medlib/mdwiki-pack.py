#!/usr/bin/env python3
"""Build the optional 'Full medical library' offline pack from an mdwiki Kiwix ZIM (D-158).

  python scripts/medlib/mdwiki-pack.py mdwiki_en_all_maxi_YYYY-MM.zim medlib-mdwiki.pack [--images] [--limit N]

Needs `pip install libzim` (Pillow too, only for --images). Format and licence notes: README-mdwiki.md.
Pack layout (all integers little-endian):
  b'BMDW1\\n' | u32 header_len | header JSON | u32 index_len | index JSON | body
  index = [[key, title, offset, length, lead], ...]; offset is relative to the start of the body.
  body = one gzip member per article (JSON {key,title,url,text,image?}), so one article is one Range read.
Text is mdwiki's article text converted from HTML to plain text; nothing else is changed (the header says so).
"""
import argparse
import base64
import gzip
import io
import json
import os
import posixpath
import struct
import sys
import tempfile
import time
from html.parser import HTMLParser
from urllib.parse import quote, unquote

MAGIC = b'BMDW1\n'
SKIP_TAGS = {'script', 'style', 'head', 'nav', 'noscript'}
# citation numbers, edit links, navigation boxes, data boxes (infobox: CAS, SMILES, InChI ...), hatnotes, reference lists,
# interactive sliders and the Kiwix footer are page furniture, not article text
SKIP_CLASSES = {'reference', 'mw-editsection', 'navbox', 'reflist', 'noprint', 'infobox', 'hatnote', 'mw-references-wrap', 'refbegin', 'OWIDSlider', 'zim-footer'}
BLOCK = {'p', 'div', 'li', 'br', 'tr', 'ul', 'ol', 'blockquote', 'table', 'section', 'dt', 'dd'}
HEADINGS = {'h2', 'h3', 'h4', 'h5', 'h6'}
VOID = {'br', 'img', 'hr', 'meta', 'link', 'input', 'wbr', 'col', 'source'}
SOURCE = 'https://mdwiki.org/wiki/'


class _Text(HTMLParser):
    """HTML to plain text: headings become '## Heading' lines, list items '- item'."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines, self.buf, self.skip, self.head, self.h1, self.first_img = [], [], [], None, False, None

    def _flush(self):
        s = ' '.join(''.join(self.buf).split())
        self.buf = []
        if s:
            self.lines.append(s)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.skip:
            if tag not in VOID:
                self.skip.append(tag)
            return
        if tag in SKIP_TAGS or SKIP_CLASSES & set((a.get('class') or '').split()):
            if tag not in VOID:
                self.skip.append(tag)
            return
        if tag == 'img' and self.first_img is None and a.get('src'):
            self.first_img = a
        if tag == 'h1':
            self.h1 = True
        elif tag in HEADINGS:
            self._flush()
            self.lines.append('')
            self.head = tag
            self.buf.append('## ')
        elif tag in BLOCK:
            self._flush()
            if tag == 'li':
                self.buf.append('- ')
        elif tag in ('td', 'th'):
            self.buf.append(' ')

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
            return
        if tag == 'h1':
            self.h1 = False
        elif tag == self.head:
            self.head = None
            self._flush()
        elif tag in BLOCK:
            self._flush()

    def handle_data(self, data):
        if not self.skip and not self.h1:
            self.buf.append(data)


def html_to_text(html):
    p = _Text()
    p.feed(html)
    p.close()
    p._flush()
    out, prev_blank = [], True
    for ln in p.lines:
        if ln == '':
            if not prev_blank:
                out.append('')
            prev_blank = True
        else:
            out.append(ln)
            prev_blank = False
    # a heading with nothing under it (end of article) carries no information
    while out and (out[-1] == '' or out[-1].startswith('## ')):
        out.pop()
    return '\n'.join(out).strip(), p.first_img


def make_image(archive, entry_path, img, max_kb):
    """First picture of the article as base64 webp <= max_kb, or None. Needs Pillow unless the file already is a small webp."""
    src = unquote((img.get('src') or '').split('?')[0])
    if not src or src.startswith('data:') or src.lower().endswith('.svg'):
        return None
    path = posixpath.normpath(posixpath.join(posixpath.dirname(entry_path), src)).lstrip('/')
    try:
        item = archive.get_entry_by_path(path).get_item()
    except KeyError:
        return None
    raw = bytes(item.content)
    if item.mimetype == 'image/webp' and len(raw) <= max_kb * 1024:
        return base64.b64encode(raw).decode()
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(raw))
        if min(im.size) < 80:  # icons and badges
            return None
        im = im.convert('RGB')
        im.thumbnail((360, 360))
        for q in (75, 55, 35):
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=q)
            if buf.tell() <= max_kb * 1024:
                return base64.b64encode(buf.getvalue()).decode()
    except Exception:  # an unreadable picture is skipped, never fatal
        return None
    return None


CHANGES = 'converted to plain text; citations, navigation boxes and edit links removed'


def build(zim_path, out_path, images=False, limit=None, max_image_kb=30, built=None):
    from libzim.reader import Archive
    arc = Archive(zim_path)
    body = tempfile.TemporaryFile()
    index, seen, n_img, off = [], set(), 0, 0
    for i in range(arc.all_entry_count):
        if limit and len(index) >= limit:
            break
        e = arc.get_entry_by_id(i)
        if e.is_redirect:
            continue
        item = e.get_item()
        if not item.mimetype.startswith('text/html'):
            continue
        key = e.path[2:] if e.path.startswith('A/') else e.path
        if key in seen:
            continue
        text, img = html_to_text(bytes(item.content).decode('utf-8', 'replace'))
        if not text:
            continue
        seen.add(key)
        title = (e.title or key).strip()
        rec = {'key': key, 'title': title, 'url': SOURCE + quote(key.replace(' ', '_'), safe='/_(),:'), 'text': text}
        if images and img:
            b = make_image(arc, e.path, img, max_image_kb)
            if b:
                rec['image'] = b
                n_img += 1
        blob = gzip.compress(json.dumps(rec, ensure_ascii=False, separators=(',', ':')).encode(), 9, mtime=0)
        body.write(blob)
        index.append([key, title, off, len(blob), text.split('\n', 1)[0][:160]])
        off += len(blob)
    header = {
        'format': 'bantay-mdwiki-pack', 'version': 1, 'built': built or time.strftime('%Y-%m-%d', time.gmtime()),
        'source': 'mdwiki', 'sourceUrl': 'https://mdwiki.org/', 'zim': os.path.basename(zim_path),
        'licence': 'CC BY-SA 4.0', 'licenceUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'changes': CHANGES,
        'credit': 'Text from mdwiki.org (WikiProject Med), licensed CC BY-SA 4.0. Changes: ' + CHANGES + '.',
        'articles': len(index), 'images': n_img,
    }
    h = json.dumps(header, ensure_ascii=False).encode()
    ix = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode()
    body.seek(0)
    with open(out_path, 'wb') as f:
        f.write(MAGIC + struct.pack('<I', len(h)) + h + struct.pack('<I', len(ix)) + ix)
        while chunk := body.read(1 << 20):
            f.write(chunk)
    body.close()
    return header, os.path.getsize(out_path)


def read_pack(path):
    """(header, index, get) where get(key) -> article dict. Used by the tests and for checking a built pack."""
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:6] == MAGIC, 'not a Bantay mdwiki pack'
    hl = struct.unpack_from('<I', data, 6)[0]
    header = json.loads(data[10:10 + hl])
    il = struct.unpack_from('<I', data, 10 + hl)[0]
    start = 14 + hl
    index = json.loads(data[start:start + il])
    base = start + il
    by_key = {r[0]: r for r in index}

    def get(key):
        r = by_key[key]
        return json.loads(gzip.decompress(data[base + r[2]:base + r[2] + r[3]]))
    return header, index, get


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('zim')
    ap.add_argument('out')
    ap.add_argument('--images', action='store_true', help='add one small webp (<= --max-image-kb) per article where there is one')
    ap.add_argument('--max-image-kb', type=int, default=30)
    ap.add_argument('--limit', type=int, help='stop after N articles (for trials)')
    a = ap.parse_args(argv)
    header, size = build(a.zim, a.out, a.images, a.limit, a.max_image_kb)
    print(f"{a.out}: {header['articles']} articles, {header['images']} images, {size} bytes ({size / 1048576:.1f} MB)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
