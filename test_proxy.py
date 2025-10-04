#!/usr/bin/env python3
"""Test the proxy with OpenAI and Anthropic requests."""

import os
import requests

PROXY_URL = "http://localhost:4000"

# Test 1: OpenAI
print("Testing OpenAI (gpt-4.1-mini)...")
response = requests.post(
    f"{PROXY_URL}/v1/chat/completions",
    json={
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "Say 'proxy works' in 2 words"}]
    }
)
print(f"Status: {response.status_code}")
if response.ok:
    data = response.json()
    print(f"Response: {data['choices'][0]['message']['content']}")
    print(f"Tokens: {data['usage']['total_tokens']}")
else:
    print(f"Error: {response.text}")

print("\n" + "="*50 + "\n")

# Test 2: Anthropic
print("Testing Anthropic (claude-haiku-3.5)...")
response = requests.post(
    f"{PROXY_URL}/v1/chat/completions",
    json={
        "model": "claude-haiku-3.5",
        "messages": [{"role": "user", "content": "Say 'anthropic works' in 2 words"}]
    }
)
print(f"Status: {response.status_code}")
if response.ok:
    data = response.json()
    print(f"Response: {data['choices'][0]['message']['content']}")
    print(f"Tokens: {data['usage']['total_tokens']}")
else:
    print(f"Error: {response.text}")

print("\n" + "="*50 + "\n")

# Get stats
print("Fetching stats...")
response = requests.get(f"{PROXY_URL}/stats")
if response.ok:
    stats = response.json()
    print(f"Total requests: {stats['totals']['requests']}")
    print(f"Total cost: ${stats['totals']['cost']}")
    print(f"Total tokens: {stats['totals']['prompt_tokens'] + stats['totals']['completion_tokens']}")
    print(f"\nBy model:")
    for m in stats['by_model']:
        print(f"  {m['model']}: {m['requests']} requests, ${m['cost']}")
else:
    print(f"Error: {response.text}")

print(f"\nDashboard available at: {PROXY_URL}/")
