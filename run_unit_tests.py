#!/usr/bin/env python3
"""Simple test runner that doesn't require pytest."""

import sys
import os

# Add project to path
sys.path.insert(0, os.path.dirname(__file__))

# Test imports
print("Testing module imports...")
try:
    from apantli.llm import infer_provider_from_model
    from apantli.errors import build_error_response
    from apantli.utils import convert_local_date_to_utc_range
    from apantli.config import DEFAULT_TIMEOUT, DEFAULT_RETRIES
    from apantli.database import Database
    print("✓ All modules import successfully")
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

# Test LLM provider inference
print("\nTesting LLM provider inference...")
tests_passed = 0
tests_failed = 0

test_cases = [
    ("gpt-4", "openai"),
    ("gpt-4.1-mini", "openai"),
    ("o1-preview", "openai"),
    ("claude-3-opus", "anthropic"),
    ("claude-sonnet-4", "anthropic"),
    ("gemini-pro", "google"),
    ("mistral-medium", "mistral"),
    ("llama-2-70b", "meta"),
    ("openai/gpt-4", "openai"),
    ("anthropic/claude-3", "anthropic"),
    ("unknown-model", "unknown"),
    ("", "unknown"),
]

for model, expected in test_cases:
    result = infer_provider_from_model(model)
    if result == expected:
        tests_passed += 1
    else:
        tests_failed += 1
        print(f"✗ FAIL: infer_provider_from_model('{model}') = '{result}', expected '{expected}'")

if tests_failed == 0:
    print(f"✓ All {tests_passed} provider inference tests passed")

# Test error formatting
print("\nTesting error formatting...")
error_response = build_error_response("invalid_request_error", "Test message")
if error_response.get("error", {}).get("type") == "invalid_request_error":
    tests_passed += 1
    print("✓ Error response format correct")
else:
    tests_failed += 1
    print("✗ FAIL: Error response format incorrect")

error_with_code = build_error_response("rate_limit_error", "Too many requests", "rate_limit")
if error_with_code.get("error", {}).get("code") == "rate_limit":
    tests_passed += 1
    print("✓ Error response with code correct")
else:
    tests_failed += 1
    print("✗ FAIL: Error response with code incorrect")

# Test timezone utilities
print("\nTesting timezone utilities...")
start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", -480)
if start_utc == "2025-10-06T08:00:00" and end_utc == "2025-10-07T08:00:00":
    tests_passed += 1
    print("✓ Timezone conversion (PST) correct")
else:
    tests_failed += 1
    print(f"✗ FAIL: Timezone conversion incorrect: {start_utc}, {end_utc}")

start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", 0)
if start_utc == "2025-10-06T00:00:00" and end_utc == "2025-10-07T00:00:00":
    tests_passed += 1
    print("✓ Timezone conversion (UTC) correct")
else:
    tests_failed += 1
    print(f"✗ FAIL: Timezone conversion (UTC) incorrect")

# Test config defaults
print("\nTesting config defaults...")
if DEFAULT_TIMEOUT == 120 and DEFAULT_RETRIES == 3:
    tests_passed += 1
    print("✓ Default config values correct")
else:
    tests_failed += 1
    print(f"✗ FAIL: Default config values incorrect")

# Summary
print("\n" + "="*60)
print(f"TOTAL: {tests_passed} passed, {tests_failed} failed")
if tests_failed == 0:
    print("✓ All unit tests passed!")
    sys.exit(0)
else:
    print("✗ Some tests failed")
    sys.exit(1)
