"""ClaudeCodeLLM với một lệnh `claude` giả (không gọi mạng)."""
import json
import os
import stat
import sys

import pytest

from flow_agent.llm import ClaudeCodeLLM, LLMError, extract_json, image_block
from flow_agent.models import ScriptScore

GOOD = {"criteria": [{"key": "hook", "score": 18, "reason": "ok"}], "safety_violations": [],
        "predicted_performance": "cao", "improvement_suggestions": []}


def _fake_cli(tmp_path, body: str):
    script = tmp_path / "claude"
    script.write_text(f"#!{sys.executable}\nimport sys, json\nargs = sys.argv[1:]\nprompt = sys.stdin.read()\n{body}\n",
                      encoding="utf-8")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return str(script)


@pytest.mark.skipif(os.name == "nt", reason="script giả dùng shebang")
def test_structured_output_and_flags(tmp_path):
    log = tmp_path / "args.json"
    exe = _fake_cli(tmp_path, f"""json.dump({{'args': args, 'prompt': prompt}}, open({str(log)!r}, 'w'))
print(json.dumps({{'type': 'result', 'subtype': 'success', 'is_error': False, 'result': '',
                  'structured_output': {GOOD!r}}}))""")
    img = tmp_path / "a.jpg"
    img.write_bytes(b"x")
    out = ClaudeCodeLLM(exe=exe).structured("hệ thống", [image_block(img), {"type": "text", "text": "chấm"}], ScriptScore)
    assert out.criteria[0].score == 18
    rec = json.load(open(log))
    assert rec["args"][:3] == ["-p", "--output-format", "json"]
    assert "--json-schema" in rec["args"] and "Read" in rec["args"]
    assert str(img.resolve()) in rec["prompt"] and "hệ thống" in rec["prompt"]


@pytest.mark.skipif(os.name == "nt", reason="script giả dùng shebang")
def test_text_fallback_and_retry(tmp_path):
    counter = tmp_path / "n"
    exe = _fake_cli(tmp_path, f"""import os
n = int(open({str(counter)!r}).read()) if os.path.exists({str(counter)!r}) else 0
open({str(counter)!r}, 'w').write(str(n + 1))
text = 'không phải json' if n == 0 else '```json\\n' + json.dumps({GOOD!r}) + '\\n```'
print(json.dumps({{'type': 'result', 'subtype': 'success', 'is_error': False, 'result': text}}))""")
    out = ClaudeCodeLLM(exe=exe).structured("s", "c", ScriptScore)
    assert out.predicted_performance == "cao" and counter.read_text() == "2"


@pytest.mark.skipif(os.name == "nt", reason="script giả dùng shebang")
def test_login_error_is_clear(tmp_path):
    exe = _fake_cli(tmp_path, """print(json.dumps({'type': 'result', 'subtype': 'success', 'is_error': True,
                  'result': 'Invalid API key · Please run /login'}))""")
    with pytest.raises(LLMError, match="chưa đăng nhập"):
        ClaudeCodeLLM(exe=exe).structured("s", "c", ScriptScore)


def test_extract_json():
    assert json.loads(extract_json('Đây là kết quả:\n```json\n{"a": 1}\n```')) == {"a": 1}
