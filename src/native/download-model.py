"""Download public MLX weights. Never load repository Python code."""
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_MODEL = "mlx-community/Qwen2.5-0.5B-Instruct-4bit"
MODELSCOPE_REVISION = "7b36975ed2397d6eb8fb55cb5a58437bd7ca5b10"


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Linloop"}), timeout=30)


def digest(file):
    result = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def modelscope_download(model, destination):
    base = "https://modelscope.cn/api/v1/models/" + model
    query = urllib.parse.urlencode({"Revision": MODELSCOPE_REVISION, "Recursive": "true"})
    with request(base + "/repo/files?" + query) as response:
        manifest = json.load(response)
    if manifest.get("Code") != 200:
        raise RuntimeError("Model source is unavailable")
    files = [item for item in manifest["Data"]["Files"] if item["Type"] == "blob"
             and Path(item["Path"]).suffix in {".json", ".safetensors", ".model", ".tiktoken", ".txt", ".jinja"}]
    if not any(item["Path"].endswith(".safetensors") for item in files):
        raise RuntimeError("Model weights are missing")
    total = sum(item["Size"] for item in files)
    done, last_percent = 0, -1
    for item in files:
        relative = Path(item["Path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise RuntimeError("Invalid model file path")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file() and digest(target) == item["Sha256"]:
            done += item["Size"]
            continue
        partial = target.with_name(target.name + ".partial")
        query = urllib.parse.urlencode({"Revision": MODELSCOPE_REVISION, "FilePath": item["Path"]})
        try:
            with request(base + "/repo?" + query) as response, partial.open("wb") as stream:
                for block in iter(lambda: response.read(1024 * 1024), b""):
                    stream.write(block)
                    done += len(block)
                    percent = min(100, int(done * 100 / total))
                    if percent != last_percent:
                        print(f"Downloading model… {percent}%", flush=True)
                        last_percent = percent
            if digest(partial) != item["Sha256"]:
                raise RuntimeError("Model file checksum did not match")
            partial.replace(target)
        finally:
            partial.unlink(missing_ok=True)


def main():
    model, folder = sys.argv[1:]
    destination = Path(folder)
    destination.mkdir(parents=True, exist_ok=True)
    try:
        # Fail fast before the hub client's retry loop on inaccessible networks.
        with urllib.request.urlopen("https://huggingface.co/api/models/" + model, timeout=8) as response:
            if response.status != 200:
                raise RuntimeError("Model source is unavailable")
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=model, local_dir=folder, allow_patterns=[
            "*.json", "*.safetensors", "*.model", "*.tiktoken", "merges.txt", "vocab.txt", "tokenizer*", "*.jinja"])
    except (OSError, RuntimeError):
        if model != DEFAULT_MODEL:
            raise
        print("Downloading default model from ModelScope…", flush=True)
        modelscope_download(model, destination)


if __name__ == "__main__":
    main()
