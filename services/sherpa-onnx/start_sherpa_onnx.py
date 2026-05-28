from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import sherpa_onnx
import websockets


SERVICE_ROOT = Path(__file__).resolve().parent
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 10096
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_FEAT_DIM = 80


def load_catalog() -> list[dict[str, Any]]:
    return json.loads((SERVICE_ROOT / "model-catalog.json").read_text(encoding="utf-8"))


def load_active_model_id(state_dir: Path) -> str | None:
    state_file = state_dir / "active-model.json"
    if not state_file.exists():
        return None

    try:
        return json.loads(state_file.read_text(encoding="utf-8")).get("id")
    except json.JSONDecodeError:
        return None


def resolve_active_model(model_dir: Path, state_dir: Path) -> tuple[dict[str, Any], Path]:
    catalog = load_catalog()
    active_model_id = load_active_model_id(state_dir)

    candidates = catalog
    if active_model_id:
        candidates = [model for model in catalog if model["id"] == active_model_id]

    for model in candidates:
        root = model_dir / model["archiveRoot"]
        if all((root / relative_path).exists() for relative_path in model["files"].values()):
            return model, root

    raise RuntimeError("未找到可用的 sherpa-onnx 模型，请先在提词器里下载并激活模型。")


def create_recognizer(model_dir: Path, state_dir: Path) -> sherpa_onnx.OnlineRecognizer:
    model, root = resolve_active_model(model_dir, state_dir)
    files = model["files"]

    common = {
        "tokens": str(root / files["tokens"]),
        "num_threads": 2,
        "sample_rate": DEFAULT_SAMPLE_RATE,
        "feature_dim": DEFAULT_FEAT_DIM,
        "decoding_method": "greedy_search",
        "provider": "cpu",
        "enable_endpoint_detection": True,
        "rule1_min_trailing_silence": 2.4,
        "rule2_min_trailing_silence": 1.0,
        "rule3_min_utterance_length": 20.0,
    }

    if model["runtime"] == "streaming-paraformer":
        return sherpa_onnx.OnlineRecognizer.from_paraformer(
            encoder=str(root / files["paraformerEncoder"]),
            decoder=str(root / files["paraformerDecoder"]),
            **common,
        )

    if model["runtime"] == "streaming-zipformer":
        return sherpa_onnx.OnlineRecognizer.from_transducer(
            encoder=str(root / files["encoder"]),
            decoder=str(root / files["decoder"]),
            joiner=str(root / files["joiner"]),
            **common,
        )

    raise RuntimeError(f"不支持的运行时模型类型: {model['runtime']}")


class SherpaStreamingServer:
    def __init__(self, recognizer: sherpa_onnx.OnlineRecognizer):
        self.recognizer = recognizer
        self.sample_rate = DEFAULT_SAMPLE_RATE

    async def run(self, host: str, port: int) -> None:
        async with websockets.serve(self.handle_connection, host=host, port=port, max_size=1 << 20):
            print(f"[thunder-sherpa] websocket ready on ws://{host}:{port}")
            await asyncio.Future()

    async def handle_connection(self, socket: websockets.WebSocketServerProtocol) -> None:
        stream = self.recognizer.create_stream()
        segment = 0
        last_text = ""

        while True:
            message = await socket.recv()
            if message == "Done":
                break
            if not isinstance(message, bytes):
                continue

            samples = np.frombuffer(message, dtype=np.float32)
            if samples.size == 0:
                continue

            stream.accept_waveform(sample_rate=self.sample_rate, waveform=samples)

            while self.recognizer.is_ready(stream):
                self.recognizer.decode_stream(stream)
                text = self.recognizer.get_result(stream)
                if not text or text == last_text:
                    continue

                is_final = self.recognizer.is_endpoint(stream)
                await socket.send(json.dumps({
                    "text": text,
                    "segment": segment,
                    "isFinal": is_final,
                }, ensure_ascii=False))
                last_text = text

                if is_final:
                    self.recognizer.reset(stream)
                    segment += 1
                    last_text = ""

        tail_padding = np.zeros(int(self.sample_rate * 0.3), dtype=np.float32)
        stream.accept_waveform(sample_rate=self.sample_rate, waveform=tail_padding)
        stream.input_finished()

        while self.recognizer.is_ready(stream):
            self.recognizer.decode_stream(stream)

        text = self.recognizer.get_result(stream)
        if text and text != last_text:
            await socket.send(json.dumps({
                "text": text,
                "segment": segment,
                "isFinal": True,
            }, ensure_ascii=False))


def main() -> int:
    host = os.environ.get("THUNDER_SHERPA_HOST", DEFAULT_HOST)
    port = int(os.environ.get("THUNDER_SHERPA_PORT", str(DEFAULT_PORT)))
    model_dir = Path(os.environ["THUNDER_SHERPA_MODEL_DIR"]).expanduser()
    state_dir = Path(os.environ["THUNDER_SHERPA_STATE_DIR"]).expanduser()

    recognizer = create_recognizer(model_dir, state_dir)
    print(f"[thunder-sherpa] model dir: {model_dir}")
    print(f"[thunder-sherpa] state dir: {state_dir}")
    asyncio.run(SherpaStreamingServer(recognizer).run(host=host, port=port))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
