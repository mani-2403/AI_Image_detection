document.addEventListener('DOMContentLoaded', () => {
    checkStatus();
    
    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.getAttribute('data-theme') === 'light';
            document.body.setAttribute('data-theme', isLight ? 'dark' : 'light');
            themeToggle.textContent = isLight ? '☀️' : '🌙';
        });
    }

    // Upload Logic
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleFile(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });
    }

    // Alert Logic
    const closeAlertBtn = document.getElementById('closeAlertBtn');
    if (closeAlertBtn) {
        closeAlertBtn.addEventListener('click', () => {
            document.getElementById('alertModal').style.display = 'none';
        });
    }

    // Twilio Alert Button
    const triggerTwilioBtn = document.getElementById('triggerTwilioBtn');
    if (triggerTwilioBtn) {
        triggerTwilioBtn.addEventListener('click', () => {
            triggerTwilioBtn.disabled = true;
            triggerTwilioBtn.textContent = 'Calling...';
            fetch('/trigger_call', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if(data.success) {
                    triggerTwilioBtn.textContent = 'Call Sent ✅';
                } else {
                    triggerTwilioBtn.textContent = 'Call Failed ❌';
                    triggerTwilioBtn.disabled = false;
                }
            })
            .catch(err => {
                triggerTwilioBtn.textContent = 'Error ❌';
            });
        });
    }

    if (document.getElementById('resetBtn')) {
        document.getElementById('resetBtn').addEventListener('click', resetUI);
    }

    // Dashboard
    if (document.getElementById('historyTable')) {
        loadDashboardData();
    }
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('Select an image');

    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('previewContainer').style.display = 'block';
    };
    reader.readAsDataURL(file);

    document.getElementById('uploadPlaceholder2').style.display = 'none';
    const rc = document.getElementById('resultContent');
    if(rc) rc.style.display = 'none';
    document.getElementById('loaderContainer').style.display = 'flex';

    const fd = new FormData();
    fd.append('image', file);

    fetch('/upload', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(data => {
        document.getElementById('loaderContainer').style.display = 'none';
        if (data.error) {
            alert('Error: ' + data.error);
            resetUI();
            return;
        }
        displayResult(data);
    })
    .catch(err => {
        document.getElementById('loaderContainer').style.display = 'none';
        alert('Upload failed');
        resetUI();
    });
}

function displayResult(data) {
    const rc = document.getElementById('resultContent');
    const glow = document.getElementById('resultGlow');
    const label = document.getElementById('resultLabel');
    const conf = document.getElementById('resultConfidence');
    const bar = document.getElementById('confidenceBar');
    const detail = document.getElementById('aiDetail');

    rc.style.display = 'flex';
    
    label.textContent = data.label === 'REAL' ? 'REAL IMAGE ✅' : 'FAKE IMAGE ⚠️';
    conf.textContent = `${data.confidence.toFixed(1)}% Confidence`;
    detail.innerHTML = `Model Artificial Score Analysis: <strong>${(data.artificial_score).toFixed(2)}%</strong>`;

    glow.className = `result-glow ${data.label === 'REAL' ? 'glow-real' : 'glow-fake'}`;
    bar.className = `progress-bar ${data.label === 'REAL' ? 'bg-real' : 'bg-fake'}`;
    
    setTimeout(() => { bar.style.width = data.confidence + '%'; }, 100);

    if (data.label === 'FAKE') {
        document.getElementById('alertModal').style.display = 'flex';
        // Reset Twilio btn
        const tBtn = document.getElementById('triggerTwilioBtn');
        if(tBtn) {
            tBtn.disabled = false;
            tBtn.textContent = 'Trigger Twilio Call Alert';
        }
    }
}

function resetUI() {
    document.getElementById('fileInput').value = '';
    document.getElementById('previewContainer').style.display = 'none';
    const rc = document.getElementById('resultContent');
    if(rc) rc.style.display = 'none';
    document.getElementById('loaderContainer').style.display = 'none';
    const up2 = document.getElementById('uploadPlaceholder2');
    if(up2) up2.style.display = 'flex';
    document.getElementById('confidenceBar').style.width = '0';
}

function checkStatus() {
    fetch('/status').then(r => r.json()).then(data => {
        const d = document.getElementById('arduinoStatus');
        if (d) {
            if (data.arduino_connected) {
                d.className = 'status-badge glass connected';
                d.innerHTML = '<div class="status-dot"></div> Arduino Connected (COM5)';
            } else {
                d.className = 'status-badge glass disconnected';
                d.innerHTML = '<div class="status-dot"></div> Arduino Disconnected';
            }
        }
    }).catch(err => console.log('Checking status...'));
}

let pieChart, barChart;
function loadDashboardData() {
    fetch('/history').then(r=>r.json()).then(data => {
        const tbody = document.getElementById('historyTable');
        let realCount = 0;
        let fakeCount = 0;

        tbody.innerHTML = '';
        data.forEach(item => {
            if (item.label === 'REAL') realCount++; else fakeCount++;
            tbody.innerHTML += `
                <tr>
                    <td><img src="/static/uploads/${item.filename}" class="history-img"></td>
                    <td>${item.timestamp}</td>
                    <td><span class="badge ${item.label === 'REAL' ? 'glow-real' : 'glow-fake'}">${item.label}</span></td>
                    <td>${item.confidence.toFixed(1)}%</td>
                </tr>
            `;
        });

        document.getElementById('totalCount').textContent = data.length;
        document.getElementById('realCount').textContent = realCount;
        document.getElementById('fakeCount').textContent = fakeCount;

        renderCharts(realCount, fakeCount, data);
    }).catch(e => console.error(e));
}

function renderCharts(real, fake, data) {
    if(typeof Chart === 'undefined') return;
    
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    const ctxBar = document.getElementById('barChart').getContext('2d');

    if(pieChart) pieChart.destroy();
    if(barChart) barChart.destroy();

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Outfit';

    pieChart = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['Authentic (Real)', 'Manipulated (Fake)'],
            datasets: [{
                data: [real, fake],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // Last 10 records for bar chart
    const recent = data.slice(0, 10).reverse();
    const confData = recent.map(d => d.confidence);
    const labels = recent.map((d,i) => `Img ${i+1}`);
    const colors = recent.map(d => d.label === 'REAL' ? '#10b981' : '#ef4444');

    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Confidence %',
                data: confData,
                backgroundColor: colors,
                borderRadius: 6
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100 } },
            plugins: { legend: { display: false } }
        }
    });
}
