"""Apantli version information - auto-synced from pyproject.toml"""

import importlib.metadata

try:
    __version__ = importlib.metadata.version("apantli")
except importlib.metadata.PackageNotFoundError:
    # Fallback for development/uninstalled package
    __version__ = "0.3.8-dev"
