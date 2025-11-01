// Calendar view for daily statistics

import { state } from './state.js'
import { formatDate, getCostColor, getProviderColor } from './core.js'

let selectedDate = null
let calendarData = {}

// Load calendar data for current month
export async function loadCalendar() {
  const year = state.currentMonth.getFullYear()
  const month = state.currentMonth.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const startDate = formatDate(firstDay)
  const endDate = formatDate(lastDay)

  // Get browser timezone offset in minutes from UTC (negative for west)
  const timezoneOffset = -new Date().getTimezoneOffset()

  const res = await fetch(`/stats/daily?start_date=${startDate}&end_date=${endDate}&timezone_offset=${timezoneOffset}`)
  const data = await res.json()

  calendarData = {}
  data.daily.forEach(day => {
    calendarData[day.date] = day
  })

  renderCalendar(year, month)
}

// Render calendar grid
function renderCalendar(year, month) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December']
  document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const today = formatDate(new Date())
  const maxCost = Math.max(...Object.values(calendarData).map(d => d.cost), 0.01)

  let html = ''
  ;['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`
  })

  for (let i = 0; i < startingDayOfWeek; i++) {
    html += '<div class="calendar-day empty"></div>'
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDate(new Date(year, month, day))
    const dayData = calendarData[date] || { requests: 0, cost: 0 }
    const bgColor = getCostColor(dayData.cost, maxCost)
    const isToday = date === today ? 'today' : ''

    const ariaLabel = `${date}: ${dayData.requests} requests, $${dayData.cost.toFixed(2)} total cost`
    html += `
      <div class="calendar-day ${isToday}"
           style="background-color: ${bgColor}"
           onclick="window.onDayClick('${date}')"
           onkeydown="window.handleCalendarKeyPress(event, '${date}')"
           tabindex="0"
           role="gridcell"
           aria-label="${ariaLabel}"
           data-date="${date}">
        <div class="day-number">${day}</div>
        <div class="day-cost">$${dayData.cost.toFixed(2)}</div>
        <div class="day-requests">${dayData.requests} req</div>
      </div>
    `
  }

  document.getElementById('calendar-grid').innerHTML = html
}

// Navigate to previous/next month
export function navigateMonth(direction) {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + direction, 1)
  loadCalendar()
}

// Handle keyboard navigation in calendar
export function handleCalendarKeyPress(event, date) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onDayClick(date)
  }
}

// Handle day click to show details
export function onDayClick(date) {
  selectedDate = date
  const dayData = calendarData[date]

  if (!dayData || dayData.requests === 0) {
    document.getElementById('day-detail').style.display = 'none'
    return
  }

  const detailTitle = document.getElementById('day-detail-title')
  const detailContent = document.getElementById('day-detail-content')

  detailTitle.textContent = `${date} - $${dayData.cost.toFixed(4)} across ${dayData.requests} requests`

  let providersHtml = '<h4>By Provider:</h4>'
  const totalCost = dayData.cost

  dayData.by_provider.forEach(p => {
    const percentage = totalCost > 0 ? (p.cost / totalCost * 100) : 0
    const color = getProviderColor(p.provider)

    providersHtml += `
      <div class="provider-bar">
        <div class="provider-header">
          <span class="provider-name">${p.provider}</span>
          <span class="provider-percentage">${percentage.toFixed(0)}%</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill" style="width: ${percentage}%; background: ${color}"></div>
        </div>
        <div class="provider-details">
          $${p.cost.toFixed(4)} across ${p.requests} requests
        </div>
      </div>
    `
  })

  detailContent.innerHTML = providersHtml
  document.getElementById('day-detail').style.display = 'block'
}
