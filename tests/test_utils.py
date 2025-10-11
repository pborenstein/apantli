"""Unit tests for utility functions."""

import pytest
from datetime import datetime, timedelta
from apantli.utils import convert_local_date_to_utc_range


def test_convert_local_date_to_utc_range_pst():
  """Test conversion from PST to UTC (UTC-8 = -480 minutes)."""
  # PST is UTC-8, so offset is -480 minutes
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", -480)

  # 2025-10-06 00:00:00 PST = 2025-10-06 08:00:00 UTC
  # 2025-10-07 00:00:00 PST = 2025-10-07 08:00:00 UTC
  assert start_utc == "2025-10-06T08:00:00"
  assert end_utc == "2025-10-07T08:00:00"


def test_convert_local_date_to_utc_range_est():
  """Test conversion from EST to UTC (UTC-5 = -300 minutes)."""
  # EST is UTC-5, so offset is -300 minutes
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", -300)

  # 2025-10-06 00:00:00 EST = 2025-10-06 05:00:00 UTC
  assert start_utc == "2025-10-06T05:00:00"
  assert end_utc == "2025-10-07T05:00:00"


def test_convert_local_date_to_utc_range_utc():
  """Test conversion with UTC (offset = 0)."""
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", 0)

  # No timezone conversion needed
  assert start_utc == "2025-10-06T00:00:00"
  assert end_utc == "2025-10-07T00:00:00"


def test_convert_local_date_to_utc_range_tokyo():
  """Test conversion from JST to UTC (UTC+9 = +540 minutes)."""
  # JST is UTC+9, so offset is +540 minutes
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", 540)

  # 2025-10-06 00:00:00 JST = 2025-10-05 15:00:00 UTC
  assert start_utc == "2025-10-05T15:00:00"
  assert end_utc == "2025-10-06T15:00:00"


def test_convert_local_date_to_utc_range_india():
  """Test conversion from IST to UTC (UTC+5:30 = +330 minutes)."""
  # IST is UTC+5:30, so offset is +330 minutes
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", 330)

  # 2025-10-06 00:00:00 IST = 2025-10-05 18:30:00 UTC
  assert start_utc == "2025-10-05T18:30:00"
  assert end_utc == "2025-10-06T18:30:00"


def test_convert_local_date_to_utc_range_full_day():
  """Test that the range covers exactly 24 hours."""
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", -480)

  start_dt = datetime.fromisoformat(start_utc)
  end_dt = datetime.fromisoformat(end_utc)

  # Should be exactly 24 hours apart
  assert (end_dt - start_dt) == timedelta(days=1)


def test_convert_local_date_to_utc_range_format():
  """Test that output is in ISO format."""
  start_utc, end_utc = convert_local_date_to_utc_range("2025-10-06", -480)

  # Should be parseable as ISO format
  datetime.fromisoformat(start_utc)
  datetime.fromisoformat(end_utc)

  # Should contain 'T' separator
  assert 'T' in start_utc
  assert 'T' in end_utc


def test_convert_local_date_to_utc_range_year_boundary():
  """Test conversion across year boundary."""
  # New Year's Eve in PST
  start_utc, end_utc = convert_local_date_to_utc_range("2024-12-31", -480)

  # 2024-12-31 00:00:00 PST = 2024-12-31 08:00:00 UTC
  # 2025-01-01 00:00:00 PST = 2025-01-01 08:00:00 UTC
  assert start_utc == "2024-12-31T08:00:00"
  assert end_utc == "2025-01-01T08:00:00"


def test_convert_local_date_to_utc_range_leap_year():
  """Test conversion on Feb 29 in leap year."""
  start_utc, end_utc = convert_local_date_to_utc_range("2024-02-29", -480)

  # Should handle leap day correctly
  assert start_utc == "2024-02-29T08:00:00"
  assert end_utc == "2024-03-01T08:00:00"
