class RecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const inputChannel = input[0];
            for (let i = 0; i < inputChannel.length; i++) {
                this.buffer[this.bufferIndex++] = inputChannel[i];
                if (this.bufferIndex >= this.bufferSize) {
                    this.sendBuffer();
                    this.bufferIndex = 0;
                }
            }
        }
        return true;
    }

    sendBuffer() {
        // Send the float32 buffer to the main thread
        // We'll handle resampling and Int16 conversion in the main thread for simplicity
        // or we could do it here. Let's do it in the main thread to keep this simple.
        this.port.postMessage(this.buffer);
    }
}

registerProcessor('recorder-processor', RecorderProcessor);
