// Calendar rendering with date range selection
import { getProviderColor } from './core.js'

// Module-level state
let calendarData = {}
let rangeSelectionStart = null
let rangeSelectionEnd = null
let isSelecting = false


function formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export async function loadCalendar() {
    if (!alpineData) return

    const filter = alpineData.dateFilter
    const timezoneOffset = -new Date().getTimezoneOffset()

    let startDate, endDate

    if (filter.startDate && filter.endDate) {
        startDate = filter.startDate
        endDate = filter.endDate
    } else {
        const rangeRes = await fetch('/stats/date-range')
        const rangeData = await rangeRes.json()

        if (!rangeData.start_date || !rangeData.end_date) {
            document.getElementById('calendar-container').innerHTML = '<div class="calendar-empty">No data available</div>'
            return
        }

        startDate = rangeData.start_date
        endDate = rangeData.end_date
    }

    const res = await fetch(`/stats/daily?start_date=${startDate}&end_date=${endDate}&timezone_offset=${timezoneOffset}`)
    const data = await res.json()

    calendarData = {}
    data.daily.forEach(day => {
        calendarData[day.date] = day
    })

    renderAllMonths(startDate, endDate)
}

function renderAllMonths(startDate, endDate) {
    const container = document.getElementById('calendar-container')
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')

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

    // Calculate intensity levels based on quartiles (GitHub style)
    const costs = Object.values(calendarData).map(d => d.cost).filter(c => c > 0)
    costs.sort((a, b) => a - b)

    const intensityLevels = {
        q1: costs[Math.floor(costs.length * 0.25)] || 0,
        q2: costs[Math.floor(costs.length * 0.50)] || 0,
        q3: costs[Math.floor(costs.length * 0.75)] || 0
    }

    let html = ''
    Object.values(monthsData).reverse().forEach(({ year, month }) => {
        html += renderMonth(year, month, intensityLevels)
    })

    container.innerHTML = html
    attachCalendarListeners()
}

function renderMonth(year, month, intensityLevels) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()

    // Group days into weeks
    const weeks = []
    let currentWeek = null

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day)
        const dateStr = formatDate(date)
        const dayOfWeek = date.getDay()

        if (dayOfWeek === 0 || day === 1) {
            if (currentWeek) weeks.push(currentWeek)
            const weekStart = getWeekStart(dateStr)
            currentWeek = {
                number: getWeekNumber(weekStart),
                startDate: weekStart,
                days: []
            }
        }

        currentWeek.days.push({
            date: dateStr,
            dayNum: day,
            data: calendarData[dateStr] || { requests: 0, cost: 0 }
        })
    }
    if (currentWeek) weeks.push(currentWeek)

    // Helper to get intensity level
    function getIntensityClass(cost) {
        if (cost === 0) return 'level-0'
        if (cost <= intensityLevels.q1) return 'level-1'
        if (cost <= intensityLevels.q2) return 'level-2'
        if (cost <= intensityLevels.q3) return 'level-3'
        return 'level-4'
    }

    let html = `
        <div class="calendar-month">
          <h3 class="month-header">${monthNames[month]} ${year}</h3>
          <div class="calendar-weeks">
    `

    weeks.forEach((week, weekIndex) => {
        const weekEnd = getWeekEnd(week.startDate)
        const weekTotalCost = week.days.reduce((sum, d) => sum + d.data.cost, 0)
        const weekTotalRequests = week.days.reduce((sum, d) => sum + d.data.requests, 0)

        html += `
            <div class="week-row" data-week-start="${week.startDate}">
                <div class="week-label"
                     data-week-num="${week.number}"
                     title="Week ${week.number}: Click for week stats">
                    ${week.number}
                </div>
                <div class="week-grid">
        `

        // Calculate how many leading/trailing empty squares needed
        // First day in this week's days array tells us where we start
        const firstDayInWeek = new Date(week.days[0].date + 'T00:00:00').getDay()
        const lastDayInWeek = new Date(week.days[week.days.length - 1].date + 'T00:00:00').getDay()

        // Add leading empty squares (days before first day of this week's data)
        for (let i = 0; i < firstDayInWeek; i++) {
            html += `<div class="day-square empty"></div>`
        }

        // Render GitHub-style squares for the week
        week.days.forEach(day => {
            const intensityClass = getIntensityClass(day.data.cost)
            const dayName = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })

            html += `
                <div class="day-square ${intensityClass}"
                     data-date="${day.date}"
                     title="${dayName} ${day.dayNum}: $${day.data.cost.toFixed(4)} (${day.data.requests} req)">
                </div>
            `
        })

        // Add trailing empty squares (days after last day of this week's data)
        for (let i = lastDayInWeek; i < 6; i++) {
            html += `<div class="day-square empty"></div>`
        }

        html += `
                </div>
                <div class="week-total">
                    $${weekTotalCost.toFixed(2)}<br>
                    <span class="week-requests">${weekTotalRequests} req</span>
                </div>
            </div>
        `
    })

    html += `</div></div>`
    return html
}

