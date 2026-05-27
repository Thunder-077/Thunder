# Thunder FunASR Service

Thunder uses this folder as the local FunASR service workspace.

The desktop app starts the service automatically when the launcher can find a
FunASR WebSocket server script. The browser-only web app cannot start this
service by itself; it uses Web Speech instead.

The current Thunder installer bundles this launcher and service workspace only.
It does not bundle the upstream FunASR repository, Python runtime, model files,
or Python dependencies. To make FunASR work out of the box on another machine,
those runtime assets must also be packaged or installed during setup.

## Expected Layout

Place the upstream FunASR repository under one of these paths:

```text
services/funasr/FunASR/
services/funasr/vendor/FunASR/
```

The launcher looks for:

```text
runtime/python/websocket/funasr_wss_server.py
```

You can also point to a custom server script with:

```text
THUNDER_FUNASR_SERVER_SCRIPT=D:\path\to\funasr_wss_server.py
```

## Desktop Defaults

```text
THUNDER_FUNASR_ENABLED=true
THUNDER_FUNASR_HOST=127.0.0.1
THUNDER_FUNASR_PORT=10095
THUNDER_FUNASR_PYTHON=python
```

The teleprompter connects to:

```text
ws://127.0.0.1:10095
```

## Install Manually

Clone or copy FunASR into this folder, then install its Python dependencies
inside your preferred Python environment.

```powershell
cd D:\self\Thunder\services\funasr
git clone https://github.com/modelscope/FunASR.git
```

Refer to the upstream FunASR runtime docs for model and dependency setup.

## Local Dev Setup

Thunder dev mode prefers the local venv at:

```text
services/funasr/.venv/Scripts/python.exe
```

Recommended setup on Windows:

```powershell
D:\Program\Python3.11\python.exe -m venv services\funasr\.venv
services\funasr\.venv\Scripts\python.exe -m pip install -U pip setuptools wheel
services\funasr\.venv\Scripts\python.exe -m pip install -r services\funasr\requirements-dev.txt
services\funasr\.venv\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
```

The first startup downloads model files into:

```text
services/funasr/modelscope-cache/
```

After setup, `pnpm dev:desktop` will try to start FunASR automatically.
