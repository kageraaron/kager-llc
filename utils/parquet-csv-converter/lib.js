/**
 * Formats bytes into a human-readable string.
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Placeholder for Parquet to CSV conversion.
 * In a real scenario, this would use a WASM library like duckdb-wasm.
 */
export async function convertParquetToCsv(file) {
    // Simulated delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Dummy data
    const dummyData = [
        { id: 1, name: 'Sample Data', value: 100, category: 'A' },
        { id: 2, name: 'Test Record', value: 250, category: 'B' }
    ];

    return {
        data: dummyData,
        csv: 'id,name,value,category
1,Sample Data,100,A
2,Test Record,250,B',
        filename: file.name.replace('.parquet', '.csv'),
        type: 'text/csv'
    };
}

/**
 * Placeholder for CSV to Parquet conversion.
 */
export async function convertCsvToParquet(file) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
        data: new Uint8Array([0x50, 0x41, 0x52, 0x31]),
        filename: file.name.replace('.csv', '.parquet'),
        type: 'application/octet-stream'
    };
}