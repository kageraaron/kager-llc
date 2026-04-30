const fs = require('fs');
const log = fs.readFileSync('curriculum_training.log', 'utf8');
const matches = log.match(/WEIGHTS:(\[.*?\])/g);
if (matches) {
    const last = matches[matches.length-1].replace('WEIGHTS:', '');
    fs.writeFileSync('trainedModel.ts', 'export const TRAINED_WEIGHTS: number[] = ' + last + ';\n');
    console.log('Successfully updated trainedModel.ts with curriculum weights');
} else {
    // If no weights found (e.g. stopped too early before first weights print)
    // Try to find the last WEIGHTS: line from any log
    console.error('No weights found in curriculum_training.log');
}
