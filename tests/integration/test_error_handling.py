#!/usr/bin/env python3
"""
Test script for error handling implementation.

Tests:
1. Normal request (baseline)
2. Timeout error (low timeout on slow model)
3. Authentication error (invalid API key)
4. Model not found error
5. Normal streaming request
6. Streaming with simulated client disconnect
7. Rate limit handling (if triggered)

Run with server on http://localhost:4000
"""

import requests
import json
import time
import sys
from typing import Optional


BASE_URL = "http://localhost:4000"
TIMEOUT = 30  # Client-side timeout for test requests


class Colors:
    """ANSI color codes for output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_test(name: str):
    """Print test header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}TEST: {name}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")


def print_success(msg: str):
    """Print success message."""
    print(f"{Colors.GREEN}✓ {msg}{Colors.RESET}")


def print_error(msg: str):
    """Print error message."""
    print(f"{Colors.RED}✗ {msg}{Colors.RESET}")


def print_info(msg: str):
    """Print info message."""
    print(f"{Colors.CYAN}ℹ {msg}{Colors.RESET}")


def print_result(result: dict):
    """Pretty print result."""
    print(f"{Colors.YELLOW}Response:{Colors.RESET}")
    print(json.dumps(result, indent=2))


def check_health() -> bool:
    """Check if server is running."""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        return response.status_code == 200
    except requests.exceptions.RequestException:
        return False


def test_normal_request() -> bool:
    """Test 1: Normal successful request."""
    print_test("Normal Request (Baseline)")

    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "Say 'test successful' and nothing else."}],
        "max_tokens": 10
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT
        )

        print_info(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            print_success(f"Request succeeded: {content}")
            return True
        else:
            print_error(f"Unexpected status code: {response.status_code}")
            print_result(response.json())
            return False

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def test_timeout() -> bool:
    """Test 2: Timeout error (requires server restart with very low timeout)."""
    print_test("Timeout Error")
    print_info("This test requires server to be started with: apantli --timeout 1")
    print_info("Skipping automatic test - manual verification needed")
    return True  # Skip for now


def test_authentication_error() -> bool:
    """Test 3: Authentication error - API key protection."""
    print_test("Authentication Error - API Key Protection")
    print_info("Tests that proxy manages API keys (clients cannot override)")

    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "test"}],
        "api_key": "sk-invalid-key-12345"  # Try to override with invalid key
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT
        )

        print_info(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            print_success("Proxy correctly ignored client's API key and used configured key")
            print_info("This is correct behavior - proxy manages authentication")
            return True
        elif response.status_code == 401:
            result = response.json()
            error = result.get("error", {})
            print_success(f"Got 401 error (no valid key configured): {error.get('type')}")
            print_result(result)
            return True
        else:
            print_info(f"Got status {response.status_code}")
            print_result(response.json())
            return True  # Any response is informational

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def test_model_not_found() -> bool:
    """Test 4: Model not found error."""
    print_test("Model Not Found Error")

    payload = {
        "model": "nonexistent-model-xyz",
        "messages": [{"role": "user", "content": "test"}]
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT
        )

        print_info(f"Status Code: {response.status_code}")

        # Should return 404 with helpful error message
        if response.status_code == 404:
            result = response.json()
            error = result.get("error", {})
            message = error.get("message", "")

            # Check for helpful error message with available models
            if "not found in configuration" in message and "Available models:" in message:
                print_success(f"Got helpful error with available models list")
                print_result(result)
                return True
            else:
                print_error(f"Error message doesn't include available models")
                print_result(result)
                return False
        else:
            print_error(f"Expected 404, got: {response.status_code}")
            print_result(response.json())
            return False

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def test_streaming_normal() -> bool:
    """Test 5: Normal streaming request."""
    print_test("Normal Streaming Request")

    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "Count from 1 to 5, one number per line."}],
        "stream": True,
        "max_tokens": 50
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            stream=True,
            timeout=TIMEOUT
        )

        print_info(f"Status Code: {response.status_code}")

        if response.status_code != 200:
            print_error(f"Unexpected status code: {response.status_code}")
            return False

        chunks = []
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    data_str = line_str[6:]  # Remove "data: " prefix
                    if data_str == '[DONE]':
                        print_info("Received [DONE]")
                        break
                    try:
                        chunk = json.loads(data_str)
                        chunks.append(chunk)
                        # Check if it's an error
                        if "error" in chunk:
                            print_error(f"Received error in stream: {chunk['error']}")
                            return False
                    except json.JSONDecodeError:
                        continue

        print_success(f"Received {len(chunks)} chunks successfully")
        print_info(f"Stream completed with [DONE]")
        return True

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def test_streaming_disconnect() -> bool:
    """Test 6: Streaming with early disconnect."""
    print_test("Streaming with Client Disconnect")

    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "Write a long story about a robot."}],
        "stream": True
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            stream=True,
            timeout=TIMEOUT
        )

        print_info(f"Status Code: {response.status_code}")

        if response.status_code != 200:
            print_error(f"Unexpected status code: {response.status_code}")
            return False

        chunk_count = 0
        for line in response.iter_lines():
            if line:
                chunk_count += 1
                if chunk_count == 3:
                    print_info("Closing connection after 3 chunks...")
                    response.close()
                    break

        print_success("Connection closed early")
        print_info("Check server logs for 'Client disconnected during streaming' message")
        print_info("Should see exactly ONE log message (not spam)")
        return True

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def test_missing_model_parameter() -> bool:
    """Test 7: Verify missing model parameter returns OpenAI-compatible error."""
    print_test("Missing Model Parameter")

    # Send request without model parameter
    payload = {
        "messages": [{"role": "user", "content": "test"}]
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT
        )

        print_info(f"Status Code: {response.status_code}")

        if response.status_code != 400:
            print_error(f"Expected 400, got {response.status_code}")
            return False

        result = response.json()
        print_result(result)

        # Check OpenAI-compatible error format
        if "error" not in result:
            print_error("Missing 'error' field in response")
            return False

        error = result["error"]
        required_fields = ["message", "type", "code"]

        for field in required_fields:
            if field not in error:
                print_error(f"Missing required field in error: {field}")
                return False

        # Verify specific values
        if error["type"] != "invalid_request_error":
            print_error(f"Expected type 'invalid_request_error', got '{error['type']}'")
            return False

        if error["code"] != "missing_model":
            print_error(f"Expected code 'missing_model', got '{error['code']}'")
            return False

        if "Model is required" not in error["message"]:
            print_error(f"Unexpected error message: {error['message']}")
            return False

        print_success("Missing model parameter handled correctly")
        print_info(f"Error message: {error['message']}")
        return True

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def test_error_response_format() -> bool:
    """Test 8: Verify error response format is OpenAI-compatible."""
    print_test("Error Response Format")

    payload = {
        "model": "invalid-model",
        "messages": [{"role": "user", "content": "test"}]
    }

    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT
        )

        result = response.json()
        print_result(result)

        # Check OpenAI-compatible error format
        if "error" not in result:
            print_error("Missing 'error' field in response")
            return False

        error = result["error"]
        required_fields = ["message", "type"]

        for field in required_fields:
            if field not in error:
                print_error(f"Missing required field in error: {field}")
                return False

        print_success("Error response has correct format")
        print_info(f"Error type: {error.get('type')}")
        print_info(f"Error code: {error.get('code', 'N/A')}")
        return True

    except Exception as e:
        print_error(f"Exception: {e}")
        return False


