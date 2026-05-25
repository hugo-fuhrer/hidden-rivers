import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src" / "eda"))
from pitch import server as application  # noqa: E402  (gunicorn entry point)
