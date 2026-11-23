import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("download_model", "src/native/download-model.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
weights = b"test safetensors weights"
manifest = {"Code": 200, "Data": {"Files": [{"Type": "blob", "Path": "model.safetensors", "Size": len(weights), "Sha256": hashlib.sha256(weights).hexdigest()}]}}

with tempfile.TemporaryDirectory() as folder:
    destination = Path(folder)
    def request(url):
        return io.BytesIO(json.dumps(manifest).encode() if "/repo/files?" in url else weights)
    with patch.object(helper, "request", side_effect=request):
        helper.modelscope_download(helper.DEFAULT_MODEL, destination)
        assert (destination / "model.safetensors").read_bytes() == weights
        helper.modelscope_download(helper.DEFAULT_MODEL, destination)
    (destination / "model.safetensors").unlink()
    with patch.object(helper, "request", side_effect=lambda url: io.BytesIO(json.dumps(manifest).encode() if "/repo/files?" in url else b"corrupt")):
        try:
            helper.modelscope_download(helper.DEFAULT_MODEL, destination)
            raise AssertionError("Corrupt weights were accepted")
        except RuntimeError as error:
            assert "checksum" in str(error)
    assert not (destination / "model.safetensors.partial").exists()
    manifest["Data"]["Files"][0]["Path"] = "../model.safetensors"
    with patch.object(helper, "request", side_effect=request):
        try:
            helper.modelscope_download(helper.DEFAULT_MODEL, destination)
            raise AssertionError("Unsafe path was accepted")
        except RuntimeError as error:
            assert "path" in str(error)
print("PASS: pinned model source, file checksums, cached files, interrupted downloads, and path validation")
