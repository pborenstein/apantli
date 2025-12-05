# Calendar View Redesign Plan

## Overview

Redesign the calendar view to show all months with data in a scrollable list format, replace heat map visualization with bar graphs, and add week/range selection capabilities.

### Current State
- Single month view with prev/next navigation
- Heat map (flame graph) color coding based on cost intensity
- Click day to show provider breakdown in detail panel
- Limited to viewing one month at a time

### Target State
- Scrollable vertical list showing all months that have data
- Date range filter controls (matching Stats tab)
- Each day cell displays side-by-side bar graphs for cost and request count
- Click day → navigate to Stats tab with that day filtered
- Hover calendar row → highlight week
- Click highlighted week → navigate to Stats tab with that week filtered
- Click and drag to select date range → navigate to Stats tab with range filtered

## User Decisions

1. **Multi-month display**: Scrollable list (all months visible at once)
2. **Day click behavior**: Navigate to Stats tab with day filter applied
3. **Visualization**: Side-by-side bars for cost + requests (not heat map)
4. **Week selection**: Hover row to highlight, click to view week stats

## Implementation Strategy

### Phase 1: Data Fetching

**Objective**: Load all available data efficiently

**Current**: Fetches one month at a time via `/stats/daily?start_date=X&end_date=Y`

**New approach**:
1. On calendar tab load, fetch `/stats/date-range` to get min/max dates
2. Fetch all daily data from min to max date using `/stats/daily?start_date={min}&end_date={max}`
3. Cache data in memory to avoid refetching
4. Respect date range filter if user applies one (same as Stats tab)

**API endpoints to use**:
- `GET /stats/date-range` - returns `{start_date, end_date}`
- `GET /stats/daily?start_date=X&end_date=Y&timezone_offset=Z` - returns daily aggregated data

### Phase 2: Date Range Filter Controls

**Objective**: Add same filter controls as Stats tab

**Location**: Top of calendar tab, before calendar grid

**Components to add** (copy from Stats tab):
- Quick filter buttons: All Time, Today, Yesterday, This Week, This Month, Last 30 Days
- Custom date range inputs (start date, end date)
- Clear Filter button
- Active filter display text

**Integration**:
- Reuse Alpine.js `dateFilter` state (already exists)
- Calendar should watch `dateFilter` and reload when changed
- Apply filter to data fetch (only show months/days within filtered range)

**Implementation**:
- Copy filter HTML from Stats tab in `templates/dashboard.html` (lines 332-357)
- Calendar already has access to `alpineData.dateFilter` via watcher
- Update `loadCalendar()` to use `dateFilter` instead of `currentMonth`

### Phase 3: Multi-Month Scrollable Layout

**Objective**: Display all months in vertical scrollable container

**Current structure**:
```html
<div class="calendar-header">
  <button prev/next>
  <h2>Current Month</h2>
</div>
<div class="calendar-grid"><!-- single month --></div>
```

**New structure**:
```html
<div class="calendar-container">
  <!-- Month 1 -->
  <div class="calendar-month">
    <h3 class="month-header">November 2025</h3>
    <div class="calendar-grid">
      <!-- day cells -->
    </div>
  </div>

  <!-- Month 2 -->
  <div class="calendar-month">
    <h3 class="month-header">December 2025</h3>
    <div class="calendar-grid">
      <!-- day cells -->
    </div>
  </div>

  <!-- ... more months -->
</div>
```

**Rendering logic**:
1. Group `calendarData` by month
2. Iterate through months in chronological order
3. For each month, render:
   - Month header (e.g., "November 2025")
   - Calendar grid with day cells
   - Week row hover/click handlers

**CSS changes**:
```css
.calendar-container {
  max-height: 80vh;
  overflow-y: auto;
  padding: 20px;
}

.calendar-month {
  margin-bottom: 40px;
}

.month-header {
  font-size: 1.2em;
  margin-bottom: 10px;
  color: var(--color-text-primary);
}
```

### Phase 4: Bar Graph Visualization

**Objective**: Replace heat map colors with side-by-side bar graphs

**Current day cell**:
- Background color based on cost intensity
- Day number + cost + request count as text

