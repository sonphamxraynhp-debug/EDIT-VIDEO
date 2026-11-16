"""ffmpeg version differences in one place.

ffmpeg >= 7 reads a filtergraph from a file with `-/filter_complex <file>`; ffmpeg 6 (Ubuntu 24.04, older winget/brew
builds) only knows `-filter_complex_script <file>`. README promises ffmpeg >= 6, so pick the spelling the installed
ffmpeg understands.
"""
import functools
import re
import subprocess


@functools.lru_cache(None)
def ffmpeg_major():
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-version"], capture_output=True, text=True).stdout
    except OSError:
        return 0
    m = re.search(r"ffmpeg version n?(\d+)\.", out)
    return int(m.group(1)) if m else 99  # git / nightly builds: assume current


def filter_script_args(path):
    """[option, path] that loads a -filter_complex graph from `path` on this ffmpeg."""
    return ["-/filter_complex", path] if ffmpeg_major() >= 7 else ["-filter_complex_script", path]
