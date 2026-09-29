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
for doc in ['README.md','INSTALL.md','CHANGELOG.md']:
    content=(root/doc).read_text(encoding='utf-8')
    for target in re.findall(r'\]\(([^)]+)\)',content):
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
assert not list(root.glob('AUDIT-*.md')), 'remove stale release audit notes'
assert not (root/'docs/character-phase1-contract.md').exists()
print(f"Release distribution passed: {manifest['version']}, committed canonical core, current files, valid docs, install-only archive.")