**New day cell design**:
```
┌─────────────┐
│ 15          │  ← day number (top-left)
│             │
│  ▂▃▅        │  ← cost bar (height = cost ratio)
│  ▂▃         │  ← request bar (height = request ratio)
│             │
│ $0.42  8req │  ← text labels (bottom)
└─────────────┘
```

**Implementation approach**:

1. **Calculate scales**:
   - For each month, find `maxCost` and `maxRequests`
   - Each bar height = (value / max) * 100%

2. **HTML structure**:
```html
<div class="calendar-day" data-date="2025-11-15">
  <div class="day-number">15</div>
  <div class="day-bars">
    <div class="bar-container">
      <div class="bar cost-bar" style="height: 65%"></div>
      <div class="bar-label">$0.42</div>
    </div>
    <div class="bar-container">
      <div class="bar requests-bar" style="height: 42%"></div>
      <div class="bar-label">8</div>
    </div>
  </div>
</div>
```

3. **CSS**:
```css
.calendar-day {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  padding: 8px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.day-number {
  font-size: 0.9em;
  font-weight: 500;
  margin-bottom: 4px;
}

.day-bars {
  display: flex;
  gap: 8px;
  flex: 1;
  align-items: flex-end;
  margin-top: auto;
}

.bar-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 50px;
}

.bar {
  width: 100%;
  min-height: 2px;
  margin-bottom: 4px;
}

.cost-bar {
  background: var(--color-primary); /* blue */
}

.requests-bar {
  background: var(--color-accent); /* green or orange */
}

.bar-label {
  font-size: 0.75em;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
```

**Remove**:
- `getCostColor()` function
- Heat map color logic from `renderCalendar()`

### Phase 5: Day Click Navigation

**Objective**: Click day → navigate to Stats tab with day filter

**Current**: Shows detail panel with provider breakdown

**New behavior**:
1. User clicks day cell (e.g., "2025-11-15")
2. Update `alpineData.dateFilter` to `{startDate: '2025-11-15', endDate: '2025-11-15'}`
3. Switch to Stats tab: `alpineData.currentTab = 'stats'`
4. Stats tab auto-refreshes due to `dateFilter` watcher

**Implementation**:
```javascript
function onDayClick(date) {
  if (!alpineData) return;

  // Set filter to single day
  alpineData.dateFilter.startDate = date;
  alpineData.dateFilter.endDate = date;

  // Navigate to Stats tab
  alpineData.currentTab = 'stats';

  // Update URL hash for browser history
  window.location.hash = 'stats';
}
```

**Remove**:
- Day detail panel HTML
- `renderDayDetail()` function
- Provider breakdown rendering code

### Phase 6: Week Selection

**Objective**: Hover row → highlight week, click → view week stats

**Visual design**:
- Hovering over any day in a week row highlights entire row
- Week number (1-52) displayed on left side
- Clicking week number or anywhere in highlighted row selects week

**HTML structure update**:
```html
<div class="calendar-grid-wrapper">
  <div class="week-numbers">
    <div class="week-number" data-week-start="2025-11-09">45</div>
    <div class="week-number" data-week-start="2025-11-16">46</div>
    <!-- ... -->
  </div>

  <div class="calendar-grid">
    <div class="calendar-day week-45" data-date="2025-11-09">...</div>
    <div class="calendar-day week-45" data-date="2025-11-10">...</div>
    <!-- ... -->
  </div>
</div>
```

**CSS**:
```css
.calendar-grid-wrapper {
  display: flex;
  gap: 10px;
}

.week-numbers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.week-number {
  height: 80px; /* Match day cell height */
  width: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s;
}

.week-number:hover,
.week-number.active {
  background: var(--color-primary-alpha-10);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.calendar-day.week-highlighted {
  box-shadow: inset 0 0 0 2px var(--color-primary-alpha-30);
}
```

