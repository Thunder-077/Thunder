from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = "10095"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_DEVICE = "cpu"
DEFAULT_NGPU = "0"
DEFAULT_NCPU = "4"
PATCH_MARKER = "# thunder patched: optional websocket subprotocol"


def resolve_server_script() -> Path | None:
    configured = os.environ.get("THUNDER_FUNASR_SERVER_SCRIPT")
    if configured:
        path = Path(configured).expanduser()
        return path if path.exists() else None

    candidates = [
        SERVICE_ROOT / "FunASR" / "runtime" / "python" / "websocket" / "funasr_wss_server.py",
        SERVICE_ROOT / "vendor" / "FunASR" / "runtime" / "python" / "websocket" / "funasr_wss_server.py",
    ]
    return next((path for path in candidates if path.exists()), None)


def patch_optional_subprotocol(server_script: Path) -> None:
    """Allow browser clients with or without the FunASR demo's binary subprotocol."""
    text = server_script.read_text(encoding="utf-8")
    if PATCH_MARKER in text:
        return

    patched = text.replace(
        'subprotocols=["binary"],\n            ping_interval=None,',
        f'{PATCH_MARKER}\n            subprotocols=None,\n            ping_interval=None,',
    ).replace(
        'subprotocols=["binary"],\n            ping_interval=None,\n            ssl=ssl_context,',
        f'{PATCH_MARKER}\n            subprotocols=None,\n            ping_interval=None,\n            ssl=ssl_context,',
    )

    if patched != text:
        server_script.write_text(patched, encoding="utf-8")


def main() -> int:
    server_script = resolve_server_script()
    if server_script is None:
        print(
            "[thunder-funasr] FunASR server script not found. "
            "Place upstream FunASR under services/funasr/FunASR or set THUNDER_FUNASR_SERVER_SCRIPT.",
            file=sys.stderr,
        )
        return 2

    patch_optional_subprotocol(server_script)

    host = os.environ.get("THUNDER_FUNASR_HOST", DEFAULT_HOST)
    port = os.environ.get("THUNDER_FUNASR_PORT", DEFAULT_PORT)
    device = os.environ.get("THUNDER_FUNASR_DEVICE", DEFAULT_DEVICE)
    ngpu = os.environ.get("THUNDER_FUNASR_NGPU", DEFAULT_NGPU)
    ncpu = os.environ.get("THUNDER_FUNASR_NCPU", DEFAULT_NCPU)
    cache_dir = os.environ.get("MODELSCOPE_CACHE") or str(SERVICE_ROOT / "modelscope-cache")

    command = [
        sys.executable,
        str(server_script),
        "--host",
        host,
        "--port",
        port,
        "--device",
        device,
        "--ngpu",
        ngpu,
        "--ncpu",
        ncpu,
        "--certfile",
        "",
        "--keyfile",
        "",
    ]

    env = os.environ.copy()
    env["MODELSCOPE_CACHE"] = cache_dir

    print(f"[thunder-funasr] starting FunASR websocket on {host}:{port} ({device}, ngpu={ngpu})")
    print(f"[thunder-funasr] model cache: {cache_dir}")
    return subprocess.call(command, cwd=server_script.parent, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
