"""Utility functions for date/time operations."""

from datetime import datetime, timedelta
from typing import Optional


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


def build_time_filter(hours: Optional[int] = None,
                     start_date: Optional[str] = None,
                     end_date: Optional[str] = None,
                     timezone_offset: Optional[int] = None) -> str:
  """Build SQL time filter clause with timezone handling.

  Args:
    hours: Filter to last N hours
    start_date: ISO date string (YYYY-MM-DD) for range start
    end_date: ISO date string (YYYY-MM-DD) for range end
    timezone_offset: Browser timezone offset in minutes from UTC

  Returns:
    SQL WHERE clause fragment (e.g., "AND timestamp >= '...'") or empty string
  """
  if hours:
    return f"AND datetime(timestamp) > datetime('now', '-{hours} hours')"

  if start_date and end_date:
    if timezone_offset is not None:
      # Convert local date range to UTC timestamps for efficient indexed queries
      start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
      _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
      return f"AND timestamp >= '{start_utc}' AND timestamp < '{end_utc}'"
    else:
      # No timezone conversion needed
      end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
      return f"AND timestamp >= '{start_date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"

  if start_date:
    if timezone_offset is not None:
      start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
      return f"AND timestamp >= '{start_utc}'"
    else:
      return f"AND timestamp >= '{start_date}T00:00:00'"

  if end_date:
    if timezone_offset is not None:
      _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
      return f"AND timestamp < '{end_utc}'"
    else:
      end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
      return f"AND timestamp < '{end_dt.date()}T00:00:00'"

  return ""
