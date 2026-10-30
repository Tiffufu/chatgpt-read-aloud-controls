#!/usr/bin/env python3
"""Build a reproducible unpacked-extension ZIP using only Python's standard library."""
import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
FOLDER = 'chatgpt-read-aloud-controls'


def package(output):
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    paths = {Path(name) for name in (
        'manifest.json', 'INSTALL.md', 'LICENSE', 'CREDITS.md',
        'THIRD_PARTY_NOTICES.md', 'PRIVACY.md',
    )}
    paths.update(path.relative_to(ROOT) for path in (ROOT / 'src').rglob('*')
                 if path.is_file() and path.suffix in {'.js', '.css', '.html'})
    icons = set(manifest['icons'].values()) | set(manifest['action']['default_icon'].values())
    paths.update(Path(name) for name in icons)
    required = {manifest['action']['default_popup'], *icons}
    for script in manifest['content_scripts']:
        required.update(script.get('js', []))
        required.update(script.get('css', []))
    for name in required:
        if Path(name) not in paths:
            raise ValueError(f'Manifest asset missing from package: {name}')
    for path in paths:
        source = ROOT / path
        if not source.is_file() or source.is_symlink() or ROOT not in source.resolve().parents:
            raise ValueError(f'Invalid package source: {path}')
    output = output.resolve()
    if any(output == (ROOT / path).resolve() for path in paths):
        raise ValueError('Output must not overwrite a package source')
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w') as archive:
        for path in sorted(paths):
            entry = ZipInfo(f'{FOLDER}/{path.as_posix()}', date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, (ROOT / path).read_bytes())
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity check failed')
        packaged = json.loads(archive.read(f'{FOLDER}/manifest.json'))
        assert packaged['version'] == manifest['version']
    print(f'Created {output.name}: v{manifest["version"]}, {len(paths)} files, {output.stat().st_size:,} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist' / f'{FOLDER}-unpacked.zip')
    package(parser.parse_args().output)
