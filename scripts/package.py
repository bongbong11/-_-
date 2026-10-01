"""Build install-only ZIPs from an explicit runtime allowlist. Python standard library only."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, hashlib, re, argparse
root = Path(__file__).resolve().parents[1]
version = json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
plugin_version = json.loads((root/'server-plugin/package.json').read_text(encoding='utf-8'))['version']
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, default=root/'downloads')
out = parser.parse_args().output_dir
out.mkdir(parents=True, exist_ok=True)
runtime = sorted(root.glob('*.js')) + sorted((root/'src').rglob('*.js'))
runtime += sorted((root/'src/vendor').rglob('sync.json'))
runtime += [root/p for p in ['manifest.json','package.json','style.css','README.md','CHANGELOG.md']]
plugin = [root/'server-plugin'/p for p in ['index.cjs','storage.cjs','retrieval-cache.cjs','package.json']]
for name, prefix, paths in [(f'scene-reader-sillytavern-v{version}.zip','scene-reader',runtime+plugin), (f'scene-reader-jev-plugin-v{plugin_version}.zip','scene-reader-jev',plugin)]:
    target=out/name
    with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=9) as archive:
        for file in paths:
            relative=file.relative_to(root/'server-plugin' if prefix.endswith('-jev') else root)
            archive.write(file,(Path(prefix)/relative).as_posix())
    with ZipFile(target) as archive:
        assert archive.testzip() is None
        names=set(archive.namelist())
        assert not any('/tests/' in n or '/artifacts/' in n or '.git/' in n or 'secrets.json' in n for n in names)
        for file in paths:
            relative=file.relative_to(root/'server-plugin' if prefix.endswith('-jev') else root)
            assert archive.read((Path(prefix)/relative).as_posix())==file.read_bytes()
        for file in plugin:
            if file.suffix!='.cjs':continue
            for spec in re.findall(r"require\(['\"](\.[^'\"]+)['\"]\)",file.read_text(encoding='utf-8')):
                dependency=(file.parent/spec).resolve()
                relative=dependency.relative_to(root/'server-plugin' if prefix.endswith('-jev') else root)
                assert (Path(prefix)/relative).as_posix() in names, spec
        if prefix=='scene-reader':
            for file in runtime:
                if file.suffix!='.js':continue
                for spec in re.findall(r"(?:from\s+|import\s*)['\"]([^'\"]+)['\"]",file.read_text(encoding='utf-8')):
                    if not spec.startswith('.'):continue
                    dependency=(file.parent/spec).resolve()
                    if dependency.is_relative_to(root):assert (Path(prefix)/dependency.relative_to(root)).as_posix() in names, spec
        print(f'{name}: {len(names)} files, {target.stat().st_size:,} bytes, SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}')
