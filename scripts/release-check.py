"""Verify final release ZIP bytes, local documentation links and vendor provenance."""
from pathlib import Path
from zipfile import ZipFile
import hashlib, json, re
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
lock=json.loads((root/'src/vendor/character-reasoner/sync.json').read_text(encoding='utf-8'))
assert lock['sourceDirty'] is False, 'release core must refer to a committed source'
assert re.fullmatch(r'[0-9a-f]{40}',lock['sourceCommit'])
assert hashlib.sha256((root/'src/vendor/character-reasoner/index.js').read_bytes()).hexdigest()==lock['sha256']
for doc in ['README.md','CHANGELOG.md']:
    content=(root/doc).read_text(encoding='utf-8')
    assert not re.search(r'character[ _-]?reasoner|캐릭터[ _-]?리즈너|참[ -]?메모리|charm[ _-]?memory|제작자|개발자\s*모드|디버그|sceneowner', content, re.I), f'{doc}: remove private/developer or unrelated extension details'
    for target in re.findall(r'\]\(([^)]+)\)',content):
        download_prefix='https://raw.githubusercontent.com/bongbong11/-_-/main/'
        if target.startswith(download_prefix):
            assert (root/target.removeprefix(download_prefix)).is_file(), (doc,target)
            continue
        if target.startswith(('https://','http://','#')):continue
        assert (root/target.split('#')[0]).is_file(), (doc,target)
archive_path=root/'downloads'/f"scene-reader-sillytavern-v{manifest['version']}.zip"
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist())==len(set(archive.namelist()))
    for name in archive.namelist():
        relative=Path(name).relative_to('scene-reader')
        assert '..' not in relative.parts
        assert not any(part in ['.git','.github','tests','artifacts','node_modules','docs'] for part in relative.parts), name
        assert archive.read(name)==(root/relative).read_bytes(), name
    assert 'scene-reader/src/vendor/character-reasoner/version.js' in archive.namelist()
    assert 'scene-reader/src/scene/appearance.js' in archive.namelist()
    assert 'scene-reader/src/characters/versions.js' in archive.namelist()
    assert 'scene-reader/src/ui/character-transfer.js' in archive.namelist()
    assert 'scene-reader/src/ui/character-error.js' in archive.namelist()
    assert 'scene-reader/src/scene/intimacy-gate.js' in archive.namelist()
    for required in ['README.md','CHANGELOG.md','src/world/advanced.js','src/world/seasonal.js','src/world/bundled.js','src/ui/toasts.js']:
        assert 'scene-reader/'+required in archive.namelist()
    for pose in ['director','reading','success','warning','error','cover','peek','wave']:
        assert f'scene-reader/assets/toasts/{pose}.webp' in archive.namelist()
    assert 'scene-reader/assets/mascot-face.webp' in archive.namelist()
    assert 'scene-reader/src/ui/mascot.js' in archive.namelist()
    assert not any(name.endswith(('INSTALL.md','MAINTENANCE.md')) for name in archive.namelist())
assert not list(root.glob('AUDIT-*.md')), 'remove stale release audit notes'
assert not (root/'docs/character-phase1-contract.md').exists()
assert not any((root/name).exists() for name in ['INSTALL.md','docs/MAINTENANCE.md'])
assert len(list((root/'downloads').glob('scene-reader-sillytavern-v*.zip')))==1, 'keep only the current installation ZIP'
plugin_version=json.loads((root/'server-plugin/package.json').read_text(encoding='utf-8'))['version']
plugin_files=['package.json','index.cjs','storage.cjs','retrieval-cache.cjs']
with ZipFile(root/'downloads'/f'scene-reader-jev-plugin-v{plugin_version}.zip') as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist())==sorted('scene-reader-jev/'+name for name in plugin_files)
    for name in plugin_files:
        assert archive.read('scene-reader-jev/'+name)==(root/'server-plugin'/name).read_bytes(), name
readme=(root/'README.md').read_text(encoding='utf-8')
for name in [archive_path.name, f'scene-reader-jev-plugin-v{plugin_version}.zip']:
    assert 'https://raw.githubusercontent.com/bongbong11/-_-/main/downloads/'+name in readme
print(f"Release distribution passed: {manifest['version']}, committed canonical core, current files, valid docs, install-only archive.")
