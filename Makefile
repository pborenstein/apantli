.PHONY: test typecheck all clean

# Run all checks
all: typecheck test

# Run type checking with mypy
typecheck:
	@echo "Running type checks..."
	@mypy apantli/

# Run unit tests
test:
	@echo "Running unit tests..."
	@python run_unit_tests.py

# Clean Python cache files
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
