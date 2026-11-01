# Third-party notices — local handwriting recognition

Air Ink loads the Hanzi Lookup WebAssembly recognizer in a browser Web Worker.

- Project: https://github.com/gugray/hanzi_lookup
- Pinned upstream revision: 01f90c3ab99a8fadf0696c28e5eb097223c500db
- Runtime assets: https://cdn.jsdelivr.net/gh/gugray/hanzi_lookup@01f90c3ab99a8fadf0696c28e5eb097223c500db/web_demo/
- Recognizer source license: GNU Lesser General Public License v3.0 (LGPL-3.0).
- Character data/fonts license: Arphic Public License (APL).

Handwriting stroke coordinates are sent only to the local browser Web Worker; they are not sent to the recognizer CDN or this website's backend. The upstream repository and license texts remain authoritative:

- LGPL-3.0: https://github.com/gugray/hanzi_lookup/blob/master/LICENSE
- Arphic Public License: https://github.com/gugray/hanzi_lookup/blob/master/LICENSE-APL
