// Calendar view for daily statistics - multi-month scrollable with bar graphs

import { state } from './state.js'
import { formatDate } from './core.js'

let calendarData = {}
let alpineData = null

// Range selection state
let rangeSelectionStart = null
let rangeSelectionEnd = null
let isSelecting = false

// Initialize calendar with Alpine.js data reference
export function initCalendar(alpine) {
  alpineData = alpine
}

// Load calendar data for all months (or filtered range)
export async function loadCalendar() {
  if (!alpineData) return

  const filter = alpineData.dateFilter
  const timezoneOffset = -new Date().getTimezoneOffset()

  let startDate, endDate

  if (filter.startDate && filter.endDate) {
    // Use filtered range
    startDate = filter.startDate
    endDate = filter.endDate
  } else {
    // Fetch all available data
    const rangeRes = await fetch('/stats/date-range')
    const rangeData = await rangeRes.json()

    if (!rangeData.start_date || !rangeData.end_date) {
      document.getElementById('calendar-container').innerHTML = '<div class="calendar-empty">No data available</div>'
      return
    }

    startDate = rangeData.start_date
    endDate = rangeData.end_date
  }

  // Fetch daily stats for the entire range
  const res = await fetch(`/stats/daily?start_date=${startDate}&end_date=${endDate}&timezone_offset=${timezoneOffset}`)
  const data = await res.json()

  // Store data by date
  calendarData = {}
  data.daily.forEach(day => {
    calendarData[day.date] = day
  })

  // Render all months
  renderAllMonths(startDate, endDate)
}

// Render all months in the date range
function renderAllMonths(startDate, endDate) {
  const container = document.getElementById('calendar-container')
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')

  // Group data by month
  const monthsData = {}
  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)

  for (let d = new Date(startMonth); d <= endMonth; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthsData[key] = {
      year: d.getFullYear(),
      month: d.getMonth()
    }
  }

  // Render each month
  let html = ''
  Object.values(monthsData).reverse().forEach(({ year, month }) => {
    html += renderMonth(year, month)
  })

  container.innerHTML = html

  // Attach event listeners after rendering
  attachEventListeners()
}

// Render a single month
function renderMonth(year, month) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December']

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  // Calculate max cost and requests for this month (for bar scaling)
  const monthData = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDate(new Date(year, month, day))
    const dayData = calendarData[date]
    if (dayData) monthData.push(dayData)
  }

  const maxCost = Math.max(...monthData.map(d => d.cost), 0.01)
  const maxRequests = Math.max(...monthData.map(d => d.requests), 1)

  const today = formatDate(new Date())

  let html = `
    <div class="calendar-month">
      <h3 class="month-header">${monthNames[month]} ${year}</h3>
      <div class="calendar-grid-wrapper">
        <div class="week-numbers" id="week-numbers-${year}-${month}">
  `

  // Calculate week numbers and render week column
  const weeks = []
  let currentWeekStart = null
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const dayOfWeek = date.getDay()

    if (dayOfWeek === 0 || day === 1) { // Sunday or first day of month
      const weekStart = getWeekStart(formatDate(date))
      if (weekStart !== currentWeekStart) {
        currentWeekStart = weekStart
        weeks.push({
          number: getWeekNumber(weekStart),
          startDate: weekStart
        })
      }
    }
  }

  weeks.forEach(week => {
    html += `
      <div class="week-number"
           data-week-start="${week.startDate}"
           data-week-num="${week.number}">
        ${week.number}
      </div>
    `
  })

  html += `
        </div>
        <div class="calendar-grid">
  `

  // Day headers
  ;['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`
  })

  // Empty cells before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += '<div class="calendar-day empty"></div>'
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDate(new Date(year, month, day))
    const dayData = calendarData[date] || { requests: 0, cost: 0 }
    const isToday = date === today ? 'today' : ''
    const weekClass = `week-${getWeekNumber(date)}`

    const costHeight = dayData.cost > 0 ? (dayData.cost / maxCost * 100) : 0
    const requestsHeight = dayData.requests > 0 ? (dayData.requests / maxRequests * 100) : 0

    const ariaLabel = `${date}: ${dayData.requests} requests, $${dayData.cost.toFixed(2)} total cost`

    html += `
      <div class="calendar-day ${isToday} ${weekClass}"
           data-date="${date}"
           tabindex="0"
           role="gridcell"
           aria-label="${ariaLabel}">
        <div class="day-number">${day}</div>
        <div class="day-bars">
          <div class="bar-container">
            <div class="bar cost-bar" style="height: ${costHeight}%"></div>
            <div class="bar-label">$${dayData.cost.toFixed(2)}</div>
          </div>
          <div class="bar-container">
            <div class="bar requests-bar" style="height: ${requestsHeight}%"></div>
            <div class="bar-label">${dayData.requests}</div>
          </div>
        </div>
      </div>
    `
  }

  html += `
        </div>
      </div>
    </div>
  `

  return html
}

