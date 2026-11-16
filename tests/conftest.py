import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))
# DB/data tách biệt cho test
os.environ.setdefault("AVF_DATA_DIR", tempfile.mkdtemp(prefix="avf-test-"))
FIXTURE = ROOT / "tests" / "fixtures" / "sample_9x16.mp4"
