"""Utility functions for date/time operations."""

from datetime import datetime, timedelta


def convert_local_date_to_utc_range(date_str: str, timezone_offset_minutes: int):
  """Convert a local date string to UTC timestamp range.

  Args:
    date_str: ISO date like "2025-10-06"
    timezone_offset_minutes: Minutes from UTC (negative for west, positive for east)

  Returns:
    (start_utc, end_utc) as ISO timestamp strings (inclusive start, exclusive end)
  """
  # Parse local date at midnight
  local_date = datetime.fromisoformat(date_str)

  # Convert to UTC by subtracting the timezone offset
  utc_start = local_date - timedelta(minutes=timezone_offset_minutes)
  utc_end = utc_start + timedelta(days=1)

  return utc_start.isoformat(), utc_end.isoformat()
