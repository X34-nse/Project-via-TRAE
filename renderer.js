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
    companiesList.innerHTML = '';

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

// Company Modal handling
const addCompanyBtn = document.getElementById('addCompanyBtn');
const addCompanyModal = new bootstrap.Modal(document.getElementById('addCompanyModal'));
const saveCompanyBtn = document.getElementById('saveCompanyBtn');
const addCompanyForm = document.getElementById('addCompanyForm');

addCompanyBtn.addEventListener('click', () => {
    addCompanyModal.show();
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
    // Maak een nieuwe sectie voor de vragenlijst
    const mainContent = document.querySelector('.main-content');
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.add('d-none'));

    const assessmentSection = document.createElement('div');
    assessmentSection.className = 'section';
    assessmentSection.id = 'current-assessment';
    mainContent.appendChild(assessmentSection);

    // Laad de vragen
    const questions = require('./questions.js');
    let currentQuestionIndex = 0;

    // Start beveiligingscontroles op de achtergrond
    const securityChecks = ipcRenderer.invoke('start-security-checks', companyId);

    function displayCurrentQuestion() {
        const question = questions[currentQuestionIndex];
        assessmentSection.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">${question.category} - ${question.subcategory}</h5>
                    <p class="card-text">${question.question}</p>
                    <div class="mb-3">
                        <button class="btn btn-success me-2" onclick="answerQuestion(true)">Ja</button>
                        <button class="btn btn-danger" onclick="answerQuestion(false)">Nee</button>
                    </div>
                    <div class="alert alert-info">
                        <h6>Waarom is dit belangrijk?</h6>
                        <p>${question.why}</p>
                        <h6>Hoe pak je dit aan?</h6>
                        <p>${question.howTo}</p>
                    </div>
                </div>
            </div>
        `;
    }

    // Functie om antwoorden op te slaan
    window.answerQuestion = async function(answer) {
        await ipcRenderer.invoke('save-answer', {
            companyId,
            questionId: currentQuestionIndex,
            answer,
            category: questions[currentQuestionIndex].category,
            subcategory: questions[currentQuestionIndex].subcategory
        });

        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
            displayCurrentQuestion();
        } else {
            // Wacht op beveiligingscontroles en toon resultaten
            const securityResults = await securityChecks;
            showAssessmentResults(companyId, securityResults);
        }
    };

    // Start met de eerste vraag
    displayCurrentQuestion();
}

async function showAssessmentResults(companyId, securityResults) {
    const assessmentSection = document.getElementById('current-assessment');
    const results = await ipcRenderer.invoke('get-assessment-results', companyId);
    
    assessmentSection.innerHTML = `
        <div class="card">
            <div class="card-body">
                <h4 class="card-title">Beveiligingsbeoordeling Voltooid</h4>
                <div class="mt-4">
                    <h5>Resultaten per Categorie</h5>
                    <div id="resultsChart"></div>
                </div>
                <div class="mt-4">
                    <button class="btn btn-primary" onclick="showSection('dashboard')">Terug naar Dashboard</button>
                </div>
            </div>
        </div>
    `;

    // Update dashboard met nieuwe resultaten
    loadDashboard();
}

// Initial load
loadDashboard();