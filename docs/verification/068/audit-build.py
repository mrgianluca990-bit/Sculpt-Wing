#!/usr/bin/env python3
"""Read-only release audit. Writes its report only into the verification directory.

python3 audit-build.py --report build-audit-preflight.json
python3 audit-build.py --report build-audit-final.json --strict --benchmark benchmark-ui-results.json
This does not run a build, copy assets, modify versions, or claim a macOS build.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--source', default=str(HERE.parent / 'sculpt-wing-068'))
parser.add_argument('--expect-version', default='0.6.8')
parser.add_argument('--report', default='build-audit-preflight.json')
parser.add_argument('--benchmark')
parser.add_argument('--strict', action='store_true')
args = parser.parse_args()
src = Path(args.source).resolve()
issues, checks, versions = [], {}, {}


def check(name, condition, detail=None):
    checks[name] = {'ok': bool(condition), **({'detail': detail} if detail is not None else {})}
    if not condition:
        issues.append(name)


def read(relative):
    path = src / relative
    return path.read_text() if path.is_file() else ''


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


for folder in ['native', 'desktop']:
    package = json.loads(read(f'{folder}/package.json') or '{}')
    lock = json.loads(read(f'{folder}/package-lock.json') or '{}')
    values = [package.get('version'), lock.get('version'), lock.get('packages', {}).get('', {}).get('version')]
    versions[folder] = values
    check(f'{folder}: package and lock version', all(value == args.expect_version for value in values), values)

for relative, pattern in [
    ('desktop/src/preload.cjs', r"version:\s*['\"]([^'\"]+)"),
    ('dist/index.html', r'version-label[^>]*>[^<]*?([0-9]+\.[0-9]+\.[0-9]+)'),
    ('dist/shell.js', r'Sculpt Wing · ([0-9]+\.[0-9]+\.[0-9]+)'),
]:
    match = re.search(pattern, read(relative))
    version = match.group(1) if match else None
    versions[relative] = version
    check(f'{relative}: displayed version', version == args.expect_version, version)


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts, self.styles = [], []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'script' and 'src' in attributes:
            self.scripts.append(attributes['src'].removeprefix('./'))
        if tag == 'link' and attributes.get('rel') == 'stylesheet':
            self.styles.append(attributes.get('href', '').removeprefix('./'))


assets = Assets()
assets.feed(read('dist/index.html'))
missing_html = [p for p in assets.scripts + assets.styles if not (src / 'dist' / p).is_file()]
check('HTML assets exist', not missing_html, missing_html)
for before, after in [('history.js', 'app.js'), ('osc.js', 'systems.js'), ('rta.js', 'plugins.js')]:
    check(f'Load order {before} before {after}', before in assets.scripts and after in assets.scripts and assets.scripts.index(before) < assets.scripts.index(after))
check('RTA stylesheet linked', 'rta.css' in assets.styles)

sw, offline = read('dist/sw.js'), read('dist/offline.js')
sw_match = re.search(r"CACHE_NAME\s*=\s*['\"]([^'\"]+)", sw)
offline_match = re.search(r"VERSION\s*=\s*['\"]([^'\"]+)", offline)
cache_name = sw_match.group(1) if sw_match else None
offline_version = offline_match.group(1) if offline_match else None
check('Offline cache identifiers match', cache_name == offline_version and bool(cache_name), {'serviceWorker': cache_name, 'offline': offline_version})
check('Offline cache differs from 0.6.7', cache_name not in [None, 'sculpt-control-v23'], cache_name)
cache_assets = re.findall(r"\['([^']+)',\s*'(?:html|css|js|json|image|font)'\]", sw)
check('Offline asset table found', bool(cache_assets))
check('RTA assets are cached', all(relative in cache_assets for relative in ['rta.js', 'rta.css']))
missing_cache = [p for p in cache_assets if not (src / 'dist' / p).is_file()]
check('Offline assets exist', not missing_cache, missing_cache)
uncached = sorted(set(assets.scripts + assets.styles) - set(cache_assets))
check('Every HTML script/style is cached', not uncached, uncached)

desktop = json.loads(read('desktop/package.json') or '{}')
mac_targets = desktop.get('build', {}).get('mac', {}).get('target', [])
check('macOS package targets arm64 ZIP', any(item.get('target') == 'zip' and item.get('arch') == ['arm64'] for item in mac_targets if isinstance(item, dict)), mac_targets)
workflow = read('.github/workflows/build-desktop.yml')
check('Workflow explicitly builds ARM64', '--mac zip --arm64' in workflow)
check('Workflow verifies final binary and signature', 'lipo -archs' in workflow and 'codesign --verify' in workflow and 'Signature=adhoc' in workflow)
check('Workflow builds frontend before packaging', 'npm run build --prefix native' in workflow and 'npm run prepare:app' in workflow)

bundle_copies = {}
source_files = [p for p in (src / 'dist').rglob('*') if p.is_file() and p.name != 'index.html' and not p.name.startswith('qa-') and p.suffix not in ['.zip', '.tar', '.gz', '.dmg', '.exe']]
for folder, markers in [
    ('native/dist', ['data-native-bundle="true"']),
    ('desktop/app', ['data-native-bundle="true"', 'data-desktop-bundle="true"', 'Content-Security-Policy']),
    ('native/ios/App/App/public', ['data-native-bundle="true"']),
]:
    target = src / folder
    if not target.is_dir():
        bundle_copies[folder] = {'present': False}
        check(f'{folder}: generated bundle exists', False)
        continue
    missing, different = [], []
    for source in source_files:
        relative = source.relative_to(src / 'dist')
        copy = target / relative
        if not copy.is_file():
            missing.append(relative.as_posix())
        elif sha(copy) != sha(source):
            different.append(relative.as_posix())
    bundle_copies[folder] = {'present': True, 'checked': len(source_files), 'missing': missing, 'different': different}
    check(f'{folder}: source assets match', not missing and not different, bundle_copies[folder])
    html = (target / 'index.html').read_text() if (target / 'index.html').is_file() else ''
    check(f'{folder}: native HTML markers', all(marker in html for marker in markers))
    check(f'{folder}: RTA included in HTML', 'rta.js' in html and 'rta.css' in html)
    generated_assets = Assets()
    generated_assets.feed(html)
    check(f'{folder}: HTML script/style order matches source', generated_assets.scripts == assets.scripts and generated_assets.styles == assets.styles)
    generated_version = re.search(r'version-label[^>]*>[^<]*?([0-9]+\.[0-9]+\.[0-9]+)', html)
    check(f'{folder}: displayed version', bool(generated_version) and generated_version.group(1) == args.expect_version)

if args.benchmark:
    benchmark_path = HERE / args.benchmark
    benchmark = json.loads(benchmark_path.read_text())
    check('Benchmark sources stayed unchanged during run', benchmark.get('changedFilesDuringRun') == [])
    measured = next((item for item in benchmark.get('sourceFiles', []) if item.get('version') == '068'), None)
    differences = []
    if measured:
        for relative, expected in measured.get('sha256', {}).items():
            file = src / 'dist' / relative
            if not file.is_file() or sha(file) != expected:
                differences.append(relative)
    check('Benchmark covers current 0.6.8 JavaScript', measured is not None and not differences, differences)

result = {
    'createdAt': datetime.now(timezone.utc).isoformat(), 'source': str(src), 'expectedVersion': args.expect_version,
    'ok': not issues, 'issues': issues, 'versions': versions, 'cache': cache_name,
    'htmlScripts': assets.scripts, 'htmlStyles': assets.styles, 'cacheAssetCount': len(cache_assets),
    'bundleCopies': bundle_copies, 'checks': checks,
    'scope': 'Read-only source/asset/version audit. No build executed; no macOS binary, launch or hardware result inferred.'
}
report = (HERE / args.report).resolve()
if report.parent != HERE:
    raise SystemExit('Report must remain in wing-068-verification')
report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'report': str(report), 'ok': result['ok'], 'issues': issues}, ensure_ascii=False, indent=2))
if args.strict and issues:
    sys.exit(1)
