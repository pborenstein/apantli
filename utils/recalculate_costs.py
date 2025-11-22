#!/usr/bin/env python3
"""Recalculate costs for requests with missing or zero cost."""

import sqlite3
import json
import litellm
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_PATH = "requests.db"

# Manual mapping for aliases to full model names
# (for old requests made before models were in config.yaml)
MODEL_ALIAS_MAP = {
    'claude-haiku-3.5': 'claude-3-5-haiku-20241022',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
}


def infer_provider_from_model(model_name: str) -> str:
    """Infer provider from model name when not explicitly prefixed."""
    if not model_name:
        return 'unknown'

    model_lower = model_name.lower()

    # Check for provider prefix first
    if '/' in model_name:
        return model_name.split('/')[0]

    # Infer from model name patterns
    if model_lower.startswith(('gpt-', 'o1-', 'text-davinci', 'text-curie')):
        return 'openai'
    elif model_lower.startswith('claude') or 'claude' in model_lower:
        return 'anthropic'
    elif model_lower.startswith(('gemini', 'palm')):
        return 'gemini'  # LiteLLM uses 'gemini' not 'google'
    elif model_lower.startswith('mistral'):
        return 'mistral'
    elif model_lower.startswith('llama'):
        return 'meta'

    return 'unknown'


def normalize_model_name(model_name: str) -> str:
    """Normalize model name to full LiteLLM format with provider prefix."""
    if '/' in model_name:
        return model_name  # Already has prefix

    # Apply alias mapping first
    if model_name in MODEL_ALIAS_MAP:
        model_name = MODEL_ALIAS_MAP[model_name]

    # Add provider prefix
    provider = infer_provider_from_model(model_name)
    if provider == 'unknown':
        return model_name

    return f"{provider}/{model_name}"


def recalculate_costs(dry_run=False):
    """Recalculate costs for all requests with cost = 0 or NULL."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Find requests with missing costs
    cursor.execute("""
        SELECT id, model, response_data, prompt_tokens, completion_tokens
        FROM requests
        WHERE cost IS NULL OR cost = 0
    """)

    requests_to_update = cursor.fetchall()
    print(f"Found {len(requests_to_update)} requests with missing costs")

    updated = 0
    failed = 0

    for request_id, model, response_json, prompt_tokens, completion_tokens in requests_to_update:
        try:
            # Parse response data
            if response_json:
                response_data = json.loads(response_json)
            else:
                # No response data, construct minimal object
                response_data = {
                    'model': model,
                    'usage': {
                        'prompt_tokens': prompt_tokens or 0,
                        'completion_tokens': completion_tokens or 0,
                        'total_tokens': (prompt_tokens or 0) + (completion_tokens or 0)
                    }
                }

            # Normalize model name (apply alias mapping + add provider prefix)
            # Old requests might have short names like "claude-haiku-3.5" or "gpt-4o-mini"
            original_model = response_data.get('model', model)
            if 'model' in response_data:
                response_data['model'] = normalize_model_name(response_data['model'])

            normalized_model = response_data.get('model', model)

            # Calculate cost using LiteLLM
            cost = litellm.completion_cost(completion_response=response_data)

            if cost > 0:
                if dry_run:
                    print(f"  [DRY RUN] Would update request {request_id} ({original_model} → {normalized_model}): ${cost:.6f}")
                else:
                    cursor.execute(
                        "UPDATE requests SET cost = ? WHERE id = ?",
                        (cost, request_id)
                    )
                    print(f"  Updated request {request_id} ({original_model} → {normalized_model}): ${cost:.6f}")
                updated += 1
            else:
                # Check if model has pricing data in LiteLLM
                has_pricing = normalized_model in litellm.model_cost
                usage = response_data.get('usage', {})
                print(f"  ⚠️  Request {request_id} ({original_model} → {normalized_model}): cost still $0.00")
                print(f"      Pricing exists: {has_pricing}, Tokens: {usage.get('prompt_tokens', 0)}/{usage.get('completion_tokens', 0)}")
                failed += 1

        except Exception as e:
            print(f"  ❌ Request {request_id} (model={model}): {e}")
            failed += 1

    if not dry_run:
        conn.commit()
        print(f"\n✅ Updated {updated} requests")
    else:
        print(f"\n[DRY RUN] Would update {updated} requests")

    if failed > 0:
        print(f"⚠️  {failed} requests could not be recalculated (pricing data unavailable)")

    conn.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Recalculate costs for requests with missing pricing")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes"
    )

    args = parser.parse_args()

    if args.dry_run:
        print("🔍 DRY RUN MODE - no changes will be made\n")

    recalculate_costs(dry_run=args.dry_run)
