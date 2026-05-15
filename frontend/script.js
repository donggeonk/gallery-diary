// UI Elements
const uploadBtn = document.getElementById('upload-btn');
const videoUploadInput = document.getElementById('video-upload');
const fileNameDisplay = document.getElementById('file-name');

const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const monthYearDisplay = document.getElementById('month-year-display');
const calendarDays = document.getElementById('calendar-days');

const selectedDateDisplay = document.getElementById('selected-date-display');
const summaryContent = document.getElementById('summary-content');

// State
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let selectedDateStr = null;
let analysisData = {}; // Will hold real DB data
let isProcessing = false;
let currentPollInterval = null;

// API Endpoints
const API_URL = "http://127.0.0.1:8000/api";

// Initialize
async function init() {
    await fetchLogs();
    renderCalendar(currentMonth, currentYear);
}

// Fetch all logs from SQLite
async function fetchLogs() {
    try {
        const response = await fetch(`${API_URL}/logs`);
        if (response.ok) {
            analysisData = await response.json();
            renderCalendar(currentMonth, currentYear);
            if (selectedDateStr) showSummary(selectedDateStr);
        }
    } catch (error) {
        console.error("Error fetching logs:", error);
    }
}

// ---- Left Panel: Upload Video Logic ----
uploadBtn.addEventListener('click', () => {
    if (isProcessing) {
        alert("A video is currently processing. Please wait.");
        return;
    }
    videoUploadInput.click();
});

videoUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('video/')) {
            alert('File not supported. Please upload a video.');
            
            // clear the input so user can try again
            videoUploadInput.value = '';
            return;
        }
        
        fileNameDisplay.textContent = `Selected: ${file.name}`;
        
        const dateToSave = selectedDateStr || getLocalDateString(new Date());
        
        summaryContent.innerHTML = `<h3>Logging Video...</h3><p>Running ML analysis...<br>Please wait (this can take a few minutes)...</p>`;
        isProcessing = true;
        
        // 1. Send file via FormData
        const formData = new FormData();
        formData.append("file", file);
        formData.append("date", dateToSave);

        try {
            const uploadRes = await fetch(`${API_URL}/upload`, {
                method: "POST",
                body: formData,
            });

            if (!uploadRes.ok) throw new Error("Upload request failed");
            
            const uploadData = await uploadRes.json();
            if (uploadData.error) {
                alert(uploadData.error);
                isProcessing = false;
                showSummary(selectedDateStr);
                return;
            }

            const taskId = uploadData.task_id;
            
            // 2. Poll Status indefinitely every 5 seconds
            currentPollInterval = setInterval(async () => {
                const statusRes = await fetch(`${API_URL}/status/${taskId}`);
                const statusData = await statusRes.json();
                
                if (statusData.status === "completed") {
                    clearInterval(currentPollInterval);
                    isProcessing = false;
                    
                    // Save dynamically into tracking variable
                    analysisData[dateToSave] = statusData.summary;
                    
                    // Show final visual message
                    summaryContent.innerHTML = `<h3>Logging completed!</h3>`;
                    
                    setTimeout(() => {
                        renderCalendar(currentMonth, currentYear);
                        showSummary(dateToSave);
                        fileNameDisplay.textContent = `Completed: ${file.name}`;
                    }, 1000);
                } else if (statusData.status === "error") {
                    clearInterval(currentPollInterval);
                    isProcessing = false;
                    summaryContent.innerHTML = `<h3 style="color:red">Error</h3><p>${statusData.error}</p>`;
                }
            }, 5000);
            
        } catch (error) {
            console.error("Upload error:", error);
            isProcessing = false;
            summaryContent.innerHTML = `<p style="color:red">Failed to connect to backend server.</p>`;
        }
    }
});

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function renderCalendar(month, year) {
    calendarDays.innerHTML = '';
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const currentDay = today.getDate();

    // Empty cells
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        calendarDays.appendChild(emptyCell);
    }

    // Day cells
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('day-cell');
        dayCell.textContent = i;
        
        const dateStr = getLocalDateString(new Date(year, month, i));

        if (isCurrentMonth && i === currentDay) {
            dayCell.classList.add('today');
        }

        if (dateStr === selectedDateStr) {
            dayCell.classList.add('selected');
        }

        if (analysisData[dateStr]) {
            dayCell.classList.add('has-data');
        }

        dayCell.addEventListener('click', () => {
            selectedDateStr = dateStr;
            // Update UI
            renderCalendar(month, year); 
            // Also show summary
            if (!isProcessing) {
                showSummary(dateStr);
            }
        });

        calendarDays.appendChild(dayCell);
    }
}

prevMonthBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar(currentMonth, currentYear);
});

nextMonthBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar(currentMonth, currentYear);
});

// ---- Right Bottom: Summary Display Logic ----
function showSummary(dateStr) {
    // Basic format: "Invalid Date" check just in case
    if (!dateStr) return;
    
    const d = new Date(dateStr + "T00:00:00");
    selectedDateDisplay.textContent = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // if we are actively processing that exact date, return
    if (isProcessing && dateStr === selectedDateStr) {
        return; 
    }

    const data = analysisData[dateStr];
    const leftPanel = document.querySelector('.left-panel');
    
    if (data) {
        const formattedData = data.split('\n').join('<br>');
        summaryContent.innerHTML = `<div style="font-family: monospace; font-size: 0.95rem;">${formattedData}</div>`;
        
        // Dynamically fetch and set the video's first frame as the background
        leftPanel.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${API_URL}/thumbnail/${dateStr}")`;
        leftPanel.style.backgroundSize = "cover";
        leftPanel.style.backgroundPosition = "center";
    } else {
        summaryContent.innerHTML = `<p class="placeholder-text">No recorded video analysis for this date.</p>`;
        // Reset background
        leftPanel.style.backgroundImage = "none";
    }
}

init();