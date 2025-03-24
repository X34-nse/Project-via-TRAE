const { ipcRenderer } = require('electron');

// Navigation handling
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = e.target.dataset.section;
        showSection(section);
    });
});

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('d-none');
    });
    document.getElementById(`${sectionId}-section`).classList.remove('d-none');
    
    // Update active state in navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionId) {
            link.classList.add('active');
        }
    });

    // Load section-specific data
    if (sectionId === 'dashboard') {
        loadDashboard();
    } else if (sectionId === 'companies') {
        loadCompanies();
    } else if (sectionId === 'assessments') {
        loadAssessments();
    }
}

// Dashboard functionality
async function loadDashboard() {
    const companies = await ipcRenderer.invoke('get-companies');
    updateRiskChart();
    loadRecentAssessments();
}

function updateRiskChart() {
    const ctx = document.getElementById('riskChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Kritiek', 'Hoog', 'Gemiddeld', 'Laag'],
            datasets: [{
                label: 'Risicoverdeling',
                data: [4, 8, 15, 12],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                    'rgba(255, 159, 64, 0.2)',
                    'rgba(255, 205, 86, 0.2)',
                    'rgba(75, 192, 192, 0.2)'
                ],
                borderColor: [
                    'rgb(255, 99, 132)',
                    'rgb(255, 159, 64)',
                    'rgb(255, 205, 86)',
                    'rgb(75, 192, 192)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Companies functionality
async function loadCompanies() {
    const companies = await ipcRenderer.invoke('get-companies');
    const companiesList = document.getElementById('companiesList');
    const addCompanyBtn = document.getElementById('addCompanyBtn');
    companiesList.innerHTML = '';

    if (companies.length === 0) {
        // Toon het bedrijvenformulier automatisch als er nog geen bedrijven zijn
        addCompanyModal.show();
        addCompanyBtn.style.display = 'none';
    } else {
        // Verberg de toevoegknop als er al een bedrijf is
        addCompanyBtn.style.display = 'none';
        companies.forEach(company => {
            const companyCard = document.createElement('div');
            companyCard.className = 'card mb-3';
            companyCard.innerHTML = `
                <div class="card-body">
                    <h5 class="card-title">${company.name}</h5>
                    <p class="card-text">Industrie: ${company.industry}</p>
                    <p class="card-text">Grootte: ${company.size}</p>
                    <button class="btn btn-primary" onclick="startAssessment(${company.id})">Start Beoordeling</button>
                </div>
            `;
            companiesList.appendChild(companyCard);
        });
    }
}

// Company Modal handling
const addCompanyBtn = document.getElementById('addCompanyBtn');
const addCompanyModal = new bootstrap.Modal(document.getElementById('addCompanyModal'));
const saveCompanyBtn = document.getElementById('saveCompanyBtn');
const addCompanyForm = document.getElementById('addCompanyForm');

addCompanyBtn.addEventListener('click', () => {
    addCompanyModal.show();
    // Initialize Select2 for industry dropdown
    $('.industry-select').select2({
        placeholder: 'Zoek een industrie...',
        allowClear: true,
        width: '100%'
    });
});

saveCompanyBtn.addEventListener('click', async () => {
    const formData = new FormData(addCompanyForm);
    const companyData = {
        name: formData.get('name'),
        industry: formData.get('industry'),
        size: formData.get('size')
    };

    try {
        await ipcRenderer.invoke('create-company', companyData);
        addCompanyModal.hide();
        addCompanyForm.reset();
        loadCompanies();
    } catch (error) {
        console.error('Error creating company:', error);
        // Show error message to user
    }
});

// Assessments functionality
async function loadAssessments() {
    // Implement assessment list loading
}

async function startAssessment(companyId) {
    const mainContent = document.querySelector('.main-content');
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.add('d-none'));

    const assessmentSection = document.createElement('div');
    assessmentSection.className = 'section';
    assessmentSection.id = 'current-assessment';
    mainContent.appendChild(assessmentSection);

    // Initialize progress tracking
    let assessmentData = {
        companyId,
        startTime: new Date(),
        systemScanResults: null,
        answers: [],
        riskScore: {
            basic: 0,
            access: 0,
            backup: 0,
            dataProtection: 0,
            network: 0,
            awareness: 0
        }
    };

    // Start system scan
    const scanProgress = document.createElement('div');
    scanProgress.innerHTML = `
        <div class="alert alert-info">
            <div class="spinner-border spinner-border-sm" role="status"></div>
            Systeem scan wordt uitgevoerd...
        </div>
    `;
    assessmentSection.appendChild(scanProgress);

    // Run all security checks in parallel with individual error handling
    const scanPromises = [
        { name: 'Antivirus', promise: ipcRenderer.invoke('check-antivirus') },
        { name: 'Windows Updates', promise: ipcRenderer.invoke('check-updates') },
        { name: 'Firewall', promise: ipcRenderer.invoke('check-firewall') },
        { name: 'Backup', promise: ipcRenderer.invoke('check-backup-status') },
        { name: 'Encryptie', promise: ipcRenderer.invoke('check-encryption-status') },
        { name: 'Netwerk', promise: ipcRenderer.invoke('check-network-security') }
    ];

    const scanResults = [];
    const scanErrors = [];

    try {
        const scanTimeout = 30000; // 30 seconden timeout voor alle scans
        const scanResults = await Promise.race([
            Promise.all(scanPromises.map(async ({ name, promise }) => {
                try {
                    const result = await promise;
                    return { name, result, status: 'success' };
                } catch (error) {
                    console.error(`${name} scan error:`, error);
                    return { name, error: error.message || 'Onbekende fout', status: 'error' };
                }
            })),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Systeemscans timeout')), scanTimeout)
            )
        ]).catch(error => {
            console.warn('Systeemscans niet volledig:', error);
            return scanPromises.map(({ name }) => ({
                name,
                error: 'Scan timeout',
                status: 'timeout'
            }));
        });

        assessmentData.systemScanResults = scanResults;

        // Update progress display with more detailed status information
        let statusHtml = '';
        const successfulScans = scanResults.filter(result => result.status === 'success');
        const failedScans = scanResults.filter(result => result.status === 'error' || result.status === 'timeout');

        if (successfulScans.length > 0) {
            statusHtml += `
                <div class="alert alert-success mb-2">
                    <h6>Succesvolle scans (${successfulScans.length}/${scanPromises.length}):</h6>
                    <ul class="mb-0">
                        ${successfulScans.map(scan => `<li>${scan.name}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (failedScans.length > 0) {
            statusHtml += `
                <div class="alert alert-warning">
                    <h6>Niet-succesvolle scans (${failedScans.length}):</h6>
                    <ul class="mb-0">
                        ${failedScans.map(scan => `
                            <li>
                                ${scan.name}: ${scan.error}
                                ${scan.status === 'timeout' ? ' (Timeout)' : ''}
                            </li>
                        `).join('')}
                    </ul>
                    <div class="mt-2">
                        <small>U kunt doorgaan met de vragenlijst. De ontbrekende scans hebben geen invloed op uw antwoorden.</small>
                    </div>
                </div>
            `;
        }

        scanProgress.innerHTML = statusHtml;

        // Log scan results for debugging
        console.log('Scan results:', {
            successful: successfulScans,
            failed: failedScans,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Algemene scan error:', error);
        scanProgress.innerHTML = `
            <div class="alert alert-warning">
                Er zijn problemen opgetreden tijdens de systeem scan, maar u kunt doorgaan met de vragenlijst.
                <button class="btn btn-link" onclick="retrySystemScans(${companyId})">Systeemscans opnieuw proberen</button>
            </div>
        `;
    }

    // Load and display company profile questions first
    const profileQuestions = [
        {
            id: 'employees',
            question: 'Hoeveel medewerkers heeft uw bedrijf?',
            options: ['1-10', '11-50', '51-250', '250+']
        },
        {
            id: 'infrastructure',
            question: 'Hoeveel IT-apparaten heeft uw organisatie in gebruik?',
            options: ['1-5', '6-20', '21-100', '100+']
        }
    ];

    // Display questions and handle responses
    const questions = require('./questions.js');
    let currentQuestionIndex = 0;

    function calculateRiskScore(answers, systemScan) {
        // Implement risk calculation based on answers and scan results
        let riskScore = {
            financial: 0,
            technical: 0,
            operational: 0
        };

        // Calculate scores based on answers and scan results
        return riskScore;
    }

    function displayCurrentQuestion() {
        const question = currentQuestionIndex < profileQuestions.length 
            ? profileQuestions[currentQuestionIndex]
            : questions[currentQuestionIndex - profileQuestions.length];

        const isProfileQuestion = currentQuestionIndex < profileQuestions.length;

        assessmentSection.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="progress mb-3">
                        <div class="progress-bar" role="progressbar" 
                             style="width: ${(currentQuestionIndex / (questions.length + profileQuestions.length)) * 100}%">
                        </div>
                    </div>
                    <h5 class="card-title">${isProfileQuestion ? 'Bedrijfsprofiel' : question.category}</h5>
                    <p class="card-text">${question.question}</p>
                    ${isProfileQuestion 
                        ? `<div class="btn-group">
                            ${question.options.map(option => 
                                `<button class="btn btn-outline-primary" 
                                         onclick="answerProfileQuestion('${option}')">${option}</button>`
                            ).join('')}
                           </div>`
                        : `<div class="mb-3">
                            <button class="btn btn-success me-2" onclick="answerQuestion(true)">Ja</button>
                            <button class="btn btn-danger" onclick="answerQuestion(false)">Nee</button>
                           </div>
                           <div class="alert alert-info">
                            <h6>Waarom is dit belangrijk?</h6>
                            <p>${question.why}</p>
                            <h6>Hoe pak je dit aan?</h6>
                            <p>${question.howTo}</p>
                           </div>`
                    }
                </div>
            </div>
        `;
    }

    // Functie om antwoorden op te slaan
    window.answerProfileQuestion = async function(answer) {
        assessmentData.profile = assessmentData.profile || {};
        assessmentData.profile[profileQuestions[currentQuestionIndex].id] = answer;
        
        currentQuestionIndex++;
        if (currentQuestionIndex < profileQuestions.length + questions.length) {
            displayCurrentQuestion();
        } else {
            showAssessmentResults(assessmentData);
        }
    };

    window.answerQuestion = async function(answer) {
        const question = questions[currentQuestionIndex - profileQuestions.length];
        assessmentData.answers.push({
            category: question.category,
            subcategory: question.subcategory,
            question: question.question,
            answer: answer,
            timestamp: new Date()
        });

        // Update risk score based on answer
        if (!answer) {
            assessmentData.riskScore[question.category.toLowerCase()] += 1;
        }

        currentQuestionIndex++;
        if (currentQuestionIndex < profileQuestions.length + questions.length) {
            displayCurrentQuestion();
        } else {
            const finalScore = await ipcRenderer.invoke('save-assessment', assessmentData);
            showAssessmentResults(assessmentData.companyId, finalScore);
        }
    };

    // Start with the first question
    displayCurrentQuestion();
}

async function showAssessmentResults(assessmentData) {
    const assessmentSection = document.getElementById('current-assessment');
    
    // Bereken totale risicoscore
    const totalRiskScore = Object.values(assessmentData.riskScore).reduce((a, b) => a + b, 0);
    const maxPossibleScore = Object.keys(assessmentData.riskScore).length;
    const riskPercentage = (totalRiskScore / maxPossibleScore) * 100;
    
    // Bepaal risico niveau
    let riskLevel, riskColor;
    if (riskPercentage <= 25) {
        riskLevel = 'Laag';
        riskColor = 'success';
    } else if (riskPercentage <= 50) {
        riskLevel = 'Gemiddeld';
        riskColor = 'warning';
    } else if (riskPercentage <= 75) {
        riskLevel = 'Hoog';
        riskColor = 'danger';
    } else {
        riskLevel = 'Kritiek';
        riskColor = 'dark';
    }

    assessmentSection.innerHTML = `
        <div class="card">
            <div class="card-body">
                <h4 class="card-title">Beveiligingsbeoordeling Voltooid</h4>
                <div class="alert alert-${riskColor} mt-3">
                    <h5>Algemeen Risico Niveau: ${riskLevel}</h5>
                    <div class="progress">
                        <div class="progress-bar bg-${riskColor}" role="progressbar" 
                             style="width: ${riskPercentage}%" 
                             aria-valuenow="${riskPercentage}" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                            ${Math.round(riskPercentage)}%
                        </div>
                    </div>
                </div>
                <div class="mt-4">
                    <h5>Resultaten per Categorie</h5>
                    <div class="list-group">
                        ${Object.entries(assessmentData.riskScore).map(([category, score]) => `
                            <div class="list-group-item">
                                <h6 class="mb-1">${category.charAt(0).toUpperCase() + category.slice(1)}</h6>
                                <div class="progress">
                                    <div class="progress-bar ${score > 0 ? 'bg-danger' : 'bg-success'}" 
                                         role="progressbar" 
                                         style="width: ${score > 0 ? '100' : '0'}%">
                                        ${score > 0 ? 'Actie vereist' : 'Geen problemen'}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="mt-4">
                    <h5>Aanbevelingen</h5>
                    <div class="list-group">
                        ${assessmentData.answers
                            .filter(answer => !answer.answer)
                            .map(answer => `
                                <div class="list-group-item">
                                    <h6 class="mb-1">${answer.subcategory}</h6>
                                    <p class="mb-1">${answer.question}</p>
                                    <small class="text-muted">Categorie: ${answer.category}</small>
                                </div>
                            `).join('')}
                    </div>
                </div>
                <div class="mt-4">
                    <button class="btn btn-primary" onclick="showSection('dashboard')">Terug naar Dashboard</button>
                </div>
            </div>
        </div>
    `;

    // Update dashboard met nieuwe resultaten
    loadDashboard();


    // Update dashboard met nieuwe resultaten
    loadDashboard();
}

// Initial load
loadDashboard();