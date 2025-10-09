#!/usr/bin/env python3
"""Generate extra-openai-models.yaml for llm CLI from config.yaml."""

import yaml
import sys
import argparse
import platform
from pathlib import Path


def get_llm_config_path():
    """Get the llm config directory path based on OS."""
    system = platform.system()

    if system == "Darwin":  # macOS
        return Path.home() / "Library" / "Application Support" / "io.datasette.llm"
    elif system == "Linux":
        return Path.home() / ".config" / "io.datasette.llm"
    elif system == "Windows":
        return Path.home() / "AppData" / "Local" / "io.datasette.llm"
    else:
        return Path.home() / ".config" / "io.datasette.llm"


def generate_llm_config(config_path='config.yaml'):
    """Generate llm extra-openai-models.yaml content from apantli config."""
    # Read apantli config
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Extract model names and create llm config format
    models = []
    for model in config.get('model_list', []):
        model_name = model['model_name']
        models.append({
            'model_id': model_name,
            'model_name': model_name
        })

    return models


def main():
    parser = argparse.ArgumentParser(
        description='Generate extra-openai-models.yaml for llm CLI from apantli config.yaml'
    )
    parser.add_argument(
        '--write',
        action='store_true',
        help='Write directly to llm config directory instead of stdout'
    )
    parser.add_argument(
        '--config',
        default='config.yaml',
        help='Path to apantli config.yaml (default: config.yaml)'
    )

    args = parser.parse_args()

    # Generate config
    try:
        llm_config = generate_llm_config(args.config)
    except FileNotFoundError:
        print(f"Error: {args.config} not found", file=sys.stderr)
        sys.exit(1)

    # Output YAML
    yaml_content = yaml.dump(llm_config, default_flow_style=False)

    if args.write:
        # Write to llm config location
        llm_config_dir = get_llm_config_path()
        llm_config_dir.mkdir(parents=True, exist_ok=True)
        output_path = llm_config_dir / "extra-openai-models.yaml"

        with open(output_path, 'w') as f:
            f.write(yaml_content)

        print(f"✅ Generated {output_path}", file=sys.stderr)
        print(f"📝 Registered {len(llm_config)} models:", file=sys.stderr)
        for model in llm_config:
            print(f"   - {model['model_id']}", file=sys.stderr)
        print("\nNow you can use:", file=sys.stderr)
        print(f"  export OPENAI_BASE_URL=http://localhost:4000/v1", file=sys.stderr)
        print(f"  llm -m claude-haiku-3.5 'Tell me a joke'", file=sys.stderr)
    else:
        # Write to stdout
        print(yaml_content)

        # Show suggestion
        llm_config_path = get_llm_config_path()
        system = platform.system()

        print(f"\n# Copy this to:", file=sys.stderr)
        print(f"#   {llm_config_path}/extra-openai-models.yaml", file=sys.stderr)
        print(f"#", file=sys.stderr)
        print(f"# Or run with --write to do it automatically:", file=sys.stderr)
        print(f"#   python3 utils/generate_llm_config.py --write", file=sys.stderr)
        print(f"#", file=sys.stderr)
        print(f"# Quick copy (macOS/Linux):", file=sys.stderr)
        if system == "Darwin" or system == "Linux":
            print(f"#   python3 utils/generate_llm_config.py > \"{llm_config_path}/extra-openai-models.yaml\"", file=sys.stderr)
        print(f"#", file=sys.stderr)
        print(f"# Registered {len(llm_config)} models from {args.config}", file=sys.stderr)


if __name__ == "__main__":
    main()
