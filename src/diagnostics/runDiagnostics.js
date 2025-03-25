const { SystemDiagnostics } = require('./systemCheck');

async function runDiagnostics() {
    const diagnostics = new SystemDiagnostics();
    
    console.log('Starting system diagnostics...');
    const results = await diagnostics.runAllTests();
    
    console.log('\nDiagnostic Results:');
    console.log('===================');
    
    Object.entries(results).forEach(([test, result]) => {
        console.log(`\n${test.toUpperCase()}:`);
        console.log('Status:', result.status);
        if (result.message) console.log('Message:', result.message);
        if (result.details) console.log('Details:', JSON.stringify(result.details, null, 2));
    });
    
    // Check for any failures
    const failures = Object.entries(results)
        .filter(([_, result]) => result.status === 'error')
        .map(([test, result]) => ({test, message: result.message}));
    
    if (failures.length > 0) {
        console.log('\nFAILURES DETECTED:');
        failures.forEach(({test, message}) => {
            console.log(`- ${test}: ${message}`);
        });
    } else {
        console.log('\nAll tests passed successfully!');
    }
    
    return results;
}

module.exports = { runDiagnostics }; 