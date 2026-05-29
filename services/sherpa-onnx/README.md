# Thunder Sherpa ONNX Workspace

Thunder uses this folder as the local `sherpa-onnx` model and tooling workspace.

The desktop app manages three things for this provider:

1. A small built-in model catalog.
2. Downloading and activating a model chosen by the user.
3. Loading the active model into the Tauri desktop runtime for direct ASR.

## Desktop Defaults

```text
模型目录: <app_data_dir>/speech/sherpa-onnx/models
状态目录: <app_data_dir>/speech/sherpa-onnx/state
```

## Local Dev Notes

当前 sherpa 模型列表、下载、解压、激活和识别都已经收进 Tauri + Rust 原生运行。

这个目录现在只保留：

- `model-catalog.json`：内置模型目录

模型文件不会提交进仓库。桌面端会下载到用户本地应用数据目录，并记录当前激活模型。
