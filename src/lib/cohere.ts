import { CohereClient } from 'cohere-ai'
import { prisma } from './prisma'

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY
})

export interface AIResponse {
  response: string;
  needsEscalation: boolean;
  escalationReason: string;
}

export async function getAIResponse(input: string, callId: string): Promise<AIResponse> {
  // Get conversation
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { conversation: { include: { messages: true } } }
  })
  if (!call || !call.conversation) return { response: 'Sorry, there was an error.', needsEscalation: false, escalationReason: '' }

  const conversation = call.conversation

  // Add user message
  try {
    const existing = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        role: 'user',
        content: input
      }
    })
    if (!existing) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: input
        }
      })
    }
  } catch (e) {
    console.error('Error saving user message (cohere):', e)
  }

  // Get messages for Cohere
  const chatHistory = conversation.messages.map(m => ({
    role: m.role === 'assistant' ? ('CHATBOT' as const) : ('USER' as const),
    message: m.content
  }))

  try {
    // Simple language detection for Swahili
    const swahiliWords = ['habari', 'asante', 'sijambo', 'karibu', 'pole', 'samahani', 'tafadhali', 'kujiua', 'kujidhuru', 'msaada']
    const isSwahili = swahiliWords.some(word => input.toLowerCase().includes(word))

    // Multilingual preamble
    const preamble = isSwahili ?
      'Wewe ni msaidizi wa afya ya akili mwenye huruma. Sikiliza kwa makini, toa msaada, na gundua ikiwa mtumiaji anahitaji msaada wa kitaalamu. Ikiwa wanataja kujiua au kujidhuru, pendekeza msaada wa haraka. Jibu kwa Kiswahili.' :
      'You are a compassionate mental health AI assistant. Listen actively, provide support, and detect if the user needs professional help. If they mention suicide or self-harm, suggest immediate help. Respond in the same language as the user.'

    // Add timeout to prevent hanging
    const chatPromise = cohere.chat({
      model: 'command-r-plus-08-2024',
      message: input,
      chatHistory,
      preamble,
      maxTokens: 150
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI response timeout')), 10000) // 10 seconds
    )

    const response = await Promise.race([chatPromise, timeoutPromise]) as { text: string }

    const aiResponse = response.text || 'I\'m here to listen.'

    // Save assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse
      }
    })

    // Check for escalation (English and Swahili)
    const needsEscalation = input.toLowerCase().includes('suicide') ||
                            input.toLowerCase().includes('kill myself') ||
                            input.toLowerCase().includes('self-harm') ||
                            input.toLowerCase().includes('professional') ||
                            input.toLowerCase().includes('therapist') ||
                            input.toLowerCase().includes('counselor') ||
                            input.toLowerCase().includes('help me professionally') ||
                            input.toLowerCase().includes('kujiua') || // Swahili for suicide
                            input.toLowerCase().includes('kujidhuru') || // self-harm
                            input.toLowerCase().includes('msaada wa kitaalamu') || // professional help
                            input.toLowerCase().includes('daktari wa akili') // mental doctor

    let escalationReason = ''
    if (needsEscalation) {
      if (input.toLowerCase().includes('suicide') || input.toLowerCase().includes('kill myself') || input.toLowerCase().includes('self-harm') ||
          input.toLowerCase().includes('kujiua') || input.toLowerCase().includes('kujidhuru')) {
        escalationReason = 'crisis'
      } else {
        escalationReason = 'requested_professional'
      }
    }

    return { response: aiResponse, needsEscalation, escalationReason }
  } catch (error) {
    console.error('Cohere error:', error)
    if ((error as Error).message === 'AI response timeout') {
      return { response: 'I\'m taking a bit longer to respond. Please hold on.', needsEscalation: false, escalationReason: '' }
    }
    return { response: 'I\'m sorry, I\'m having trouble responding right now. Please try again.', needsEscalation: false, escalationReason: '' }
  }
}