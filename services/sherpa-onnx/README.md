# Thunder Sherpa ONNX Service

Thunder uses this folder as the local `sherpa-onnx` service workspace.

The desktop app manages three things for this provider:

1. A small built-in model catalog.
2. Downloading and activating a model chosen by the user.
3. Starting a local WebSocket ASR service for the teleprompter.

## Desktop Defaults

```text
THUNDER_SHERPA_HOST=127.0.0.1
THUNDER_SHERPA_PORT=10096
THUNDER_SHERPA_PYTHON=python
```

The teleprompter connects to:

```text
ws://127.0.0.1:10096
```

## Local Dev Setup

Thunder dev mode prefers the local venv at:

```text
services/sherpa-onnx/.venv/Scripts/python.exe
```

Recommended setup on Windows:

```powershell
D:\Program\Python3.11\python.exe -m venv services\sherpa-onnx\.venv
services\sherpa-onnx\.venv\Scripts\python.exe -m pip install -U pip setuptools wheel
services\sherpa-onnx\.venv\Scripts\python.exe -m pip install -r services\sherpa-onnx\requirements-dev.txt
```

模型文件不会提交进仓库。桌面端会下载到用户本地应用数据目录，并记录当前激活模型。