**JavaScript**:
```javascript
// Calculate week number from date
function getWeekNumber(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Get Monday of the week containing this date
function getWeekStart(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Get Sunday of the week containing this date
function getWeekEnd(dateStr) {
  const start = getWeekStart(dateStr);
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  return endDate.toISOString().split('T')[0];
}

// Hover handlers
function onWeekHover(weekClass, isEntering) {
  const days = document.querySelectorAll(`.calendar-day.${weekClass}`);
  days.forEach(day => {
    if (isEntering) {
      day.classList.add('week-highlighted');
    } else {
      day.classList.remove('week-highlighted');
    }
  });
}

// Click handler
function onWeekClick(weekStartDate) {
  if (!alpineData) return;

  const weekEnd = getWeekEnd(weekStartDate);

  // Set filter to week range
  alpineData.dateFilter.startDate = weekStartDate;
  alpineData.dateFilter.endDate = weekEnd;

  // Navigate to Stats tab
  alpineData.currentTab = 'stats';
  window.location.hash = 'stats';
}
```

**Event binding**:
```javascript
// Attach to week numbers
weekNumberEl.addEventListener('mouseenter', () => onWeekHover(`week-${weekNum}`, true));
weekNumberEl.addEventListener('mouseleave', () => onWeekHover(`week-${weekNum}`, false));
weekNumberEl.addEventListener('click', () => onWeekClick(weekStartDate));

// Also attach to calendar days in the row
dayEl.addEventListener('mouseenter', () => onWeekHover(dayEl.dataset.weekClass, true));
dayEl.addEventListener('mouseleave', () => onWeekHover(dayEl.dataset.weekClass, false));
```

### Phase 7: Range Selection

**Objective**: Click and drag to select date range

**Interaction flow**:
1. User clicks and holds on day A
2. User drags to day B (visual feedback shows selection)
3. User releases mouse
4. Navigate to Stats tab with range A-B filtered

**State tracking**:
```javascript
let rangeSelectionStart = null;
let rangeSelectionEnd = null;
let isSelecting = false;
```

**Visual feedback**:
```css
.calendar-day.range-selecting {
  background: var(--color-primary-alpha-20);
  border: 1px solid var(--color-primary);
}

.calendar-day.range-start {
  border-left: 3px solid var(--color-primary);
}

.calendar-day.range-end {
  border-right: 3px solid var(--color-primary);
}
```

**Event handlers**:
```javascript
function onDayMouseDown(date, event) {
  // Prevent week hover from interfering
  event.stopPropagation();

  rangeSelectionStart = date;
  rangeSelectionEnd = date;
  isSelecting = true;

  updateRangeSelection();
}

function onDayMouseEnter(date) {
  if (!isSelecting) return;

  rangeSelectionEnd = date;
  updateRangeSelection();
}

function onDayMouseUp(date) {
  if (!isSelecting) return;

  isSelecting = false;

  // Ensure start < end
  const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort();

  // Navigate to Stats with range
  if (alpineData) {
    alpineData.dateFilter.startDate = start;
    alpineData.dateFilter.endDate = end;
    alpineData.currentTab = 'stats';
    window.location.hash = 'stats';
  }

  // Clear selection state
  clearRangeSelection();
}

function updateRangeSelection() {
  // Remove all selection classes
  document.querySelectorAll('.calendar-day').forEach(el => {
    el.classList.remove('range-selecting', 'range-start', 'range-end');
  });

  if (!rangeSelectionStart || !rangeSelectionEnd) return;

  const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort();
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');

  // Mark all days in range
  document.querySelectorAll('.calendar-day').forEach(el => {
    const dateStr = el.dataset.date;
    if (!dateStr) return;

    const date = new Date(dateStr + 'T00:00:00');

    if (date >= startDate && date <= endDate) {
      el.classList.add('range-selecting');
      if (dateStr === start) el.classList.add('range-start');
      if (dateStr === end) el.classList.add('range-end');
    }
  });
}

function clearRangeSelection() {
  rangeSelectionStart = null;
  rangeSelectionEnd = null;
  document.querySelectorAll('.calendar-day').forEach(el => {
    el.classList.remove('range-selecting', 'range-start', 'range-end');
  });
}

// Global mouse up listener (in case user releases outside calendar)
document.addEventListener('mouseup', () => {
  if (isSelecting) {
    onDayMouseUp(rangeSelectionEnd);
  }
});
```

**Conflict resolution**:
- Day click vs. range selection: Use `mousedown`+`mouseup` on same day = click
- Week hover vs. range selection: Range selection takes precedence (stop propagation)
- Touch support: Add `touchstart`/`touchmove`/`touchend` equivalents

## Files to Modify