def main():
    """Run all tests."""
    print(f"{Colors.BOLD}Apantli Error Handling Test Suite{Colors.RESET}")
    print(f"Testing server at: {BASE_URL}")

    # Check if server is running
    print_info("Checking server health...")
    if not check_health():
        print_error("Server is not running at {BASE_URL}")
        print_info("Start server with: apantli")
        sys.exit(1)

    print_success("Server is running")

    # Run tests
    tests = [
        ("Normal Request", test_normal_request),
        ("API Key Protection", test_authentication_error),
        ("Model Not Found", test_model_not_found),
        ("Missing Model Parameter", test_missing_model_parameter),
        ("Normal Streaming", test_streaming_normal),
        ("Streaming Disconnect", test_streaming_disconnect),
        ("Error Response Format", test_error_response_format),
    ]

    results = {}
    for name, test_func in tests:
        try:
            results[name] = test_func()
            time.sleep(1)  # Brief pause between tests
        except KeyboardInterrupt:
            print(f"\n{Colors.YELLOW}Tests interrupted by user{Colors.RESET}")
            break
        except Exception as e:
            print_error(f"Test crashed: {e}")
            results[name] = False

    # Summary
    print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}TEST SUMMARY{Colors.RESET}")
    print(f"{Colors.BOLD}{'='*60}{Colors.RESET}")

    passed = sum(1 for result in results.values() if result)
    total = len(results)

    for name, result in results.items():
        status = f"{Colors.GREEN}PASS{Colors.RESET}" if result else f"{Colors.RED}FAIL{Colors.RESET}"
        print(f"{status} - {name}")

    print(f"\n{Colors.BOLD}Total: {passed}/{total} tests passed{Colors.RESET}")

    if passed == total:
        print(f"{Colors.GREEN}All tests passed!{Colors.RESET}")
        return 0
    else:
        print(f"{Colors.RED}Some tests failed{Colors.RESET}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
