"""Backend dự phòng: tạo clip bằng mô hình Veo (cùng mô hình dùng trong Google Flow) qua Gemini API."""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path

log = logging.getLogger(__name__)


class VeoAPI:
    def __init__(self, cfg):  # noqa: ANN001
        try:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore
        except ImportError as exc:
            raise RuntimeError("Cần cài `pip install google-genai` để dùng backend veo_api") from exc
        key = os.environ.get(cfg.get_path("video.veo_api.api_key_env", "GEMINI_API_KEY"))
        if not key:
            raise RuntimeError("Thiếu GEMINI_API_KEY cho backend veo_api")
        self.client = genai.Client(api_key=key)
        self.types = types
        self.model = cfg.get_path("video.veo_api.model")
        self.aspect = cfg.get_path("video.aspect_ratio", "9:16")
        self.resolution = cfg.get_path("video.veo_api.resolution", "720p")

    def __enter__(self) -> "VeoAPI":
        return self

    def __exit__(self, *exc) -> None:  # noqa: ANN002
        return None

    def generate_clip(self, prompt: str, out_path: Path) -> Path:
        op = self.client.models.generate_videos(
            model=self.model,
            prompt=prompt,
            config=self.types.GenerateVideosConfig(
                aspect_ratio=self.aspect,
                resolution=self.resolution,
                negative_prompt="text, captions, watermark, logo, distorted hands, gore, abnormal fetus",
            ),
        )
        while not op.done:
            time.sleep(10)
            op = self.client.operations.get(op)
        if not op.response or not op.response.generated_videos:
            raise RuntimeError(f"Veo không trả về video (có thể bị lọc nội dung): {op}")
        video = op.response.generated_videos[0]
        self.client.files.download(file=video.video)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        video.video.save(str(out_path))
        return out_path
