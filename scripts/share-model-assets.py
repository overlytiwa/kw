"""Externalize repeated GLB resources without changing geometry or image bytes."""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
OUT = ROOT / 'models-shared'
OUT.mkdir(exist_ok=True)
(ROOT / 'textures-shared').mkdir(exist_ok=True)
(ROOT / 'geometry-shared').mkdir(exist_ok=True)
manifest = []

for source in sorted((ROOT / 'models').glob('*.glb')):
    blob = source.read_bytes()
    json_length = struct.unpack_from('<I', blob, 12)[0]
    scene = json.loads(blob[20:20 + json_length])
    binary_offset = 28 + json_length
    old_views = scene['bufferViews']
    image_views = {image['bufferView'] for image in scene['images']}
    views, remap, geometry = [], {}, bytearray()
    for old_index, old in enumerate(old_views):
        if old_index in image_views:
            continue
        while len(geometry) % 4:
            geometry.append(0)
        new = dict(old)
        new['buffer'] = 0
        new['byteOffset'] = len(geometry)
        start = binary_offset + old.get('byteOffset', 0)
        geometry.extend(blob[start:start + old['byteLength']])
        remap[old_index] = len(views)
        views.append(new)
    for accessor in scene['accessors']:
        if 'bufferView' in accessor:
            accessor['bufferView'] = remap[accessor['bufferView']]
        assert 'sparse' not in accessor
    geometry_hash = hashlib.sha256(geometry).hexdigest()
    geometry_name = geometry_hash[:20] + '.bin'
    (ROOT / 'geometry-shared' / geometry_name).write_bytes(geometry)
    scene['bufferViews'] = views
    scene['buffers'] = [{'uri': '../geometry-shared/' + geometry_name, 'byteLength': len(geometry)}]
    schema = json.dumps([views, scene['accessors']], sort_keys=True).encode()
    geometry_key = hashlib.sha256(geometry + schema).hexdigest()
    for root_scene in scene['scenes']:
        root_scene.setdefault('extras', {})['archiveGeometryKey'] = geometry_key
    image_keys = []
    for image in scene['images']:
        view = old_views[image['bufferView']]
        start = binary_offset + view.get('byteOffset', 0)
        encoded = blob[start:start + view['byteLength']]
        digest = hashlib.sha256(encoded).hexdigest()
        extension = '.jpg' if image['mimeType'] == 'image/jpeg' else '.png'
        cover = ROOT / 'covers' / (source.name[:2] + '.jpg')
        if extension == '.jpg' and cover.read_bytes() == encoded:
            uri = '../covers/' + cover.name
            image_key = 'album:' + source.name[:2] + ':' + digest
        else:
            name = digest[:20] + extension
            (ROOT / 'textures-shared' / name).write_bytes(encoded)
            uri = '../textures-shared/' + name
            image_key = 'shared:' + digest
        image.clear()
        image.update({'uri': uri, 'name': image_key})
        image_keys.append(image_key)
    for texture in scene['textures']:
        texture['name'] = image_keys[texture['source']]
    destination = OUT / source.with_suffix('.gltf').name
    destination.write_text(json.dumps(scene, separators=(',', ':')), encoding='utf-8')
    manifest.append({'source': source.name, 'optimized': destination.name, 'geometry': geometry_key, 'images': image_keys})

(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('Exported', len(manifest), 'models with byte-identical geometry and images.')
print('Shared geometry files:', len(list((ROOT / 'geometry-shared').glob('*'))))
print('Shared surface images:', len(list((ROOT / 'textures-shared').glob('*'))))
