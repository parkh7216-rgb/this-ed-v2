#!/bin/sh
set -eu
mkdir -p dist
cp index.html style.css app.js question-data.js extra-questions.js scan-passage-questions.js config.js sw.js manifest.webmanifest manus-routes.json apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png dist/
