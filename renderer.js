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
            labels: ['Critical', 'High', 'Medium', 'Low'],
            datasets: [{
                label: 'Risk Distribution',
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
                <p class="card-text">Industry: ${company.industry}</p>
                <p class="card-text">Size: ${company.size}</p>
                <button class="btn btn-primary" onclick="startAssessment(${company.id})">Start Assessment</button>
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
    // Implement assessment start logic
}

// Initial load
loadDashboard();