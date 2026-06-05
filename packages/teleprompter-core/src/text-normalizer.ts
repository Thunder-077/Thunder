export function normalizeSpeechText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[，。！？、；：,.!?;:'"“”‘’（）()[\]{}《》<>…—\-_/\\|~`@#$%^&*+=]/g, "")
}
