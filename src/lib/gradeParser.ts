export interface ParsedGradeEntry {
  studentName: string
  subject?: string
  grade?: number
}

export interface ParsedGradesResult {
  className?: string
  entries: ParsedGradeEntry[]
}

// Very small heuristic parser to extract student-grade pairs from a spoken string.
// It supports patterns like:
// - "Class 10B: John 85 in Math; Mary 90 in Math"
// - "John Doe got 78 in Chemistry"
// - "Alice: Math 92, Biology 88"
// This is intentionally simple; for more robust parsing use an AI extractor.
export function parseGrades(text: string): ParsedGradesResult {
  const result: ParsedGradesResult = { entries: [] }

  if (!text) return result

  // Try to detect class name like "Class 10B" or "class 10B"
  const classMatch = text.match(/class\s+([A-Za-z0-9\-]+)/i)
  if (classMatch) result.className = classMatch[1]

  // Split on common separators
  const parts = text.split(/[;\.|\n]| and |, and |,\s+/i).map(p => p.trim()).filter(Boolean)

  const gradeRegexes = [
    // Name got 85 in Math
    /(?<name>[A-Za-z'\- ]{2,50})\s+(?:got|has|scored|scored\s+an|received)?\s*(?<grade>\d{1,3}(?:\.\d+)?)\s*(?:in|for)?\s*(?<subject>[A-Za-z &]+)?/i,
    // Name: Subject 85
    /(?<name>[A-Za-z'\- ]{2,50})[:\-]\s*(?<subject>[A-Za-z &]+)\s*(?<grade>\d{1,3}(?:\.\d+)?)/i,
    // Subject Name 85 (less common)
    /(?<subject>[A-Za-z &]+)\s+(?<name>[A-Za-z'\- ]{2,50})\s*(?<grade>\d{1,3}(?:\.\d+)?)/i
  ]

  for (const part of parts) {
    let matched = false
    for (const rx of gradeRegexes) {
      const m = part.match(rx)
      if (m && m.groups) {
        const studentName = (m.groups['name'] || '').trim()
        const subject = (m.groups['subject'] || '').trim() || undefined
        const gradeStr = (m.groups['grade'] || '').trim()
        const grade = gradeStr ? Number(gradeStr) : undefined
        if (studentName) {
          result.entries.push({ studentName, subject, grade })
          matched = true
          break
        }
      }
    }

    // If no match but the chunk looks like "Name number"
    if (!matched) {
      const fallback = part.match(/(?<name>[A-Za-z'\- ]{2,50})\s+(?<grade>\d{1,3}(?:\.\d+)?)/)
      if (fallback && fallback.groups) {
        const studentName = fallback.groups['name'].trim()
        const grade = Number(fallback.groups['grade'])
        result.entries.push({ studentName, grade })
      }
    }
  }

  return result
}

export default parseGrades
