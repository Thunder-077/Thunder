class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this._inputSampleRate = options.processorOptions?.inputSampleRate || sampleRate
    this._ratio = this._inputSampleRate / 16000
    this._buffer = []
    this._chunkSize = 4096
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0] || input[0].length === 0) {
      return true
    }

    const channelData = input[0]
    const outputLength = Math.floor(channelData.length / this._ratio)

    for (let i = 0; i < outputLength; i++) {
      const start = Math.floor(i * this._ratio)
      const end = Math.min(Math.floor((i + 1) * this._ratio), channelData.length)
      let sum = 0
      for (let j = start; j < end; j++) {
        sum += channelData[j]
      }
      this._buffer.push(sum / Math.max(1, end - start))
    }

    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.splice(0, this._chunkSize)
      const pcm = new ArrayBuffer(chunk.length * 2)
      const view = new DataView(pcm)
      for (let i = 0; i < chunk.length; i++) {
        const sample = Math.max(-1, Math.min(1, chunk[i]))
        view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      }
      this.port.postMessage(pcm, [pcm])
    }

    return true
  }
}

registerProcessor("pcm-processor", PcmProcessor)
