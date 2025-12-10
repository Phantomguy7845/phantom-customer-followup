const healthOutput = document.getElementById('health-output');
const refreshButton = document.getElementById('refresh-health');

const renderHealth = (data) => {
  healthOutput.textContent = JSON.stringify(data, null, 2);
};

const renderError = (message) => {
  healthOutput.textContent = message;
};

const fetchHealth = async () => {
  try {
    renderError('Loading...');
    const response = await fetch('/api/health');
    const data = await response.json();
    renderHealth(data);
  } catch (error) {
    renderError(`ไม่สามารถดึงข้อมูล health ได้: ${error.message}`);
  }
};

if (refreshButton) {
  refreshButton.addEventListener('click', fetchHealth);
}

fetchHealth();
