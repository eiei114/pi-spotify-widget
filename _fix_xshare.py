from pathlib import Path
Path("lib/x-share.ts").write_text(Path("lib/x-share.ts").read_text(encoding="utf-8"), encoding="utf-8")
