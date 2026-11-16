"""Lỗi có cấu trúc {code, message, details, retryable, trace_id, hint} (mục 6 SRS)."""
from __future__ import annotations

import uuid


class AppError(Exception):
    def __init__(self, code: str, message: str, *, details: dict | None = None, retryable: bool = False,
                 hint: str | None = None, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
        self.retryable = retryable
        self.hint = hint
        self.status = status
        self.trace_id = uuid.uuid4().hex[:12]

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "details": self.details,
                "retryable": self.retryable, "hint": self.hint, "trace_id": self.trace_id}


def not_found(what: str) -> AppError:
    return AppError("NOT_FOUND", f"Không tìm thấy {what}", status=404)