// Attach event listeners to calendar elements
function attachEventListeners() {
  // Day click/drag event listeners
  document.querySelectorAll('.calendar-day:not(.empty)').forEach(el => {
    const date = el.dataset.date

    el.addEventListener('mousedown', (e) => onDayMouseDown(date, e))
    el.addEventListener('mouseenter', () => onDayMouseEnter(date))
    el.addEventListener('mouseup', () => onDayMouseUp(date))

    // Keyboard support
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onDayClick(date)
      }
    })
  })

  // Week number event listeners
  document.querySelectorAll('.week-number').forEach(el => {
    const weekStart = el.dataset.weekStart
    const weekNum = el.dataset.weekNum

    el.addEventListener('mouseenter', () => onWeekHover(`week-${weekNum}`, true))
    el.addEventListener('mouseleave', () => onWeekHover(`week-${weekNum}`, false))
    el.addEventListener('click', () => onWeekClick(weekStart))
  })

  // Global mouseup for range selection
  document.addEventListener('mouseup', handleGlobalMouseUp, { once: false })
}

// Week number calculation
function getWeekNumber(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

// Get Monday of the week containing this date
function getWeekStart(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(date.setDate(diff))
  return monday.toISOString().split('T')[0]
}

// Get Sunday of the week containing this date
function getWeekEnd(dateStr) {
  const start = getWeekStart(dateStr)
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  return endDate.toISOString().split('T')[0]
}

// Day click - navigate to Stats tab
function onDayClick(date) {
  if (!alpineData) return

  alpineData.dateFilter.startDate = date
  alpineData.dateFilter.endDate = date
  alpineData.currentTab = 'stats'
  window.location.hash = 'stats'
}

// Week hover - highlight week row
function onWeekHover(weekClass, isEntering) {
  const days = document.querySelectorAll(`.calendar-day.${weekClass}`)
  days.forEach(day => {
    if (isEntering) {
      day.classList.add('week-highlighted')
    } else {
      day.classList.remove('week-highlighted')
    }
  })
}

// Week click - navigate to Stats tab with week filter
function onWeekClick(weekStartDate) {
  if (!alpineData) return

  const weekEnd = getWeekEnd(weekStartDate)
  alpineData.dateFilter.startDate = weekStartDate
  alpineData.dateFilter.endDate = weekEnd
  alpineData.currentTab = 'stats'
  window.location.hash = 'stats'
}

// Range selection handlers
function onDayMouseDown(date, event) {
  event.stopPropagation()

  rangeSelectionStart = date
  rangeSelectionEnd = date
  isSelecting = true

  updateRangeSelection()
}

function onDayMouseEnter(date) {
  if (!isSelecting) return

  rangeSelectionEnd = date
  updateRangeSelection()
}

function onDayMouseUp(date) {
  if (!isSelecting) return

  isSelecting = false

  // Check if it's a click (same day) vs drag
  if (rangeSelectionStart === rangeSelectionEnd) {
    // Single day click
    onDayClick(date)
  } else {
    // Range selection
    const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort()

    if (alpineData) {
      alpineData.dateFilter.startDate = start
      alpineData.dateFilter.endDate = end
      alpineData.currentTab = 'stats'
      window.location.hash = 'stats'
    }
  }

  clearRangeSelection()
}

function handleGlobalMouseUp() {
  if (isSelecting) {
    onDayMouseUp(rangeSelectionEnd)
  }
}

function updateRangeSelection() {
  // Remove all selection classes
  document.querySelectorAll('.calendar-day').forEach(el => {
    el.classList.remove('range-selecting', 'range-start', 'range-end')
  })

  if (!rangeSelectionStart || !rangeSelectionEnd) return

  const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort()
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')

  // Mark all days in range
  document.querySelectorAll('.calendar-day').forEach(el => {
    const dateStr = el.dataset.date
    if (!dateStr) return

    const date = new Date(dateStr + 'T00:00:00')

    if (date >= startDate && date <= endDate) {
      el.classList.add('range-selecting')
      if (dateStr === start) el.classList.add('range-start')
      if (dateStr === end) el.classList.add('range-end')
    }
  })
}

function clearRangeSelection() {
  rangeSelectionStart = null
  rangeSelectionEnd = null
  document.querySelectorAll('.calendar-day').forEach(el => {
    el.classList.remove('range-selecting', 'range-start', 'range-end')
  })
}

// Cleanup on navigation away from calendar
export function cleanupCalendar() {
  document.removeEventListener('mouseup', handleGlobalMouseUp)
}
