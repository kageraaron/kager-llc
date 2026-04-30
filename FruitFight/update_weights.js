const fs = require('fs'); const weights = fs.readFileSync('best_weights.json', 'utf8'); fs.writeFileSync('trainedModel.ts', 'export const TRAINED_WEIGHTS: number[] = ' + weights + ';\\n');
