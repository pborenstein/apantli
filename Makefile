.PHONY: test typecheck all clean update-pricing update-deps

# Run all checks
all: typecheck test

# Run type checking with mypy
typecheck:
	@echo "Running type checks..."
	@uv run mypy apantli/

# Run unit tests
test:
	@echo "Running unit tests..."
	@uv run python run_unit_tests.py

# Update LiteLLM pricing data
update-pricing:
	@echo "Updating LiteLLM package for latest pricing data..."
	@uv sync --upgrade-package litellm
	@echo ""
	@if [ -f requests.db ]; then \
		echo "Recalculating costs for historical requests..."; \
		uv run python utils/recalculate_costs.py; \
		echo ""; \
	else \
		echo "No database found - skipping cost recalculation."; \
		echo ""; \
	fi
	@echo "✓ Pricing update complete. Restart apantli to use new pricing."

# Update all dependencies
update-deps:
	@echo "Updating all dependencies..."
	@uv sync --upgrade --extra dev
	@echo "✓ Dependencies updated. Run 'make all' to verify."

# Clean Python cache files
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
