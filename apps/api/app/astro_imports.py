"""Central import helper for astro-core package.

Since astro-core lives outside the api app as a sibling package with a
hyphenated directory name, we register it into sys.modules once here so
all routers/services can do normal imports.
"""

import importlib.util
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]  # shastra/
_ASTRO_CORE = _REPO_ROOT / "packages" / "astro-core"


def _register(module_name: str, file_path: Path, search_locations: list[str] | None = None):
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(
        module_name, str(file_path), submodule_search_locations=search_locations,
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


def setup():
    """Register astro_core and its submodules so they can be imported normally."""
    if "astro_core" in sys.modules:
        return

    _register("astro_core", _ASTRO_CORE / "__init__.py", [str(_ASTRO_CORE)])
    _register("astro_core.models", _ASTRO_CORE / "models" / "__init__.py", [str(_ASTRO_CORE / "models")])
    _register("astro_core.models.chart", _ASTRO_CORE / "models" / "chart.py")
    _register("astro_core.engines", _ASTRO_CORE / "engines" / "__init__.py", [str(_ASTRO_CORE / "engines")])
    _register("astro_core.engines.base", _ASTRO_CORE / "engines" / "base.py")
    _register("astro_core.engines.vedic", _ASTRO_CORE / "engines" / "vedic.py")
    _register("astro_core.engines.kp", _ASTRO_CORE / "engines" / "kp.py")
    _register("astro_core.engines.western", _ASTRO_CORE / "engines" / "western.py")
    _register("astro_core.engines.compare", _ASTRO_CORE / "engines" / "compare.py")
    _register("astro_core.calculator", _ASTRO_CORE / "calculator.py")


setup()
