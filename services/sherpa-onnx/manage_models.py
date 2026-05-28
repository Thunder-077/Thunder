from __future__ import annotations

import argparse
import json
import tarfile
import tempfile
import urllib.request
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("list", "download", "activate"))
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--model-id")
    return parser.parse_args()


def load_catalog(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def get_active_model_id(state_dir: Path) -> str | None:
    state_file = state_dir / "active-model.json"
    if not state_file.exists():
        return None

    try:
        return json.loads(state_file.read_text(encoding="utf-8")).get("id")
    except json.JSONDecodeError:
        return None


def set_active_model_id(state_dir: Path, model_id: str) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "active-model.json").write_text(
        json.dumps({"id": model_id}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_model_root(model_dir: Path, model: dict) -> Path:
    return model_dir / model["archiveRoot"]


def is_model_installed(model_dir: Path, model: dict) -> bool:
    root = get_model_root(model_dir, model)
    return all((root / relative_path).exists() for relative_path in model["files"].values())


def serialize_models(catalog: list[dict], model_dir: Path, state_dir: Path) -> list[dict]:
    active_model_id = get_active_model_id(state_dir)
    items: list[dict] = []

    for model in catalog:
        installed = is_model_installed(model_dir, model)
        items.append({
            "id": model["id"],
            "name": model["name"],
            "description": model["description"],
            "language": model["language"],
            "runtime": model["runtime"],
            "installed": installed,
            "active": installed and active_model_id == model["id"],
        })

    if not any(item["active"] for item in items):
        for item in items:
            if item["installed"]:
                item["active"] = True
                break

    return items


def resolve_model(catalog: list[dict], model_id: str) -> dict:
    for model in catalog:
        if model["id"] == model_id:
            return model
    raise SystemExit(f"未知模型: {model_id}")


def download_model(model_dir: Path, model: dict) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    destination_root = get_model_root(model_dir, model)
    if destination_root.exists() and is_model_installed(model_dir, model):
        return

    with tempfile.TemporaryDirectory(prefix="thunder-sherpa-download-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        archive_path = temp_dir / "model.tar.bz2"
        urllib.request.urlretrieve(model["downloadUrl"], archive_path)

        with tarfile.open(archive_path, mode="r:bz2") as archive:
            archive.extractall(path=model_dir)


def main() -> int:
    args = parse_args()
    catalog = load_catalog(Path(args.catalog))
    model_dir = Path(args.model_dir)
    state_dir = Path(args.state_dir)

    if args.command == "list":
        print(json.dumps(serialize_models(catalog, model_dir, state_dir), ensure_ascii=False))
        return 0

    if not args.model_id:
        raise SystemExit("缺少 --model-id")

    model = resolve_model(catalog, args.model_id)
    if args.command == "download":
        download_model(model_dir, model)
        set_active_model_id(state_dir, model["id"])
    elif args.command == "activate":
        if not is_model_installed(model_dir, model):
            raise SystemExit("模型尚未下载，无法激活。")
        set_active_model_id(state_dir, model["id"])

    print(json.dumps(serialize_models(catalog, model_dir, state_dir), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
