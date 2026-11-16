"""Tải sẵn model nhận giọng nói (whisper) khi cài đặt, để lần dựng video đầu tiên không phải chờ tải ~1,6 GB.

usage: python -I scripts/prefetch_model.py [model]     (mặc định: $AVS_WHISPER_MODEL hoặc large-v3-turbo)
Không bắt buộc: lỗi mạng chỉ in cảnh báo; app sẽ tự tải lại lúc dùng lần đầu.
"""
import os
import sys

model = (sys.argv[1] if len(sys.argv) > 1 else None) or os.environ.get("AVS_WHISPER_MODEL") or "large-v3-turbo"
try:
    from faster_whisper.utils import download_model
    path = download_model(model)
    print(f"Model whisper '{model}' đã sẵn sàng: {path}")
except Exception as e:  # offline, firewall, HF down: not fatal
    print(f"Chưa tải được model whisper '{model}' ({e.__class__.__name__}) — app sẽ tự tải khi dựng video đầu tiên.")
