import OpenAI from 'openai'

export interface AIGradeEntry {
  studentName: string
  subject?: string
  grade?: number
}

export interface AIExtractResult {
  className?: string
  entries: AIGradeEntry[]
  missing?: string[]
  assistantReply?: string
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function extractGradesWithOpenAI(text: string): Promise<AIExtractResult> {
  // Defensive return
  const empty: AIExtractResult = { entries: [], assistantReply: 'I could not parse any grades. Could you repeat them more clearly?' }
  if (!text || !text.trim()) return empty

  // System prompt: ask model to reply with a JSON object only
  const system = `You are an assistant that extracts structured grade data from free-form spoken teacher input. ` +
    `Output a single JSON object only (no explanation) with these keys: ` +
    `"className" (string or null), "entries" (array of {"studentName":string, "subject":string|null, "grade":number|null}), and "missing" (array of student names the teacher mentioned but did not provide grades for). ` +
    `If you cannot determine something, use null for that value. Keep "assistantReply" short (a one-sentence, polite confirmation or clarification request).`

  const user = `Extract grades from this teacher statement exactly (do not invent new students): "${text.replace(/"/g, '\\"')}"`;

  try {
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: 400
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI response timeout')), 10000)
    )

    const completion = await Promise.race([completionPromise, timeoutPromise]) as any
    const raw = completion?.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string') return empty

    // Try to find a JSON object in the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const jsonText = jsonMatch ? jsonMatch[0] : raw

    let parsed: any
    try {
      parsed = JSON.parse(jsonText)
    } catch (e) {
      // Try a looser attempt: replace single quotes with double
      try {
        parsed = JSON.parse(jsonText.replace(/\'/g, '"'))
      } catch (e2) {
        console.error('Failed to parse JSON from OpenAI output:', raw)
        return { ...empty, assistantReply: 'I had trouble extracting structured grades. Could you rephrase?' }
      }
    }

    const result: AIExtractResult = { entries: [], assistantReply: parsed.assistantReply || undefined }
    if (parsed.className) result.className = parsed.className
    if (Array.isArray(parsed.entries)) {
      for (const e of parsed.entries) {
        const entry: AIGradeEntry = {
          studentName: (e.studentName || '').trim(),
          subject: e.subject || undefined,
          grade: typeof e.grade === 'number' ? e.grade : (e.grade ? Number(e.grade) : undefined)
        }
        if (entry.studentName) result.entries.push(entry)
      }
    }
    if (Array.isArray(parsed.missing)) result.missing = parsed.missing.map((s: any) => String(s))
    if (!result.assistantReply) result.assistantReply = parsed.assistantReply || 'I parsed the grades — do you want to add more?'

    return result
  } catch (err) {
    console.error('OpenAI grade extract error:', err)
    return { ...empty, assistantReply: 'I am having trouble parsing that right now. Could you repeat?' }
  }
}

export default extractGradesWithOpenAI
