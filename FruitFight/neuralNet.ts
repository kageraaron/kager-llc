
// Simple Feed-Forward Neural Network for Neuroevolution
// Architecture: Input -> Hidden (Tanh) -> Output (Linear/Argmax)

export class SimpleNN {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  weights1: number[]; // Input -> Hidden
  bias1: number[];
  weights2: number[]; // Hidden -> Output
  bias2: number[];

  constructor(inputSize: number, hiddenSize: number, outputSize: number) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    
    // Initialize random weights
    this.weights1 = this.randomArray(inputSize * hiddenSize);
    this.bias1 = this.randomArray(hiddenSize);
    this.weights2 = this.randomArray(hiddenSize * outputSize);
    this.bias2 = this.randomArray(outputSize);
  }

  private randomArray(size: number): number[] {
    return Array.from({ length: size }, () => (Math.random() * 2 - 1));
  }

  // Load weights from a flat array (for evolution)
  loadWeights(flatWeights: number[]) {
    let offset = 0;
    
    const w1Size = this.inputSize * this.hiddenSize;
    this.weights1 = flatWeights.slice(offset, offset + w1Size);
    offset += w1Size;

    const b1Size = this.hiddenSize;
    this.bias1 = flatWeights.slice(offset, offset + b1Size);
    offset += b1Size;

    const w2Size = this.hiddenSize * this.outputSize;
    this.weights2 = flatWeights.slice(offset, offset + w2Size);
    offset += w2Size;

    const b2Size = this.outputSize;
    this.bias2 = flatWeights.slice(offset, offset + b2Size);
  }

  getFlatWeights(): number[] {
    return [...this.weights1, ...this.bias1, ...this.weights2, ...this.bias2];
  }

  forward(inputs: number[]): number[] {
    if (inputs.length !== this.inputSize) {
      throw new Error(`Expected ${this.inputSize} inputs, got ${inputs.length}`);
    }

    // Hidden Layer
    const hidden: number[] = new Array(this.hiddenSize).fill(0);
    for (let i = 0; i < this.hiddenSize; i++) {
      let sum = this.bias1[i];
      for (let j = 0; j < this.inputSize; j++) {
        sum += inputs[j] * this.weights1[j * this.hiddenSize + i];
      }
      hidden[i] = Math.tanh(sum);
    }

    // Output Layer
    const output: number[] = new Array(this.outputSize).fill(0);
    for (let i = 0; i < this.outputSize; i++) {
      let sum = this.bias2[i];
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += hidden[j] * this.weights2[j * this.outputSize + i];
      }
      output[i] = sum; // Linear output (Q-values)
    }

    return output;
  }

  forwardWithActivations(inputs: number[]): { inputs: number[], hidden: number[], outputs: number[] } {
    if (inputs.length !== this.inputSize) {
      throw new Error(`Expected ${this.inputSize} inputs, got ${inputs.length}`);
    }

    // Hidden Layer
    const hidden: number[] = new Array(this.hiddenSize).fill(0);
    for (let i = 0; i < this.hiddenSize; i++) {
      let sum = this.bias1[i];
      for (let j = 0; j < this.inputSize; j++) {
        sum += inputs[j] * this.weights1[j * this.hiddenSize + i];
      }
      hidden[i] = Math.tanh(sum);
    }

    // Output Layer
    const output: number[] = new Array(this.outputSize).fill(0);
    for (let i = 0; i < this.outputSize; i++) {
      let sum = this.bias2[i];
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += hidden[j] * this.weights2[j * this.outputSize + i];
      }
      output[i] = sum;
    }

    return { inputs, hidden, outputs: output };
  }
}
