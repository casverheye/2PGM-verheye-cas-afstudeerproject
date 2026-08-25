/** Split teaching text into paragraphs on blank lines. */
export function paragraphs(text: string) {
  return text.split(/\n\n+/).filter((part) => part.trim() !== "");
}
