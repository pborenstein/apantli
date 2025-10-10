#!/usr/bin/env python3
"""Redact API keys from existing database records."""

import sqlite3
import json
import sys

DB_PATH = "requests.db"


def redact_api_keys(dry_run=False):
    """Redact API keys from request_data in existing database records."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Find all records with request_data
    cursor.execute("""
        SELECT id, request_data
        FROM requests
        WHERE request_data IS NOT NULL
    """)

    records = cursor.fetchall()
    print(f"Found {len(records)} records with request_data")

    updated = 0
    skipped = 0
    errors = 0

    for record_id, request_data_json in records:
        try:
            # Parse the JSON
            request_data = json.loads(request_data_json)

            # Check if api_key exists and needs redaction
            if 'api_key' in request_data:
                original_key = request_data['api_key']

                # Skip if already redacted
                if original_key == 'sk-redacted':
                    skipped += 1
                    continue

                # Redact the key
                request_data['api_key'] = 'sk-redacted'
                new_json = json.dumps(request_data)

                if dry_run:
                    print(f"  [DRY RUN] Would redact request {record_id}: {original_key[:10]}... → sk-redacted")
                else:
                    cursor.execute(
                        "UPDATE requests SET request_data = ? WHERE id = ?",
                        (new_json, record_id)
                    )
                    print(f"  Redacted request {record_id}: {original_key[:10]}... → sk-redacted")

                updated += 1
            else:
                skipped += 1

        except json.JSONDecodeError as e:
            print(f"  ❌ Request {record_id}: Invalid JSON - {e}")
            errors += 1
        except Exception as e:
            print(f"  ❌ Request {record_id}: {e}")
            errors += 1

    if not dry_run:
        conn.commit()
        print(f"\n✅ Updated {updated} records")
    else:
        print(f"\n[DRY RUN] Would update {updated} records")

    if skipped > 0:
        print(f"⏭️  Skipped {skipped} records (no api_key or already redacted)")

    if errors > 0:
        print(f"❌ {errors} errors encountered")

    conn.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Redact API keys from existing database records"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes"
    )

    args = parser.parse_args()

    if args.dry_run:
        print("🔍 DRY RUN MODE - no changes will be made\n")
    else:
        print("⚠️  This will modify the database. Make a backup first if needed.\n")
        response = input("Continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted.")
            sys.exit(0)
        print()

    redact_api_keys(dry_run=args.dry_run)
