# Sculpt Wing desktop — third-party notices

## Mozilla PDF.js

The local PDF channel-list reader embeds `pdfjs-dist` version 6.5.438, published
by the Mozilla PDF.js project at https://github.com/mozilla/pdf.js. PDF parsing
uses a worker packaged with the application. The Apache License 2.0 and PDF.js
copyright notice are included in `LICENSE-PDFJS.txt` beside the app assets.
Third-party notices retained by the upstream distribution are also preserved in
the generated `pdf-reader.js` and `pdf.worker.js` bundles.

## Electron, Chromium and Node.js

The packaged Electron runtime includes its own license and third-party notices (`LICENSE.electron.txt` and `LICENSES.chromium.html` on Windows, and the corresponding runtime resources inside the macOS application bundle). Those files are retained by the packaging process.

## Capacitor Core

The shared `native-bridge.js` bundle includes Capacitor Core.

```text
MIT License

Copyright (c) 2017-present Drifty Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