function attachCalendarListeners() {
    // Day square click handlers
    document.querySelectorAll('.day-square').forEach(el => {
        const date = el.dataset.date
        el.addEventListener('mousedown', (e) => onCalendarDayMouseDown(date, e))
        el.addEventListener('mouseenter', () => onCalendarDayMouseEnter(date))
        el.addEventListener('mouseup', () => onCalendarDayMouseUp(date))
    })

    // Week row hover/click handlers
    document.querySelectorAll('.week-row').forEach(el => {
        const weekStart = el.dataset.weekStart
        el.addEventListener('mouseenter', () => {
            el.classList.add('week-highlighted')
        })
        el.addEventListener('mouseleave', () => {
            el.classList.remove('week-highlighted')
        })
    })

    // Week label click handlers
    document.querySelectorAll('.week-label').forEach(el => {
        const weekStart = el.closest('.week-row').dataset.weekStart
        el.addEventListener('click', () => onWeekClick(weekStart))
    })

    document.addEventListener('mouseup', handleCalendarGlobalMouseUp)
}

function getWeekNumber(dateStr) {
    const date = new Date(dateStr + 'T00:00:00')
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

function getWeekStart(dateStr) {
    const date = new Date(dateStr + 'T00:00:00')
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date.setDate(diff))
    return monday.toISOString().split('T')[0]
}

function getWeekEnd(dateStr) {
    const start = getWeekStart(dateStr)
    const startDate = new Date(start + 'T00:00:00')
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)
    return endDate.toISOString().split('T')[0]
}

function onCalendarDayClick(date) {
    if (!alpineData) return
    alpineData.dateFilter.startDate = date
    alpineData.dateFilter.endDate = date
    alpineData.currentTab = 'stats'
    window.location.hash = 'stats'
}

function onWeekClick(weekStartDate) {
    if (!alpineData) return
    const weekEnd = getWeekEnd(weekStartDate)
    alpineData.dateFilter.startDate = weekStartDate
    alpineData.dateFilter.endDate = weekEnd
    alpineData.currentTab = 'stats'
    window.location.hash = 'stats'
}

function onCalendarDayMouseDown(date, event) {
    event.stopPropagation()
    rangeSelectionStart = date
    rangeSelectionEnd = date
    isSelecting = true
    updateCalendarRangeSelection()
}

function onCalendarDayMouseEnter(date) {
    if (!isSelecting) return
    rangeSelectionEnd = date
    updateCalendarRangeSelection()
}

function onCalendarDayMouseUp(date) {
    if (!isSelecting) return
    isSelecting = false

    if (rangeSelectionStart === rangeSelectionEnd) {
        onCalendarDayClick(date)
    } else {
        const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort()
        if (alpineData) {
            alpineData.dateFilter.startDate = start
            alpineData.dateFilter.endDate = end
            alpineData.currentTab = 'stats'
            window.location.hash = 'stats'
        }
    }
    clearCalendarRangeSelection()
}

function handleCalendarGlobalMouseUp() {
    if (isSelecting) {
        onCalendarDayMouseUp(rangeSelectionEnd)
    }
}

function updateCalendarRangeSelection() {
    document.querySelectorAll('.day-square').forEach(el => {
        el.classList.remove('range-selecting')
    })

    if (!rangeSelectionStart || !rangeSelectionEnd) return

    const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort()
    const startDate = new Date(start + 'T00:00:00')
    const endDate = new Date(end + 'T00:00:00')

    document.querySelectorAll('.day-square').forEach(el => {
        const dateStr = el.dataset.date
        if (!dateStr) return
        const date = new Date(dateStr + 'T00:00:00')
        if (date >= startDate && date <= endDate) {
            el.classList.add('range-selecting')
        }
    })
}

function clearCalendarRangeSelection() {
    rangeSelectionStart = null
    rangeSelectionEnd = null
    document.querySelectorAll('.day-square').forEach(el => {
        el.classList.remove('range-selecting')
    })
}

// Auto-refresh stats every 5 seconds (uses current filter state)
setInterval(() => {
    if (alpineData && alpineData.currentTab === 'stats') {
        refreshStats()
    }
}, 5000)

// Load initial tab data after Alpine initializes
document.addEventListener('alpine:initialized', () => {
    const initialTab = localStorage.getItem('_x_currentTab')?.replace(/['"]/g, '') || 'stats'
    onTabChange(initialTab)
})

// Handle browser back/forward navigation
window.addEventListener('popstate', () => {
    if (!alpineData) return
    const hash = window.location.hash.slice(1)
    if (hash && ['stats', 'calendar', 'models', 'requests'].includes(hash)) {
        alpineData.currentTab = hash
    } else if (!hash) {
        // No hash means navigate to default (stats)
        alpineData.currentTab = 'stats'
    }
})

// Model Management Modal Functions
// Wizard state
let wizardState = {
    currentStep: 1,
    selectedProvider: null,
    selectedModel: null,
    providers: [],
    models: []
}

