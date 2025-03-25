const { db } = require('./init');

function saveScanResult(checkType, result) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO scan_results (check_type, status, data, timestamp) 
                      VALUES (?, ?, ?, datetime('now'))`;
        
        db.run(query, [
            checkType,
            result.status,
            JSON.stringify(result)
        ], function(err) {
            if (err) {
                console.error('Error saving scan result:', err);
                reject(err);
            } else {
                console.log(`Saved ${checkType} scan result with id ${this.lastID}`);
                resolve(this.lastID);
            }
        });
    });
}

module.exports = { saveScanResult }; 