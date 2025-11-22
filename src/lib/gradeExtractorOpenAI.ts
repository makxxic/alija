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

    const completion = await Promise.race([completionPromise, timeoutPromise]) as unknown

    // Safely extract the assistant text from the OpenAI response without using `any`
    let raw: string | undefined
    if (typeof completion === 'object' && completion !== null) {
      const c = completion as Record<string, unknown>
      const choices = c['choices']
      if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0]
        if (typeof first === 'object' && first !== null) {
          const msg = (first as Record<string, unknown>)['message']
          if (typeof msg === 'object' && msg !== null) {
            const content = (msg as Record<string, unknown>)['content']
            if (typeof content === 'string') raw = content
          }
        }
      }
    }

    if (!raw || typeof raw !== 'string') return empty

    // Try to find a JSON object in the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const jsonText = jsonMatch ? jsonMatch[0] : raw

    let parsedUnknown: unknown
    try {
      parsedUnknown = JSON.parse(jsonText)
    } catch (e) {
      // Try a looser attempt: replace single quotes with double
      try {
        parsedUnknown = JSON.parse(jsonText.replace(/\'/g, '"'))
      } catch {
        console.error('Failed to parse JSON from OpenAI output:', raw)
        return { ...empty, assistantReply: 'I had trouble extracting structured grades. Could you rephrase?' }
      }
    }

    const parsedObj = (typeof parsedUnknown === 'object' && parsedUnknown !== null) ? parsedUnknown as Record<string, unknown> : {}

    const result: AIExtractResult = { entries: [], assistantReply: undefined }
    const assistantReplyVal = parsedObj['assistantReply']
    if (typeof assistantReplyVal === 'string') result.assistantReply = assistantReplyVal

    const classNameVal = parsedObj['className']
    if (typeof classNameVal === 'string') result.className = classNameVal

    const entriesVal = parsedObj['entries']
    if (Array.isArray(entriesVal)) {
      for (const e of entriesVal) {
        if (typeof e === 'object' && e !== null) {
          const entryObj = e as Record<string, unknown>
          const studentName = typeof entryObj['studentName'] === 'string' ? entryObj['studentName'].trim() : ''
          const subject = typeof entryObj['subject'] === 'string' ? entryObj['subject'] : undefined
          const gradeRaw = entryObj['grade']
          let grade: number | undefined
          if (typeof gradeRaw === 'number') grade = gradeRaw
          else if (typeof gradeRaw === 'string' && gradeRaw.trim() !== '') {
            const n = Number(gradeRaw)
            if (!Number.isNaN(n)) grade = n
          }

          const entry: AIGradeEntry = { studentName, subject, grade }
          if (entry.studentName) result.entries.push(entry)
        }
      }
    }

    const missingVal = parsedObj['missing']
    if (Array.isArray(missingVal)) result.missing = missingVal.map(s => String(s))

    if (!result.assistantReply) result.assistantReply = 'I parsed the grades — do you want to add more?'

    return result
  } catch (err) {
    console.error('OpenAI grade extract error:', err)
    return { ...empty, assistantReply: 'I am having trouble parsing that right now. Could you repeat?' }
  }
}

export default extractGradesWithOpenAI