### 1. `templates/dashboard.html`
**Changes**:
- Remove month navigation buttons
- Add date range filter controls (copy from Stats tab section)
- Update calendar tab HTML structure for multi-month layout
- Remove day detail panel

**Lines affected**: ~390-401

### 2. `apantli/static/js/modules/calendar.js`
**Major refactor** - currently 138 lines, expect ~300+ lines after changes

**Changes**:
- Remove `loadCalendar()` single-month logic
- Add `loadAllMonths()` function using date range
- Refactor `renderCalendar()` to render multiple months
- Replace heat map color logic with bar graph rendering
- Add week calculation and rendering functions
- Implement range selection state and handlers
- Add navigation functions (onDayClick, onWeekClick)

### 3. `apantli/static/js/dashboard.js`
**Changes**:
- Update calendar initialization code
- Wire up date filter watcher to calendar reload
- Remove `getCostColor()` function (lines ~1573-1592)
- Update `onDayClick()` to navigate instead of showing detail (lines ~1685-1724)

**Lines affected**: ~1569-1724

### 4. `apantli/static/css/dashboard.css`
**Changes**:
- Replace calendar heat map styles with bar graph styles
- Add multi-month container styles
- Add week number column styles
- Add range selection visual feedback styles
- Update hover states for week highlighting

**Lines affected**: ~712-856

### 5. No backend changes required
All existing API endpoints support the new functionality:
- `/stats/date-range` - already exists
- `/stats/daily` - already supports arbitrary date ranges
- No new endpoints needed

## Testing Checklist

### Visual/Layout
- [ ] All months display in vertical scrollable list
- [ ] Month headers clearly separate each month
- [ ] Bar graphs render correctly with proper scaling
- [ ] Calendar grid maintains 7-column layout
- [ ] Week numbers align with calendar rows
- [ ] Responsive on different screen sizes

### Date Range Filter
- [ ] Quick filter buttons work (Today, This Week, etc.)
- [ ] Custom date inputs filter calendar correctly
- [ ] Clear Filter resets to all data
- [ ] Active filter text displays correctly
- [ ] Filter persists in localStorage

### Navigation
- [ ] Day click navigates to Stats tab with day filter
- [ ] Week hover highlights entire week row
- [ ] Week click navigates to Stats tab with week filter
- [ ] Range selection (drag) works across days
- [ ] Range selection works across weeks
- [ ] Range selection works across months

### Data Accuracy
- [ ] Bar heights accurately represent cost/request ratios
- [ ] Week numbers calculated correctly (1-52)
- [ ] Week ranges span Monday-Sunday correctly
- [ ] Empty days show no bars (or minimal height)
- [ ] Data loads correctly for filtered date ranges

### Accessibility
- [ ] Keyboard navigation works for day/week selection
- [ ] ARIA labels updated for new interactions
- [ ] Focus indicators visible
- [ ] Screen reader announces selections

### Edge Cases
- [ ] Partial weeks at month start/end handled correctly
- [ ] Single-day months render properly
- [ ] Leap years handled correctly
- [ ] Timezone conversions work correctly
- [ ] Empty months (no data) display appropriately

## Implementation Order

1. **Phase 2** (Date Range Filter) - foundational for all other features
2. **Phase 1** (Data Fetching) - load all data instead of one month
3. **Phase 3** (Multi-Month Layout) - render multiple months
4. **Phase 4** (Bar Graphs) - replace heat map visualization
5. **Phase 5** (Day Click) - simplest navigation feature
6. **Phase 6** (Week Selection) - more complex with hover states
7. **Phase 7** (Range Selection) - most complex interaction

## Estimated Scope

- **New code**: ~400-500 lines JavaScript, ~100 lines CSS
- **Modified code**: ~200 lines JavaScript, ~100 lines HTML
- **Deleted code**: ~150 lines (heat map logic, detail panel)
- **Net change**: +350-450 lines

**Time estimate**: 4-6 hours for full implementation and testing

## Migration Notes

**Backwards compatibility**: None required (UI-only changes)

**User impact**:
- Positive: Can see all historical data at once
- Positive: More efficient navigation to filtered views
- Neutral: Different visual style (bars vs. heat map)
- Training: Users need to learn new interactions (week selection, range drag)

**Rollback plan**: Git revert commits if issues arise
